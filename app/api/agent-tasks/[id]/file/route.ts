import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { kantorReportFilePath } from '@/lib/agents/reports';

export const dynamic = 'force-dynamic';

// GET /api/agent-tasks/[id]/file — unduh file laporan hasil tugas agent.
// File TIDAK pernah di-expose lewat URL /uploads langsung: hanya disajikan
// lewat route ini, setelah cek INBOX_VIEW + modul kantor + organisasi
// tugas + guard traversal pada path tersimpan (kantorReportFilePath).
// 404 bila tugas tidak ditemukan, tidak punya file laporan, atau file
// fisiknya hilang.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    const task = await prisma.agentTask.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, createdById: true, resultPayload: true },
    });
    if (!task) return new Response('Not found', { status: 404 });
    // Wave 16 — riwayat per-user: file laporan milik user lain tidak bisa
    // diunduh lewat ID (404). Tugas lama tanpa createdById tetap bisa.
    if (task.createdById && task.createdById !== ctx.userId) return new Response('Not found', { status: 404 });
    let stored: any = null;
    try {
      stored = JSON.parse(task.resultPayload || 'null');
    } catch {
      stored = null;
    }
    const info = stored?.reportFile;
    if (!info || typeof info.path !== 'string') return new Response('Not found', { status: 404 });
    const full = kantorReportFilePath(info.path, ctx.organizationId);
    if (!full || !existsSync(full)) return new Response('Not found', { status: 404 });
    const buf = await readFile(full);
    const safeName = String(info.name || 'laporan').replace(/["\r\n]/g, '');
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': info.mime || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat file.', 500);
  }
}
