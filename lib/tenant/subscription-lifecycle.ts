// Siklus hidup langganan tenant (Fase 4 — Bab 5.5/7.4/7.5).
//
// Status: TRIAL | AKTIF | MENUNGGAK | DITANGGUHKAN | NONAKTIF | DIHAPUS.
// Satu-satunya penulis status siklus hidup adalah fungsi-fungsi di file
// ini (+ backfill migrasi). Pemetaan ke Tenant.tenantStatus ada di §3
// desain: TRIAL/AKTIF/MENUNGGAK -> ACTIVE, DITANGGUHKAN -> SUSPENDED,
// NONAKTIF -> DEACTIVATED, DIHAPUS -> DELETED.
//
// Transisi OTOMATIS (jatuh tempo -> Menunggak -> grace -> auto-suspend)
// BUKAN di sini — itu Fase 5. Semua transisi di sini manual (Master atau
// permintaan OWNER) dan wajib beralasan >=10 karakter (pola Fase 3).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Subscription,
  SubscriptionInvoice,
  Tenant,
} from '@prisma/master-client';
import { masterPrisma } from './master';
import {
  TENANT_BACKUP_DIR,
  dropTenantDatabase,
  listTenantBackups,
  setTenantStatus,
} from './backup';
import {
  computeBasePrice,
  getBillingSettings,
  validatePackageSelection,
  type BillingCycle,
} from '@/lib/pricing-catalog';
import { syncPackageModulesToTenant } from './package-sync';

/** Error dengan status HTTP (pola RegistrationError Fase 2/3). */
export class LifecycleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'LifecycleError';
    this.status = status;
  }
}

export const LIFECYCLE_STATUSES = [
  'TRIAL',
  'AKTIF',
  'MENUNGGAK',
  'DITANGGUHKAN',
  'NONAKTIF',
  'DIHAPUS',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  TRIAL: 'Trial',
  AKTIF: 'Aktif',
  MENUNGGAK: 'Menunggak',
  DITANGGUHKAN: 'Ditangguhkan',
  NONAKTIF: 'Nonaktif (Berhenti)',
  DIHAPUS: 'Dihapus',
};

/** Pemetaan lifecycle -> Tenant.tenantStatus (desain §3). */
export const LIFECYCLE_TO_TENANT_STATUS: Record<
  LifecycleStatus,
  'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'DELETED'
> = {
  TRIAL: 'ACTIVE',
  AKTIF: 'ACTIVE',
  MENUNGGAK: 'ACTIVE',
  DITANGGUHKAN: 'SUSPENDED',
  NONAKTIF: 'DEACTIVATED',
  DIHAPUS: 'DELETED',
};

/** Masa retensi setelah berhenti (Bab 7.5): 60 hari. */
export const RETENTION_DAYS = 60;

/** Pola kode tenant — validasi sebelum dipakai di SQL mentah. */
const TENANT_CODE_RE = /^woork_t_[0-9a-f]{8}$/;

function assertReason(reason: unknown): string {
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < 10) {
    throw new LifecycleError('Alasan wajib diisi minimal 10 karakter.', 400);
  }
  return r;
}

async function loadSubscription(tenantId: string): Promise<{
  subscription: Subscription;
  tenant: Tenant;
}> {
  const subscription = await masterPrisma.subscription.findUnique({
    where: { tenantId },
  });
  if (!subscription) {
    throw new LifecycleError('Langganan tenant tidak ditemukan.', 404);
  }
  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    throw new LifecycleError('Tenant tidak ditemukan.', 404);
  }
  return { subscription, tenant };
}

/**
 * Tambah 1 siklus kalender (MONTHLY +1 bulan, YEARLY +1 tahun) dengan clamp
 * ke akhir bulan (31 Jan + 1 bulan = 28/29 Feb). Dipakai applyPayment +
 * lib otomasi Fase 5 (periodEnd invoice). Hitung di UTC supaya tidak
 * bergeser oleh zona waktu server.
 */
