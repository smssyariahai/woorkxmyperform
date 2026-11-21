/** Propagasi konfigurasi agent dari registry ke DB (upsert idempotent). */
import { ensureAgents } from '../lib/agents/scheduler';

async function main() {
  await ensureAgents('cmuxmwvzl0000td0t7x9v10va');
  console.log('ensureAgents selesai');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
