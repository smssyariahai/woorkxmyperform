import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function getCampaign(ctx: { organizationId: string }, id: string) {
  return prisma.campaign.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, name: true, status: true, imagePath: true },
  });
}

/** GET — serve gambar poster (butuh akses broadcast). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requirePermission('BROADCAST_CREATE');
  const c = await getCampaign(ctx, params.id);
  if (!c?.imagePath) return apiErr('Tidak ada gambar.', 404);
  const safe = c.imagePath.split('/').pop()!.split('\\').pop()!;
  const full = join(process.cwd(), 'uploads', 'campaigns', safe);
  if (!existsSync(full)) return apiErr('File tidak ditemukan.', 404);
  const buf = await readFile(full);
  return new Response(buf, {
    headers: {
      'Content-Type': MIME[extname(safe).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

/** POST — upload poster (multipart field: image). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requirePermission('BROADCAST_CREATE');
  const c = await getCampaign(ctx, params.id);
  if (!c) return apiErr('Campaign tidak ditemukan.', 404);
  if (c.status === 'SENDING') {
    return apiErr('Campaign sedang dikirim — gambar tidak bisa diubah.', 409);
  }

  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return apiErr('Tidak ada file gambar.', 422);
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return apiErr('Format harus PNG, JPG, atau WEBP.', 422);
  }
  if (file.size > MAX_BYTES) {
    return apiErr('Ukuran maksimal 5MB.', 422);
  }
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return apiErr('Ekstensi tidak didukung.', 422);

  const dir = join(process.cwd(), 'uploads', 'campaigns');
  await mkdir(dir, { recursive: true });
  const stored = `${c.id}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(join(dir, stored), Buffer.from(await file.arrayBuffer()));

  // hapus file lama
  if (c.imagePath) {
    const old = join(dir, c.imagePath.split('/').pop()!.split('\\').pop()!);
    await unlink(old).catch(() => {});
  }

  await prisma.campaign.update({ where: { id: c.id }, data: { imagePath: stored } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'UPLOAD_CAMPAIGN_IMAGE',
    module: 'BROADCAST',
    description: `Mengunggah poster untuk campaign "${c.name}"`,
    ipAddress: getClientIp(req),
  });
  return apiOk({ imageUrl: `/api/campaigns/${c.id}/image` });
}

/** DELETE — hapus poster. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requirePermission('BROADCAST_CREATE');
  const c = await getCampaign(ctx, params.id);
  if (!c) return apiErr('Campaign tidak ditemukan.', 404);
  if (c.status === 'SENDING') {
    return apiErr('Campaign sedang dikirim — gambar tidak bisa diubah.', 409);
  }
  if (c.imagePath) {
    const full = join(
      process.cwd(), 'uploads', 'campaigns',
      c.imagePath.split('/').pop()!.split('\\').pop()!
    );
    await unlink(full).catch(() => {});
    await prisma.campaign.update({ where: { id: c.id }, data: { imagePath: null } });
  }
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'DELETE_CAMPAIGN_IMAGE',
    module: 'BROADCAST',
    description: `Menghapus poster campaign "${c.name}"`,
    ipAddress: getClientIp(req),
  });
  return apiOk({ removed: true });
}
