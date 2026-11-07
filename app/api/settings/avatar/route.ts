import { NextRequest } from 'next/server';
import { getAuthContext } from '@/lib/auth-helpers';
import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

/** Foto hasil upload disimpan sebagai URL rute penyaji; foto Google tetap URL eksternal. */
function isUploadedAvatar(avatar: string | null | undefined): avatar is string {
  return !!avatar && avatar.startsWith('/api/users/avatar');
}

async function removeUploadedFile(avatar: string | null | undefined) {
  if (!isUploadedAvatar(avatar)) return;
  const file = avatar.split('?')[0].split('/').pop();
  if (!file) return;
  await unlink(join(process.cwd(), 'uploads', 'avatars', file)).catch(() => {});
}

/**
 * Upload foto profil pribadi. Field multipart: avatar.
 * Siapa pun yang login boleh mengganti fotonya sendiri.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return apiErr('Unauthorized', 401);
  try {
    const form = await req.formData();
    const file = form.get('avatar');
    if (!(file instanceof File) || file.size === 0) {
      return apiErr('Tidak ada file gambar yang diunggah.', 422);
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return apiErr('Format gambar harus PNG, JPG, WEBP, atau SVG.', 400);
    }
    if (file.size > MAX_BYTES) {
      return apiErr('Ukuran gambar maksimal 2MB.', 400);
    }
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return apiErr('Ekstensi gambar tidak didukung.', 400);
    }
    const dir = join(process.cwd(), 'uploads', 'avatars');
    await mkdir(dir, { recursive: true });
    const stored = `${ctx.userId}-avatar-${randomUUID().slice(0, 8)}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, stored), buf);

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { avatar: true },
    });
    await removeUploadedFile(user?.avatar);

    // `v=` membatalkan cache browser setelah foto diganti.
    const avatar = `/api/users/avatar?userId=${ctx.userId}&v=${Date.now()}`;
    await prisma.user.update({ where: { id: ctx.userId }, data: { avatar } });
    return apiOk({ avatar });
  } catch (e: any) {
    return apiErr(e.message || 'Gagal mengunggah foto.', 400);
  }
}

/** Hapus foto profil (kembali ke huruf awal). */
export async function DELETE() {
  const ctx = await getAuthContext();
  if (!ctx) return apiErr('Unauthorized', 401);
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { avatar: true },
  });
  await removeUploadedFile(user?.avatar);
  await prisma.user.update({ where: { id: ctx.userId }, data: { avatar: null } });
  return apiOk({ removed: true });
}
