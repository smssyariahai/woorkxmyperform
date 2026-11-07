import { prisma } from '@/lib/db';
import { getAuthContext } from '@/lib/auth-helpers';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Serve foto profil hasil upload. Butuh login; yang boleh melihat: pemilik
 * foto, Administrator Pusat, atau anggota kantor yang sama dengan pemilik.
 * Foto dari Google (URL eksternal) tidak lewat rute ini — dipakai langsung.
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = new URL(req.url).searchParams.get('userId') || '';
  if (!userId) {
    return new Response('Not found', { status: 404 });
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });
  if (!target?.avatar || !target.avatar.startsWith('/api/users/avatar')) {
    return new Response('Not found', { status: 404 });
  }
  const allowed =
    ctx.userId === userId ||
    ctx.isSuperAdmin ||
    (await prisma.membership.findFirst({
      where: {
        userId: ctx.userId,
        status: 'ACTIVE',
        organization: {
          memberships: { some: { userId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    })) !== null;
  if (!allowed) {
    return new Response('Not found', { status: 404 });
  }
  // Cegah path traversal: hanya basename dari URL avatar yang tersimpan.
  const safe = target.avatar
    .split('?')[0]
    .split('/')
    .pop()!
    .split('\\')
    .pop()!;
  const full = join(process.cwd(), 'uploads', 'avatars', safe);
  if (!existsSync(full)) {
    return new Response('Not found', { status: 404 });
  }
  const buf = await readFile(full);
  const ext = extname(safe).toLowerCase();
  return new Response(buf, {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
