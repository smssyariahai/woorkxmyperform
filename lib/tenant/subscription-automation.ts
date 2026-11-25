// Otomasi langganan §7.7 (Fase 5 — Bab 7.7 + §5.5).
//
// Mesin otomatis (dijalankan scheduler per jam via
// scripts/subscription-automation.ts):
//   T-7 -> terbitkan invoice perpanjangan (24 jam, tidak diterbitkan ulang);
//   jatuh tempo tanpa bayar -> Menunggak + tenggang (default 14 hari);
//   pengingat selama tenggang (jadwal dari pengaturan);
//   tenggang habis -> auto-suspend;
//   pengingat retensi menjelang habis (penghapusan TETAP butuh konfirmasi
//   Master — Fase 4).
//
// Idempotensi lewat log + status, bukan lock (desain §2.5): setiap aksi
// dicek dari SubscriptionAutoActionLog + status saat ini sebelum dijalankan.
// Aktor otomatis = 'SYSTEM' (string, bukan userId); manual = userId Master
// + actorType 'MASTER'. TIDAK ada pengiriman email/pengumuman di sini
// (Fase 7) — notifikasi = log + tampil di UI. Otomasi TIDAK PERNAH mengubah
// tier/harga (dilarang §7.7) dan TIDAK pernah menghapus database sendiri.

import type {
  PrismaClient,
  Subscription,
  SubscriptionAutomationSettings,
  SubscriptionInvoice,
} from '@prisma/master-client';
import { masterPrisma } from './master';
import { getBillingSettings } from '@/lib/pricing-catalog';
import type { BillingCycle } from '@/lib/pricing-catalog';
import {
  LifecycleError,
  addBillingCycle,
  transitionSubscription,
} from './subscription-lifecycle';
// Fase 6 (§9.5): kredit dipakai invoice perpanjangan (dasar − kredit, PPN
// dari dasar setelah kredit). Impor fungsi saja — dipakai di dalam fungsi,
// bukan saat evaluasi modul (bank-reconciliation mengimpor helper dari file
// ini; siklus impor antar keduanya aman di level fungsi).
import { applyCreditToInvoice } from './bank-reconciliation';
import { sendInvoiceIssuedEmail } from './invoice-email';

/** Aktor otomatis di log + audit (String, bukan userId — sah karena
 *  PlatformAuditLog.actorUserId tidak punya FK ke PlatformUser). */
export const SYSTEM_ACTOR = 'SYSTEM';

export const AUTO_ACTIONS = [
  'RENEWAL_NOTICE',
  'RENEWAL_INVOICE_ISSUED',
  'INVOICE_EXPIRED',
  'MARKED_OVERDUE',
  'GRACE_REMINDER',
  'AUTO_SUSPENDED',
  'RETENTION_REMINDER',
  'PAYMENT_APPLIED',
  'MANUAL_REACTIVATE',
  'MANUAL_GRACE_EXTENDED',
  'MANUAL_END_DATE_CHANGED',
  'MANUAL_PAYMENT_CONFIRMED',
  // Fase 6 (§9.5): kredit + invoice manual nego + penerbitan ulang.
  'CREDIT_ADDED',
  'MANUAL_INVOICE_ISSUED',
  'INVOICE_REISSUED',
] as const;
export type AutoAction = (typeof AUTO_ACTIONS)[number];

/* ------------------------------------------------------------------ */
/* Pengaturan otomasi                                                  */
/* ------------------------------------------------------------------ */

export interface AutomationSettingsView {
  graceDays: number;
  invoiceLeadDays: number;
  reminderDaysBeforeGraceEnd: number[];
  retentionReminderDaysBefore: number;
  automationEnabled: boolean;
  updatedAt: Date;
}

export function shapeAutomationSettings(
  s: SubscriptionAutomationSettings,
): AutomationSettingsView {
  let reminders: number[] = [7, 3, 1];
  try {
    const parsed: unknown = JSON.parse(s.reminderDaysBeforeGraceEnd);
    if (Array.isArray(parsed)) {
      const ints = parsed.filter(
        (n): n is number => Number.isInteger(n) && n >= 0 && n <= 14,
      );
      if (ints.length > 0) reminders = ints;
    }
  } catch {
    // Pakai default bila kolom rusak.
  }
  return {
    graceDays: s.graceDays,
    invoiceLeadDays: s.invoiceLeadDays,
    reminderDaysBeforeGraceEnd: reminders,
    retentionReminderDaysBefore: s.retentionReminderDaysBefore,
    automationEnabled: s.automationEnabled,
    updatedAt: s.updatedAt,
  };
}