export function addBillingCycle(date: Date, cycle: BillingCycle): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  let ty = y;
  let tm = m;
  if (cycle === 'YEARLY') {
    ty = y + 1;
  } else {
    tm = m + 1;
    if (tm > 11) {
      tm = 0;
      ty = y + 1;
    }
  }
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      ty,
      tm,
      Math.min(d, lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Target pemulihan saat reaktivasi: previous bila masih bermakna
 * (TRIAL/AKTIF/MENUNGGAK), selain itu AKTIF. Dipakai rute reactivate
 * (lama + baru) dan transisi DITANGGUHKAN.
 */
export function getReactivateTarget(
  subscription: Pick<Subscription, 'lifecycleStatus' | 'previousLifecycleStatus'>,
): LifecycleStatus {
  const prev = subscription.previousLifecycleStatus;
  if (
    subscription.lifecycleStatus === 'DITANGGUHKAN' &&
    (prev === 'TRIAL' || prev === 'AKTIF' || prev === 'MENUNGGAK')
  ) {
    return prev;
  }
  return 'AKTIF';
}

/** Tabel transisi yang diizinkan (selain itu 409). */
function allowedTargets(
  sub: Pick<Subscription, 'lifecycleStatus' | 'previousLifecycleStatus'>,
): LifecycleStatus[] {
  switch (sub.lifecycleStatus) {
    case 'TRIAL':
      // Fase 5 keputusan #2: trial habis tanpa bayar -> Menunggak + tenggang
      // (trial adalah satu periode dengan trialEndsAt sebagai jatuh tempo).
      return ['AKTIF', 'MENUNGGAK', 'DITANGGUHKAN', 'NONAKTIF'];
    case 'AKTIF':
      return ['MENUNGGAK', 'DITANGGUHKAN', 'NONAKTIF'];
    case 'MENUNGGAK':
      return ['AKTIF', 'DITANGGUHKAN', 'NONAKTIF'];
    case 'DITANGGUHKAN':
      return [getReactivateTarget(sub), 'NONAKTIF'];
    case 'NONAKTIF':
      // DIHAPUS HANYA lewat confirmDeletion, bukan transisi umum.
      return ['AKTIF'];
    case 'DIHAPUS':
      return [];
    default:
      return [];
  }
}

export interface SubscriptionLifecycleDetail {
  subscription: Subscription;
  tenant: Tenant;
  history: Array<{
    id: string;
    subscriptionId: string;
    tenantId: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    changedByUserId: string | null;
    createdAt: Date;
  }>;
}

/** Langganan + tenant + riwayat perubahan (terbaru dulu, maks 50). */
export async function getSubscriptionLifecycle(
  tenantId: string,
): Promise<SubscriptionLifecycleDetail> {
  const { subscription, tenant } = await loadSubscription(tenantId);
  const history = await masterPrisma.subscriptionStatusLog.findMany({
    where: { subscriptionId: subscription.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return { subscription, tenant, history };
}

/**
 * Pindah status siklus hidup. SATU transaksi master untuk Subscription +
 * log + audit; lalu setTenantStatus (di luar transaksi — ia melakukan
 * invalidasi cache + audit sendiri). setTenantStatus hanya dipanggil bila
 * tenantStatus yang dipetakan BERUBAH, supaya transisi yang tidak mengubah
 * akses (mis. TRIAL -> AKTIF) tidak menulis audit TENANT_REACTIVATED palsu.
 */
export async function transitionSubscription(
  tenantId: string,
  to: LifecycleStatus,
  opts: { reason: string; actorId: string },
): Promise<{ subscription: Subscription; tenant: Tenant; from: string; to: LifecycleStatus }> {
  const reason = assertReason(opts.reason);
  const { subscription, tenant } = await loadSubscription(tenantId);
  const from = subscription.lifecycleStatus;
  if (from === to) {
    throw new LifecycleError(
      `Langganan sudah berstatus ${LIFECYCLE_LABELS[to] ?? to}.`,
      409,
    );
  }
  if (!allowedTargets(subscription).includes(to)) {
    if (from === 'NONAKTIF' && to === 'DIHAPUS') {
      throw new LifecycleError(
        'Penghapusan permanen hanya lewat konfirmasi penghapusan setelah masa retensi berakhir.',
        409,
      );
    }
    if (from === 'DIHAPUS') {
      throw new LifecycleError(
        'Langganan sudah dihapus permanen dan tidak bisa dipulihkan.',
        409,
      );
    }
    throw new LifecycleError(
      `Transisi ${from} -> ${to} tidak diizinkan.`,
      409,
    );
  }

  const now = new Date();
  const retention =
    to === 'NONAKTIF'
      ? {
          retentionStartsAt: now,
          retentionEndsAt: new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
        }
      : from === 'NONAKTIF'
        ? { retentionStartsAt: null, retentionEndsAt: null }
        : {};

  const updated = await masterPrisma.$transaction(async (tx) => {
    const sub = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        lifecycleStatus: to,
        previousLifecycleStatus:
          to === 'DITANGGUHKAN' ? from : subscription.previousLifecycleStatus,
        lifecycleReason: reason,
        lifecycleChangedAt: now,
        lifecycleChangedByUserId: opts.actorId,
        ...retention,
      },
    });
    await tx.subscriptionStatusLog.create({
      data: {
        subscriptionId: subscription.id,
        tenantId,
        fromStatus: from,
        toStatus: to,
        reason,
        changedByUserId: opts.actorId,
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: opts.actorId,
        action: 'SUBSCRIPTION_LIFECYCLE_CHANGED',
        tenantId,
        metadata: JSON.stringify({
          from,
          to,
          reason,
          tenantCode: tenant.tenantCode,
        }),
      },
    });
    return sub;
  });

  // Sinkronkan Tenant.tenantStatus (di luar transaksi, pola desain §5).
  // Bila ini gagal, lifecycle SUDAH berubah — pemanggil harus melaporkannya.
  const mapped = LIFECYCLE_TO_TENANT_STATUS[to];
  let tenantAfter = tenant;
  if (tenant.tenantStatus !== mapped) {
    const res = await setTenantStatus(tenantId, mapped, opts.actorId);
    tenantAfter = { ...tenant, tenantStatus: res.tenantStatus };
  }
  return { subscription: updated, tenant: tenantAfter, from, to };
}

/**
 * Ubah paket langganan (naik/turun). Validasi via lib/pricing-catalog.ts
 * (tier + minimum storage + >=1 modul berbayar untuk langganan berbayar).
 * Pemakaian storage/user BELUM diukur di mana pun, jadi guard downgrade
 * berbasis pemakaian (Bab 9.2) tidak bisa dicek — dicatat di audit sebagai
 * usageCheck: 'unavailable' (desain §1).
 */
export async function changePackage(
  tenantId: string,
  input: { userTierId: string; storageTierId: string; moduleKeys: string[] },
  actorId: string,
): Promise<{ subscription: Subscription; packageSyncWarning?: string }> {
  const { subscription, tenant } = await loadSubscription(tenantId);
  const isPaid = subscription.lifecycleStatus !== 'TRIAL';
  const validation = await validatePackageSelection({
    userTierId: input.userTierId,
    storageTierId: input.storageTierId,
    moduleKeys: input.moduleKeys,
    isPaid,
  });
  if (!validation.ok) {
    throw new LifecycleError(validation.errors.join(' '), 400);
  }
  const [userTier, storageTier, modules, settings] = await Promise.all([
    masterPrisma.packageUserTier.findUnique({ where: { id: input.userTierId } }),
    masterPrisma.packageStorageTier.findUnique({ where: { id: input.storageTierId } }),
    masterPrisma.packageModulePrice.findMany({
      where: { moduleKey: { in: input.moduleKeys } },
      orderBy: { sortOrder: 'asc' },
    }),
    getBillingSettings(),
  ]);
  const cycle = (subscription.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY') as BillingCycle;
  const price = await computeBasePrice({
    userTier,
    storageTier,
    moduleKeys: input.moduleKeys,
    cycle,
  });
  // Bentuk snapshot SAMA dengan buildPackageSnapshot Fase 2 (dipakai UI
  // antrean + detail langganan).
  const snapshot = {
    userTier: userTier
      ? {
          id: userTier.id,
          name: userTier.name,
          maxUsers: userTier.maxUsers,
          monthlyPrice: userTier.monthlyPrice,
          yearlyPrice: userTier.yearlyPrice,
          minStorageGb: userTier.minStorageGb,
        }
      : null,
    storageTier: storageTier
      ? {
          id: storageTier.id,
          name: storageTier.name,
          capacityGb: storageTier.capacityGb,
          monthlyPrice: storageTier.monthlyPrice,
          yearlyPrice: storageTier.yearlyPrice,
        }
      : null,
    modules: modules.map((m) => ({
      moduleKey: m.moduleKey,
      name: m.name,
      monthlyPrice: m.monthlyPrice,
      yearlyPrice: m.yearlyPrice,
    })),
    billingCycle: cycle,
    startChoice: subscription.lifecycleStatus === 'TRIAL' ? 'TRIAL' : 'PAID',
    basePrice: price.base,
    hasCustomPrice: price.hasCustomPrice,
    ppnRateBps: settings.ppnRateBps,
  };
  const updated = await masterPrisma.subscription.update({
    where: { id: subscription.id },
    data: {
      userTierId: input.userTierId,
      storageTierId: input.storageTierId,
      moduleKeys: input.moduleKeys,
      packageSnapshotJson: JSON.stringify(snapshot),
    },
  });
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: actorId,
      action: 'SUBSCRIPTION_PACKAGE_CHANGED',
      tenantId,
      metadata: JSON.stringify({
        tenantCode: tenant.tenantCode,
        userTierId: input.userTierId,
        storageTierId: input.storageTierId,
        moduleKeys: input.moduleKeys,
        basePrice: price.base,
        usageCheck: 'unavailable',
      }),
    },
  });
  // Fase 7 (Bab 8 G1): sinkronkan paket -> baris SubscriptionModule di DB
  // tenant. Pilihan modul diteruskan eksplisit (tanpa grandfathering).
  // Gagal di sini TIDAK menggagalkan perubahan paket (dicatat +
  // dikembalikan sebagai peringatan; bisa diulang via skrip).
  let packageSyncWarning: string | undefined;
  try {
    await syncPackageModulesToTenant(tenantId, { moduleKeys: input.moduleKeys });
  } catch (e) {
    packageSyncWarning = (e as Error)?.message ?? String(e);
    console.error('[changePackage] sinkronisasi modul paket gagal:', packageSyncWarning);
  }
  return { subscription: updated, packageSyncWarning };
}

