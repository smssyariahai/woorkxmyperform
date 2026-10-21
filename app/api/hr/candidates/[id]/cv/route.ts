import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';

export const dynamic = 'force-dynamic';

/** GET /api/hr/candidates/[id]/cv — unduh CV kandidat (butuh HR_VIEW). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const c = await prisma.hrCandidate.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, name: true, cvUrl: true, cvName: true },
    });
    if (!c || !c.cvUrl) return apiErr('CV tidak ditemukan.', 404);

    // cvUrl tersimpan sebagai "uploads:<nama-file>" atau path endpoint lama
    const m = /^uploads:(.+)$/.exec(c.cvUrl);
    if (!m) return apiErr('CV tidak ditemukan.', 404);
    const file = join(process.cwd(), 'uploads', 'cv', basename(m[1]));
    let buf: Buffer;
    try {
      buf = await readFile(file);
    } catch {
      return apiErr('File CV tidak ditemukan di server.', 404);
    }

    const filename = (c.cvName || `CV-${c.name}.pdf`).replace(/["\r\n]/g, '');
    const ext = filename.split('.').pop()?.toLowerCase();
    const mime = ext === 'pdf' ? 'application/pdf'
      : ext === 'doc' ? 'application/msword'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const body = new Uint8Array(buf);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(body.length),
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunduh CV.', 500);
  }
}