/** Pengaturan otomasi (buat baris default bila belum ada — migrasi sudah
 *  men-seed, ini hanya jaring pengaman). */
export async function getAutomationSettings(): Promise<SubscriptionAutomationSettings> {
  const existing =
    await masterPrisma.subscriptionAutomationSettings.findUnique({
      where: { id: 'default' },
    });
  if (existing) return existing;
  return masterPrisma.subscriptionAutomationSettings.create({
    data: { id: 'default' },
  });
}

/**
 * Ubah pengaturan otomasi (Master). Validasi ketat per desain §6; perubahan
 * dicatat PlatformAuditLog AUTOMATION_SETTINGS_UPDATED. Hanya field yang
 * diberikan yang diubah; bila tidak ada field valid -> 400.
 */
export async function updateAutomationSettings(
  input: {
    graceDays?: unknown;
    invoiceLeadDays?: unknown;
    reminderDaysBeforeGraceEnd?: unknown;
    retentionReminderDaysBefore?: unknown;
    automationEnabled?: unknown;
  },
  actorId: string,
): Promise<AutomationSettingsView> {
  const data: {
    graceDays?: number;
    invoiceLeadDays?: number;
    reminderDaysBeforeGraceEnd?: string;
    retentionReminderDaysBefore?: number;
    automationEnabled?: boolean;
  } = {};
  const changes: Record<string, unknown> = {};

  const intInRange = (v: unknown, min: number, max: number): number | null =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
      ? (v as number)
      : null;

  if (input.graceDays !== undefined) {
    const v = intInRange(input.graceDays, 1, 30);
    if (v === null) {
      throw new LifecycleError('graceDays harus bilangan bulat 1-30.', 400);
    }
    data.graceDays = v;
    changes.graceDays = v;
  }
  if (input.invoiceLeadDays !== undefined) {
    const v = intInRange(input.invoiceLeadDays, 1, 30);
    if (v === null) {
      throw new LifecycleError('invoiceLeadDays harus bilangan bulat 1-30.', 400);
    }
    data.invoiceLeadDays = v;
    changes.invoiceLeadDays = v;
  }
  if (input.reminderDaysBeforeGraceEnd !== undefined) {
    const arr = input.reminderDaysBeforeGraceEnd;
    if (
      !Array.isArray(arr) ||
      arr.length === 0 ||
      arr.length > 5 ||
      arr.some((n) => !Number.isInteger(n) || n < 0 || n > 14)
    ) {
      throw new LifecycleError(
        'reminderDaysBeforeGraceEnd harus array 1-5 bilangan bulat 0-14.',
        400,
      );
    }
    const sorted = [...new Set(arr as number[])].sort((a, b) => b - a);
    data.reminderDaysBeforeGraceEnd = JSON.stringify(sorted);
    changes.reminderDaysBeforeGraceEnd = sorted;
  }
  if (input.retentionReminderDaysBefore !== undefined) {
    const v = intInRange(input.retentionReminderDaysBefore, 1, 30);
    if (v === null) {
      throw new LifecycleError(
        'retentionReminderDaysBefore harus bilangan bulat 1-30.',
        400,
      );
    }
    data.retentionReminderDaysBefore = v;
    changes.retentionReminderDaysBefore = v;
  }
  if (input.automationEnabled !== undefined) {
    if (typeof input.automationEnabled !== 'boolean') {
      throw new LifecycleError('automationEnabled harus boolean.', 400);
    }
    data.automationEnabled = input.automationEnabled;
    changes.automationEnabled = input.automationEnabled;
  }
  if (Object.keys(data).length === 0) {
    throw new LifecycleError('Tidak ada pengaturan yang diubah.', 400);
  }
  const updated = await masterPrisma.subscriptionAutomationSettings.update({
    where: { id: 'default' },
    data,
  });
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: actorId,
      action: 'AUTOMATION_SETTINGS_UPDATED',
      tenantId: null,
      metadata: JSON.stringify(changes),
    },
  });
  return shapeAutomationSettings(updated);
}

/* ------------------------------------------------------------------ */
/* Jatuh tempo + status pembayaran                                     */
/* ------------------------------------------------------------------ */