/**
 * Perpanjang masa aktif. TRIAL -> trialEndsAt += hari; selain itu
 * currentPeriodEndsAt (bila null, mulai dari now) += hari. Hari 1-365.
 */
export async function extendPeriod(
  tenantId: string,
  days: number,
  actorId: string,
): Promise<Subscription> {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new LifecycleError('Jumlah hari perpanjangan harus 1-365.', 400);
  }
  const { subscription, tenant } = await loadSubscription(tenantId);
  const ms = days * 24 * 60 * 60 * 1000;
  const now = new Date();
  let updated: Subscription;
  if (subscription.lifecycleStatus === 'TRIAL') {
    const base = subscription.trialEndsAt && subscription.trialEndsAt > now
      ? subscription.trialEndsAt
      : now;
    updated = await masterPrisma.subscription.update({
      where: { id: subscription.id },
      data: { trialEndsAt: new Date(base.getTime() + ms) },
    });
  } else {
    const base = subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt > now
      ? subscription.currentPeriodEndsAt
      : now;
    updated = await masterPrisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEndsAt: new Date(base.getTime() + ms) },
    });
  }
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: actorId,
      action: 'SUBSCRIPTION_PERIOD_EXTENDED',
      tenantId,
      metadata: JSON.stringify({
        tenantCode: tenant.tenantCode,
        days,
        field: subscription.lifecycleStatus === 'TRIAL' ? 'trialEndsAt' : 'currentPeriodEndsAt',
        newEndsAt:
          subscription.lifecycleStatus === 'TRIAL'
            ? updated.trialEndsAt?.toISOString() ?? null
            : updated.currentPeriodEndsAt?.toISOString() ?? null,
      }),
    },
  });
  return updated;
}

