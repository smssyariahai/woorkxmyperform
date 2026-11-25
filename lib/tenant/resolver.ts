// Lapisan F — Resolver tenant (AsyncLocalStorage + per-tenant Prisma client).
//
// Pola:
// - `runWithTenant(code, fn)` / `enterTenantContext(code)` menandai eksekusi
//   saat ini sebagai milik satu tenant; `lib/db.ts` (proxy `prisma`) membaca
//   penanda ini untuk merutekan query ke client tenant yang benar.
// - `getTenantClientForCode(code)` me-resolve tenant dari MASTER (Tenant +
//   TenantDatabaseRegistry), mendekripsi password DB role, lalu memakai
//   `getTenantClient` (cache per code di lib/tenant/tenant-db.ts).
//   Hasil resolve (client + info tenant) di-cache di level modul ini agar
//   `requireAuth` tidak query master di tiap panggilan.
//
// KEAMANAN: password / connection string / secret TIDAK PERNAH di-log.
// Pesan error hanya membawa kode tenant (bukan kredensial).
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { masterPrisma } from './master';
import { decryptSecret } from './crypto';
import {
  disconnectTenantClient,
  getTenantClient,
  onTenantClientEvicted,
  tenantConnectionString,
} from './tenant-db';
import { validateTenantCode } from './tenant-code';

const als = new AsyncLocalStorage<{ tenantCode: string }>();

/** Jalankan `fn` di dalam context tenant `code` (async-safe). */
export function runWithTenant<T>(code: string, fn: () => T): T {
  return als.run({ tenantCode: code }, fn);
}

/** Kode tenant dari context saat ini, atau `undefined` bila tidak ada. */
export function getCurrentTenantCode(): string | undefined {
  return als.getStore()?.tenantCode;
}

/**
 * Masuk ke context tenant untuk sisa eksekusi DALAM frame async yang
 * memanggil ini. PERHATIAN (hasil uji Node 24, Lapisan F): `enterWith`
 * yang dipanggil di dalam fungsi async yang di-`await` TIDAK menembus
 * batas await ke pemanggil — context hanya berlaku untuk kode yang
 * berjalan di frame yang sama (dan turunannya). Karena itu route handler /
 * layout HARUS memanggil ini sendiri di frame-nya setelah `requireAuth`
 * (lihat `app/(dashboard)/layout.tsx`); `enterWith` di `requireAuth`
 * hanya menjangkau kode yang berjalan di dalam `requireAuth` sendiri.
 */
export function enterTenantContext(code: string): void {
  als.enterWith({ tenantCode: code });
}

export interface TenantInfo {
  tenantId: string;
  tenantCode: string;
  tenantStatus: string;
}

// Cache hasil resolve per kode tenant: client + info (status) dari master.
const resolvedClients = new Map<string, { client: TenantPrismaClient; url: string }>();
const tenantInfoCache = new Map<string, TenantInfo>();
const inflightResolutions = new Map<string, Promise<TenantPrismaClient>>();

// Eviksi idle (P2-5): bila tenant-db memutuskan satu client (idle >30
// menit), hapus juga entri cache di sini — kalau tidak, proxy tetap
// memegang client yang sudah di-disconnect.
onTenantClientEvicted((code) => {
  resolvedClients.delete(code);
  tenantInfoCache.delete(code);
  inflightResolutions.delete(code);
});

/** Client tenant yang sudah ter-resolve untuk `code` (sync, tanpa I/O). */
export function getCachedTenantClient(code: string): TenantPrismaClient | undefined {
  return resolvedClients.get(code)?.client;
}

/** Info tenant (id + status master) yang sudah ter-resolve (sync, tanpa I/O). */
export function getCachedTenantInfo(code: string): TenantInfo | undefined {
  return tenantInfoCache.get(code);
}

/**
 * Resolve (atau ambil dari cache) Prisma client untuk satu tenant.
 * Urutan: Tenant by tenantCode (master) → TenantDatabaseRegistry by
 * tenantId → `decryptSecret(secretReference)` → `tenantConnectionString`
 * → `getTenantClient(url)`. Resolusi bersamaan untuk kode yang sama
 * digabung ke satu promise. Gagal bila tenant / registry tidak ada,
 * kode tidak valid, atau secret tidak bisa didekripsi.
 */
export async function getTenantClientForCode(code: string): Promise<TenantPrismaClient> {
  if (!validateTenantCode(code)) {
    throw new Error(`Kode tenant tidak valid: ${code}`);
  }
  const cached = resolvedClients.get(code);
  if (cached) return cached.client;
  const pending = inflightResolutions.get(code);
  if (pending) return pending;

  const resolution = (async (): Promise<TenantPrismaClient> => {
    const tenant = await masterPrisma.tenant.findUnique({
      where: { tenantCode: code },
      select: { id: true, tenantCode: true, tenantStatus: true },
    });
    if (!tenant) {
      throw new Error(`Tenant tidak ditemukan untuk kode ${code}`);
    }
    const registry = await masterPrisma.tenantDatabaseRegistry.findUnique({
      where: { tenantId: tenant.id },
    });
    if (!registry) {
      throw new Error(`Registry database tidak ditemukan untuk tenant ${code}`);
    }
    // Password hanya hidup di memori selama membangun connection string.
    const password = decryptSecret(registry.secretReference);
    const url = tenantConnectionString(code, password);
    const client = getTenantClient(url);
    resolvedClients.set(code, { client, url });
    tenantInfoCache.set(code, {
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      tenantStatus: tenant.tenantStatus,
    });
    return client;
  })();

  inflightResolutions.set(code, resolution);
  try {
    return await resolution;
  } finally {
    inflightResolutions.delete(code);
  }
}

/**
 * Hapus client tenant dari cache + disconnect (keperluan maintenance,
 * mis. setelah status tenant berubah atau rotasi kredensial — resolve
 * berikutnya membaca ulang master + membuat client baru).
 */
export async function invalidateTenantClient(code: string): Promise<void> {
  resolvedClients.delete(code);
  tenantInfoCache.delete(code);
  inflightResolutions.delete(code);
  await disconnectTenantClient(code);
}
