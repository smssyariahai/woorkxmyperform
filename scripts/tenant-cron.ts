/**
 * Helper bersama untuk cron scheduler multi-tenant (P1-4 Phase 4).
 *
 * Keempat skrip scheduler (salat, briefing, pengingat kalender,
 * sinkronisasi kalender) berjalan sebagai proses tsx di luar request
 * HTTP — tidak ada header `x-tenant-code` dari middleware — jadi konteks
 * tenant HANYA bisa dibawa lewat ALS `runWithTenant`.
 *
 * Urutan yang benar per tenant (lihat lib/db.ts — proxy `prisma`
 * fail-closed): resolve client dulu via `getTenantClientForCode`
 * (mengisi cache resolver; throw bila tenant/registry/secret bermasalah),
 * BARU bungkus kerja dalam `runWithTenant(code, ...)`. Membalik urutan
 * membuat semua query throw "tenant client belum di-resolve".
 *
 * Dipakai HANYA oleh scripts/* (cron). Bukan untuk route HTTP.
 */
import { masterPrisma } from '../lib/tenant/master';
import { getTenantClientForCode, runWithTenant } from '../lib/tenant/resolver';

export interface ActiveTenant {
  id: string;
  tenantCode: string;
  companyName: string;
}

/**
 * Daftar tenant ACTIVE dari master. Hanya id/kode/nama — JANGAN baca
 * registry/secret di sini (tidak dibutuhkan scheduler, dan secret tidak
 * boleh keluar dari resolver).
 */
export async function listActiveTenants(): Promise<ActiveTenant[]> {
  return masterPrisma.tenant.findMany({
    where: { tenantStatus: 'ACTIVE' },
    select: { id: true, tenantCode: true, companyName: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Daftar id Organization legacy yang SUDAH bermigrasi ke tenant
 * (Tenant.legacyOrganizationId di master). Dipakai pass legacy 4 skrip
 * cron agar org bermigrasi tidak diproses ganda (legacy + tenant).
 * Fail-open: bila master tidak bisa dibaca (mis. migrasi
 * `legacyOrganizationId` belum di-apply), kembalikan himpunan kosong +
 * log — perilaku lama (tanpa skip) dipertahankan, cron tidak gagal.
 */
export async function listMigratedLegacyOrgIds(): Promise<Set<string>> {
  try {
    const rows = await masterPrisma.tenant.findMany({
      where: { legacyOrganizationId: { not: null } },
      select: { legacyOrganizationId: true },
    });
    return new Set(rows.map((r) => r.legacyOrganizationId as string));
  } catch (e: unknown) {
    console.error(
      `[tenant-cron] tidak bisa membaca daftar org bermigrasi (skip nonaktif): ${(e as Error).message}`,
    );
    return new Set();
  }
}

/**
 * Jalankan `fn` untuk satu tenant dengan konteks ALS-nya. `organizationId`
 * yang dipakai di dalam `fn` harus `tenant.id` (id mirror org di tenant
 * DB — sama seperti yang dipakai requireAuth).
 * Error apa pun dilempar ke pemanggil: skrip HARUS menangkap per tenant
 * (try/catch) agar satu tenant gagal tidak menghentikan tenant lain.
 */
export async function withTenant<T>(tenant: ActiveTenant, fn: () => Promise<T>): Promise<T> {
  await getTenantClientForCode(tenant.tenantCode);
  return runWithTenant(tenant.tenantCode, fn);
}
