import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CreditCard, CalendarClock, Users, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Card, Badge } from '@/components/ui/primitives';
import { getAuthContext } from '@/lib/auth-helpers';
import { prisma } from '@/lib/db';
import { MODULAR_MODULE_MAP, formatIDR } from '@/lib/modular';
import { effectiveSubscriptionStatus } from '@/lib/subscription';
import { RenewButton } from '@/components/billing/RenewButton';

export const metadata = { title: 'Langganan & Tagihan — WOORK' };

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  ACTIVE: 'green',
  PENDING_PAYMENT: 'amber',
  EXPIRED: 'red',
  SUSPENDED: 'red',
  CANCELLED: 'gray',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  PENDING_PAYMENT: 'Menunggu Pembayaran',
  EXPIRED: 'Berakhir',
  SUSPENDED: 'Ditangguhkan',
  CANCELLED: 'Dibatalkan',
};

export default async function SubscriptionPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [sub, invoices, memberCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      include: { modules: true },
    }),
    prisma.invoice.findMany({
      where: { organizationId: ctx.organizationId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.membership.count({ where: { organizationId: ctx.organizationId, status: 'ACTIVE' } }),
  ]);

  const status = sub ? effectiveSubscriptionStatus(sub as any) : 'ACTIVE';
  const hasPendingInvoice = invoices.some((i) => i.status === 'PENDING');
  const billableModules = sub?.modules?.filter((m) => m.status === 'ACTIVE') ?? [];
  const daysLeft =
    sub?.endDate && status === 'ACTIVE'
      ? Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86_400_000))
      : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto space-y-5">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-brand mb-3">
          <ArrowLeft className="h-4 w-4" /> Kembali ke dashboard
        </Link>
        <h1 className="text-[22px] font-bold text-ink">Langganan & Tagihan</h1>
        <p className="text-sm text-muted">Langganan modul kantor {ctx.organizationName} beserta seluruh invoice.</p>
      </div>

      {!sub ? (
        <Card className="!p-6">
          <p className="text-sm text-muted">
            Kantor ini belum memiliki langganan modul. Hubungi Administrator Pusat untuk mengaktifkan langganan.
          </p>
        </Card>
      ) : (
        <>
          <Card className="!p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wider text-muted">Status Langganan</p>
                <p className="mt-1 flex items-center gap-2">
                  <Badge tone={STATUS_TONE[status] ?? 'gray'}>{STATUS_LABEL[status] ?? status}</Badge>
                  <span className="text-[13.5px] text-ink font-medium">
                    {sub.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'}
                  </span>
                </p>
              </div>
              <RenewButton
                disabled={status === 'PENDING_PAYMENT' || status === 'CANCELLED' || hasPendingInvoice}
                reason={
                  status === 'PENDING_PAYMENT'
                    ? 'Masih ada invoice pertama yang menunggu pembayaran.'
                    : hasPendingInvoice
                      ? 'Sudah ada invoice yang menunggu pembayaran.'
                      : status === 'CANCELLED'
                        ? 'Langganan dibatalkan — hubungi Administrator Pusat.'
                        : undefined
                }
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4 text-[13.5px]">
              <div className="rounded-btn border border-line bg-canvas p-4">
                <p className="flex items-center gap-1.5 text-muted text-[12.5px]"><CalendarClock className="h-4 w-4" /> Periode aktif</p>
                <p className="mt-1 font-semibold text-ink">
                  {sub.startDate ? new Date(sub.startDate).toLocaleDateString('id-ID') : '—'} –{' '}
                  {sub.endDate ? new Date(sub.endDate).toLocaleDateString('id-ID') : '—'}
                </p>
                {daysLeft !== null && <p className="text-muted text-[12.5px] mt-0.5">Sisa {daysLeft} hari</p>}
              </div>
              <div className="rounded-btn border border-line bg-canvas p-4">
                <p className="flex items-center gap-1.5 text-muted text-[12.5px]"><Users className="h-4 w-4" /> Kuota karyawan</p>
                <p className="mt-1 font-semibold text-ink">
                  {memberCount} / {sub.userQuota > 0 ? `${sub.userQuota} pengguna` : 'tanpa batas'}
                </p>
                {sub.userQuota > 0 && memberCount >= sub.userQuota && (
                  <p className="text-danger text-[12.5px] mt-0.5">Kuota penuh — tidak bisa tambah karyawan.</p>
                )}
              </div>
              <div className="rounded-btn border border-line bg-canvas p-4">
                <p className="flex items-center gap-1.5 text-muted text-[12.5px]"><CreditCard className="h-4 w-4" /> Modul berbayar</p>
                <p className="mt-1 font-semibold text-ink">
                  {billableModules.length === 0
                    ? 'Tidak ada (hanya Dashboard & Setting)'
                    : billableModules.map((m) => MODULAR_MODULE_MAP.get(m.moduleKey as any)?.label ?? m.moduleKey).join(', ')}
                </p>
              </div>
            </div>

            {status === 'EXPIRED' && (
              <p className="flex items-start gap-2 rounded-btn bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Masa langganan telah berakhir — seluruh fitur tulis terkunci (baca tetap bisa).
                Perpanjang langganan di atas, lalu hubungi Administrator Pusat untuk konfirmasi pembayaran.
              </p>
            )}
            {status === 'PENDING_PAYMENT' && (
              <p className="flex items-start gap-2 rounded-btn bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-800">
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                Langganan menunggu pembayaran invoice pertama. Admin kantor baru bisa login setelah
                Administrator Pusat menandai invoice lunas.
              </p>
            )}
          </Card>

          <Card className="!p-0 overflow-hidden">
            <p className="px-5 pt-5 pb-3 text-[15px] font-bold text-ink">Riwayat Invoice</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-y border-line bg-canvas text-left text-muted">
                    <th className="px-5 py-2.5 font-semibold">Invoice</th>
                    <th className="px-4 py-2.5 font-semibold">Periode</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const overdue = inv.status === 'PENDING' && new Date(inv.dueDate).getTime() < Date.now();
                    return (
                      <tr key={inv.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-3 font-medium text-ink whitespace-nowrap">
                          {inv.number}
                          <span className="block text-[12px] text-muted font-normal">
                            {inv.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'} · jatuh tempo{' '}
                            {new Date(inv.dueDate).toLocaleDateString('id-ID')}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted">
                          {new Date(inv.periodStart).toLocaleDateString('id-ID')} – {new Date(inv.periodEnd).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-ink whitespace-nowrap">{formatIDR(inv.total)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={inv.status === 'PAID' ? 'green' : overdue ? 'red' : 'amber'}>
                            {inv.status === 'PAID' ? 'Lunas' : overdue ? 'Jatuh Tempo' : 'Menunggu Pembayaran'}
                          </Badge>
                          {inv.status === 'PAID' && inv.paidAt && (
                            <span className="block text-[12px] text-muted mt-0.5 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              {new Date(inv.paidAt).toLocaleDateString('id-ID')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-muted">Belum ada invoice.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-center text-[13px] text-muted">
            Pembayaran via transfer bank / QRIS —{' '}
            <a
              href="https://wa.me/6287777808021?text=Halo%20WOORK,%20saya%20ingin%20konfirmasi%20pembayaran%20langganan."
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand hover:underline"
            >
              konfirmasi via WhatsApp
            </a>{' '}
            setelah membayar; tim kami mengaktifkan langganan Anda.
          </p>
        </>
      )}
    </div>
  );
}
