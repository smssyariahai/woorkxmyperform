// POST /api/koperasi/kirim-json — teruskan JSON pendaftaran anggota ke
// server tujuan. Porting POST /api/pg/koperasi/kirim-json backup
// (src/server/server.ts): tujuan dipilih lewat urlId atau defaultUrlId
// dari setting 'kirim_json' (URL tidak pernah dipercaya dari klien
// mentah), payload dibangun buildAnggotaJson (src/components/koperasi/
// kirimJson.ts), POST server-side supaya tidak terkendala CORS.
// Perbedaan vs backup: timeout 15 detik (backup 30 detik) dan TIDAK ada
// fallback ke urls[0] bila default tidak diset — 400 bila belum ada URL
// yang dikonfigurasi (sesuai kontrak Gelombang 5). Semua user login org
// boleh kirim.
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  buildAnggotaJson,
  getKirimJsonSetting,
  mapAnggota,
  photoFileToDataUrl,
} from '@/lib/koperasi/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const anggotaId = typeof body.anggotaId === 'string' ? body.anggotaId : '';
    const urlId = typeof body.urlId === 'string' ? body.urlId : '';
    if (!anggotaId) return apiErr('anggotaId wajib diisi.', 400);

    const row = await prisma.koperasiAnggota.findFirst({
      where: { id: anggotaId, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Anggota tidak ditemukan.', 404);

    const setting = await getKirimJsonSetting(ctx.organizationId);
    let entry;
    if (urlId) {
      entry = setting.urls.find((u) => u.id === urlId);
      if (!entry) return apiErr('URL tujuan tidak ditemukan (mungkin sudah dihapus).', 400);
    } else if (setting.defaultUrlId) {
      entry = setting.urls.find((u) => u.id === setting.defaultUrlId);
      if (!entry) return apiErr('URL default tidak ditemukan di daftar.', 400);
    } else {
      return apiErr('Belum ada URL Server yang diatur di Pengaturan Kirim JSON.', 400);
    }

    const dto = mapAnggota(row as any) as Record<string, unknown>;
    const payload = buildAnggotaJson({
      cabang: row.cabang,
      nik: row.nik,
      namaLengkap: row.namaLengkap,
      tempatLahir: row.tempatLahir,
      tanggalLahir: (dto.tanggalLahir as string | null) ?? undefined,
      jenisKelamin: row.jenisKelamin,
      alamatKtp: row.alamatKtp,
      noHp: row.noHp,
      namaIbuKandung: row.namaIbuKandung,
      pekerjaan: row.pekerjaan,
      statusPerkawinan: row.statusPerkawinan,
      penghasilanBulanan: row.penghasilanBulanan,
      tujuanKeanggotaan: row.tujuanKeanggotaan,
      fotoKtp: await photoFileToDataUrl(row.fotoKtpPath),
      fotoAnggota: await photoFileToDataUrl(row.fotoAnggotaPath),
      tandaTangan: await photoFileToDataUrl(row.tandaTanganPath),
      setujuMobileBanking: row.setujuMobileBanking,
      createdAt: row.createdAt.toISOString(),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const upstream = await fetch(entry.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'WOORK/1.0' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await upstream.text().catch(() => '');
      return apiOk({
        ok: upstream.ok,
        status: upstream.status,
        response: text ? text.slice(0, 500) : '',
        tujuan: entry.judul,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return apiErr('URL tujuan tidak merespons dalam 15 detik (timeout).', 502);
      }
      return apiErr(`Gagal menghubungi server tujuan: ${e?.message || 'koneksi gagal'}`, 502);
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim JSON.', 500);
  }
}
