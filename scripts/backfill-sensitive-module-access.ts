/**
 * Backfill akses modul sensitif (Fase 7, Bab 8 G2).
 *
 * Sejak Fase 7, modul sensitif (koperasi, setting, pusat) default-nya NONE
 * bila pengguna tidak punya baris UserModuleAccess eksplisit. Tanpa
 * backfill ini, SEMUA pengguna existing akan terkunci dari Koperasi +
 * Setting dalam semalam. Skrip ini menulis baris WRITE eksplisit untuk
 * pengguna yang HAKNYA SUDAH DIBERIKAN lewat role-nya:
 *   - Untuk tiap kunci sensitif: bila role memberi >=1 permission yang
 *     modulnya kunci itu (via PERMISSION_MODULE_LEVEL) -> baris WRITE.
 *   - Role OWNER -> WRITE 'setting' (modul inti perusahaan, Bab 9) walau
 *     tanpa permission yang terpetakan.
 *   - 'koperasi' HANYA via permission (tidak ada permission katalog yang
 *     terpetakan ke koperasi) — jadi TIDAK ADA yang mendapat koperasi
 *     otomatis, bahkan OWNER. Admin harus mengaktifkan eksplisit lewat
 *     Manajemen Pengguna (keputusan desain FASE7 §3.2 butir 4).
 *   - Baris yang SUDAH ADA (termasuk NONE eksplisit dari admin) TIDAK
 *     pernah ditimpa — backfill hanya mengisi yang kosong.
 *
 * Jalankan:  npx tsx scripts/backfill-sensitive-module-access.ts [--dry-run] [--tenant <tenantId>]
 * --dry-run: cetak rencana per tenant, tanpa menulis apa pun. WAJIB
 * dijalankan dulu dan dilaporkan sebelum menulis.
 * Idempotent (skip bila baris sudah ada). JANGAN auto-run saat deploy.
 */
import { masterPrisma } from '../lib/tenant/master';
import { PERMISSION_MODULE_LEVEL, SENSITIVE_MODULES_DEFAULT_NONE } from '../lib/modular';
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { disconnectTenantClient } from '../lib/tenant/tenant-db';

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

  let totalPlanned = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  for (const t of tenants) {
    const client = await getTenantClientForCode(t.tenantCode);
    try {
      const memberships = await client.membership.findMany({
        where: { status: 'ACTIVE' },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          moduleAccess: { select: { moduleKey: true } },
        },
      });
      let planned = 0;
      let written = 0;
      let skipped = 0;
      const perModule: Record<string, number> = {};
      for (const m of memberships) {
        const permKeys = (m.role?.permissions ?? []).map((rp) => rp.permission.key);
        // '*' hanya dimiliki super admin (bukan membership tenant) — abaikan.
        const modulesFromRole = new Set<string>();
        for (const key of permKeys) {
          const entry = PERMISSION_MODULE_LEVEL.get(key);
          if (entry && SENSITIVE_MODULES_DEFAULT_NONE.has(entry.module)) {
            modulesFromRole.add(entry.module);
          }
        }
        if (m.role?.name === 'OWNER') modulesFromRole.add('setting');
        const existing = new Set(m.moduleAccess.map((r) => r.moduleKey));
        for (const mod of modulesFromRole) {
          if (existing.has(mod)) {
            skipped += 1;
            continue;
          }
          planned += 1;
          perModule[mod] = (perModule[mod] ?? 0) + 1;
          if (!dryRun) {
            await client.userModuleAccess.upsert({
              where: {
                membershipId_moduleKey: { membershipId: m.id, moduleKey: mod },
              },
              update: {},
              create: { membershipId: m.id, moduleKey: mod, allowed: true, access: 'WRITE' },
            });
            written += 1;
          }
        }
      }
      totalPlanned += planned;
      totalWritten += written;
      totalSkipped += skipped;
      console.log(
        `[backfill-sensitive] ${t.tenantCode} (${t.companyName}): ${memberships.length} membership aktif — ` +
          `rencana ${planned} baris WRITE baru (${Object.entries(perModule)
            .map(([k, v]) => `${k}:${v}`)
            .join(' ') || 'tidak ada'}), ${skipped} sudah ada (dilewati)${dryRun ? ' [DRY-RUN]' : `, ${written} ditulis`}.`
      );
    } finally {
      await disconnectTenantClient(t.tenantCode).catch(() => undefined);
    }
  }
  console.log(
    `[backfill-sensitive] selesai: ${tenants.length} tenant — total rencana ${totalPlanned} baris, ${totalSkipped} dilewati (sudah ada)${dryRun ? ' [DRY-RUN, tidak ada yang ditulis]' : `, ${totalWritten} ditulis`}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[backfill-sensitive] fatal:', (e as Error).message);
    process.exit(1);
  });
