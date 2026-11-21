/**
 * Uji konfigurasi detail agent (Wave 12) secara end-to-end di jalur yang
 * sama dengan eksekusi tugas nyata, TANPA membuat tugas di UI:
 *   planWithAI (pilih tool) -> tool.run (data nyata DB) -> composeReportWithAI
 * Jalankan: npx tsx scripts/test-agent-config.ts
 * (butuh DATABASE_URL + env Prisma seperti biasa; 9Router dibaca dari DB)
 */
import { AGENT_DEFINITIONS } from '../lib/agents/registry';
import { TOOLS } from '../lib/agents/tools';
import { planWithAI, composeReportWithAI } from '../lib/agents/ai';

const ORG = 'cmuxmwvzl0000td0t7x9v10va';

async function testAgent(name: string, command: string, monthLabel?: string) {
  const def = AGENT_DEFINITIONS.find((d) => d.name === name);
  if (!def) throw new Error(`Agent ${name} tidak ada di registry`);
  const profile = {
    name: def.name,
    role: def.role,
    systemInstructions: def.systemInstructions,
    tools: def.tools,
    organizationId: ORG,
  };
  const toolInfos = def.tools.map((k) => {
    const t = TOOLS[k];
    return { key: t.key, name: t.name, description: t.description };
  });
  console.log(`\n===== ${name} (${def.role}) | "${command}" =====`);
  console.log(`instruksi: ${def.systemInstructions.length} karakter`);
  const plan = await planWithAI(command, profile, toolInfos);
  console.log('PLAN:', JSON.stringify(plan));
  let toolKey: string | null = plan?.toolKey ?? null;
  let args: Record<string, any> = plan?.toolArgs ?? {};
  if (!toolKey) {
    toolKey = name === 'Dian' ? 'rekap_keuangan' : 'laporan_kinerja';
    args = name === 'Dian' ? { year: 2026, month: 9 } : {};
    console.log(`(plan null -> fallback tool ${toolKey})`);
  }
  const tool = TOOLS[toolKey];
  const out = await tool.run(
    { organizationId: ORG, agentId: 'test', agentName: name, taskId: 'test' },
    args
  );
  console.log(`TOOL ${toolKey}: ${out.summary}`);
  const report = await composeReportWithAI(
    profile,
    command,
    toolKey,
    out,
    { monthLabel, organizationId: ORG }
  );
  console.log(`\n--- LAPORAN ${name} ---\n${report ?? '(AI gagal — fallback ringkasan tool)'}\n`);
}

async function main() {
  await testAgent('Dian', 'buatkan rekap keuangan bulan September 2026', 'September 2026');
  await testAgent('Bima', 'buatkan laporan kinerja hari ini');
  console.log('SELESAI');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
