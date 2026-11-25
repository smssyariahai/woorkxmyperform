// Seed pemetaan divisi→lantai + penempatan agent awal untuk WOORK.ID
// (Fase 3a — skema revisi Addendum §7 audit 3 lantai).
// Idempotent: department hanya dibuat bila belum ada (berdasarkan nama),
// floor/zone hanya diisi bila masih NULL, departmentId agent hanya diisi
// bila masih NULL — aman dijalankan ulang; tidak menimpa perubahan admin
// lewat UI Department Management.
//
// Jalankan: npx tsx scripts/seed-woork-departments.ts
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { masterPrisma } from '../lib/tenant/master';

const TENANT_CODE = 'woork_t_7862d085';
const ORG_ID = 'cmwsycgq40000ftucekyc2us8';

type DeptSeed = { name: string; floor: number; zone: string };
const DEPARTMENTS: DeptSeed[] = [
  // Lantai 1 — existing (sudah ada di DB; hanya isi floor/zone bila NULL)
  { name: 'CS', floor: 1, zone: 'CS' },
  { name: 'Finance', floor: 1, zone: 'Finance' },
  { name: 'HR', floor: 1, zone: 'HR' },
  { name: 'IT', floor: 1, zone: 'IT' },
  // Lantai 2 — Technology & Product (baru)
  { name: 'Frontend Engineering', floor: 2, zone: 'Frontend Engineering' },
  { name: 'Backend Engineering', floor: 2, zone: 'Backend Engineering' },
  { name: 'AI & Automation', floor: 2, zone: 'AI & Automation' },
  { name: 'DevOps & Infrastructure', floor: 2, zone: 'DevOps & Infrastructure' },
  { name: 'Product Management', floor: 2, zone: 'Product Management' },
  { name: 'UI/UX Design', floor: 2, zone: 'UI/UX Design' },
  { name: 'Quality Assurance', floor: 2, zone: 'Quality Assurance' },
  { name: 'Collaboration Hub', floor: 2, zone: 'Collaboration Hub' },
  // Lantai 3 — Executive & Management (baru)
  { name: 'Executive', floor: 3, zone: 'CEO Office' },
  { name: 'Strategy & Business Development', floor: 3, zone: 'Strategy & PM' },
  { name: 'Legal & Compliance', floor: 3, zone: 'Legal' },
  { name: 'Project Management', floor: 3, zone: 'Project Management' },
];

// Penempatan agent awal (bisa diubah user lewat UI Department Management).
const AGENT_PLACEMENT: Record<string, string> = {
  Aria: 'Executive',
  Bima: 'Strategy & Business Development',
  Citra: 'IT',
  Dian: 'Finance',
  Eko: 'Backend Engineering',
  Fathan: 'Project Management',
  Rama: 'DevOps & Infrastructure',
};

async function main(): Promise<void> {
  const client = await getTenantClientForCode(TENANT_CODE);
  const deptIds = new Map<string, string>();
  let created = 0;
  let filled = 0;
  let skipped = 0;

  for (const d of DEPARTMENTS) {
    const existing = await client.department.findFirst({
      where: { organizationId: ORG_ID, name: d.name },
      select: { id: true, floor: true, zone: true },
    });
    if (!existing) {
      const row = await client.department.create({
        data: { organizationId: ORG_ID, name: d.name, floor: d.floor, zone: d.zone },
        select: { id: true },
      });
      deptIds.set(d.name, row.id);
      created++;
      console.log(`[seed-dept] buat divisi "${d.name}" lantai ${d.floor} (${d.zone})`);
    } else {
      deptIds.set(d.name, existing.id);
      if (existing.floor === null || existing.zone === null) {
        await client.department.update({
          where: { id: existing.id },
          data: {
            ...(existing.floor === null ? { floor: d.floor } : {}),
            ...(existing.zone === null ? { zone: d.zone } : {}),
          },
        });
        filled++;
        console.log(`[seed-dept] isi lantai/zone divisi "${d.name}" → lantai ${d.floor} (${d.zone})`);
      } else {
        skipped++;
      }
    }
  }

  let assigned = 0;
  let alreadyPlaced = 0;
  let agentMissing = 0;
  for (const [agentName, deptName] of Object.entries(AGENT_PLACEMENT)) {
    const deptId = deptIds.get(deptName);
    if (!deptId) {
      console.log(`[seed-dept] divisi "${deptName}" tidak ditemukan — agent ${agentName} dilewati`);
      agentMissing++;
      continue;
    }
    const agent = await client.agent.findFirst({
      where: { organizationId: ORG_ID, name: agentName },
      select: { id: true, departmentId: true },
    });
    if (!agent) {
      console.log(`[seed-dept] agent "${agentName}" tidak ditemukan — dilewati`);
      agentMissing++;
      continue;
    }
    if (agent.departmentId === null) {
      await client.agent.update({ where: { id: agent.id }, data: { departmentId: deptId } });
      assigned++;
      console.log(`[seed-dept] agent ${agentName} → ${deptName}`);
    } else {
      alreadyPlaced++;
    }
  }

  console.log(
    `[seed-dept] SELESAI tenant ${TENANT_CODE}: divisi dibuat=${created} diisi=${filled} dilewati=${skipped}, agent ditempatkan=${assigned} sudah=${alreadyPlaced} hilang=${agentMissing}`,
  );
  await client.$disconnect();
  await masterPrisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('[seed-dept] GAGAL:', e?.message ?? e);
  try {
    await masterPrisma.$disconnect();
  } catch {
    /* abaikan */
  }
  process.exit(1);
});
