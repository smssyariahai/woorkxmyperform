import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { applyTemplateToPeriod } from '@/lib/tal/server';
import { TAL_DEFAULT_ROUTINE_TEMPLATES } from '@/lib/tal/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tal/routine-templates/apply — terapkan template ke periode.
 * Body: { templateId, scopeType, targetDateStr?, targetWeekNumber?,
 * targetWeekYear?, targetMonth?, targetYear?, includeMonthly?,
 * includeWeekly?, includeDaily?, dailyMappingMode? }
 * Tugas harian pada Minggu/libur/cuti dilewati (dicatat di `skipped`).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const templateId = body.templateId as string;
    const scopeType = body.scopeType as string;
    if (!templateId) return apiErr('templateId wajib diisi.', 400);
    if (!['daily', 'weekly', 'monthly'].includes(scopeType)) {
      return apiErr('scopeType harus daily, weekly, atau monthly.', 400);
    }

    let template: any = null;
    if (templateId.startsWith('preset_')) {
      template = TAL_DEFAULT_ROUTINE_TEMPLATES.find((t) => t.id === templateId) ?? null;
    } else {
      const row = await prisma.talRoutineTemplate.findFirst({
        where: { organizationId: ctx.organizationId, id: templateId },
      });
      if (row) {
        template = { id: row.id, template: row.template ?? {} };
      }
    }
    if (!template) return apiErr('Template tidak ditemukan.', 404);

    const { created, skipped } = await applyTemplateToPeriod(ctx, template, {
      scopeType: scopeType as 'daily' | 'weekly' | 'monthly',
      targetDateStr: body.targetDateStr,
      targetWeekNumber: body.targetWeekNumber,
      targetWeekYear: body.targetWeekYear,
      targetMonth: body.targetMonth,
      targetYear: body.targetYear,
      includeMonthly: body.includeMonthly !== false,
      includeWeekly: body.includeWeekly !== false,
      includeDaily: body.includeDaily !== false,
      dailyMappingMode: body.dailyMappingMode === 'current_day_only' ? 'current_day_only' : 'full_work_week',
    });
    return apiOk({ created, skipped, count: created.length });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menerapkan template TAL.', 500);
  }
}
