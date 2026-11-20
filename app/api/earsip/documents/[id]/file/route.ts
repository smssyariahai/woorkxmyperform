// GET /api/earsip/documents/[id]/file — stream file dokumen arsip.
// JANGAN PERNAH expose URL /uploads langsung: file hanya disajikan lewat
// route ini, setelah cek EARSIP_VIEW + aturan kerahasiaan (CONFIDENTIAL
// hanya Super Admin / EARSIP_MANAGE; selain itu 404). ?download=1 untuk
// memaksa unduhan (Content-Disposition: attachment), default inline
// (preview PDF/gambar di tab baru).
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { canAccessConfidential, earsipFilePath } from '@/lib/earsip/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('EARSIP_VIEW', req);
    const row = await prisma.archiveDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true, filePath: true, fileName: true, mimeType: true, confidentiality: true },
    });
    if (!row) return new Response('Not found', { status: 404 });
    if (row.confidentiality === 'CONFIDENTIAL' && !(await canAccessConfidential(ctx))) {
      return new Response('Not found', { status: 404 });
    }
    const full = earsipFilePath(row.filePath);
    if (!full || !existsSync(full)) return new Response('Not found', { status: 404 });
    const buf = await readFile(full);
    const download = new URL(req.url).searchParams.get('download') === '1';
    const safeName = row.fileName.replace(/["\r\n]/g, '');
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DOWNLOAD_EARSIP_DOCUMENT',
      module: 'EARSIP',
      description: `${ctx.name} ${download ? 'mengunduh' : 'membuka'} file dokumen arsip "${row.title}" (${row.fileName})`,
      ipAddress: getClientIp(req),
    });
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': row.mimeType || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat file.', 500);
  }
}
