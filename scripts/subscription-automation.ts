/**
 * Cron: otomasi langganan §7.7 (Fase 5) — tiap 1 jam.
 *
 * Jalankan:  npx tsx scripts/subscription-automation.ts [--dry-run] [--tenant <tenantId>]
 * Tanpa argumen: cek SEMUA tenant yang punya Subscription.
 * --dry-run: hitung rencana tanpa menulis apa pun.
 * --tenant <id>: hanya satu tenant.
 *
 * Butuh MASTER_DATABASE_URL + env Prisma (DATABASE_URL dibaca script dari
 * .env bila belum ada di environment — lewat loadTenantEnv di lib).
 *
 * Idempotent (cek log + status sebelum bertindak; dua run bersamaan tidak
 * membuat ganda). Gagal satu tenant tidak menghentikan yang lain.
 *
 * Exit 0 bila selesai (walau ada error per tenant — error per tenant
 * dicetak ke stderr + masuk ringkasan); exit 1 hanya bila gagal total
 * (DB tidak terjangkau / argumen salah).
 */
import {
  runAutomationAll,
  runAutomationForTenant,
} from '../lib/tenant/subscription-automation';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tenantIdx = args.indexOf('--tenant');
  const tenantId =
    tenantIdx >= 0 ? args[tenantIdx + 1] : undefined;
  if (tenantIdx >= 0 && !tenantId) {
    throw new Error('--tenant butuh nilai tenantId.');
  }

  if (tenantId) {
    const res = await runAutomationForTenant(tenantId, { dryRun });
    console.log(JSON.stringify(res));
    for (const a of res.actions) {
      console.log(`[automation] ${res.tenantCode || tenantId} ${a}`);
    }
    if (res.skipped) {
      console.log(
        `[automation] ${res.tenantCode || tenantId} dilewati: ${res.skipped}`,
      );
    }
    return;
  }

  const summary = await runAutomationAll({ dryRun });
  console.log(JSON.stringify(summary));
  for (const a of summary.actions) {
    console.log(`[automation] ${a}`);
  }
  for (const e of summary.errors) {
    console.error(`[automation] tenant ${e.tenantId}: gagal — ${e.message}`);
  }
  if (summary.disabled) {
    console.log(
      '[automation] otomasi dimatikan (automationEnabled=false) — tidak ada aksi.',
    );
  }
  console.log(
    `[automation] selesai: ${summary.checked} tenant dicek, ${summary.actions.length} aksi, ${summary.errors.length} error.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[automation] fatal:', (e as Error).message);
    process.exit(1);
  });
