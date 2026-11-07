import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { calcSubscriptionTotal, MODULAR_MODULE_MAP, periodEndFrom } from '@/lib/modular';
import { getModulePrices, getSubscription, nextInvoiceNumber } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/renew — buat invoice perpanjangan (PENDING) untuk
 * langganan kantor saat ini. Modul, kuota, dan siklus mengikuti langganan
 * aktif; periode baru mulai dari akhir periode berjalan (atau hari ini bila
 * sudah berakhir). Pembayaran tetap manual — Administrator Pusat menandai
 * lunas di /admin/invoices.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE', req);
    const sub = await getSubscription(ctx.organizationId);
    if (!sub) return apiErr('Kantor ini belum memiliki langganan.', 422);
    if (sub.status === 'PENDING_PAYMENT') {
      return apiErr('Masih ada invoice pertama yang menunggu pembayaran.', 422);
    }
    if (sub.status === 'CANCELLED') {
      return apiErr('Langganan ini sudah dibatalkan. Hubungi Administrator Pusat.', 422);
    }
    const existing = await prisma.invoice.findFirst({
      where: { organizationId: ctx.organizationId, subscriptionId: sub.id, status: 'PENDING' },
      select: { id: true, number: true },
    });
    if (existing) {
      return apiErr(`Sudah ada invoice perpanjangan yang menunggu pembayaran (${existing.number}).`, 422);
    }

    const prices = await getModulePrices();
    const moduleKeys = sub.modules.length > 0
      ? sub.modules.filter((m) => m.status === 'ACTIVE').map((m) => m.moduleKey)
      : ['chat', 'hris', 'audit'];
    const chosenPrices = prices.filter((p) => moduleKeys.includes(p.moduleKey));
    const cycle = (sub.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY') as 'MONTHLY' | 'YEARLY';
    const total = calcSubscriptionTotal({ modules: chosenPrices, userQuota: sub.userQuota, cycle });
    const periodStart = sub.endDate && sub.endDate.getTime() > Date.now() ? new Date(sub.endDate) : new Date();
    const periodEnd = periodEndFrom(periodStart, cycle);
    const cycleLabel = cycle === 'YEARLY' ? 'tahunan' : 'bulanan';

    const invoice = await prisma.$transaction(async (tx) => {
      const number = await nextInvoiceNumber(tx as any);
      const dueDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      return tx.invoice.create({
        data: {
          organizationId: ctx.organizationId,
          subscriptionId: sub.id,
          number,
          status: 'PENDING',
          billingCycle: cycle,
          periodStart,
          periodEnd,
          subtotal: total,
          total,
          dueDate,
          items: {
            create: chosenPrices.map((p) => {
              const unit = cycle === 'YEARLY' ? p.yearlyPerUser : p.monthlyPerUser;
              const label = MODULAR_MODULE_MAP.get(p.moduleKey as any)?.label ?? p.moduleKey;
              return {
                moduleKey: p.moduleKey,
                description: `Perpanjangan Modul ${label} — ${sub.userQuota} pengguna (${cycleLabel})`,
                quantity: sub.userQuota,
                unitPrice: unit,
                amount: unit * sub.userQuota,
              };
            }),
          },
        },
        include: { items: true },
      });
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'INVOICE_RENEW',
      module: 'BILLING',
      description: `Admin kantor membuat invoice perpanjangan ${invoice.number} (Rp${total.toLocaleString('id-ID')}, ${cycleLabel})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ invoice }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat invoice perpanjangan.', 500);
  }
}
