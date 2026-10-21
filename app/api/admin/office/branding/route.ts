import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth-helpers';
import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

async function saveImage(file: File, orgId: string, kind: 'logo' | 'cover'): Promise<string> {
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new Error('Format gambar harus PNG, JPG, WEBP, atau SVG.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Ukuran gambar maksimal 2MB.');
  }
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error('Ekstensi gambar tidak didukung.');
  }
  const dir = join(process.cwd(), 'uploads', 'offices');
  await mkdir(dir, { recursive: true });
  const stored = `${orgId}-${kind}-${randomUUID().slice(0, 8)}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, stored), buf);
  return stored;
}

/**
 * Upload logo / cover kantor. Butuh SETTINGS_MANAGE (Admin Kantor, IT Support).
 * Field multipart: logo?, cover?
 */
export async function POST(req: NextRequest) {
  const ctx = await requirePermission('SETTINGS_MANAGE', req);
  try {
    const form = await req.formData();
    const logo = form.get('logo');
    const cover = form.get('cover');
    if (!(logo instanceof File) && !(cover instanceof File)) {
      return apiErr('Tidak ada file gambar yang diunggah.', 422);
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, logoPath: true, coverPath: true },
    });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);

    const data: { logoPath?: string; coverPath?: string } = {};
    const dir = join(process.cwd(), 'uploads', 'offices');

    if (logo instanceof File && logo.size > 0) {
      const stored = await saveImage(logo, org.id, 'logo');
      if (org.logoPath && existsSync(join(dir, org.logoPath))) {
        await unlink(join(dir, org.logoPath)).catch(() => {});
      }
      data.logoPath = stored;
    }
    if (cover instanceof File && cover.size > 0) {
      const stored = await saveImage(cover, org.id, 'cover');
      if (org.coverPath && existsSync(join(dir, org.coverPath))) {
        await unlink(join(dir, org.coverPath)).catch(() => {});
      }
      data.coverPath = stored;
    }

    await prisma.organization.update({ where: { id: org.id }, data });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_OFFICE_BRANDING',
      module: 'OFFICES',
      description: `Memperbarui identitas visual kantor (${Object.keys(data).join(', ')})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ ...data });
  } catch (e: any) {
    // requirePermission melempar 403 sendiri; error lain jadi 400
    if (e.message === 'FORBIDDEN') throw e;
    return apiErr(e.message || 'Gagal mengunggah gambar.', 400);
  }
}

/** Hapus logo / cover. Body: { kind: 'logo' | 'cover' } */
export async function DELETE(req: NextRequest) {
  const ctx = await requirePermission('SETTINGS_MANAGE', req);
  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === 'cover' ? 'cover' : 'logo';
  const field = kind === 'cover' ? 'coverPath' : 'logoPath';

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { id: true, logoPath: true, coverPath: true },
  });
  if (!org) return apiErr('Kantor tidak ditemukan.', 404);

  const old = org[field];
  if (old) {
    await unlink(join(process.cwd(), 'uploads', 'offices', old)).catch(() => {});
  }
  await prisma.organization.update({ where: { id: org.id }, data: { [field]: null } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'UPDATE_OFFICE_BRANDING',
    module: 'OFFICES',
    description: `Menghapus ${kind} kantor`,
    ipAddress: getClientIp(req),
  });
  return apiOk({ removed: kind });
}
