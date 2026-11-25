// Laporan kunci (TalLockReport) + aksi batch admin — porting endpoint backup:
//   GET  /api/pg/tal/locks/all          -> GET ?all=1 (admin) / milik sendiri
//   POST /api/pg/tal/locks/batch-unlock -> POST { action: 'batch-unlock', ids[], reason }
//   POST /api/pg/tal/locks/batch-reset  -> POST { action: 'batch-reset', ids[], reason }
//   GET  /api/pg/tal/audit-logs         -> GET ?audit=1 (admin; route khusus
//        tidak ada di daftar file sub-tahap b, jadi digabung di sini)
// Aksi batch: admin-only (§5.2/§5.3) + TalAuditLog (unlock_plans /
// reset_reports) dengan alasan wajib.
import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { talIsHrAdmin, talWriteAuditLog } from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

const mapReport = (r: any) => ({
  id: r.id,
  scope: r.scope,
  scopeKey: r.scopeKey,
  userId: r.userId,
  isPlanLocked: r.isPlanLocked,
  planLockedAt: r.planLockedAt ? new Date(r.planLockedAt).toISOString() : null,
  isReported: r.isReported,
  reportedAt: r.reportedAt ? new Date(r.reportedAt).toISOString() : null,
  payload: r.payload || {},
  createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
});

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const url = new URL(req.url);

    // Daftar audit log TAL (admin-only)
    if (url.searchParams.get('audit') === '1') {
      if (!talIsHrAdmin(ctx)) return apiErr('Anda tidak memiliki akses melihat audit log TAL.', 403);
      const actionType = url.searchParams.get('actionType') || undefined;
      const rows = await prisma.talAuditLog.findMany({
        where: { organizationId: ctx.organizationId, ...(actionType ? { actionType } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return apiOk({ auditLogs: rows });
    }

    const admin = talIsHrAdmin(ctx);
    const scope = url.searchParams.get('scope') || undefined;
    const scopeKey = url.searchParams.get('scopeKey') || undefined;
    let userId: string | undefined = ctx.userId;
    if (admin && url.searchParams.get('all') === '1') {
      userId = url.searchParams.get('userId') || undefined;
    }
    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (scope) where.scope = scope;
    if (scopeKey) where.scopeKey = scopeKey;
    if (userId) where.userId = userId;
    const rows = await prisma.talLockReport.findMany({
      where: where as never,
      orderBy: [{ scopeKey: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return apiOk({ reports: rows.map(mapReport) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat laporan kunci TAL.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh melakukan aksi batch kunci TAL.', 403);
    const b = (await req.json().catch(() => ({}))) as any;
    const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return apiErr('ids wajib diisi (array id laporan kunci).', 400);
    const reason = String(b.reason || '').trim();
    if (!reason) return apiErr('Alasan wajib diisi untuk aksi batch kunci TAL.', 400);

    if (b.action === 'batch-unlock') {
      const rows = await prisma.talLockReport.findMany({
        where: { organizationId: ctx.organizationId, id: { in: ids } },
        select: { id: true, scope: true, scopeKey: true, userId: true, payload: true },
      });
      for (const r of rows) {
        const payload = { ...(r.payload as any || {}) };
        delete payload.lockedBy;
        delete payload.lockNotes;
        payload.isPlanLocked = false;
        payload.planLockedAt = null;
        await prisma.talLockReport.update({
          where: { id: r.id },
          data: { isPlanLocked: false, planLockedAt: null, payload: payload as any },
        });
      }
      await talWriteAuditLog(ctx, {
        actionType: 'unlock_plans',
        actionTitle: 'Buka kunci plan (batch)',
        reason,
        targetSummary: `${rows.length} laporan kunci: ${rows.map((r) => `${r.scope} ${r.scopeKey}`).slice(0, 5).join(', ')}${rows.length > 5 ? '…' : ''}`,
        affectedCount: rows.length,
        details: { ids: rows.map((r) => r.id) },
      });
      return apiOk({ ok: true, affected: rows.length });
    }

    if (b.action === 'batch-reset') {
      const rows = await prisma.talLockReport.findMany({
        where: { organizationId: ctx.organizationId, id: { in: ids } },
        select: { id: true, scope: true, scopeKey: true, userId: true, payload: true },
      });
      for (const r of rows) {
        const payload = { ...(r.payload as any || {}) };
        delete payload.reportedBy;
        delete payload.reportNotes;
        delete payload.scorePercent;
        delete payload.reportSummary;
        payload.isReported = false;
        payload.reportedAt = null;
        await prisma.talLockReport.update({
          where: { id: r.id },
          data: { isReported: false, reportedAt: null, payload: payload as any },
        });
      }
      await talWriteAuditLog(ctx, {
        actionType: 'reset_reports',
        actionTitle: 'Reset laporan (batch)',
        reason,
        targetSummary: `${rows.length} laporan kunci: ${rows.map((r) => `${r.scope} ${r.scopeKey}`).slice(0, 5).join(', ')}${rows.length > 5 ? '…' : ''}`,
        affectedCount: rows.length,
        details: { ids: rows.map((r) => r.id) },
      });
      return apiOk({ ok: true, affected: rows.length });
    }

    return apiErr('action tidak dikenal (batch-unlock | batch-reset).', 400);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal melakukan aksi batch kunci TAL.', 500);
  }
}