/** Tanggal jatuh tempo: TRIAL -> trialEndsAt, selain itu
 *  currentPeriodEndsAt (null bila keduanya null — tenant lama). */
export function getDueAt(
  subscription: Pick<
    Subscription,
    'lifecycleStatus' | 'trialEndsAt' | 'currentPeriodEndsAt'
  >,
): Date | null {
  // PERBAIKAN live 2026-11-24 (verifikasi Fase 5): dueAt TIDAK boleh
  // bergantung pada lifecycle. Trial yang sudah Menunggak tetap berutang
  // pada trialEndsAt-nya (currentPeriodEndsAt-nya NULL) — versi lama
  // mengembalikan null begitu lifecycle bukan TRIAL lagi, sehingga scheduler
  // melewati tenant Menunggak dengan 'no-due-date' dan pengingat tenggang +
  // auto-suspend tidak pernah jalan. currentPeriodEndsAt didahulukan (tenant
  // berbayar), trialEndsAt sebagai fallback (tenant trial, apa pun statusnya).
  return subscription.currentPeriodEndsAt ?? subscription.trialEndsAt;
}

/** Total transfer invoice = dasar + PPN + kode unik (Bab 9.5). */
export function invoiceTransferTotal(
  invoice: Pick<
    SubscriptionInvoice,
    'baseAmount' | 'ppnAmount' | 'uniqueCode'
  >,
): number {
  return invoice.baseAmount + invoice.ppnAmount + invoice.uniqueCode;
}

export function shapeInvoice(inv: SubscriptionInvoice) {
  let items: Array<{ label: string; amount: number }> | null = null;
  if (inv.itemsJson) {
    try {
      const parsed: unknown = JSON.parse(inv.itemsJson);
      if (Array.isArray(parsed)) {
        items = parsed
          .filter(
            (it): it is { label: string; amount: number } =>
              !!it &&
              typeof it === 'object' &&
              typeof (it as any).label === 'string' &&
              typeof (it as any).amount === 'number',
          )
          .map((it) => ({ label: it.label, amount: it.amount }));
      }
    } catch {
      items = null;
    }
  }
  return {
    id: inv.id,
    tenantId: inv.tenantId,
    subscriptionId: inv.subscriptionId,
    number: inv.number,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    billingCycle: inv.billingCycle,
    baseAmount: inv.baseAmount,
    ppnAmount: inv.ppnAmount,
    uniqueCode: inv.uniqueCode,
    transferTotal: invoiceTransferTotal(inv),
    status: inv.status,
    issuedAt: inv.issuedAt,
    validUntil: inv.validUntil,
    paidAt: inv.paidAt,
    paidAmount: inv.paidAmount,
    createdAt: inv.createdAt,
    // Fase 6 (§9.5).
    purpose: inv.purpose,
    items,
    isManual: inv.isManual,
    manualReason: inv.manualReason,
    catalogBaseAmount: inv.catalogBaseAmount,
    creditApplied: inv.creditApplied,
    paidBank: inv.paidBank,
    replacedByInvoiceId: inv.replacedByInvoiceId,
  };
}

/** Client transaksi yang cukup untuk pembuatan invoice (dipakai helper
 *  kode unik + nomor invoice, dipakai ulang Fase 6 — bukan diduplikasi). */
export type InvoiceTxClient = Pick<PrismaClient, 'subscriptionInvoice'>;

/**
 * Kode unik 3 digit, unik antar SEMUA invoice Belum Dibayar (cek di
 * transaksi, ulang hingga dapat yang unik). Dipakai issueRenewalInvoice
 * (Fase 5) + createManualInvoice/reissueInvoice (Fase 6).
 */