/**
 * Terapkan pembayaran yang dicocokkan / dikonfirmasi manual Master
 * (Fase 5 §4.2; jalur rekonsiliasi Fase 6 memanggil fungsi ini).
 * - Invoice (bila ada) harus Belum Dibayar, else 409; lalu -> Lunas.
 * - newEnd = dibayar SETELAH penangguhan ? paidAt + 1 siklus
 *   : (dueAt ?? paidAt) + 1 siklus (dibayar sebelum penangguhan ->
 *   perpanjangan dihitung dari akhir periode sebelumnya).
 * - TRIAL -> trialEndsAt = null, currentPeriodEndsAt = newEnd;
 *   AKTIF/MENUNGGAK -> currentPeriodEndsAt = newEnd; graceEndsAt = null.
 * - Satu transaksi master (invoice + subscription + log status + audit),
 *   lalu setTenantStatus bila pemetaan berubah (DITANGGUHKAN -> ACTIVE),
 *   lalu log otomasi PAYMENT_APPLIED (ditulis langsung via masterPrisma —
 *   file ini tidak mengimpor lib otomasi untuk menghindari impor sirkular).
 * - Bila invoiceId TIDAK diberikan (pembayaran tanpa invoice): tetap
 *   perpanjang dengan cara yang sama, invoice = null, dicatat di log+audit.
 */
