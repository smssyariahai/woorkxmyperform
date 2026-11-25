import { masterPrisma } from './master';
import { sendInvoiceEmail } from '../mailer';

/**
 * Kirim email invoice yang baru terbit ke email tenant (§9.5).
 * Dipanggil SETELAH transaksi pembuatan invoice commit (bukan di dalam
 * transaksi — email yang sudah terkirim tidak bisa dibatalkan bila
 * transaksi rollback).
 *
 * Penerima (berurutan):
 *   1. Email OWNER tenant (membership OWNER aktif -> PlatformUser.email).
 *   2. Email PIC pendaftaran terakhir tenant itu (TenantRegistration.picEmail).
 * Bila tidak ada penerima -> status NO_RECIPIENT (bukan error).
 *
 * TIDAK PERNAH melempar: semua kegagalan dicatat di invoice
 * (emailStatus / emailSentAt / emailTo / emailError) dan dikembalikan
 * sebagai hasil, supaya otomasi langganan tidak pernah gagal hanya
 * karena email.
 */
export type InvoiceEmailSendResult =
  | { ok: true; to: string; messageId?: string; smtpResponse?: string }
  | { ok: false; reason: 'not_configured' | 'send_failed' | 'no_recipient' | 'not_found'; to?: string; error?: string };

function appUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  return raw.replace(/\/+$/, '');
}

export async function resolveInvoiceRecipient(
  tenantId: string
): Promise<string | null> {
  // 1) OWNER tenant.
  const ownerMembership = await masterPrisma.tenantMembership.findFirst({
    where: {
      tenantId,
      roleReference: 'OWNER',
      membershipStatus: 'ACTIVE',
    },
    orderBy: { joinedAt: 'asc' },
    select: { userId: true },
  });
  if (ownerMembership) {
    const owner = await masterPrisma.platformUser.findUnique({
      where: { id: ownerMembership.userId },
      select: { email: true, status: true },
    });
    if (owner?.email && owner.status === 'ACTIVE') return owner.email;
  }
  // 2) PIC pendaftaran terakhir tenant itu.
  const reg = await masterPrisma.tenantRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { picEmail: true },
  });
  if (reg?.picEmail) return reg.picEmail;
  return null;
}

export async function sendInvoiceIssuedEmail(
  invoiceId: string
): Promise<InvoiceEmailSendResult> {
  try {
    const invoice = await masterPrisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return { ok: false, reason: 'not_found' };

    const tenant = await masterPrisma.tenant.findUnique({
      where: { id: invoice.tenantId },
      select: { companyName: true },
    });
    const companyName = tenant?.companyName ?? 'Perusahaan';

    const to = await resolveInvoiceRecipient(invoice.tenantId);
    if (!to) {
      await masterPrisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          emailStatus: 'NO_RECIPIENT',
          emailError:
            'Tidak ada alamat email penerima (OWNER tenant / PIC pendaftaran tidak ditemukan).',
        },
      });
      return { ok: false, reason: 'no_recipient' };
    }

    const banks = await masterPrisma.bankReceivingAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { bankName: true, accountNumber: true, accountHolderName: true },
    });
    const filledBanks = banks.filter((b) => (b.accountNumber || '').trim() !== '');

    const base = appUrl();
    const link = base ? `${base}/langganan/tagihan` : '/langganan/tagihan';

    const res = await sendInvoiceEmail({
      to,
      companyName,
      invoiceNumber: invoice.number,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      billingCycle: invoice.billingCycle,
      baseAmount: invoice.baseAmount,
      creditApplied: invoice.creditApplied,
      ppnAmount: invoice.ppnAmount,
      uniqueCode: invoice.uniqueCode,
      validUntil: invoice.validUntil,
      banks: filledBanks.map((b) => ({
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        accountHolderName: b.accountHolderName || undefined,
      })),
      link,
    });

    if (res.ok) {
      await masterPrisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          emailStatus: 'SENT',
          emailSentAt: new Date(),
          emailTo: to,
          emailError: null,
        },
      });
      return { ok: true, to, messageId: res.messageId, smtpResponse: res.response };
    }

    await masterPrisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        emailStatus:
          res.reason === 'not_configured' ? 'NOT_CONFIGURED' : 'SEND_FAILED',
        emailTo: to,
        emailError: (res.error ?? 'Gagal mengirim email.').slice(0, 500),
      },
    });
    return {
      ok: false,
      reason: res.reason === 'not_configured' ? 'not_configured' : 'send_failed',
      to,
      error: res.error,
    };
  } catch (e: any) {
    const message = e?.message ? String(e.message) : 'Gagal mengirim email invoice.';
    console.error('[invoice-email] sendInvoiceIssuedEmail gagal:', message);
    try {
      await masterPrisma.subscriptionInvoice.update({
        where: { id: invoiceId },
        data: { emailStatus: 'SEND_FAILED', emailError: message.slice(0, 500) },
      });
    } catch {
      /* abaikan */
    }
    return { ok: false, reason: 'send_failed', error: message };
  }
}
