/**
 * Cron: sinkronisasi Work Calendar dari semua modul sumber.
 *
 * Jalankan:  npx tsx scripts/calendar-sync.ts [organizationId]
 * Tanpa argumen: sync SEMUA organisasi aktif.
 * Dengan argumen: sync satu organisasi saja.
 *
 * Butuh DATABASE_URL + env Prisma (lihat README cron). DATABASE_URL dibaca
 * dari .env bila belum ada di environment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../lib/db';
import { syncAllSources } from '../lib/calendar/sync';
import { listActiveTenants, listMigratedLegacyOrgIds, withTenant } from './tenant-cron';

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const envPath = join(process.cwd(), '.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) {
        process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
        return;
      }
    }
  } catch {
    // .env tidak ada — Prisma akan error dengan pesan yang jelas.
  }
}

async function main(): Promise<void> {
  loadEnv();
  const orgArg = process.argv[2];
  const allOrgs = orgArg
    ? [{ id: orgArg }]
    : await prisma.organization.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
  // Phase 6: org yang sudah bermigrasi di-sync pass tenant di bawah —
  // lewati di pass legacy agar data beku legacy tidak menulis
  // CalendarEvent ke legacy (duplikat saat rollback).
  const migrated = await listMigratedLegacyOrgIds();
  const orgs = allOrgs.filter((o) => !migrated.has(o.id));
  if (orgs.length !== allOrgs.length) {
    console.log(`[calendar-sync] lewati ${allOrgs.length - orgs.length} org bermigrasi di pass legacy`);
  }
  let total = { created: 0, updated: 0, cancelled: 0, deleted: 0, failed: 0, skipped: 0 };
  for (const org of orgs) {
    try {
      const s = await syncAllSources(org.id);
      total = {
        created: total.created + s.created,
        updated: total.updated + s.updated,
        cancelled: total.cancelled + s.cancelled,
        deleted: total.deleted + s.deleted,
        failed: total.failed + s.failed,
        skipped: total.skipped + s.skipped,
      };
      console.log(
        `[calendar-sync] org=${org.id} created=${s.created} updated=${s.updated} cancelled=${s.cancelled} deleted=${s.deleted} failed=${s.failed} skipped=${s.skipped}`
      );
    } catch (e) {
      console.error(`[calendar-sync] org=${org.id} GAGAL:`, (e as Error).message);
      total.failed += 1;
    }
  }

  // Pass tenant (P1-4 Phase 4): hanya bila tanpa argumen org (mode cron).
  // Argumen org tunggal tetap legacy-only (alat operator manual).
  // syncAllSources tidak butuh baris setting — DB tenant kosong hanya
  // menghasilkan angka 0, jadi tidak ada guard pengaturan di sini.
  if (!orgArg) {
    const tenants = await listActiveTenants().catch((e: unknown) => {
      console.error(`[calendar-sync] gagal membaca daftar tenant:`, (e as Error).message);
      return [];
    });
    for (const tenant of tenants) {
      try {
        const s = await withTenant(tenant, () => syncAllSources(tenant.id));
        total = {
          created: total.created + s.created,
          updated: total.updated + s.updated,
          cancelled: total.cancelled + s.cancelled,
          deleted: total.deleted + s.deleted,
          failed: total.failed + s.failed,
          skipped: total.skipped + s.skipped,
        };
        console.log(
          `[calendar-sync] tenant=${tenant.tenantCode} created=${s.created} updated=${s.updated} cancelled=${s.cancelled} deleted=${s.deleted} failed=${s.failed} skipped=${s.skipped}`
        );
      } catch (e) {
        console.error(`[calendar-sync] tenant=${tenant.tenantCode} GAGAL:`, (e as Error).message);
        total.failed += 1;
      }
    }
  }
  console.log(
    `[calendar-sync] TOTAL created=${total.created} updated=${total.updated} cancelled=${total.cancelled} deleted=${total.deleted} failed=${total.failed} skipped=${total.skipped}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