export async function generateUniqueCode(
  tx: InvoiceTxClient,
): Promise<number> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = 100 + Math.floor(Math.random() * 900);
    const clash = await tx.subscriptionInvoice.findFirst({
      where: { status: 'Belum Dibayar', uniqueCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('Gagal mendapatkan kode unik invoice setelah 25 percobaan.');
}

/** Nomor invoice berikutnya INV/YYYY/MM/NNN — satu urutan untuk semua
 *  invoice (sistem + manual, desain §3.7). */
export async function nextInvoiceNumber(tx: InvoiceTxClient): Promise<string> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const prefix = `INV/${yyyy}/${mm}/`;
  const countThisMonth = await tx.subscriptionInvoice.count({
    where: { number: { startsWith: prefix } },
  });
  return `${prefix}${String(countThisMonth + 1).padStart(3, '0')}`;
}

export type PaymentStatus =
  | 'TRIAL'
  | 'LUNAS'
  | 'MENUNGGAK'
  | 'BELUM_DIBAYAR'
  | 'TANPA_JATUH_TEMPO';

export interface PaymentStatusInfo {
  status: PaymentStatus;
  label: string;
  dueAt: Date | null;
  unpaidInvoice?: {
    id: string;
    number: string;
    transferTotal: number;
    validUntil: Date;
  } | null;
}

/**
 * Status pembayaran turunan (desain §4.1): TRIAL -> TRIAL;
 * MENUNGGAK/DITANGGUHKAN -> MENUNGGAK; ada invoice Belum Dibayar yang
 * masih berlaku -> BELUM_DIBAYAR; tanpa jatuh tempo -> TANPA_JATUH_TEMPO;
 * selain itu LUNAS (aktif sampai dueAt).
 */
export function derivePaymentStatus(
  subscription: Pick<
    Subscription,
    'lifecycleStatus' | 'trialEndsAt' | 'currentPeriodEndsAt'
  >,
  unpaidInvoices: SubscriptionInvoice[],
): PaymentStatusInfo {
  const dueAt = getDueAt(subscription);
  if (subscription.lifecycleStatus === 'TRIAL') {
    return { status: 'TRIAL', label: 'Trial', dueAt };
  }
  if (
    subscription.lifecycleStatus === 'MENUNGGAK' ||
    subscription.lifecycleStatus === 'DITANGGUHKAN'
  ) {
    return { status: 'MENUNGGAK', label: 'Menunggak', dueAt };
  }
  const now = new Date();
  const valid = unpaidInvoices
    .filter((i) => i.status === 'Belum Dibayar' && i.validUntil > now)
    .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0];
  if (valid) {
    return {
      status: 'BELUM_DIBAYAR',
      label: 'Belum dibayar',
      dueAt,
      unpaidInvoice: {
        id: valid.id,
        number: valid.number,
        transferTotal: invoiceTransferTotal(valid),
        validUntil: valid.validUntil,
      },
    };
  }
  if (!dueAt) {
    return { status: 'TANPA_JATUH_TEMPO', label: 'Tanpa jatuh tempo', dueAt };
  }
  return { status: 'LUNAS', label: 'Lunas', dueAt };
}

/** Invoice Belum Dibayar terbaru satu tenant (dipakai halaman /langganan). */
export async function getLatestUnpaidInvoice(tenantId: string) {
  const inv = await masterPrisma.subscriptionInvoice.findFirst({
    where: { tenantId, status: 'Belum Dibayar' },
    orderBy: { issuedAt: 'desc' },
  });
  return inv ? shapeInvoice(inv) : null;
}

/* ------------------------------------------------------------------ */
/* Log tindakan otomatis                                               */
/* ------------------------------------------------------------------ */

/** Client yang bisa menulis log: masterPrisma biasa maupun client
 *  transaksi ($transaction). Dipakai logAutoAction di keduanya. */
type LogClient = Pick<PrismaClient, 'subscriptionAutoActionLog'>;

