import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getAutomationSettings,
  shapeAutomationSettings,
  updateAutomationSettings,
} from '@/lib/tenant/subscription-automation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** GET /api/super/subscriptions/settings — pengaturan otomasi.
 *  Guard: PLATFORM_TENANTS_VIEW. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const settings = await getAutomationSettings();
    return apiOk({ settings: shapeAutomationSettings(settings) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan otomasi.', 500);
  }
}

/** PATCH /api/super/subscriptions/settings — ubah pengaturan otomasi.
 *  Guard: PLATFORM_TENANTS_MANAGE. Body boleh sebagian:
 *  { graceDays 1-30, invoiceLeadDays 1-30, reminderDaysBeforeGraceEnd
 *  int[] 0-14 (maks 5 nilai), retentionReminderDaysBefore 1-30,
 *  automationEnabled bool }. Dicatat PlatformAuditLog
 *  AUTOMATION_SETTINGS_UPDATED. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_TENANTS_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const settings = await updateAutomationSettings(body ?? {}, ctx.userId);
    return apiOk({ settings });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menyimpan pengaturan otomasi.', 500);
  }
}
