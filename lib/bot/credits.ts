import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { debitMasterTx, creditMasterTx, getCenterOrgId } from './master';

/**
 * Layanan kredit owner — SEMUA perubahan saldo lewat sini.
 * - Saldo di BotConfig.creditBalance adalah cache; CreditLedger = sumber audit.
 * - Pemotongan memakai updateMany kondisional (atomik, anti race).
 * - Setiap mutasi menulis ledger dengan reference unik (idempotency).
 */

export async function getOrCreateBotConfig(organizationId: string) {
  let cfg = await prisma.botConfig.findUnique({ where: { organizationId } });
  if (!cfg) {
    cfg = await prisma.botConfig.create({ data: { organizationId } });
  }
  return cfg;
}

export async function getBalance(organizationId: string): Promise<number> {
  const cfg = await getOrCreateBotConfig(organizationId);
  return cfg.creditBalance;
}

function ref(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/**
 * Reservasi kredit untuk 1 balasan — atomik.
 * Mengembalikan { usageId, balanceAfter } atau melempar bila saldo kurang / duplikat.
 */
export async function reserveCredit(opts: {
  organizationId: string;
  messageId: string;
  conversationId?: string;
  amount: number;
  model?: string;
}): Promise<{ usageId: string; balanceAfter: number }> {
  const { organizationId, messageId, conversationId, amount, model } = opts;
  await getOrCreateBotConfig(organizationId);

  // Idempotency: pesan yang sama tidak boleh ditagih 2x
  const existing = await prisma.botUsage.findUnique({ where: { messageId } });
  if (existing) throw new Error('DUPLICATE_MESSAGE');

  return prisma.$transaction(async (tx) => {
    // Kurangi saldo hanya bila cukup — atomik, aman dari race
    const upd = await tx.botConfig.updateMany({
      where: { organizationId, creditBalance: { gte: amount } },
      data: { creditBalance: { decrement: amount } },
    });
    if (upd.count === 0) throw new Error('INSUFFICIENT_BALANCE');

    const cfg = await tx.botConfig.findUniqueOrThrow({ where: { organizationId } });
    const usage = await tx.botUsage.create({
      data: {
        organizationId,
        conversationId: conversationId ?? null,
        messageId,
        status: 'RESERVED',
        amount,
        model: model ?? null,
      },
    });
    await tx.creditLedger.create({
      data: {
        organizationId,
        type: 'CHARGE',
        amount: -amount,
        balanceAfter: cfg.creditBalance,
        reference: ref('rsv'),
        description: `Reservasi 1 balasan AI (usage ${usage.id.slice(0, 8)})`,
      },
    });
    // Saldo Master ikut berkurang dalam SATU transaksi yang sama —
    // KECUALI untuk organisasi pusat (WOORK.ID): saldonya memang milik pusat,
    // jadi cukup potong saldo tenant agar tidak dobel.
    // Menolak (rollback penuh) bila Master tidak cukup / di bawah batas minimum.
    const centerOrgId = await getCenterOrgId();
    if (organizationId !== centerOrgId) {
      await debitMasterTx(tx, {
        amount,
        type: 'USAGE',
        organizationId,
        reference: `mstr_use_${usage.id}`,
        description: `Pemakaian AI 1 balasan (usage ${usage.id.slice(0, 8)})`,
      });
    }
    return { usageId: usage.id, balanceAfter: cfg.creditBalance };
  });
}

/** Tagihan final: reservasi → CHARGED. */
export async function finalizeCharge(usageId: string): Promise<void> {
  await prisma.botUsage.update({
    where: { id: usageId, status: 'RESERVED' },
    data: { status: 'CHARGED' },
  }).catch(() => {});
}

/** Gagal: kembalikan kredit (sekali saja). */
export async function refundCredit(usageId: string, reason?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const usage = await tx.botUsage.findUnique({ where: { id: usageId } });
    if (!usage || usage.status !== 'RESERVED') return; // sudah final/refund
    const cfg = await tx.botConfig.update({
      where: { organizationId: usage.organizationId },
      data: { creditBalance: { increment: usage.amount } },
    });
    await tx.botUsage.update({ where: { id: usageId }, data: { status: 'REFUNDED', error: reason ?? null } });
    await tx.creditLedger.create({
      data: {
        organizationId: usage.organizationId,
        type: 'REFUND',
        amount: usage.amount,
        balanceAfter: cfg.creditBalance,
        reference: ref('rfd'),
        description: `Refund reservasi gagal (usage ${usageId.slice(0, 8)}): ${reason ?? 'gagal'}`,
      },
    });
    // Kembalikan juga potongan Saldo Master (kecuali org pusat yang memang tidak didebet)
    const centerOrgId = await getCenterOrgId();
    if (usage.organizationId !== centerOrgId) {
      await creditMasterTx(tx, {
        amount: usage.amount,
        type: 'USAGE_REFUND',
        reference: `mstr_rfd_${usageId}`,
        description: `Refund pemakaian AI gagal (usage ${usageId.slice(0, 8)}): ${reason ?? 'gagal'}`,
      });
    }
  });
}