export async function logAutoAction(
  client: LogClient,
  input: {
    tenantId: string;
    subscriptionId: string;
    action: string;
    reason: string;
    detail?: string;
    actorType?: 'SYSTEM' | 'MASTER' | 'TENANT';
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.subscriptionAutoActionLog.create({
    data: {
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      action: input.action,
      detail: input.detail ?? null,
      reason: input.reason,
      actorType: input.actorType ?? 'SYSTEM',
      actorUserId: input.actorUserId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Invoice perpanjangan                                                */
/* ------------------------------------------------------------------ */

/**
 * Harga dasar dari snapshot paket (harga yang disepakati saat paket
 * dipilih — TIDAK dihitung ulang dari katalog). MONTHLY -> monthlyPrice,
 * YEARLY -> yearlyPrice. Harga khusus (null) -> tolak: invoice harus
 * dibuat manual oleh Master.
 */
function baseFromSnapshot(subscription: Subscription): {
  base: number;
  cycle: BillingCycle;
} {
  const cycle = (subscription.billingCycle === 'YEARLY'
    ? 'YEARLY'
    : 'MONTHLY') as BillingCycle;
  let snap: any = null;
  try {
    snap = JSON.parse(subscription.packageSnapshotJson);
  } catch {
    snap = null;
  }
  if (!snap || typeof snap !== 'object') {
    throw new Error(
      'Snapshot paket langganan tidak ditemukan — invoice perpanjangan harus dibuat manual oleh Master.',
    );
  }
  const pick = (obj: any): number | null => {
    if (!obj || typeof obj !== 'object') return null;
    const v = cycle === 'YEARLY' ? obj.yearlyPrice : obj.monthlyPrice;
    return typeof v === 'number' ? v : null;
  };
  const parts: Array<number | null> = [
    pick(snap.userTier),
    pick(snap.storageTier),
    ...((Array.isArray(snap.modules) ? snap.modules : []).map(pick)),
  ];
  if (parts.some((p) => p === null)) {
    throw new Error(
      'Paket mengandung harga khusus — invoice perpanjangan harus dibuat manual oleh Master.',
    );
  }
  return { base: parts.reduce<number>((a, b) => a + (b ?? 0), 0), cycle };
}

/**
 * Terbitkan invoice perpanjangan untuk satu periode (jatuh tempo -> +1
 * siklus). SATU transaksi master: nomor, kode unik, PPN, log.
 * Idempotensi: bila SUDAH ADA invoice apa pun (Belum Dibayar/Lunas/
 * Kedaluwarsa) untuk (subscriptionId, periodEnd) -> kembalikan yang sudah
 * ada, JANGAN buat baru (invoice TIDAK diterbitkan ulang otomatis, §7.7).
 */
export async function issueRenewalInvoice(
  subscription: Subscription,
  opts: { actorType?: 'SYSTEM' | 'MASTER'; actorUserId?: string | null } = {},
): Promise<{ invoice: SubscriptionInvoice; created: boolean }> {
  const dueAt = getDueAt(subscription);
  if (!dueAt) {
    throw new Error(
      'Tidak ada tanggal jatuh tempo — invoice tidak bisa diterbitkan.',
    );
  }
  const { base, cycle } = baseFromSnapshot(subscription);
  const settings = await getBillingSettings();
  const periodStart = dueAt;
  const periodEnd = addBillingCycle(dueAt, cycle);
  const now = new Date();

  const result = await masterPrisma.$transaction(async (tx) => {
    const existing = await tx.subscriptionInvoice.findFirst({
      where: { subscriptionId: subscription.id, periodEnd },
      orderBy: { issuedAt: 'desc' },
    });
    if (existing) return { invoice: existing, created: false };

    // Fase 6 (§9.5 keputusan #1): saldo kredit mengurangi dasar invoice,
    // PPN dihitung dari dasar SETELAH kredit. Kredit dikonsumsi di dalam
    // transaksi yang sama dengan pembuatan invoice.
    const { creditApplied, newBase } = await applyCreditToInvoice(
      tx,
      subscription.tenantId,
      base,
    );
    const ppnAmount = Math.round((newBase * settings.ppnRateBps) / 10000);
    const uniqueCode = await generateUniqueCode(tx);
    const number = await nextInvoiceNumber(tx);

    const validUntil = new Date(
      now.getTime() + settings.invoiceValidityHours * 60 * 60 * 1000,
    );
    const invoice = await tx.subscriptionInvoice.create({
      data: {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        number,
        periodStart,
        periodEnd,
        billingCycle: cycle,
        baseAmount: newBase,
        ppnAmount,
        uniqueCode,
        status: 'Belum Dibayar',
        validUntil,
        creditApplied,
      },
    });
    const total = newBase + ppnAmount + uniqueCode;
    const dueLabel = dueAt.toISOString().slice(0, 10);
    await logAutoAction(tx, {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      action: 'RENEWAL_INVOICE_ISSUED',
      reason: `Invoice perpanjangan ${number} diterbitkan (jatuh tempo ${dueLabel}).`,
      detail: `Invoice ${number}, total Rp${total.toLocaleString('id-ID')}`,
      actorType: opts.actorType ?? 'SYSTEM',
      actorUserId: opts.actorUserId ?? null,
      metadata: {
        invoiceId: invoice.id,
        number,
        total,
        periodEnd: periodEnd.toISOString(),
      },
    });
    await logAutoAction(tx, {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      action: 'RENEWAL_NOTICE',
      reason: `Pemberitahuan perpanjangan: langganan berakhir ${dueLabel}, invoice ${number} diterbitkan.`,
      detail: `Invoice ${number} diterbitkan, berlaku sampai ${validUntil.toISOString()}`,
      actorType: opts.actorType ?? 'SYSTEM',
      actorUserId: opts.actorUserId ?? null,
      metadata: { invoiceId: invoice.id, number },
    });
    return { invoice, created: true };
  });
  // Email invoice (best-effort, DI LUAR transaksi — invoice sudah commit).
  if (result.created) {
    try {
      await sendInvoiceIssuedEmail(result.invoice.id);
    } catch {
      /* helper tidak pernah melempar; pengaman saja */
    }
  }
  return result;
}

/**
 * Kedaluwarsakan semua invoice Belum Dibayar yang validUntil-nya lewat.
 * Per invoice satu transaksi (update + log) supaya tiap kedaluwarsa
 * tercatat. Kembalikan nomor-nomor yang kedaluwarsa.
 */
export async function expireInvoices(
  tenantId?: string,
): Promise<{ expired: string[] }> {
  const now = new Date();
  const due = await masterPrisma.subscriptionInvoice.findMany({
    where: {
      status: 'Belum Dibayar',
      validUntil: { lte: now },
      ...(tenantId ? { tenantId } : {}),
    },
    orderBy: { validUntil: 'asc' },
  });
  const expired: string[] = [];
  for (const inv of due) {
    await masterPrisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.update({
        where: { id: inv.id },
        data: { status: 'Kedaluwarsa' },
      });
      await logAutoAction(tx, {
        tenantId: inv.tenantId,
        subscriptionId: inv.subscriptionId,
        action: 'INVOICE_EXPIRED',
        reason: `Invoice ${inv.number} kedaluwarsa tanpa pembayaran (berlaku sampai ${inv.validUntil.toISOString()}).`,
        detail: `Invoice ${inv.number} kedaluwarsa`,
        metadata: { invoiceId: inv.id, number: inv.number },
      });
    });
    expired.push(inv.number);
  }
  return { expired };
}

/* ------------------------------------------------------------------ */
/* Mesin otomasi per tenant + semua tenant                             */
/* ------------------------------------------------------------------ */

export interface TenantAutomationResult {
  tenantId: string;
  tenantCode: string;
  actions: string[];
  skipped?: string;
  dryRun?: boolean;
}

/**
 * Jalankan otomasi untuk satu tenant (desain §4.1, urutan PENTING):
 *  1. lewati bila DIHAPUS / tenantStatus DELETED;
 *  2. expireInvoices dulu (supaya status invoice segar);
 *  3. tanpa jatuh tempo -> skipped 'no-due-date';
 *  4. MENUNGGAK: tenggang habis -> auto-suspend; masih jalan -> pengingat
 *     bila sisa hari masuk jadwal dan belum pernah di-log untuk sisa hari itu;
 *  5. DITANGGUHKAN -> skipped 'suspended' (menunggu bayar/manual Master);
 *  6. TRIAL/AKTIF: jatuh tempo lewat -> Menunggak + graceEndsAt; dalam
 *     jendela T-7 -> terbitkan invoice; selain itu tidak ada aksi;
 *  7. NONAKTIF: pengingat retensi bila dalam jendela dan belum pernah di-log
 *     untuk periode retensi ini.
 * dryRun: hitung rencana tanpa menulis apa pun (aksi ditandai [DRY-RUN]).
 */
export async function runAutomationForTenant(
  tenantId: string,
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<TenantAutomationResult> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? new Date();
  const settings = shapeAutomationSettings(await getAutomationSettings());
  const sub = await masterPrisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: true },
  });
  if (!sub) {
    return { tenantId, tenantCode: '', actions: [], skipped: 'no-subscription', dryRun };
  }
  const tenantCode = sub.tenant.tenantCode;
  const actions: string[] = [];
  const record = (a: string) => {
    actions.push(dryRun ? `[DRY-RUN] ${a}` : a);
  };

  // 1. Lewati tenant yang sudah dihapus permanen.
  if (
    sub.lifecycleStatus === 'DIHAPUS' ||
    sub.tenant.tenantStatus === 'DELETED'
  ) {
    return { tenantId, tenantCode, actions, skipped: 'deleted', dryRun };
  }

  // 2. Kedaluwarsakan invoice dulu.
  const expiredNumbers = dryRun
    ? (
        await masterPrisma.subscriptionInvoice.findMany({
          where: {
            tenantId,
            status: 'Belum Dibayar',
            validUntil: { lte: now },
          },
          select: { number: true },
        })
      ).map((r) => r.number)
    : (await expireInvoices(tenantId)).expired;
  for (const n of expiredNumbers) record(`INVOICE_EXPIRED ${n}`);

  // 3. Jatuh tempo.
  const dueAt = getDueAt(sub);
  if (!dueAt) {
    return { tenantId, tenantCode, actions, skipped: 'no-due-date', dryRun };
  }

  const lifecycle = sub.lifecycleStatus;

  // 4. MENUNGGAK.
  if (lifecycle === 'MENUNGGAK') {
    const graceEndsAt =
      sub.graceEndsAt ??
      (sub.lifecycleChangedAt
        ? new Date(
            sub.lifecycleChangedAt.getTime() +
              settings.graceDays * 24 * 60 * 60 * 1000,
          )
        : new Date(dueAt.getTime() + settings.graceDays * 24 * 60 * 60 * 1000));
    if (graceEndsAt <= now) {
      const reason = `Otomatis: tenggang berakhir ${graceEndsAt.toISOString().slice(0, 10)} tanpa pembayaran — langganan ditangguhkan.`;
      if (!dryRun) {
        await transitionSubscription(tenantId, 'DITANGGUHKAN', {
          reason,
          actorId: SYSTEM_ACTOR,
        });
        await logAutoAction(masterPrisma, {
          tenantId,
          subscriptionId: sub.id,
          action: 'AUTO_SUSPENDED',
          reason,
          detail: 'Tenggang habis tanpa pembayaran',
          metadata: { graceEndsAt: graceEndsAt.toISOString() },
        });
      }
      record('AUTO_SUSPENDED');
      return { tenantId, tenantCode, actions, dryRun };
    }
    const remainingDays = Math.ceil(
      (graceEndsAt.getTime() - now.getTime()) / 86400000,
    );
    if (settings.reminderDaysBeforeGraceEnd.includes(remainingDays)) {
      const already =
        await masterPrisma.subscriptionAutoActionLog.findFirst({
          where: {
            subscriptionId: sub.id,
            action: 'GRACE_REMINDER',
            metadataJson: { contains: `"remainingDays":${remainingDays}` },
          },
          select: { id: true },
        });
      if (!already) {
        const reason = `Otomatis: pengingat tenggang — sisa ${remainingDays} hari sebelum langganan ditangguhkan.`;
        if (!dryRun) {
          await logAutoAction(masterPrisma, {
            tenantId,
            subscriptionId: sub.id,
            action: 'GRACE_REMINDER',
            reason,
            detail: `Sisa tenggang ${remainingDays} hari`,
            metadata: {
              remainingDays,
              graceEndsAt: graceEndsAt.toISOString(),
            },
          });
        }
        record(`GRACE_REMINDER ${remainingDays} hari`);
      }
    }
    return { tenantId, tenantCode, actions, dryRun };
  }

  // 5. DITANGGUHKAN — tidak ada aksi otomatis.
  if (lifecycle === 'DITANGGUHKAN') {
    return { tenantId, tenantCode, actions, skipped: 'suspended', dryRun };
  }

  // 6. TRIAL / AKTIF.
  if (lifecycle === 'TRIAL' || lifecycle === 'AKTIF') {
    if (dueAt <= now) {
      const dueLabel = dueAt.toISOString().slice(0, 10);
      const reason = `Otomatis: jatuh tempo ${dueLabel} tanpa pembayaran — status menjadi Menunggak, tenggang ${settings.graceDays} hari dimulai.`;
      const graceEndsAt = new Date(
        dueAt.getTime() + settings.graceDays * 24 * 60 * 60 * 1000,
      );
      if (!dryRun) {
        await transitionSubscription(tenantId, 'MENUNGGAK', {
          reason,
          actorId: SYSTEM_ACTOR,
        });
        try {
          await masterPrisma.subscription.update({
            where: { id: sub.id },
            data: { graceEndsAt },
          });
        } catch (e) {
          // graceEndsAt bisa dihitung ulang dari lifecycleChangedAt +
          // graceDays (fallback di pembaca) — catat dan lanjut.
          await logAutoAction(masterPrisma, {
            tenantId,
            subscriptionId: sub.id,
            action: 'MARKED_OVERDUE',
            reason: `graceEndsAt gagal ditulis (${(e as Error).message}) — fallback: lifecycleChangedAt + ${settings.graceDays} hari.`,
          });
        }
        await logAutoAction(masterPrisma, {
          tenantId,
          subscriptionId: sub.id,
          action: 'MARKED_OVERDUE',
          reason,
          detail: `Jatuh tempo ${dueLabel}, tenggang sampai ${graceEndsAt.toISOString().slice(0, 10)}`,
          metadata: {
            dueAt: dueAt.toISOString(),
            graceEndsAt: graceEndsAt.toISOString(),
          },
        });
      }
      record('MARKED_OVERDUE');
      return { tenantId, tenantCode, actions, dryRun };
    }
    const leadMs = settings.invoiceLeadDays * 24 * 60 * 60 * 1000;
    if (dueAt.getTime() - now.getTime() <= leadMs) {
      if (!dryRun) {
        const { invoice, created } = await issueRenewalInvoice(sub);
        if (created) record(`RENEWAL_INVOICE_ISSUED ${invoice.number}`);
      } else {
        record('RENEWAL_INVOICE_ISSUED (akan terbit)');
      }
      return { tenantId, tenantCode, actions, dryRun };
    }
    return { tenantId, tenantCode, actions, dryRun };
  }

  // 7. NONAKTIF — pengingat retensi.
  if (lifecycle === 'NONAKTIF') {
    if (sub.retentionEndsAt && sub.retentionStartsAt) {
      const msLeft = sub.retentionEndsAt.getTime() - now.getTime();
      if (
        msLeft > 0 &&
        msLeft <= settings.retentionReminderDaysBefore * 24 * 60 * 60 * 1000
      ) {
        const already =
          await masterPrisma.subscriptionAutoActionLog.findFirst({
            where: {
              subscriptionId: sub.id,
              action: 'RETENTION_REMINDER',
              createdAt: { gte: sub.retentionStartsAt },
            },
            select: { id: true },
          });
        if (!already) {
          const remainingDays = Math.ceil(msLeft / 86400000);
          const reason = `Otomatis: pengingat retensi — sisa ${remainingDays} hari sebelum data perusahaan dihapus permanen (butuh konfirmasi Master).`;
          if (!dryRun) {
            await logAutoAction(masterPrisma, {
              tenantId,
              subscriptionId: sub.id,
              action: 'RETENTION_REMINDER',
              reason,
              detail: `Sisa retensi ${remainingDays} hari`,
              metadata: {
                remainingDays,
                retentionEndsAt: sub.retentionEndsAt.toISOString(),
              },
            });
          }
          record(`RETENTION_REMINDER ${remainingDays} hari`);
        }
      }
    }
    return { tenantId, tenantCode, actions, dryRun };
  }

  return { tenantId, tenantCode, actions, dryRun };
}

