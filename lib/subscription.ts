// Helper langganan Sistem Modular: status langganan kantor, modul yang
// diambil, level akses per pengguna, kuota karyawan, dan nomor invoice.
//
// Aturan grandfathering: kantor TANPA baris Subscription (data lama) =
// semua modul aktif, tanpa batas kuota. Setelah seed Fase 7, keempat kantor
// yang ada sudah punya Subscription.

import { prisma } from './db';
import { apiErr } from './utils';
import {
  DEFAULT_MODULE_PRICES,
  LEGACY_TO_MODULAR,
  MODULAR_TO_LEGACY,
  type ModularKey,
  type ModuleAccessLevel,
} from './modular';

export interface SubscriptionModuleRow {
  moduleKey: string;
  pricePerUserSnapshot: number;
  status: string;
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  billingCycle: string;
  userQuota: number;
  startDate: Date | null;
  endDate: Date | null;
  modules: SubscriptionModuleRow[];
}

export async function getSubscription(organizationId: string): Promise<SubscriptionInfo | null> {
  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { modules: true },
  });
  if (!sub) return null;
  return {
    id: sub.id,
    status: sub.status,
    billingCycle: sub.billingCycle,
    userQuota: sub.userQuota,
    startDate: sub.startDate,
    endDate: sub.endDate,
    modules: sub.modules.map((m) => ({
      moduleKey: m.moduleKey,
      pricePerUserSnapshot: m.pricePerUserSnapshot,
      status: m.status,
    })),
  };
}

/**
 * Status efektif: langganan ACTIVE yang sudah melewati endDate dianggap EXPIRED.
 * PENDING_PAYMENT / CANCELLED / SUSPENDED / EXPIRED = tidak aktif.
 */
export function effectiveSubscriptionStatus(sub: SubscriptionInfo | null): string {
  if (!sub) return 'ACTIVE'; // tanpa langganan = grandfathering
  if (sub.status === 'ACTIVE' && sub.endDate && sub.endDate.getTime() <= Date.now()) {
    return 'EXPIRED';
  }
  return sub.status;
}

export function isSubscriptionActive(sub: SubscriptionInfo | null): boolean {
  return effectiveSubscriptionStatus(sub) === 'ACTIVE';
}

/** Modul non-billable (Dashboard, Setting, Administrator Pusat) selalu aktif. */
export function isModuleSubscribed(sub: SubscriptionInfo | null, moduleKey: ModularKey): boolean {
  if (moduleKey === 'dashboard' || moduleKey === 'setting' || moduleKey === 'pusat') return true;
  if (!sub) return true; // grandfathering
  if (sub.modules.length === 0) return true; // belum ada pilihan modul = semua aktif
  return sub.modules.some((m) => m.moduleKey === moduleKey && m.status === 'ACTIVE');
}

/** Daftar modul yang aktif untuk kantor (dipakai Sidebar + form). */
export function activeModulesOf(sub: SubscriptionInfo | null): ModularKey[] {
  const all: ModularKey[] = ['dashboard', 'chat', 'hris', 'audit', 'setting', 'pusat'];
  return all.filter((k) => isModuleSubscribed(sub, k));
}

// ---------------------------------------------------------------------------
// Level akses modul per pengguna
// ---------------------------------------------------------------------------

/** Semua baris UserModuleAccess untuk satu membership (kunci baru + kunci lama). */
export async function getUserModuleLevels(
  userId: string,
  organizationId: string
): Promise<Record<string, ModuleAccessLevel>> {
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId },
    select: { id: true },
  });
  if (!membership) return {};
  const rows = await prisma.userModuleAccess.findMany({
    where: { membershipId: membership.id },
    select: { moduleKey: true, allowed: true, access: true },
  });
  const levels: Record<string, ModuleAccessLevel> = {};
  for (const r of rows) {
    levels[r.moduleKey] = !r.allowed ? 'NONE' : r.access === 'READ' ? 'READ' : 'WRITE';
  }
  return levels;
}

/**
 * Level efektif user untuk satu modul baru.
 * - Baris kunci modul baru (mis. 'chat') berlaku untuk seluruh modul.
 * - Bila tidak ada: baris kunci lama anaknya (mis. 'inbox') dipakai bila
 *   dipanggil dengan legacyKey (pengecekan per halaman/permission).
 * - Tanpa baris apa pun = WRITE (ikut aturan kantor).
 */
export function effectiveModuleLevel(
  levels: Record<string, ModuleAccessLevel>,
  moduleKey: ModularKey,
  legacyKey?: string
): ModuleAccessLevel {
  if (levels[moduleKey]) return levels[moduleKey];
  if (legacyKey && levels[legacyKey]) return levels[legacyKey];
  return 'WRITE';
}

