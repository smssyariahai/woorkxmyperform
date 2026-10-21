import { prisma } from '@/lib/db';
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

/** Serve cover/hero kantor (publik, untuk situs subdomain). */
export async function GET(_: Request, { params }: { params: { subdomain: string } }) {
  const org = await prisma.organization.findFirst({
    where: { subdomain: params.subdomain.toLowerCase(), isActive: true },
    select: { coverPath: true },
  });
  if (!org?.coverPath) {
    return new Response('Not found', { status: 404 });
  }
  // Cegah path traversal: hanya basename
  const safe = org.coverPath.split('/').pop()!.split('\\').pop()!;
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
