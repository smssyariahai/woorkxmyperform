// Verifikasi Fase 8 (3.0) — isolasi tenant untuk fitur 3.0
// (agent + department + workstation).
//
// Isolasi dijamin pemisahan database per tenant: client tenant A hanya
// terhubung ke DB tenant A, jadi ID dari tenant lain tidak ditemukan
// (findUnique -> null). Skrip ini membuktikannya dengan data nyata,
// read-only (tidak membuat/mengubah/menghapus apa pun):
//  - WOORK.ID: 16 agent + 16 department; SINERGI: agent + department
//    sendiri (5 department); KAYU/OMEGA: 0 department.
//  - departmentId WOORK.ID tidak ditemukan dari client SINERGI, dan
//    sebaliknya; agentId WOORK.ID tidak ditemukan dari client SINERGI,
//    dan sebaliknya; tidak ada ID yang sama di dua tenant.
//  - semua department WOORK.ID ber-organizationId WOORK.ID.
// Isolasi Residence (27/27) sudah tercakup scripts/verify-fase8-isolation.ts;
// isolasi HTTP lintas tenant (9/9) + stress (7/7) sudah terbukti di
// program multi-tenant Fase 8 (laporan PHASE8_ISOLATION_2026-11-23.md /
// PHASE8_STRESS_2026-11-23.md); uji katalog install lintas tenant
// (departmentId SINERGI sebagai admin WOORK.ID -> 404) sudah terbukti
// 2026-11-23 ~18:22.
//
// Dijalankan:
//   eval $(grep -E '^(MASTER_)?DATABASE_URL=' .env | sed 's/^/export /') \
//     && npx tsx scripts/verify-fase8-3iso.ts
import { getTenantClientForCode } from '../lib/tenant/resolver';

const WOORK_CODE = 'woork_t_7862d085';
const WOORK_ORG = 'cmwsycgq40000ftucekyc2us8';
const KAYU_CODE = 'woork_t_a4c39018';
const OMEGA_CODE = 'woork_t_af9d7975';
const SINERGI_CODE = 'woork_t_a91ff448';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const woork = await getTenantClientForCode(WOORK_CODE);
  const kayu = await getTenantClientForCode(KAYU_CODE);
  const omega = await getTenantClientForCode(OMEGA_CODE);
  const sinergi = await getTenantClientForCode(SINERGI_CODE);

  const woorkAgents = await woork.agent.findMany({ select: { id: true, name: true, departmentId: true } });
  const woorkDepts = await woork.department.findMany({ select: { id: true, name: true, organizationId: true, floor: true } });
  const sinergiAgents = await sinergi.agent.findMany({ select: { id: true, name: true } });
  const sinergiDepts = await sinergi.department.findMany({ select: { id: true, name: true } });
  const kayuDepts = await kayu.department.findMany({ select: { id: true } });
  const omegaDepts = await omega.department.findMany({ select: { id: true } });

  check(`WOORK.ID punya 16 agent`, woorkAgents.length === 16, `dapat ${woorkAgents.length}`);
  check(`WOORK.ID punya 16 department`, woorkDepts.length === 16, `dapat ${woorkDepts.length}`);
  check(
    'WOORK.ID: semua department ber-organizationId WOORK.ID',
    woorkDepts.every((d) => d.organizationId === WOORK_ORG),
  );
  check(
    'WOORK.ID: department tersebar L1/L2/L3 (4/8/4)',
    woorkDepts.filter((d) => d.floor === 1).length === 4 &&
      woorkDepts.filter((d) => d.floor === 2).length === 8 &&
      woorkDepts.filter((d) => d.floor === 3).length === 4,
    JSON.stringify(woorkDepts.map((d) => `${d.name}:${d.floor}`)),
  );
  check(
    'WOORK.ID: semua agent punya departmentId terisi',
    woorkAgents.every((a) => !!a.departmentId),
    woorkAgents.filter((a) => !a.departmentId).map((a) => a.name).join(','),
  );
  check(
    'WOORK.ID: departmentId agent semua ada di department WOORK.ID',
    woorkAgents.every((a) => woorkDepts.some((d) => d.id === a.departmentId)),
  );
  check(`SINERGI punya 5 department`, sinergiDepts.length === 5, `dapat ${sinergiDepts.length}`);
  check('KAYU punya 0 department', kayuDepts.length === 0, `dapat ${kayuDepts.length}`);
  check('OMEGA punya 0 department', omegaDepts.length === 0, `dapat ${omegaDepts.length}`);

  // --- tidak ada ID yang sama di dua tenant ---
  const woorkAgentIds = new Set(woorkAgents.map((a) => a.id));
  const woorkDeptIds = new Set(woorkDepts.map((d) => d.id));
  check(
    'tidak ada agentId yang sama WOORK.ID vs SINERGI',
    sinergiAgents.every((a) => !woorkAgentIds.has(a.id)),
  );
  check(
    'tidak ada departmentId yang sama WOORK.ID vs SINERGI',
    sinergiDepts.every((d) => !woorkDeptIds.has(d.id)),
  );

  // --- lookup lintas tenant -> null ---
  const wDept = woorkDepts[0];
  const sDept = sinergiDepts[0];
  const wAgent = woorkAgents[0];
  const sAgent = sinergiAgents[0];
  check(
    'departmentId WOORK.ID tidak ditemukan dari client SINERGI',
    (await sinergi.department.findUnique({ where: { id: wDept.id } })) === null,
  );
  check(
    'departmentId SINERGI tidak ditemukan dari client WOORK.ID',
    (await woork.department.findUnique({ where: { id: sDept.id } })) === null,
  );
  check(
    'agentId WOORK.ID tidak ditemukan dari client SINERGI',
    (await sinergi.agent.findUnique({ where: { id: wAgent.id } })) === null,
  );
  if (sAgent) {
    check(
      'agentId SINERGI tidak ditemukan dari client WOORK.ID',
      (await woork.agent.findUnique({ where: { id: sAgent.id } })) === null,
    );
  } else {
    check('SINERGI punya agent untuk lookup balik', false, '0 agent di SINERGI');
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