export interface AutomationRunSummary {
  disabled?: boolean;
  checked: number;
  actions: string[];
  errors: { tenantId: string; tenantCode?: string; message: string }[];
  dryRun?: boolean;
}

/**
 * Jalankan otomasi untuk SEMUA tenant yang punya Subscription (bukan hanya
 * ACTIVE — NONAKTIF butuh pengingat retensi; DITANGGUHKAN dilewati cepat di
 * runAutomationForTenant). Gagal satu tenant tidak menghentikan yang lain.
 * Bila automationEnabled=false -> {disabled: true} tanpa aksi apa pun,
 * termasuk kedaluwarsa invoice (Master yang mematikan otomasi bertanggung
 * jawab — catat di UI).
 */
export async function runAutomationAll(
  opts: { dryRun?: boolean } = {},
): Promise<AutomationRunSummary> {
  const dryRun = opts.dryRun ?? false;
  const settings = shapeAutomationSettings(await getAutomationSettings());
  if (!settings.automationEnabled) {
    return { disabled: true, checked: 0, actions: [], errors: [], dryRun };
  }
  const subs = await masterPrisma.subscription.findMany({
    select: { tenantId: true },
    orderBy: { createdAt: 'asc' },
  });
  const actions: string[] = [];
  const errors: AutomationRunSummary['errors'] = [];
  for (const s of subs) {
    try {
      const res = await runAutomationForTenant(s.tenantId, { dryRun });
      for (const a of res.actions) {
        actions.push(`${res.tenantCode || s.tenantId} ${a}`);
      }
    } catch (e: any) {
      errors.push({ tenantId: s.tenantId, message: e?.message ?? String(e) });
    }
  }
  return { checked: subs.length, actions, errors, dryRun };
}
