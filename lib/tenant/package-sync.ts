// Sinkronisasi paket (Bab 9) -> baris SubscriptionModule di DB tenant
// (Fase 7, Bab 8 G1).
//
// Penegakan paket dibaca dari DB tenant oleh isModuleSubscribed
// (lib/subscription.ts): modul berbayar Bab 9 AKTIF hanya bila barisnya
// ACTIVE. Baris ditulis di sini dari master Subscription.moduleKeys:
//   - moduleKeys kosong (tenant lama / grandfathered) -> kelima modul ACTIVE.
//   - moduleKeys berisi -> ACTIVE bila termasuk, INACTIVE bila tidak.
//   - opts.moduleKeys (pilihan EKSPLISIT dari approve/change-package)
//     -> tanpa grandfathering: kosong berarti TIDAK ADA modul aktif.
// Baris chat/hris/audit (modul lama berper-user) TIDAK disentuh.
//
// Dipanggil dari approveRegistration (Fase 3) + changePackage (Fase 4)
// dan skrip one-time scripts/sync-package-modules.ts. Kegagalan di sini
// TIDAK BOLEH menggagalkan approve/change-package (pemanggil menangkap
// dan hanya mencatat peringatan) — sinkronisasi bisa diulang via skrip.
// Sejak 2026-11-25 penegakan bersifat fail-closed (tanpa baris = tidak
// aktif), jadi kegagalan sync hanya menyembunyikan modul, bukan
// membuka semuanya.
import { PAID_MODULE_KEYS } from '@/lib/modular';
import { masterPrisma } from './master';
import { getTenantClientForCode, invalidateTenantClient } from './resolver';

export interface PackageSyncResult {
  tenantId: string;
  tenantCode: string;
  synced: Record<string, 'ACTIVE' | 'INACTIVE'>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function syncPackageModulesToTenant(
  tenantId: string,
  opts?: { waitForProvisioningMs?: number; moduleKeys?: string[] }
): Promise<PackageSyncResult> {
  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, tenantCode: true },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} tidak ditemukan di master.`);
  const subscription = await masterPrisma.subscription.findUnique({
    where: { tenantId },
    select: { moduleKeys: true },
  });
  if (!subscription) {
    throw new Error(`Subscription tenant ${tenant.tenantCode} tidak ditemukan di master.`);
  }
  // Pilihan eksplisit (approve / change-package / Jalur A): tanpa
  // grandfathering — kosong berarti tidak ada modul berbayar yang aktif.
  // Tanpa opts.moduleKeys (skrip one-time untuk tenant lama): moduleKeys
  // kosong di master berarti grandfathered -> semua ACTIVE.
  const explicit = opts?.moduleKeys !== undefined;
  const moduleKeys = opts?.moduleKeys ?? subscription.moduleKeys ?? [];
  const desired = new Map<string, 'ACTIVE' | 'INACTIVE'>();
  for (const key of PAID_MODULE_KEYS) {
    const active = explicit
      ? moduleKeys.includes(key)
      : moduleKeys.length === 0 || moduleKeys.includes(key);
    desired.set(key, active ? 'ACTIVE' : 'INACTIVE');
  }

  // Saat dipanggil dari approveRegistration, provisioning DB tenant bisa
  // saja belum selesai — tunggu sampai baris Subscription ADA sebelum
  // menyerah.
  const waitMs = opts?.waitForProvisioningMs ?? 30000;
  const deadline = Date.now() + waitMs;
  let lastError: unknown = null;
  let client: Awaited<ReturnType<typeof getTenantClientForCode>> | null = null;
  for (;;) {
    try {
      client = await getTenantClientForCode(tenant.tenantCode);
      // Bukti DB benar-benar bisa dipakai (bukan sekadar client terbentuk):
      // baris Subscription harus ADA — findFirst yang mengembalikan null
      // (query sukses, seed belum jalan) BUKAN tanda siap. Bug ini membuat
      // sync gagal "Subscription tidak ditemukan" untuk tenant yang
      // provisioning-nya lambat (terbukti E2E 2026-11-25: B2 + Jalur A).
      const probe = await client.subscription.findFirst({ select: { id: true } });
      if (probe) break;
      lastError = new Error('Subscription tenant belum ter-seed di DB tenant.');
    } catch (e) {
      lastError = e;
    }
    if (Date.now() >= deadline) {
      // Jangan biarkan cache status PENDING menempel: resolve berikutnya
      // harus membaca ulang master (provisioning bisa saja sudah DONE).
      try {
        await invalidateTenantClient(tenant.tenantCode);
      } catch {}
      throw new Error(
        `Sinkronisasi modul paket gagal untuk ${tenant.tenantCode}: DB tenant belum siap — ${
          (lastError as Error)?.message ?? lastError
        }`
      );
    }
    await sleep(2000);
  }

  let tenantSub: { id: string } | null = null;
  const synced: Record<string, 'ACTIVE' | 'INACTIVE'> = {};
  try {
    tenantSub = await client!.subscription.findFirst({
      select: { id: true },
    });
    if (!tenantSub) {
      throw new Error(
        `Sinkronisasi modul paket gagal untuk ${tenant.tenantCode}: Subscription tenant tidak ditemukan di DB tenant.`
      );
    }
    for (const [moduleKey, status] of desired) {
      await client!.subscriptionModule.upsert({
        where: {
          subscriptionId_moduleKey: { subscriptionId: tenantSub.id, moduleKey },
        },
        update: { status },
        create: {
          subscriptionId: tenantSub.id,
          moduleKey,
          pricePerUserSnapshot: 0,
          status,
        },
      });
      synced[moduleKey] = status;
    }
  } catch (e) {
    // Gagal di tengah jalan (mis. DB di-restore saat sync): buang cache
    // status PENDING agar resolve berikutnya membaca ulang master.
    try {
      await invalidateTenantClient(tenant.tenantCode);
    } catch {}
    throw e;
  }
  // Cache status bisa saja tercatat PENDING: saat dipanggil dari
  // approveRegistration, getTenantClientForCode di loop retry di atas
  // berjalan selagi provisioning masih jalan (tenant masih PENDING di
  // master) dan resolver meng-cache status itu. Tanpa invalidasi di sini,
  // requireAuthTenant terus membaca PENDING dan OWNER tenant baru selalu
  // 403 "belum aktif" sampai server restart (ditemukan uji E2E Fase 8,
  // 2026-11-24). Buang cache agar resolve berikutnya membaca ulang status
  // ACTIVE dari master. Gagal invalidasi tidak boleh menggagalkan sync
  // yang sudah berhasil.
  try {
    await invalidateTenantClient(tenant.tenantCode);
  } catch (e) {
    console.error('[package-sync] invalidasi cache tenant gagal:', e);
  }
  return { tenantId: tenant.id, tenantCode: tenant.tenantCode, synced };
}
