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
 * Serve logo kantor untuk aplikasi (sidebar). Butuh login + membership aktif
 * di kantor itu (atau Administrator Pusat). Berbeda dengan rute publik
 * /api/o/[subdomain]/logo: rute ini tidak butuh subdomain, jadi kantor yang
 * belum punya subdomain (mis. WOORK.ID) tetap bisa menampilkan logonya.
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }
  const orgId = new URL(req.url).searchParams.get('orgId') || '';
  if (!orgId) {
    return new Response('Not found', { status: 404 });
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, organizationId: orgId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!membership && !ctx.isSuperAdmin) {
    return new Response('Not found', { status: 404 });
  }
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoPath: true },
  });
  if (!org?.logoPath) {
    return new Response('Not found', { status: 404 });
  }
  // Cegah path traversal: hanya basename
  const safe = org.logoPath.split('/').pop()!.split('\\').pop()!;
  const full = join(process.cwd(), 'uploads', 'offices', safe);
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
