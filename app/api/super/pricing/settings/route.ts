import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  bodyInt,
  getBillingSettings,
  readJsonBody,
  recordPackageAudit,
  summarizeBillingSettings,
} from '@/lib/pricing-catalog';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/super/pricing/settings — ubah pengaturan billing
 * (ppnRateBps 0–10000, invoiceValidityHours 1–168 jam, trialEnabled
 * boolean). Buat default bila belum ada. Berlaku hanya untuk invoice
 * yang terbit setelah perubahan; trialEnabled berlaku untuk pendaftaran
 * baru setelah perubahan.
 */
export async function PATCH(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const body = await readJsonBody(req);

    const data: { ppnRateBps?: number; invoiceValidityHours?: number; trialEnabled?: boolean } = {};
    if (body.ppnRateBps !== undefined) {
      const v = bodyInt(body.ppnRateBps, 'Tarif PPN', { min: 0 });
      if (v === null || v === undefined) {
        throw apiErr('Tarif PPN wajib diisi.', 400);
      }
      if (v > 10000) throw apiErr('Tarif PPN maksimal 10000 bps (100%).', 400);
      data.ppnRateBps = v;
    }
    if (body.invoiceValidityHours !== undefined) {
      const v = bodyInt(body.invoiceValidityHours, 'Masa berlaku invoice', { min: 1 });
      if (v === null || v === undefined) {
        throw apiErr('Masa berlaku invoice wajib diisi.', 400);
      }
      if (v > 168) throw apiErr('Masa berlaku invoice maksimal 168 jam (7 hari).', 400);
      data.invoiceValidityHours = v;
    }
    if (body.trialEnabled !== undefined) {
      if (typeof body.trialEnabled !== 'boolean') {
        throw apiErr('trialEnabled harus boolean.', 400);
      }
      data.trialEnabled = body.trialEnabled;
    }
    if (Object.keys(data).length === 0) {
      return apiErr('Tidak ada perubahan yang dikirim.', 400);
    }

    const before = await getBillingSettings();
    const updated = await masterPrisma.billingSettings.update({
      where: { id: before.id },
      data,
    });
    await recordPackageAudit(ctx.userId, 'BILLING_SETTINGS_UPDATED', {
      before: summarizeBillingSettings(before),
      after: summarizeBillingSettings(updated),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah pengaturan billing.', 500);
  }
}
