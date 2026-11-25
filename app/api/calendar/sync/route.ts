// POST /api/calendar/sync — jalankan sinkronisasi kalender.
// Body: { sourceModule, sourceRecordId } -> sync satu record;
// tanpa body -> sync semua sumber di organisasi. Butuh CALENDAR_MANAGE.
import { z } from 'zod';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { isValidSourceModule } from '@/lib/calendar/constants';
import { syncSourceEvent, syncAllSources } from '@/lib/calendar/sync';

export const dynamic = 'force-dynamic';

const syncSchema = z
  .object({
    sourceModule: z.string().optional(),
    sourceRecordId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasModule = !!data.sourceModule;
    const hasRecord = !!data.sourceRecordId;
    if (hasModule !== hasRecord) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sourceModule dan sourceRecordId harus diisi bersamaan, atau dikosongkan keduanya (sync semua).',
      });
    }
    if (hasModule && !isValidSourceModule(data.sourceModule)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceModule'],
        message: `sourceModule tidak valid: ${data.sourceModule}.`,
      });
    }
  });

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const parsed = syncSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data sync tidak valid.', 400, parsed.error.errors);
    }
    const { sourceModule, sourceRecordId } = parsed.data;
    let summary;
    if (sourceModule && sourceRecordId) {
      const r = await syncSourceEvent(ctx.organizationId, sourceModule, sourceRecordId);
      summary = {
        created: r.action === 'created' ? 1 : 0,
        updated: r.action === 'updated' ? 1 : 0,
        cancelled: r.action === 'cancelled' ? 1 : 0,
        deleted: r.action === 'deleted' ? 1 : 0,
        failed: r.action === 'failed' ? 1 : 0,
        skipped: r.action === 'skipped' || r.action === 'unchanged' ? 1 : 0,
        results: [r],
      };
    } else {
      summary = await syncAllSources(ctx.organizationId);
    }
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CALENDAR_SYNC',
      module: 'CALENDAR',
      description: sourceModule
        ? `Sinkronisasi kalender sumber ${sourceModule}:${sourceRecordId}`
        : `Sinkronisasi semua sumber kalender (dibuat ${summary.created}, diubah ${summary.updated}, dibatalkan ${summary.cancelled}, dihapus ${summary.deleted}, gagal ${summary.failed})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ summary });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/sync POST]', e);
    return apiErr('Gagal menjalankan sinkronisasi kalender.', 500);
  }
}
