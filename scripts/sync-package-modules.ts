/**
 * Sinkronisasi paket -> baris SubscriptionModule tenant (Fase 7, Bab 8 G1).
 *
 * Jalankan:  npx tsx scripts/sync-package-modules.ts [--dry-run] [--tenant <tenantId>]
 * Tanpa argumen: semua tenant ACTIVE yang punya Subscription.
 * --dry-run: hitung status yang diinginkan dari master, tanpa menulis.
 * --tenant <id>: hanya satu tenant (id master Tenant).
 *
 * Idempotent (upsert per kunci). Tidak mengubah baris chat/hris/audit.
 * JANGAN auto-run saat deploy — jalankan manual sekali setelah deploy
 * Fase 7, lalu laporkan ringkasannya.
 */
import { masterPrisma } from '../lib/tenant/master';
import { PAID_MODULE_KEYS } from '../lib/modular';
import { syncPackageModulesToTenant } from '../lib/tenant/package-sync';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tenantIdx = args.indexOf('--tenant');
  const tenantId = tenantIdx >= 0 ? args[tenantIdx + 1] : undefined;
  if (tenantIdx >= 0 && !tenantId) {
    throw new Error('--tenant butuh nilai tenantId.');
  }

  const tenants = await masterPrisma.tenant.findMany({
    where: {
      tenantStatus: 'ACTIVE',
      ...(tenantId ? { id: tenantId } : {}),
    },
    select: { id: true, tenantCode: true, companyName: true },
    orderBy: { companyName: 'asc' },
  });
  if (tenants.length === 0) {
    throw new Error(tenantId ? `Tenant ${tenantId} tidak ditemukan / tidak ACTIVE.` : 'Tidak ada tenant ACTIVE.');
  }

  let written = 0;
  let failed = 0;
  for (const t of tenants) {
    try {
      if (dryRun) {
        const sub = await masterPrisma.subscription.findUnique({
          where: { tenantId: t.id },
          select: { moduleKeys: true },
        });
        const keys = sub?.moduleKeys ?? [];
        const desired = PAID_MODULE_KEYS.map(
          (k) => `${k}=${keys.length === 0 || keys.includes(k) ? 'ACTIVE' : 'INACTIVE'}`
        ).join(' ');
        console.log(
          `[sync-package-modules] [DRY-RUN] ${t.tenantCode} (${t.companyName}) moduleKeys=[${keys.join(',') || 'kosong→grandfathered'}] ${desired}`
        );
        continue;
      }
      const res = await syncPackageModulesToTenant(t.id);
      written += 1;
      console.log(
        `[sync-package-modules] ${res.tenantCode} (${t.companyName}): ${Object.entries(res.synced)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')}`
      );
    } catch (e) {
      failed += 1;
      console.error(
        `[sync-package-modules] ${t.tenantCode} GAGAL: ${(e as Error)?.message ?? e}`
      );
    }
  }
  console.log(
    `[sync-package-modules] selesai: ${tenants.length} tenant, ${written} disinkronkan, ${failed} gagal${dryRun ? ' (DRY-RUN, tidak ada yang ditulis)' : ''}.`
  );
  if (failed > 0) throw new Error(`${failed} tenant gagal disinkronkan.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[sync-package-modules] fatal:', (e as Error).message);
    process.exit(1);
  });
