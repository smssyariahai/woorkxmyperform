// Katalog Paket & Harga — server-only.
// Semua harga/tier berasal dari Database Master (bukan konstanta di kode),
// sesuai Bab 9.1–9.4. Master mengubahnya lewat /api/super/pricing/*.
import { masterPrisma } from '@/lib/tenant/master';
import { apiErr } from '@/lib/utils';
import type {
  BillingSettings,
  PackageModulePrice,
  PackageStorageTier,
  PackageUserTier,
  Prisma,
} from '@prisma/master-client';

export type BillingCycle = 'MONTHLY' | 'YEARLY';

export const DEFAULT_PPN_RATE_BPS = 1100; // 11%
export const DEFAULT_INVOICE_VALIDITY_HOURS = 24;

/* ------------------------------------------------------------------ */
/* Pembacaan katalog                                                  */
/* ------------------------------------------------------------------ */

export async function getActiveUserTiers(): Promise<PackageUserTier[]> {
  return masterPrisma.packageUserTier.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getActiveStorageTiers(): Promise<PackageStorageTier[]> {
  return masterPrisma.packageStorageTier.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getActiveModulePrices(): Promise<PackageModulePrice[]> {
  return masterPrisma.packageModulePrice.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Ambil pengaturan billing; buat default (PPN 11%, invoice 24 jam) bila belum ada. */
export async function getBillingSettings(): Promise<BillingSettings> {
  const existing = await masterPrisma.billingSettings.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;
  return masterPrisma.billingSettings.create({
    data: {
      ppnRateBps: DEFAULT_PPN_RATE_BPS,
      invoiceValidityHours: DEFAULT_INVOICE_VALIDITY_HOURS,
    },
  });
}

export interface RegistrationCatalog {
  userTiers: PackageUserTier[];
  storageTiers: PackageStorageTier[];
  modules: PackageModulePrice[];
  settings: BillingSettings;
}

/** Gabungan katalog untuk formulir pendaftaran (Fase 2). */
export async function getCatalogForRegistration(): Promise<RegistrationCatalog> {
  const [userTiers, storageTiers, modules, settings] = await Promise.all([
    getActiveUserTiers(),
    getActiveStorageTiers(),
    getActiveModulePrices(),
    getBillingSettings(),
  ]);
  return { userTiers, storageTiers, modules, settings };
}

/* ------------------------------------------------------------------ */
/* Hitung harga dasar (Bab 9.1: tier pengguna + tier storage + modul) */
/* ------------------------------------------------------------------ */

export interface PriceBreakdownItem {
  label: string;
  /** null = harga khusus (dinego dengan Master), tidak masuk total. */
  amount: number | null;
}

export interface ComputedBasePrice {
  /** Total harga dasar (rupiah) per siklus, tanpa harga khusus. */
  base: number;
  hasCustomPrice: boolean;
  breakdown: PriceBreakdownItem[];
}

export interface ComputeBasePriceInput {
  userTier: PackageUserTier | string | null;
  storageTier: PackageStorageTier | string | null;
  moduleKeys: string[];
  cycle: BillingCycle;
}

function priceForCycle(
  row: { monthlyPrice: number | null; yearlyPrice: number | null },
  cycle: BillingCycle,
): number | null {
  return cycle === 'YEARLY' ? row.yearlyPrice : row.monthlyPrice;
}

async function resolveUserTier(
  input: PackageUserTier | string | null,
): Promise<PackageUserTier | null> {
  if (!input) return null;
  if (typeof input === 'string') {
    return masterPrisma.packageUserTier.findUnique({ where: { id: input } });
  }
  return input;
}

async function resolveStorageTier(
  input: PackageStorageTier | string | null,
): Promise<PackageStorageTier | null> {
  if (!input) return null;
  if (typeof input === 'string') {
    return masterPrisma.packageStorageTier.findUnique({
      where: { id: input },
    });
  }
  return input;
}

/**
 * Harga dasar = harga tier pengguna + harga tier storage + jumlah harga modul.
 * Harga tahunan memakai kolom yearlyPrice (bukan hitung 10x) — Master bebas
 * mengisi harga tahunan berapa pun. Modul hanya yang status ACTIVE.
 */
export async function computeBasePrice(
  input: ComputeBasePriceInput,
): Promise<ComputedBasePrice> {
  const breakdown: PriceBreakdownItem[] = [];
  let base = 0;
  let hasCustomPrice = false;

  const userTier = await resolveUserTier(input.userTier);
  if (userTier) {
    const amount = priceForCycle(userTier, input.cycle);
    breakdown.push({ label: userTier.name, amount });
    if (amount === null) hasCustomPrice = true;
    else base += amount;
  }

  const storageTier = await resolveStorageTier(input.storageTier);
  if (storageTier) {
    const amount = priceForCycle(storageTier, input.cycle);
    breakdown.push({ label: storageTier.name, amount });
    if (amount === null) hasCustomPrice = true;
    else base += amount;
  }

  const uniqueKeys = [
    ...new Set(
      (input.moduleKeys ?? []).map((k) => String(k).trim()).filter(Boolean),
    ),
  ];
  if (uniqueKeys.length > 0) {
    const modules = await masterPrisma.packageModulePrice.findMany({
      where: { moduleKey: { in: uniqueKeys }, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
    for (const m of modules) {
      const amount = priceForCycle(m, input.cycle);
      breakdown.push({ label: m.name, amount });
      if (amount === null) hasCustomPrice = true;
      else base += amount;
    }
  }

  return { base, hasCustomPrice, breakdown };
}

/* ------------------------------------------------------------------ */
/* Validasi pilihan paket (Bab 9.1–9.2)                               */
/* ------------------------------------------------------------------ */

export interface PackageSelectionInput {
  userTierId: string | null | undefined;
  storageTierId: string | null | undefined;
  moduleKeys: string[];
  /** true = langganan berbayar (wajib ≥1 modul berbayar aktif). */
  isPaid: boolean;
}

export async function validatePackageSelection(
  input: PackageSelectionInput,
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  let userTier: PackageUserTier | null = null;
  if (!input.userTierId) {
    errors.push('Tier pengguna wajib dipilih.');
  } else {
    userTier = await masterPrisma.packageUserTier.findUnique({
      where: { id: input.userTierId },
    });
    if (!userTier) errors.push('Tier pengguna tidak ditemukan.');
    else if (userTier.status !== 'ACTIVE')
      errors.push(`Tier pengguna "${userTier.name}" sudah tidak aktif.`);
  }

  let storageTier: PackageStorageTier | null = null;
  if (!input.storageTierId) {
    errors.push('Tier storage wajib dipilih.');
  } else {
    storageTier = await masterPrisma.packageStorageTier.findUnique({
      where: { id: input.storageTierId },
    });
    if (!storageTier) errors.push('Tier storage tidak ditemukan.');
    else if (storageTier.status !== 'ACTIVE')
      errors.push(`Tier storage "${storageTier.name}" sudah tidak aktif.`);
  }

  // Minimum storage mengikuti tier pengguna (Bab 9.1). capacityGb null =
  // harga khusus di atas 2 TB — dianggap memenuhi minimum berapa pun.
  if (
    userTier &&
    userTier.status === 'ACTIVE' &&
    storageTier &&
    storageTier.status === 'ACTIVE' &&
    storageTier.capacityGb !== null &&
    storageTier.capacityGb < userTier.minStorageGb
  ) {
    errors.push(
      `Storage minimum untuk tier "${userTier.name}" adalah ${userTier.minStorageGb} GB.`,
    );
  }

  const uniqueKeys = [
    ...new Set(
      (input.moduleKeys ?? []).map((k) => String(k).trim()).filter(Boolean),
    ),
  ];
  if (uniqueKeys.length > 0) {
    const found = await masterPrisma.packageModulePrice.findMany({
      where: { moduleKey: { in: uniqueKeys } },
    });
    const foundMap = new Map(found.map((m) => [m.moduleKey, m]));
    for (const key of uniqueKeys) {
      const m = foundMap.get(key);
      if (!m) errors.push(`Modul "${key}" tidak ditemukan.`);
      else if (m.status !== 'ACTIVE')
        errors.push(`Modul "${m.name}" sudah tidak aktif.`);
    }
  }
  if (input.isPaid) {
    const activeCount = await masterPrisma.packageModulePrice.count({
      where: { moduleKey: { in: uniqueKeys }, status: 'ACTIVE' },
    });
    if (activeCount === 0) {
      errors.push(
        'Langganan berbayar wajib memilih minimal 1 modul berbayar yang aktif.',
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Audit perubahan katalog (PlatformAuditLog, tenantId null)          */
/* ------------------------------------------------------------------ */

export async function recordPackageAudit(
  actorUserId: string | null | undefined,
  action: string,
  metadata: Record<string, unknown> | string,
): Promise<void> {
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: actorUserId ?? null,
      action,
      tenantId: null,
      metadata:
        typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Ringkasan sebelum/sesudah untuk metadata audit                     */
/* ------------------------------------------------------------------ */

export function summarizeUserTier(t: PackageUserTier): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    maxUsers: t.maxUsers,
    monthlyPrice: t.monthlyPrice,
    yearlyPrice: t.yearlyPrice,
    isCustomPrice: t.isCustomPrice,
    minStorageGb: t.minStorageGb,
    status: t.status,
  };
}

export function summarizeStorageTier(
  t: PackageStorageTier,
): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    capacityGb: t.capacityGb,
    monthlyPrice: t.monthlyPrice,
    yearlyPrice: t.yearlyPrice,
    isCustomPrice: t.isCustomPrice,
    status: t.status,
  };
}

export function summarizeModulePrice(
  m: PackageModulePrice,
): Record<string, unknown> {
  return {
    id: m.id,
    moduleKey: m.moduleKey,
    name: m.name,
    monthlyPrice: m.monthlyPrice,
    yearlyPrice: m.yearlyPrice,
    status: m.status,
  };
}

export function summarizeBillingSettings(
  s: BillingSettings,
): Record<string, unknown> {
  return {
    id: s.id,
    ppnRateBps: s.ppnRateBps,
    invoiceValidityHours: s.invoiceValidityHours,
    trialEnabled: s.trialEnabled,
  };
}

/* ------------------------------------------------------------------ */
/* Validasi body JSON (melempar Response apiErr bila tidak valid)     */
/* ------------------------------------------------------------------ */

/** Baca body sebagai objek JSON. */
export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw apiErr('Body JSON tidak valid.', 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw apiErr('Body harus berupa objek JSON.', 400);
  }
  return body as Record<string, unknown>;
}

/**
 * Validasi satu field integer. Mengembalikan undefined bila tidak dikirim,
 * null bila dikirim null (untuk PATCH = kosongkan field nullable).
 */
export function bodyInt(
  value: unknown,
  label: string,
  opts: { min?: number; required?: boolean } = {},
): number | null | undefined {
  const { min = 0, required = false } = opts;
  if (value === undefined || value === null) {
    if (required) throw apiErr(`${label} wajib diisi.`, 400);
    return value === null ? null : undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw apiErr(
      `${label} harus bilangan bulat${min > 0 ? ` lebih dari ${min - 1}` : ' ≥ 0'}.`,
      400,
    );
  }
  return value;
}

/** Validasi satu field string (di-trim). */
export function bodyString(
  value: unknown,
  label: string,
  opts: { required?: boolean; maxLength?: number } = {},
): string | undefined {
  if (value === undefined || value === null) {
    if (opts.required) throw apiErr(`${label} wajib diisi.`, 400);
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw apiErr(`${label} wajib diisi.`, 400);
  }
  const s = value.trim();
  if (opts.maxLength && s.length > opts.maxLength) {
    throw apiErr(`${label} maksimal ${opts.maxLength} karakter.`, 400);
  }
  return s;
}

/**
 * Validasi status katalog via PATCH: hanya ACTIVE ↔ DISCONTINUED.
 * DELETED hanya lewat DELETE (terminal) dan tidak bisa diedit lagi.
 */
export function bodyCatalogStatus(
  value: unknown,
): 'ACTIVE' | 'DISCONTINUED' | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'ACTIVE' || value === 'DISCONTINUED') return value;
  if (value === 'DELETED') {
    throw apiErr('Status DELETED hanya bisa lewat penghapusan (DELETE).', 400);
  }
  throw apiErr('Status hanya boleh ACTIVE atau DISCONTINUED.', 400);
}

/** true bila error Prisma adalah pelanggaran unique constraint (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'P2002'
  );
}

export type { Prisma };
