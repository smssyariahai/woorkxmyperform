import { prisma } from '@/lib/db';
import { getSystemSetting } from '@/lib/system-settings';
import { randomUUID } from 'crypto';

/**
 * Saldo Master WOORK.ID — dompet pusat untuk seluruh layanan AI-Agent.
 * - Saldo Master: dana pusat milik administrator utama.
 * - Top up tenant = distribusi Master → tenant (Master berkurang, tenant bertambah).
 * - Pemakaian AI = tenant & Master sama-sama berkurang Rp500 dalam SATU transaksi logis.
 * - Proteksi: transaksi ditolak bila Master tidak cukup / turun di bawah saldo minimum.
 * - Semua mutasi tercatat di MasterLedger (audit) dengan reference unik (idempotensi).
 */

export const MASTER_ID = 'master';
export const DEFAULT_MIN_BALANCE = 500_000;
export const DEFAULT_CRITICAL_BALANCE = 200_000;

function ref(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export async function getMasterBalance(): Promise<number> {
  const row = await prisma.masterBalance.upsert({
    where: { id: MASTER_ID },
    create: { id: MASTER_ID },
    update: {},
  });
  return row.balance;
}

export async function getMasterLimits(): Promise<{ minBalance: number; criticalBalance: number }> {
  const minRaw = parseInt((await getSystemSetting('master.minBalance')) || '', 10);
  const critRaw = parseInt((await getSystemSetting('master.criticalBalance')) || '', 10);
  const minBalance = Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : DEFAULT_MIN_BALANCE;
  const criticalBalance = Number.isFinite(critRaw) && critRaw >= 0 ? critRaw : DEFAULT_CRITICAL_BALANCE;
  return { minBalance, criticalBalance };
}

/**
 * Organisasi pusat (WOORK.ID) — pemakaian AI-nya TIDAK mendebet Saldo Master,
 * karena Saldo Master memang milik pusat. Cukup potong saldo tenant-nya saja.
 * Terdeteksi otomatis dari nama org; bisa dioverride via setting `master.centerOrgId`.
 */
export async function getCenterOrgId(): Promise<string | null> {
  const configured = (await getSystemSetting('master.centerOrgId')).trim();
  if (configured) {
    const exists = await prisma.organization.findUnique({ where: { id: configured }, select: { id: true } });
    if (exists) return exists.id;
  }
  const org = await prisma.organization.findFirst({ where: { name: 'WOORK.ID' }, select: { id: true } });
  return org?.id ?? null;
}

export type MasterStatus = 'AMAN' | 'PERINGATAN' | 'KRITIS';

export function masterStatusOf(balance: number, minBalance: number, criticalBalance: number): MasterStatus {
  if (balance <= criticalBalance) return 'KRITIS';
  if (balance <= minBalance) return 'PERINGATAN';
  return 'AMAN';
}

async function pricePerReply(): Promise<number> {
  const raw = parseInt((await getSystemSetting('ninerouter.pricePerReply')) || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

/**
 * Kurangi Saldo Master secara atomik di dalam transaksi pemanggil.
 * Menolak bila saldo tidak cukup ATAU akan turun di bawah saldo minimum.
 */
export async function debitMasterTx(
  tx: any,
  opts: {
    amount: number;
    type: 'USAGE' | 'DISTRIBUTE' | 'ADJUST';
    description?: string;
    organizationId?: string;
    createdById?: string;
    reference?: string;
  },
): Promise<number> {
  const { amount, type, description, organizationId, createdById } = opts;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal harus bilangan bulat positif.');
  const { minBalance } = await getMasterLimits();

  // Atomik: kurangi hanya bila sisa tetap >= saldo minimum (anti race)
  const upd = await tx.masterBalance.updateMany({
    where: { id: MASTER_ID, balance: { gte: amount + minBalance } },
    data: { balance: { decrement: amount } },
  });
  if (upd.count === 0) {
    const cur = await getMasterBalance();
    throw new Error(cur < amount ? 'INSUFFICIENT_MASTER_BALANCE' : 'MASTER_MIN_BALANCE_BLOCKED');
  }
  const row = await tx.masterBalance.findUniqueOrThrow({ where: { id: MASTER_ID } });
  await tx.masterLedger.create({
    data: {
      type,
      amount: -amount,
      balanceAfter: row.balance,
      reference: opts.reference ?? ref('mstr'),
      description,
      organizationId: organizationId ?? null,
      createdById: createdById ?? null,
    },
  });
  return row.balance;
}

/** Tambah Saldo Master secara atomik di dalam transaksi pemanggil. */
export async function creditMasterTx(
  tx: any,
  opts: {
    amount: number;
    type: 'MASTER_TOPUP' | 'USAGE_REFUND' | 'ADJUST';
    description?: string;
    createdById?: string;
    reference?: string;
  },
): Promise<number> {
  const { amount, type, description, createdById } = opts;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal harus bilangan bulat positif.');
  const row = await tx.masterBalance.update({
    where: { id: MASTER_ID },
    data: { balance: { increment: amount } },
  });
  await tx.masterLedger.create({
    data: {
      type,
      amount,
      balanceAfter: row.balance,
      reference: opts.reference ?? ref('mstr'),
      description,
      createdById: createdById ?? null,
    },
  });
  return row.balance;
}

/** Tambah Saldo Master oleh admin (transaksi sendiri, idempoten via reference). */
export async function topUpMaster(opts: {
  amount: number;
  description?: string;
  createdById?: string;
  reference?: string;
}): Promise<number> {
  const r = opts.reference ?? ref('mtop');
  const dup = await prisma.masterLedger.findUnique({ where: { reference: r } });
  if (dup) return dup.balanceAfter;
  await prisma.masterBalance.upsert({ where: { id: MASTER_ID }, create: { id: MASTER_ID }, update: {} });
  return prisma.$transaction(async (tx) => {
    return creditMasterTx(tx, {
      amount: opts.amount,
      type: 'MASTER_TOPUP',
      description: opts.description,
      createdById: opts.createdById,
      reference: r,
    });
  });
}

/** Ringkasan dashboard Saldo Master. */
export async function getMasterStats() {
  const balance = await getMasterBalance();
  const { minBalance, criticalBalance } = await getMasterLimits();
  const price = await pricePerReply();
  const status = masterStatusOf(balance, minBalance, criticalBalance);

  const [tenantAgg, usageAgg, inAgg, outAgg] = await Promise.all([
    prisma.botConfig.aggregate({ _sum: { creditBalance: true } }),
    prisma.botUsage.aggregate({
      _sum: { amount: true },
      where: { status: 'CHARGED' },
    }),
    prisma.masterLedger.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 } } }),
    prisma.masterLedger.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }),
  ]);

  const totalTenant = tenantAgg._sum.creditBalance ?? 0;
  const totalUsage = usageAgg._sum.amount ?? 0;
  const totalIn = inAgg._sum.amount ?? 0;
  const totalOut = Math.abs(outAgg._sum.amount ?? 0);
  const estimasiSisa = price > 0 ? Math.max(0, Math.floor((balance - minBalance) / price)) : 0;

  return {
    balance,
    minBalance,
    criticalBalance,
    status,
    pricePerReply: price,
    totalTenant,
    totalUsage,
    totalIn,
    totalOut,
    estimasiSisa,
  };
}
