// GET /api/perusahaan/dokumen/[id]/file — stream file dokumen terotorisasi.
//
// - Butuh membership aktif + PERUSAHAAN_VIEW (requirePermission).
// - Cegah path traversal: hanya basename dari filePath tersimpan yang dipakai.
// - Content-Type dari mimeType tersimpan; Content-Disposition inline untuk
//   preview PDF/gambar di browser. File TIDAK diekspos lewat URL publik.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { perusahaanFilePath } from '@/lib/perusahaan/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_VIEW', req);
    const doc = await prisma.companyDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, filePath: true, mimeType: true, originalName: true },
    });
    if (!doc) {
      return new Response('Not found', { status: 404 });
    }
    const full = perusahaanFilePath(doc.filePath);
    if (!full || !existsSync(full)) {
      return new Response('Not found', { status: 404 });
    }
    const buf = await readFile(full);
    const safeName = doc.originalName.replace(/["\\\r\n]/g, '_');
    return new Response(buf, {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return new Response('Gagal memuat file.', { status: 500 });
  }
}