/** Level efektif satu modul dari baris legacy saja (untuk tampilan form). */
export function moduleLevelFromLegacy(
  levels: Record<string, ModuleAccessLevel>,
  moduleKey: ModularKey
): ModuleAccessLevel {
  if (levels[moduleKey]) return levels[moduleKey];
  const children = MODULAR_TO_LEGACY[moduleKey];
  if (children.length === 0) return 'WRITE';
  const childLevels = children.map((c) => levels[c]).filter(Boolean) as ModuleAccessLevel[];
  if (childLevels.length > 0 && childLevels.every((l) => l === 'NONE')) return 'NONE';
  return 'WRITE';
}

/** Apakah ada baris legacy yang memblokir satu kunci lama (untuk Sidebar per halaman). */
export function legacyBlocked(levels: Record<string, ModuleAccessLevel>, legacyKey: string): boolean {
  return levels[legacyKey] === 'NONE';
}

// ---------------------------------------------------------------------------
// Kuota karyawan
// ---------------------------------------------------------------------------

/** Tolak bila jumlah member aktif sudah mencapai kuota langganan. */
export async function checkUserQuota(organizationId: string): Promise<void> {
  const sub = await getSubscription(organizationId);
  if (!sub || sub.userQuota <= 0) return; // tanpa kuota = tanpa batas
  const count = await prisma.membership.count({
    where: { organizationId, status: 'ACTIVE' },
  });
  if (count >= sub.userQuota) {
    throw apiErr(
      `Kuota karyawan tercapai (${count}/${sub.userQuota} pengguna). Perpanjang atau naikkan kuota langganan untuk menambah karyawan.`,
      422
    );
  }
}

export async function countActiveMembers(organizationId: string): Promise<number> {
  return prisma.membership.count({ where: { organizationId, status: 'ACTIVE' } });
}

// ---------------------------------------------------------------------------
// Harga modul & invoice
// ---------------------------------------------------------------------------

export interface ModulePriceRow {
  moduleKey: string;
  monthlyPerUser: number;
  yearlyPerUser: number;
}

/** Harga aktif per modul berbayar (tabel ModulePrice; fallback harga default). */
export async function getModulePrices(): Promise<ModulePriceRow[]> {
  const rows = await prisma.modulePrice.findMany({
    where: { isActive: true },
    select: { moduleKey: true, monthlyPerUser: true, yearlyPerUser: true },
  });
  const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
  return ['chat', 'hris', 'audit'].map((key) => {
    const r = byKey.get(key);
    if (r) return { moduleKey: key, monthlyPerUser: r.monthlyPerUser, yearlyPerUser: r.yearlyPerUser };
    const d = DEFAULT_MODULE_PRICES[key];
    return { moduleKey: key, monthlyPerUser: d.monthlyPerUser, yearlyPerUser: d.yearlyPerUser };
  });
}

/** Nomor invoice berikutnya: INV/YYYY/MM/NNN (NNN berurutan per bulan). */
export async function nextInvoiceNumber(
  tx: { invoice: { count: (args: any) => Promise<number> } },
  now = new Date()
): Promise<string> {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INV/${y}/${m}/`;
  const count = await tx.invoice.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

/**
 * Sinkronkan Organization.modules (kunci lama, dipakai jalur lama) dari
 * SubscriptionModule yang aktif. Dipanggil saat invoice ditandai lunas.
 */
export async function syncOrgModulesFromSubscription(
  tx: {
    subscriptionModule: { findMany: (args: any) => Promise<Array<{ moduleKey: string }>> };
    organization: { update: (args: any) => Promise<unknown> };
  },
  organizationId: string,
  subscriptionId: string
): Promise<void> {
  const active = await tx.subscriptionModule.findMany({
    where: { subscriptionId, status: 'ACTIVE' },
    select: { moduleKey: true },
  });
  const legacyKeys = active.flatMap((m) => MODULAR_TO_LEGACY[m.moduleKey as ModularKey] ?? []);
  // Modul lama kosong = semua aktif (grandfathering); bila langganan hanya
  // mengambil sebagian modul, tulis kunci lamanya agar jalur lama konsisten.
  await tx.organization.update({
    where: { id: organizationId },
    data: { modules: JSON.stringify(legacyKeys) },
  });
}

/** Modul berbayar apa saja yang diambil kantor ini (untuk tampilan). */
export function subscribedBillableModules(sub: SubscriptionInfo | null): string[] {
  if (!sub) return ['chat', 'hris', 'audit'];
  if (sub.modules.length === 0) return ['chat', 'hris', 'audit'];
  return sub.modules.filter((m) => m.status === 'ACTIVE').map((m) => m.moduleKey);
}

export { LEGACY_TO_MODULAR };