/** Tandai gagal tanpa refund (untuk kasus yang tidak pernah reservasi). */
export async function markFailed(messageId: string, organizationId: string, error: string): Promise<void> {
  await prisma.botUsage.upsert({
    where: { messageId },
    update: { status: 'FAILED', error },
    create: { organizationId, messageId, status: 'FAILED', amount: 0, error },
  });
}

/**
 * Tambah kredit — hanya setelah pembayaran terverifikasi / oleh admin. Idempoten via reference.
 * fromMaster=true: top up tenant sebagai DISTRIBUSI dari Saldo Master
 * (Master berkurang, tenant bertambah; ditolak bila Master tidak cukup / di bawah minimum).
 */
export async function addCredit(opts: {
  organizationId: string;
  amount: number;
  type: 'TOPUP' | 'ADJUST';
  description?: string;
  createdById?: string;
  reference?: string;
  fromMaster?: boolean;
}): Promise<number> {
  const { organizationId, amount, type, description, createdById, reference, fromMaster } = opts;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal harus bilangan bulat positif.');
  await getOrCreateBotConfig(organizationId);
  const r = reference ?? ref('top');

  // Idempotency: reference yang sama tidak diproses 2x
  const dup = await prisma.creditLedger.findUnique({ where: { reference: r } });
  if (dup) return dup.balanceAfter;

  const cfg = await prisma.$transaction(async (tx) => {
    if (fromMaster && type === 'TOPUP') {
      await debitMasterTx(tx, {
        amount,
        type: 'DISTRIBUTE',
        organizationId,
        createdById,
        reference: `mstr_dist_${r}`,
        description: `Distribusi top up ke tenant (${organizationId.slice(0, 8)}): Rp${amount.toLocaleString('id-ID')}`,
      });
    }
    const c = await tx.botConfig.update({
      where: { organizationId },
      data: { creditBalance: { increment: amount } },
    });
    await tx.creditLedger.create({
      data: { organizationId, type, amount, balanceAfter: c.creditBalance, reference: r, description, createdById },
    });
    return c;
  });
  return cfg.creditBalance;
}

/** Statistik pemakaian owner. */
export async function getOwnerStats(organizationId: string) {
  const [cfg, charged, total] = await Promise.all([
    getOrCreateBotConfig(organizationId),
    prisma.botUsage.count({ where: { organizationId, status: 'CHARGED' } }),
    prisma.botUsage.aggregate({
      where: { organizationId, status: 'CHARGED' },
      _sum: { amount: true },
    }),
  ]);
  return {
    isEnabled: cfg.isEnabled,
    balance: cfg.creditBalance,
    successReplies: charged,
    totalSpent: total._sum.amount ?? 0,
  };
}

export function formatRp(n: number): string {
  return 'Rp' + n.toLocaleString('id-ID');
}
