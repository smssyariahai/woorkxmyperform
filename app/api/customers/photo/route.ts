import { prisma } from '@/lib/db';
import { getAuthContext } from '@/lib/auth-helpers';
import { customerPhotoFile } from '@/lib/wa/profile-photo';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Serve foto profil WA pelanggan (disimpan lokal di uploads/customers/).
 * Butuh login; yang boleh melihat: Administrator Pusat, atau anggota
 * kantor yang sama dengan pelanggan. File dicari dari customerId
 * (satu file per pelanggan), bukan dari path yang dikirim klien.
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }
  const customerId = new URL(req.url).searchParams.get('customerId') || '';
  if (!customerId) {
    return new Response('Not found', { status: 404 });
  }
  const target = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { organizationId: true, photoUrl: true },
  });
  if (!target?.photoUrl || !target.photoUrl.startsWith('/api/customers/photo')) {
    return new Response('Not found', { status: 404 });
  }
  const allowed =
    ctx.isSuperAdmin ||
    (await prisma.membership.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: target.organizationId,
        status: 'ACTIVE',
      },
      select: { id: true },
    })) !== null;
  if (!allowed) {
    return new Response('Not found', { status: 404 });
  }
  const full = customerPhotoFile(customerId);
  if (!full || !existsSync(full)) {
    return new Response('Not found', { status: 404 });
  }
  const buf = await readFile(full);
  const ext = extname(full).toLowerCase();
  return new Response(buf, {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
