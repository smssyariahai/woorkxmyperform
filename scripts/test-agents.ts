/* Uji end-to-end engine Kantor Virtual (tanpa HTTP/auth). */
import { prisma } from '@/lib/db';
import { parseCommand } from '@/lib/agents/intent';
import { ensureAgents, enqueueTask } from '@/lib/agents/scheduler';

async function main() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) throw new Error('tidak ada organisasi');
  console.log('org:', org.name, org.id);

  await ensureAgents(org.id);
  const agents = await prisma.agent.findMany({ where: { organizationId: org.id }, orderBy: { name: 'asc' } });
  console.log('agents:', agents.map((a) => `${a.name}(${a.currentStatus})`).join(', '));

  // 1. intent parsing
  for (const cmd of [
    'Aria, buatkan laporan kinerja minggu ini',
    'Dian, bayar tagihan listrik',
    'Tampilkan seluruh pekerjaan yang sedang berlangsung',
  ]) {
    const it = parseCommand(cmd);
    console.log(`\n"${cmd}"\n  -> agent=${it.agentName} kind=${it.kind} tool=${it.toolKey} approval=${it.requiresApproval} priority=${it.priority}`);
  }

  // 2. buat tugas laporan via Aria, jalankan scheduler
  const aria = agents.find((a) => a.name === 'Aria')!;
  const task = await prisma.agentTask.create({
    data: {
      organizationId: org.id,
      title: 'Laporan: uji scheduler',
      description: 'Aria, buatkan laporan kinerja minggu ini',
      agentId: aria.id,
      priority: 'NORMAL',
      status: 'QUEUED',
      inputPayload: JSON.stringify({ toolKey: 'laporan_kinerja', toolArgs: {} }),
    },
  });
  console.log('\ntask dibuat:', task.id);
  await enqueueTask(org.id, task.id);

  // tunggu eksekusi (worker async)
  await new Promise((r) => setTimeout(r, 6000));

  const done = await prisma.agentTask.findUnique({
    where: { id: task.id },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  console.log('status akhir:', done!.status, '| progress:', done!.progress);
  console.log('events:', done!.events.map((e) => e.eventType).join(' → '));
  const payload = JSON.parse(done!.resultPayload || '{}');
  console.log('ringkasan:', payload.summary);
  const ariaNow = await prisma.agent.findUnique({ where: { id: aria.id } });
  console.log('status Aria:', ariaNow!.currentStatus);

  // 3. tugas sensitif → harus WAITING_APPROVAL
  const dian = agents.find((a) => a.name === 'Dian')!;
  const t2 = await prisma.agentTask.create({
    data: {
      organizationId: org.id, title: 'Bayar tagihan listrik', description: 'Dian, bayar tagihan listrik',
      agentId: dian.id, priority: 'HIGH', status: 'QUEUED', requiresApproval: true,
      inputPayload: JSON.stringify({ toolKey: 'rekap_keuangan', toolArgs: {} }),
    },
  });
  await enqueueTask(org.id, t2.id);
  await new Promise((r) => setTimeout(r, 4000));
  const t2done = await prisma.agentTask.findUnique({ where: { id: t2.id }, include: { approvals: true } });
  console.log('\ntugas sensitif:', t2done!.status, '| approvals:', t2done!.approvals.length, t2done!.approvals[0]?.status);

  // bersih-bersih data uji
  await prisma.agentTask.deleteMany({ where: { id: { in: [task.id, t2.id] } } });
  console.log('\ndata uji dibersihkan. OK');
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