export async function applyPayment(
  subscriptionId: string,
  opts: {
    invoiceId?: string | null;
    amount: number;
    paidAt?: Date;
    actorId: string;
    reason: string;
    actorType?: 'SYSTEM' | 'MASTER';
    // Fase 6 (§9.5): bank + mutasi pencocokan otomatis — ditulis ke invoice.
    paidBank?: string | null;
    paidMutationId?: string | null;
  },
): Promise<{
  subscription: Subscription;
  invoice: SubscriptionInvoice | null;
  newEnd: Date;
  wasSuspended: boolean;
}> {
  const reason = assertReason(opts.reason);
  if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
    throw new LifecycleError('Jumlah pembayaran harus lebih dari 0.', 400);
  }
  const subscription = await masterPrisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) {
    throw new LifecycleError('Langganan tidak ditemukan.', 404);
  }
  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: subscription.tenantId },
  });
  if (!tenant) {
    throw new LifecycleError('Tenant tidak ditemukan.', 404);
  }
  const from = subscription.lifecycleStatus;
  if (from === 'NONAKTIF' || from === 'DIHAPUS') {
    throw new LifecycleError(
      'Langganan sudah berhenti/dihapus — pembayaran tidak bisa diterapkan.',
      409,
    );
  }
  let invoice: SubscriptionInvoice | null = null;
  if (opts.invoiceId) {
    invoice = await masterPrisma.subscriptionInvoice.findUnique({
      where: { id: opts.invoiceId },
    });
    if (!invoice || invoice.subscriptionId !== subscription.id) {
      throw new LifecycleError(
        'Invoice tidak ditemukan untuk langganan ini.',
        404,
      );
    }
    if (invoice.status !== 'Belum Dibayar') {
      throw new LifecycleError(
        `Invoice sudah berstatus ${invoice.status}.`,
        409,
      );
    }
  }
  const paidAt = opts.paidAt ?? new Date();
  const wasSuspended = from === 'DITANGGUHKAN';
  const dueAt =
    from === 'TRIAL'
      ? subscription.trialEndsAt
      : subscription.currentPeriodEndsAt;
  const cycle = (subscription.billingCycle === 'YEARLY'
    ? 'YEARLY'
    : 'MONTHLY') as BillingCycle;
  const baseDate = wasSuspended ? paidAt : (dueAt ?? paidAt);
  const newEnd = addBillingCycle(baseDate, cycle);
  const now = new Date();

  const updated = await masterPrisma.$transaction(async (tx) => {
    if (invoice) {
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'Lunas',
          paidAt,
          paidAmount: opts.amount,
          paidBank: opts.paidBank ?? invoice.paidBank,
          paidMutationId: opts.paidMutationId ?? invoice.paidMutationId,
        },
      });
    }
    const sub = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        lifecycleStatus: 'AKTIF',
        previousLifecycleStatus: wasSuspended
          ? from
          : subscription.previousLifecycleStatus,
        lifecycleReason: reason,
        lifecycleChangedAt: now,
        lifecycleChangedByUserId: opts.actorId,
        trialEndsAt: null,
        currentPeriodEndsAt: newEnd,
        graceEndsAt: null,
      },
    });
    await tx.subscriptionStatusLog.create({
      data: {
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        fromStatus: from,
        toStatus: 'AKTIF',
        reason,
        changedByUserId: opts.actorId,
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: opts.actorId,
        action: 'SUBSCRIPTION_PAYMENT_APPLIED',
        tenantId: subscription.tenantId,
        metadata: JSON.stringify({
          tenantCode: tenant.tenantCode,
          invoiceId: invoice?.id ?? null,
          invoiceNumber: invoice?.number ?? null,
          amount: opts.amount,
          paidAt: paidAt.toISOString(),
          newEnd: newEnd.toISOString(),
          wasSuspended,
          note: invoice ? undefined : 'tanpa invoice',
        }),
      },
    });
    return sub;
  });

  const mapped = LIFECYCLE_TO_TENANT_STATUS['AKTIF'];
  if (tenant.tenantStatus !== mapped) {
    await setTenantStatus(subscription.tenantId, mapped, opts.actorId);
  }
  await masterPrisma.subscriptionAutoActionLog.create({
    data: {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      action: 'PAYMENT_APPLIED',
      detail: invoice
        ? `Invoice ${invoice.number} lunas, periode baru sampai ${newEnd.toISOString().slice(0, 10)}`
        : `Pembayaran tanpa invoice, periode baru sampai ${newEnd.toISOString().slice(0, 10)}`,
      reason,
      actorType: opts.actorType ?? 'MASTER',
      actorUserId: opts.actorId,
      metadataJson: JSON.stringify({
        invoiceId: invoice?.id ?? null,
        amount: opts.amount,
        paidAt: paidAt.toISOString(),
        newEnd: newEnd.toISOString(),
        wasSuspended,
        paidBank: opts.paidBank ?? null,
        paidMutationId: opts.paidMutationId ?? null,
      }),
    },
  });
  return { subscription: updated, invoice, newEnd, wasSuspended };
}

