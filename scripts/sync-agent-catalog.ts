// Skrip sekali jalan: sinkronkan katalog template agent dari repo
// agency-agents ke master DB (memakai importer yang sama dengan API sync).
//   npx tsx scripts/sync-agent-catalog.ts
// Dipakai verifikasi Fase 4a (API sync baru aktif setelah parent build/deploy).
import { syncAgentCatalog } from '../lib/kantor/catalog-importer';

async function main(): Promise<void> {
  console.log('Sync katalog agency-agents -> woork_master ...');
  const result = await syncAgentCatalog();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('SYNC GAGAL:', e?.message ?? e);
  process.exit(1);
});
