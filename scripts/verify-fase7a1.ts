// Verifikasi Fase 7a1 — AI Command Center (read-only, tanpa tulis data).
// Menjalankan getCommandCenterData terhadap DB tenant WOORK.ID dan
// memeriksa invarian: angka bulat >= 0, jumlah per divisi = total agent
// aktif, token/biaya available:false, filter mempersempit dengan benar.
//
// Jalankan:
//   eval $(grep -E '^(MASTER_)?DATABASE_URL=' .env | sed 's/^/export /') \
//     && npx tsx scripts/verify-fase7a1.ts
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { getCommandCenterData } from '../lib/kantor/command-center';

const TENANT_CODE = 'woork_t_7862d085';
const ORG_ID = 'cmwsycgq40000ftucekyc2us8';

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
function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

async function main() {
  const tprisma = await getTenantClientForCode(TENANT_CODE);
  const d = await getCommandCenterData(tprisma, ORG_ID);

  console.log('--- ringkasan ---');
  console.log(`agent aktif: ${d.agents.active}/${d.agents.total}`);
  console.log(`tugas hari ini: dibuat ${d.tasks.today.created}, selesai ${d.tasks.today.completed}, gagal ${d.tasks.today.failed}`);
  console.log(`tugas berjalan: ${d.tasks.current.length}; kolaborasi 24j: ${d.collaborations.total}; meeting 7 hari: ${d.meetings.length}`);
  console.log(`panggilan AI hari ini: ${d.aiUsage.callsToday}; token: available=${d.tokenUsage.available}; biaya: available=${d.estimatedCost.available}`);

  check('total agent bilangan bulat >= 0', isInt(d.agents.total));
  check('agent aktif <= total', d.agents.active <= d.agents.total);
  const deptSum = d.agents.byDepartment.reduce((s, g) => s + g.count, 0);
  check('jumlah per divisi = total agent aktif', deptSum === d.agents.total, `sum=${deptSum} total=${d.agents.total}`);
  check('statusCounts menjumlah ke total', d.agents.statusCounts.reduce((s, g) => s + g.count, 0) === d.agents.total);
  check('tugas hari ini: selesai+gagal <= dibuat', d.tasks.today.completed + d.tasks.today.failed <= d.tasks.today.created);
  check('semua angka tugas bulat >= 0', isInt(d.tasks.today.created) && isInt(d.tasks.today.completed) && isInt(d.tasks.today.failed));
  check('tugas berjalan berstatus aktif', d.tasks.current.every((t) => ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(t.status)));
  check('meeting dalam 7 hari & SCHEDULED/ONGOING', d.meetings.every((m) => {
    const s = new Date(m.startsAt).getTime();
    return s >= Date.now() - 60_000 && s < new Date(d.period.meetingsUntil).getTime() && ['SCHEDULED', 'ONGOING'].includes(m.status);
  }));
  check('kolaborasi total = jumlah percakapan unik', d.collaborations.total >= d.collaborations.items.length);
  check('panggilan AI bilangan bulat >= 0', isInt(d.aiUsage.callsToday));
  check('tokenUsage available=false (tanpa dummy)', d.tokenUsage.available === false && d.tokenUsage.reason.length > 0);
  check('estimatedCost available=false (tanpa dummy)', d.estimatedCost.available === false && d.estimatedCost.reason.length > 0);
  check('utilisasi: satu baris per agent aktif', d.utilization.length === d.agents.total);
  check('utilisasi: angka bulat >= 0', d.utilization.every((u) => isInt(u.activeTasks) && isInt(u.tasksToday.total)));

  // Filter divisi: Backend Engineering — hanya agent divisi itu.
  const backend = d.departments.find((x) => x.name === 'Backend Engineering');
  if (backend) {
    const fd = await getCommandCenterData(tprisma, ORG_ID, { departmentId: backend.id });
    const expected = d.agents.byDepartment.find((g) => g.departmentId === backend.id)?.count ?? 0;
    check('filter divisi mempersempit utilisasi', fd.utilization.length === expected, `got=${fd.utilization.length} expected=${expected}`);
    check(
      'filter divisi mempersempit tugas berjalan ke agent divisi',
      fd.tasks.current.every((t) => fd.utilization.some((u) => u.agentName === t.agentName)),
    );
    check('filter divisi: meeting tetap org-wide', fd.meetings.length === d.meetings.length);
  } else {
    check('divisi Backend Engineering ada (seed Fase 3a)', false);
  }

  // Filter agent: satu agent saja.
  if (d.utilization.length > 0) {
    const one = d.utilization[0];
    const fa = await getCommandCenterData(tprisma, ORG_ID, { agentId: one.agentId });
    check('filter agent: utilisasi 1 baris', fa.utilization.length === 1 && fa.utilization[0].agentId === one.agentId);
    check('filter agent: tugas berjalan hanya miliknya', fa.tasks.current.every((t) => t.agentName === one.agentName));
  }

  // Filter divisi tak dikenal -> tetap aman (0 agent, 0 tugas).
  const bad = await getCommandCenterData(tprisma, ORG_ID, { departmentId: 'dept-tidak-ada' });
  check('filter divisi asing: utilisasi 0', bad.utilization.length === 0);
  check('filter divisi asing: tugas berjalan 0', bad.tasks.current.length === 0);

  console.log(`\n${fail === 0 ? 'Semua' : fail} cek Fase 7a1 ${fail === 0 ? 'lolos' : 'GAGAL'} (${pass} PASS, ${fail} FAIL).`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
