// POST /api/koperasi/anggota/ocr-ktp — OCR DITUNDA.
// Backup (POST /api/pg/koperasi/anggota/ocr-ktp, src/server/server.ts)
// memakai /api/ai/ocr dengan kunci AI terenkripsi dari tabel api_keys —
// modul API keys baru ada di Gelombang 6, jadi OCR TIDAK BISA jalan
// sekarang. Endpoint ini wajib ada dan selalu menjawab configured:false;
// tidak memanggil layanan eksternal apa pun.
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request) {
  try {
    await requireAuth();
    return apiOk({
      configured: false,
      message:
        'OCR KTP belum dikonfigurasi — membutuhkan kunci AI (modul API keys, Gelombang 6). Isi data anggota secara manual.',
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses OCR KTP.', 500);
  }
}