/**
 * Konfirmasi penghapusan permanen (Bab 7.5). Syarat: NONAKTIF + retensi
 * sudah lewat + confirmCode === tenantCode persis + alasan >=10 karakter.
 * Langkah berurutan (tiap langkah diaudit di tempatnya; bila satu gagal,
 * berhenti — master masih NONAKTIF sehingga bisa dicoba lagi):
 * 1) putuskan client cache, 2) hapus file backup tenant,
 * 3) DROP DATABASE + DROP ROLE, 4) master: DIHAPUS + tombstone + log + audit.
 * Baris Tenant + Subscription + log TETAP ADA sebagai tombstone (info
 * perusahaan disimpan 1 tahun; purge tahunan di luar Fase 4).
 */
export async function confirmDeletion(
  tenantId: string,
  opts: { reason: string; confirmCode: string; actorId: string },
): Promise<{ tenantId: string; tenantCode: string; deletedAt: Date }> {
  const reason = assertReason(opts.reason);
  const { subscription, tenant } = await loadSubscription(tenantId);
  const code = tenant.tenantCode;
  if (!TENANT_CODE_RE.test(code)) {
    throw new LifecycleError('Kode tenant tidak valid untuk penghapusan.', 400);
  }
  if (subscription.lifecycleStatus !== 'NONAKTIF') {
    throw new LifecycleError(
      'Tenant hanya bisa dihapus permanen setelah berstatus Nonaktif (Berhenti).',
      409,
    );
  }
  const now = new Date();
  if (!subscription.retentionEndsAt || subscription.retentionEndsAt > now) {
    const remainingMs = subscription.retentionEndsAt
      ? subscription.retentionEndsAt.getTime() - now.getTime()
      : RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    throw new LifecycleError(
      `Masa retensi belum berakhir. Sisa ${remainingDays} hari lagi sebelum data bisa dihapus permanen.`,
      409,
    );
  }
  if (opts.confirmCode !== code) {
    throw new LifecycleError(
      `Kode konfirmasi salah. Ketik persis kode tenant "${code}" untuk menghapus database ini.`,
      400,
    );
  }

  // 1) Hapus file backup tenant.
  for (const b of listTenantBackups(code)) {
    const filePath = path.join(TENANT_BACKUP_DIR, path.basename(b.filename));
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File sudah hilang di tengah jalan — lanjutkan.
    }
  }
  // 2) DROP DATABASE + DROP ROLE (dropTenantDatabase di lib/tenant/backup.ts:
  //    invalidate client + terminate backend sebagai role tenant sendiri +
  //    DROP sebagai admin; IF EXISTS supaya bisa dicoba lagi).
  await dropTenantDatabase(tenantId);

  // 4) Master: DIHAPUS + tombstone + log + audit (satu transaksi).
  const deletedAt = new Date();
  await masterPrisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        lifecycleStatus: 'DIHAPUS',
        lifecycleReason: reason,
        lifecycleChangedAt: deletedAt,
        lifecycleChangedByUserId: opts.actorId,
        deletedAt,
        deletionConfirmedByUserId: opts.actorId,
      },
    });
    await tx.tenant.update({
      where: { id: tenantId },
      data: { tenantStatus: 'DELETED' },
    });
    // Registry dipertahankan sebagai riwayat (JANGAN dihapus).
    await tx.tenantDatabaseRegistry.updateMany({
      where: { tenantId },
      data: { connectionStatus: 'DELETED' },
    });
    await tx.subscriptionStatusLog.create({
      data: {
        subscriptionId: subscription.id,
        tenantId,
        fromStatus: 'NONAKTIF',
        toStatus: 'DIHAPUS',
        reason,
        changedByUserId: opts.actorId,
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: opts.actorId,
        action: 'SUBSCRIPTION_DELETED',
        tenantId,
        metadata: JSON.stringify({ tenantCode: code, reason }),
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: opts.actorId,
        action: 'TENANT_DELETED',
        tenantId,
        metadata: JSON.stringify({ tenantCode: code, reason }),
      },
    });
  });
  return { tenantId, tenantCode: code, deletedAt };
}

