import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';

/**
 * Foto profil WhatsApp pelanggan.
 *
 * Baileys menyediakan `sock.profilePictureUrl(jid)` — URL CDN foto profil
 * kontak. URL itu bisa berubah/kedaluwarsa, jadi foto DIUNDUH dan disimpan
 * lokal di uploads/customers/<customerId>.<ext> (satu file per pelanggan),
 * lalu disajikan lewat /api/customers/photo.
 *
 * Aturan refresh:
 * - diambil saat pesan masuk (tanpa menahan pesan) dan lewat tombol
 *   "Perbarui foto" di Inbox (maks 25 pelanggan per panggilan);
 * - hanya bila belum pernah dicek atau pengecekan terakhir > 7 hari;
 * - bila WA tidak memberikan URL (privasi kontak menutup / tanpa foto),
 *   pengecekan tetap dicatat agar tidak diulang tiap pesan;
 * - bila unduhan gagal (gangguan jaringan), pengecekan TIDAK dicatat
 *   sehingga percobaan berikutnya tetap jalan.
 */

const PHOTO_DIR = path.join(process.cwd(), 'uploads', 'customers');
const REFRESH_MS = 7 * 24 * 3600 * 1000;
const MAX_BYTES = 1024 * 1024; // 1 MB

function isStale(photoCheckedAt: Date | null): boolean {
  if (!photoCheckedAt) return true;
  return Date.now() - photoCheckedAt.getTime() > REFRESH_MS;
}

function localFile(customerId: string): string | null {
  try {
    if (!fs.existsSync(PHOTO_DIR)) return null;
    const f = fs
      .readdirSync(PHOTO_DIR)
      .find((n) => n.startsWith(`${customerId}.`));
    return f ? path.join(PHOTO_DIR, f) : null;
  } catch {
    return null;
  }
}

export function customerPhotoFile(customerId: string): string | null {
  return localFile(customerId);
}

/** Ambil + simpan foto profil WA satu pelanggan. True bila foto tersimpan. */
export async function refreshCustomerPhoto(
  orgId: string,
  customerId: string,
  sock: any,
): Promise<boolean> {
  try {
    if (!sock || typeof sock.profilePictureUrl !== 'function') return false;
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        organizationId: true,
        phone: true,
        waLid: true,
        photoUrl: true,
        photoCheckedAt: true,
      },
    });
    if (!c || c.organizationId !== orgId) return false;
    if (!isStale(c.photoCheckedAt)) return false;

    // JID nomor dulu; bila hanya LID yang diketahui, coba JID LID.
    const digits = (c.phone || '').replace(/\D/g, '');
    const jids = [
      digits ? `${digits}@s.whatsapp.net` : null,
      c.waLid ? `${c.waLid}@lid` : null,
    ].filter(Boolean) as string[];

    let url: string | undefined;
    for (const j of jids) {
      try {
        url = await sock.profilePictureUrl(j, 'image', 8000);
        if (url) break;
      } catch {
        // gagal jaringan / timeout — biarkan pengecekan tidak tercatat
        // supaya percobaan berikutnya tetap jalan.
        return false;
      }
    }
    const now = new Date();
    if (!url) {
      // WA tidak memberikan foto (privasi menutup / tanpa foto) — catat
      // pengecekan agar tidak diulang tiap ada pesan masuk.
      await prisma.customer.update({
        where: { id: c.id },
        data: { photoCheckedAt: now },
      });
      return false;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return false;
    const ext = ct.includes('png')
      ? 'png'
      : ct.includes('webp')
        ? 'webp'
        : 'jpg';

    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    // hapus file lama berekstensi lain (satu file per pelanggan)
    try {
      for (const n of fs.readdirSync(PHOTO_DIR)) {
        if (n.startsWith(`${c.id}.`) && n !== `${c.id}.${ext}`) {
          fs.unlinkSync(path.join(PHOTO_DIR, n));
        }
      }
    } catch {}
    fs.writeFileSync(path.join(PHOTO_DIR, `${c.id}.${ext}`), buf);

    await prisma.customer.update({
      where: { id: c.id },
      data: {
        photoUrl: `/api/customers/photo?customerId=${c.id}&v=${now.getTime()}`,
        photoCheckedAt: now,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Perbarui foto pelanggan yang belum ada / sudah lewat 7 hari.
 * Dipakai tombol "Perbarui foto" di Inbox; dibatasi agar tidak
 * membanjiri koneksi WA (25 pelanggan, jeda antar panggilan).
 */
export async function refreshOrgPhotos(
  orgId: string,
  sock: any,
  limit = 25,
): Promise<{ checked: number; updated: number; unavailable: number }> {
  const cutoff = new Date(Date.now() - REFRESH_MS);
  const customers = await prisma.customer.findMany({
    where: {
      organizationId: orgId,
      OR: [{ photoCheckedAt: null }, { photoCheckedAt: { lt: cutoff } }],
    },
    select: { id: true },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
  });
  let updated = 0;
  let unavailable = 0;
  for (const c of customers) {
    const ok = await refreshCustomerPhoto(orgId, c.id, sock);
    if (ok) updated++;
    else unavailable++;
    await new Promise((r) => setTimeout(r, 400));
  }
  return { checked: customers.length, updated, unavailable };
}
