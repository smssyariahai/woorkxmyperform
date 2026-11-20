// GET /api/koperasi/anggota/[id]/foto?type=ktp|anggota|ttd — serve file foto
// anggota. Pola app/api/customers/photo/route.ts: butuh login, anggota harus
// milik organisasi peminta (atau Administrator Pusat), 404 bila tidak ada
// file; Content-Type sesuai ekstensi.
import { prisma } from '@/lib/db';
import { getAuthContext } from '@/lib/auth-helpers';
import { koperasiPhotoPath } from '@/lib/koperasi/server';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const FIELD: Record<string, string> = {
  ktp: 'fotoKtpPath',
  anggota: 'fotoAnggotaPath',
  ttd: 'tandaTanganPath',
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) return new Response('Unauthorized', { status: 401 });
  const type = new URL(req.url).searchParams.get('type') ?? '';
  const field = FIELD[type];
  if (!field) return new Response('Not found', { status: 404 });
  const row = await prisma.koperasiAnggota.findUnique({
    where: { id: params.id },
    select: { organizationId: true, fotoKtpPath: true, fotoAnggotaPath: true, tandaTanganPath: true },
  });
  if (!row) return new Response('Not found', { status: 404 });
  const allowed =
    ctx.isSuperAdmin ||
    (await prisma.membership.findFirst({
      where: { userId: ctx.userId, organizationId: row.organizationId, status: 'ACTIVE' },
      select: { id: true },
    })) !== null;
  if (!allowed) return new Response('Not found', { status: 404 });
  const storedPath = (row as Record<string, string>)[field] ?? '';
  const full = koperasiPhotoPath(storedPath);
  if (!full || !existsSync(full)) return new Response('Not found', { status: 404 });
  const buf = await readFile(full);
  const ext = extname(full).toLowerCase();
  return new Response(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