/* ------------------------------------------------------------------ */
/* Status langganan milik pemanggil (dipakai /api/tenant/subscription  */
/* + halaman /langganan Tugas B). TANPA tenant context: tenant         */
/* DITANGGUHKAN/NONAKTIF tidak punya context, jadi identitas dibaca    */
/* dari sesi (auth()) lalu TenantMembership di master.                 */
/* ------------------------------------------------------------------ */

export interface OwnSubscriptionStatus {
  tenant: Tenant;
  subscription: Subscription;
  membership: { id: string; roleReference: string };
  isOwner: boolean;
}

export async function getOwnSubscriptionStatus(
  platformUserId: string,
): Promise<OwnSubscriptionStatus | null> {
  const membership = await masterPrisma.tenantMembership.findFirst({
    where: { userId: platformUserId, membershipStatus: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: { tenant: { include: { subscription: true } } },
  });
  if (!membership || !membership.tenant.subscription) return null;
  return {
    tenant: membership.tenant,
    subscription: membership.tenant.subscription,
    membership: { id: membership.id, roleReference: membership.roleReference },
    isOwner: membership.roleReference === 'OWNER',
  };
}

/** Sesi -> PlatformUser (by id, fallback by email) -> status langganan. */
export async function resolveOwnSubscription(
  sessionUser: { id?: string | null; email?: string | null },
): Promise<OwnSubscriptionStatus | null> {
  let platformUserId: string | null = null;
  if (sessionUser.id) {
    const pu = await masterPrisma.platformUser.findUnique({
      where: { id: sessionUser.id },
      select: { id: true },
    });
    if (pu) platformUserId = pu.id;
  }
  if (!platformUserId && sessionUser.email) {
    const pu = await masterPrisma.platformUser.findUnique({
      where: { email: sessionUser.email.toLowerCase() },
      select: { id: true },
    });
    if (pu) platformUserId = pu.id;
  }
  if (!platformUserId) return null;
  return getOwnSubscriptionStatus(platformUserId);
}

/** Bentuk payload status untuk API + halaman /langganan (desain §6). */
export function toStatusPayload(own: OwnSubscriptionStatus) {
  const { tenant, subscription } = own;
  return {
    companyName: tenant.companyName,
    tenantCode: tenant.tenantCode,
    lifecycleStatus: subscription.lifecycleStatus,
    lifecycleReason: subscription.lifecycleReason,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    retentionStartsAt: subscription.retentionStartsAt,
    retentionEndsAt: subscription.retentionEndsAt,
    isOwner: own.isOwner,
  };
}

/** Bentuk detail langganan untuk API Master (desain §6 GET). */
export function shapeSubscription(subscription: Subscription) {
  let packageSnapshot: unknown = null;
  try {
    packageSnapshot = JSON.parse(subscription.packageSnapshotJson);
  } catch {
    packageSnapshot = null;
  }
  return {
    lifecycleStatus: subscription.lifecycleStatus,
    previousLifecycleStatus: subscription.previousLifecycleStatus,
    lifecycleReason: subscription.lifecycleReason,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    retentionStartsAt: subscription.retentionStartsAt,
    retentionEndsAt: subscription.retentionEndsAt,
    userTierId: subscription.userTierId,
    storageTierId: subscription.storageTierId,
    moduleKeys: subscription.moduleKeys,
    packageSnapshot,
    billingCycle: subscription.billingCycle,
    userQuota: subscription.userQuota,
  };
}
