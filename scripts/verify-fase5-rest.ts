// Verifikasi Fase 5a + 5b + 7 — Residence DB + seed + assignment + retarget
// tidur + Admin Management (helper lib/kantor/residence-admin.ts).
// (read-only kecuali uji tulis yang dibersihkan sendiri: sesi uji + kasur
// sementara K1-TMP dihapus di finally; assignment dipulihkan ke posisi seed;
// sesi MANUAL uji toggle diakhiri + dihapus, sesi MANUAL yang sudah ada
// sebelum uji (bila ada) dibuat ulang persis; rename kamar + nama mess +
// status kasur + jadwal uji dipulihkan/dihapus di finally; Residence uji di
// tenant KAYU dibuat + dihapus di finally).
//
// Memeriksa invarian desain §1:
//  - 1 Residence + 4 Room + 16 Bed (bedIndex 0–15 unik, kode K1-B1..K4-B4)
//  - 16 agent WOORK.ID masing-masing 1 assignment ACTIVE; 16 bed masing-masing
//    max 1 agent (satu agent ↔ satu bed, ditegakkan DB)
//  - Assign ganda ditolak DB (unique agentId + unique bedId -> P2002)
//  - Partial unique index sesi: max 1 RESTING per agent, COMPLETED boleh ganda
//  - Pindah kasur (jalur update API assign) bekerja + dapat dipulihkan
//  - Query bentuk GET /api/admin/kantor/residence: 4 kamar, 16 kasur,
//    16 penghuni, 0 agent tanpa kasur
//  - Jumlah tabel tenant = 128 (EXPECTED_TABLE_COUNT Fase 5a)
//
// Bagian 5b (tanpa HTTP — helper lib/kantor/rest.ts + idlePlan langsung):
//  - computeSleepers: sleeper Idle+Lounge -> kasur assignment-nya di mess
//    (y 2,8, pose 'lie', height 0,5, dalam bounds mess); agent WORKING /
//    Praying dengan sesi RESTING TIDAK dikirim tidur; `sleep` true hanya
//    bila ada sesi MANUAL (SCHEDULE saja -> false)
//  - idlePlan + sleeperBeds: tiap sleeper dapat placement kasurnya sendiri;
//    sleeper tanpa kasur fallback ke restSpot lounge (y 5,6, pose 'lie')
//  - setManualRest (DB): toggle ON -> 16 sesi MANUAL; ON ke-2 -> 0 baru
//    (idempotent); OFF -> 16 diakhiri; OFF ke-2 -> 0; 0 RESTING tersisa
//
// Dijalankan:
//   eval $(grep -E '^(MASTER_)?DATABASE_URL=' .env | sed 's/^/export /') \
//     && npx tsx scripts/verify-fase5-rest.ts
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { masterPrisma } from '../lib/tenant/master';
import { residenceBeds, residenceBedSpot, RESIDENCE, DEFAULT_LAYOUT, idlePlan } from '../components/kantor/scene/office3d-layout';
import { computeSleepers, getRestingAgents, setManualRest } from '../lib/kantor/rest';
import {
  ResidenceAdminError,
  activateResidence,
  assignAgentToBed,
  createRestSchedule,
  deleteRestSchedule,
  getResidence,
  listRestSchedules,
  renameResidenceRoom,
  setResidenceBedStatus,
  updateResidence,
  updateRestSchedule,
} from '../lib/kantor/residence-admin';

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

async function main() {
  const client = await getTenantClientForCode(TENANT_CODE);

  // --- hitung tabel tenant (migrasi diterapkan) ---
  const tablesRaw = await client.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const tableCount = Number(tablesRaw[0]?.count ?? 0);
  check('jumlah tabel tenant = 128', tableCount === 128, `got=${tableCount}`);

  // --- residence / kamar / kasur ---
  const residences = await client.residence.findMany({ select: { id: true, name: true, status: true } });
  check('tepat 1 Residence', residences.length === 1, `got=${residences.length}`);
  const residence = residences[0];
  check(
    'Residence = WOORK STAFF RESIDENCE (ACTIVE)',
    residence?.name === 'WOORK STAFF RESIDENCE' && residence?.status === 'ACTIVE',
  );
  const rooms = await client.residenceRoom.findMany({
    where: { residenceId: residence.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, floorNumber: true, capacity: true },
  });
  check('4 kamar (Kamar 1–4)', rooms.length === 4 && rooms.map((r) => r.name).join(',') === 'Kamar 1,Kamar 2,Kamar 3,Kamar 4');
  check('semua kamar lantai 2 kapasitas 4', rooms.every((r) => r.floorNumber === 2 && r.capacity === 4));
  const beds = await client.residenceBed.findMany({
    orderBy: { bedIndex: 'asc' },
    select: { id: true, roomId: true, bedCode: true, bedIndex: true, status: true },
  });
  check('16 kasur', beds.length === 16, `got=${beds.length}`);
  check(
    'bedIndex 0–15 unik + urut',
    beds.map((b) => b.bedIndex).join(',') === Array.from({ length: 16 }, (_, i) => i).join(','),
  );
  check(
    'kode kasur K1-B1..K4-B4',
    beds.map((b) => b.bedCode).join(',') ===
      ['K1-B1', 'K1-B2', 'K1-B3', 'K1-B4', 'K2-B1', 'K2-B2', 'K2-B3', 'K2-B4', 'K3-B1', 'K3-B2', 'K3-B3', 'K3-B4', 'K4-B1', 'K4-B2', 'K4-B3', 'K4-B4'].join(','),
  );
  check(
    'bedIndex cocok geometri residenceBeds() (16 titik)',
    residenceBeds().length === 16 && beds.every((b) => rooms.some((r) => r.id === b.roomId)),
  );
  check('semua kasur AVAILABLE', beds.every((b) => b.status === 'AVAILABLE'));

  // --- assignment 1↔1 ---
  const agents = await client.agent.findMany({
    where: { organizationId: ORG_ID, isEnabled: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  check('16 agent aktif WOORK.ID', agents.length === 16, `got=${agents.length}`);
  const assignments = await client.agentResidenceAssignment.findMany({
    where: { residenceId: residence.id, status: 'ACTIVE' },
    select: { agentId: true, bedId: true, roomId: true },
  });
  check('16 assignment ACTIVE', assignments.length === 16, `got=${assignments.length}`);
  check(
    'tiap agent tepat 1 assignment',
    agents.every((a) => assignments.filter((x) => x.agentId === a.id).length === 1),
  );
  check(
    'tiap kasur max 1 agent',
    beds.every((b) => assignments.filter((x) => x.bedId === b.id).length <= 1),
  );
  check(
    'Kamar 1 = 4 agent pertama (urut nama)',
    assignments
      .filter((x) => x.roomId === rooms[0].id)
      .map((x) => agents.find((a) => a.id === x.agentId)?.name)
      .sort()
      .join(',') === agents.slice(0, 4).map((a) => a.name).sort().join(','),
  );

  // --- assign ganda ditolak DB (create langsung, gagal sebelum tulis) ---
  const beforeCount = await client.agentResidenceAssignment.count();
  const agentA = agents[0];
  const bedOfA = beds.find((b) => assignments.some((x) => x.agentId === agentA.id && x.bedId === b.id))!;
  const bedOfB = beds.find((b) => assignments.some((x) => x.agentId === agents[1].id && x.bedId === b.id))!;
  let errAgent: any = null;
  try {
    await client.agentResidenceAssignment.create({
      data: { agentId: agentA.id, residenceId: residence.id, roomId: bedOfB.roomId, bedId: bedOfB.id, status: 'ACTIVE' },
    });
  } catch (e: any) {
    errAgent = e;
  }
  check('assign ganda agent (ke kasur orang) ditolak P2002', errAgent?.code === 'P2002', `code=${errAgent?.code ?? 'tidak throw'}`);
  // Uji unique bedId secara terisolasi: agent SEMENTARA (tanpa assignment)
  // mencoba kasur yang sudah terisi -> harus gagal di bedId (bukan agentId).
  const tmpAgent = await client.agent.create({
    data: { organizationId: ORG_ID, name: 'ZZZ-TEST-TMP-5A', role: 'TEST', isEnabled: false },
    select: { id: true },
  });
  let errBed: any = null;
  try {
    await client.agentResidenceAssignment.create({
      data: { agentId: tmpAgent.id, residenceId: residence.id, roomId: bedOfA.roomId, bedId: bedOfA.id, status: 'ACTIVE' },
    });
  } catch (e: any) {
    errBed = e;
  } finally {
    await client.agent.delete({ where: { id: tmpAgent.id } });
  }
  check(
    'assign ganda kasur (agent baru ke kasur terisi) ditolak P2002 bedId',
    errBed?.code === 'P2002' && JSON.stringify(errBed?.meta?.target ?? '').includes('bedId'),
    `code=${errBed?.code ?? 'tidak throw'} target=${JSON.stringify(errBed?.meta?.target ?? null)}`,
  );
  const afterCount = await client.agentResidenceAssignment.count();
  check('tidak ada baris kotor dari uji ganda', afterCount === beforeCount, `before=${beforeCount} after=${afterCount}`);

  // --- partial unique index sesi: 1 RESTING per agent, COMPLETED boleh ganda ---
  // Riwayat COMPLETED yang sah (mis. dari uji tidur live / scheduler 5c)
  // boleh sudah ada sebelum uji — yang dicek: tidak ada SISA dari sesi
  // uji ini (leftover harus sama dengan jumlah sebelum uji, bukan 0).
  const sessionsBefore = await client.agentRestSession.count({ where: { agentId: agentA.id } });
  const sessionIds: string[] = [];
  try {
    const s1 = await client.agentRestSession.create({
      data: { agentId: agentA.id, bedId: bedOfA.id, status: 'RESTING', source: 'MANUAL' },
      select: { id: true },
    });
    sessionIds.push(s1.id);
    let errResting: any = null;
    try {
      await client.agentRestSession.create({
        data: { agentId: agentA.id, bedId: bedOfA.id, status: 'RESTING', source: 'SCHEDULE' },
      });
    } catch (e: any) {
      errResting = e;
    }
    check('sesi RESTING ke-2 agent sama ditolak P2002', errResting?.code === 'P2002', `code=${errResting?.code ?? 'tidak throw'}`);
    const s3 = await client.agentRestSession.create({
      data: { agentId: agentA.id, bedId: bedOfA.id, status: 'COMPLETED', source: 'SCHEDULE', endedAt: new Date() },
      select: { id: true },
    });
    sessionIds.push(s3.id);
    check('sesi COMPLETED ke-2 agent sama BOLEH (riwayat)', true);
    const s4 = await client.agentRestSession.create({
      data: { agentId: agentA.id, bedId: bedOfA.id, status: 'COMPLETED', source: 'MANUAL', endedAt: new Date() },
      select: { id: true },
    });
    sessionIds.push(s4.id);
    check('sesi COMPLETED ke-3 agent sama BOLEH (riwayat)', true);
  } finally {
    if (sessionIds.length > 0) {
      await client.agentRestSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
  }
  const leftoverSessions = await client.agentRestSession.count({ where: { agentId: agentA.id } });
  check('sesi uji dibersihkan', leftoverSessions === sessionsBefore, `sisa=${leftoverSessions} sebelum=${sessionsBefore}`);

  // --- pindah kasur (jalur update API assign) via kasur sementara ---
  const room1 = rooms[0];
  let tmpBed: { id: string } | null = null;
  try {
    tmpBed = await client.residenceBed.create({
      data: { roomId: room1.id, bedCode: 'K1-TMP', bedIndex: 99, status: 'AVAILABLE' },
      select: { id: true },
    });
    const moved = await client.agentResidenceAssignment.update({
      where: { agentId: agentA.id },
      data: { bedId: tmpBed.id, assignedAt: new Date() },
      select: { agentId: true, bedId: true },
    });
    check('pindah agent ke kasur sementara (update)', moved.bedId === tmpBed.id);
    const freed = await client.agentResidenceAssignment.findUnique({ where: { bedId: bedOfA.id } });
    check('kasur lama bebas setelah pindah', freed === null);
    const back = await client.agentResidenceAssignment.update({
      where: { agentId: agentA.id },
      data: { bedId: bedOfA.id, assignedAt: new Date() },
      select: { agentId: true, bedId: true },
    });
    check('pindah kembali ke kasur asal', back.bedId === bedOfA.id);
  } finally {
    // Pulihkan apa pun yang tersisa + hapus kasur sementara.
    const current = await client.agentResidenceAssignment.findUnique({
      where: { agentId: agentA.id },
      select: { bedId: true },
    });
    if (current && current.bedId !== bedOfA.id) {
      await client.agentResidenceAssignment.update({
        where: { agentId: agentA.id },
        data: { bedId: bedOfA.id },
      });
    }
    if (tmpBed) {
      await client.residenceBed.deleteMany({ where: { id: tmpBed.id } });
    }
  }
  const tmpLeft = await client.residenceBed.count({ where: { bedCode: 'K1-TMP' } });
  check('kasur sementara dibersihkan', tmpLeft === 0);
  const finalA = await client.agentResidenceAssignment.findUnique({
    where: { agentId: agentA.id },
    select: { bedId: true },
  });
  check('assignment agent A kembali ke kasur seed', finalA?.bedId === bedOfA.id);

  // --- bentuk data GET /api/admin/kantor/residence (query sama dengan route) ---
  const routeRooms = await client.residenceRoom.findMany({
    where: { residenceId: residence.id },
    orderBy: { name: 'asc' },
    include: { beds: { orderBy: { bedIndex: 'asc' }, select: { id: true, bedCode: true, bedIndex: true, status: true } } },
  });
  const routeAssignments = await client.agentResidenceAssignment.findMany({
    where: { residenceId: residence.id, status: 'ACTIVE' },
    select: { agentId: true, bedId: true },
  });
  const assignedIds = new Set(routeAssignments.map((a) => a.agentId));
  const occupiedBeds = routeRooms.flatMap((r) => r.beds).filter((b) => routeAssignments.some((a) => a.bedId === b.id));
  check('GET residence: 4 kamar', routeRooms.length === 4);
  check('GET residence: 16 kasur', routeRooms.flatMap((r) => r.beds).length === 16);
  check('GET residence: 16 kasur berpenghuni', occupiedBeds.length === 16, `got=${occupiedBeds.length}`);
  check('GET residence: 0 agent tanpa kasur', agents.filter((a) => !assignedIds.has(a.id)).length === 0);

  // --- jadwal: BELUM ada (menunggu pilihan user — desain §2) ---
  const schedules = await client.agentRestSchedule.count();
  check('belum ada AgentRestSchedule (menunggu pilihan user)', schedules === 0, `got=${schedules}`);

  // === FASE 5b — retarget tidur ke kasur mess (tanpa HTTP) ===
  const bedIndexByAgent = new Map<string, number>();
  for (const a of assignments) {
    const bed = beds.find((b) => b.id === a.bedId);
    if (bed) bedIndexByAgent.set(a.agentId, bed.bedIndex);
  }
  const bedIdByAgent = new Map(assignments.map((a) => [a.agentId, a.bedId]));
  const fakeStations = agents.map((a, i) => ({ id: a.id, seat: i + 1, state: 'Idle', room: 'Lounge' }));
  const restingAll = new Map(
    agents.map((a) => [
      a.id,
      { agentId: a.id, bedId: bedIdByAgent.get(a.id)!, bedIndex: bedIndexByAgent.get(a.id)!, source: 'MANUAL' as const },
    ]),
  );
  const sleepAll = computeSleepers(fakeStations, restingAll);
  check('computeSleepers: 16 sleeper (semua Idle+Lounge + sesi)', sleepAll.sleepers.length === 16, `got=${sleepAll.sleepers.length}`);
  check('computeSleepers: 16 placement kasur', sleepAll.sleeperBeds.size === 16, `got=${sleepAll.sleeperBeds.size}`);
  check('computeSleepers: sleep true (ada MANUAL)', sleepAll.sleep === true);
  const messBeds = residenceBeds();
  const bedsOk = agents.every((a, i) => {
    const p = sleepAll.sleeperBeds.get(i + 1);
    if (!p) return false;
    const [x, y, z] = p.position;
    const bed = messBeds[bedIndexByAgent.get(a.id)!];
    return (
      y === 2.8 && x >= RESIDENCE.minX && x <= RESIDENCE.maxX && z >= RESIDENCE.minZ && z <= RESIDENCE.maxZ && p.pose === 'lie' && p.height === 0.5 &&
      p.position[0] === bed[0] && p.position[1] === bed[1] && p.position[2] === bed[2] + 0.95 && p.facing === 0
    );
  });
  check('placement kasur: di mess, y 2,8, pose lie, height 0,5, = residenceBedSpot', bedsOk);
  check(
    'residenceBedSpot cocok residenceBeds() (16 titik)',
    messBeds.every((b, i) => {
      const p = residenceBedSpot(b);
      return p.position[0] === b[0] && p.position[1] === 2.8 && p.position[2] === b[2] + 0.95 && p.pose === 'lie' && p.height === 0.5;
    }),
  );
  // idlePlan: tiap sleeper dapat kasurnya sendiri (stop tetap 'tidur').
  const nowMs = Date.now();
  const planAll = idlePlan(
    fakeStations.map((s) => s.seat),
    nowMs,
    DEFAULT_LAYOUT,
    sleepAll.sleepers,
    sleepAll.sleeperBeds,
  );
  check(
    'idlePlan: tiap sleeper di kasurnya (stop tidur, posisi = bedSpot)',
    agents.every((a, i) => {
      const got = planAll.get(i + 1);
      const want = sleepAll.sleeperBeds.get(i + 1)!;
      return (
        got?.stop.key === 'tidur' &&
        got.placement.position[0] === want.position[0] &&
        got.placement.position[1] === want.position[1] &&
        got.placement.position[2] === want.position[2] &&
        got.placement.pose === 'lie'
      );
    }),
  );
  // Agent WORKING / Praying dengan sesi RESTING TIDAK dikirim tidur.
  const mixedStations = [
    { id: agents[0].id, seat: 1, state: 'Working', room: 'Workspace' },
    { id: agents[1].id, seat: 2, state: 'Praying', room: 'Musala' },
    { id: agents[2].id, seat: 3, state: 'Idle', room: 'Lounge' },
  ];
  const sleepMixed = computeSleepers(mixedStations, restingAll);
  check(
    'WORKING + Praying tidak jadi sleeper (hanya Idle Lounge)',
    sleepMixed.sleepers.length === 1 && sleepMixed.sleepers[0] === 3,
    `got=${JSON.stringify(sleepMixed.sleepers)}`,
  );
  check('sleep tetap true (sesi MANUAL ada, walau agent-nya Working)', sleepMixed.sleep === true);
  // `sleep` hanya dari MANUAL: SCHEDULE saja -> false (tombol tidak menyala).
  const restingSchedule = new Map(
    agents.map((a) => [
      a.id,
      { agentId: a.id, bedId: bedIdByAgent.get(a.id)!, bedIndex: bedIndexByAgent.get(a.id)!, source: 'SCHEDULE' as const },
    ]),
  );
  const sleepSched = computeSleepers(fakeStations, restingSchedule);
  check('sleep false bila hanya sesi SCHEDULE', sleepSched.sleep === false);
  check('sleeper SCHEDULE tetap dapat kasur (tidur jadwal jalan)', sleepSched.sleepers.length === 16);
  // Sleeper tanpa assignment -> fallback restSpot lounge (bukan error).
  const noBedStations = [{ id: 'agent-tanpa-kasur', seat: 1, state: 'Idle', room: 'Lounge' }];
  const sleepNoBed = computeSleepers(noBedStations, new Map());
  check('agent tanpa sesi bukan sleeper', sleepNoBed.sleepers.length === 0 && sleepNoBed.sleep === false);
  const planFallback = idlePlan([1], nowMs, DEFAULT_LAYOUT, [1]);
  const fallback = planFallback.get(1);
  check(
    'idlePlan tanpa sleeperBeds: fallback restSpot lounge (y 5,6, lie)',
    fallback?.stop.key === 'tidur' && fallback.placement.position[1] === 5.6 && fallback.placement.pose === 'lie',
    `y=${fallback?.placement.position[1]}`,
  );

  // Toggle Tidur via setManualRest (DB) — pulihkan state awal bila ada.
  const preResting = await getRestingAgents(client);
  const preManual = [...preResting.values()].filter((r) => r.source === 'MANUAL');
  const toggleIds: string[] = [];
  try {
    const on = await setManualRest(client, true);
    toggleIds.push(...on.started.map((s) => s.sessionId));
    check('toggle ON: sesi MANUAL dibuat untuk agent yang belum istirahat', on.sleeping && on.started.length === 16 - preManual.length, `started=${on.started.length} pre=${preManual.length}`);
    check(
      'toggle ON: bedCode sesuai assignment',
      on.started.every((s) => beds.some((b) => b.bedCode === s.bedCode && bedIdByAgent.get(s.agentId) === b.id)),
    );
    const restingNow = await getRestingAgents(client);
    check(
      'getRestingAgents: 16 MANUAL setelah ON',
      restingNow.size === 16 && [...restingNow.values()].every((r) => r.source === 'MANUAL'),
      `got=${restingNow.size}`,
    );
    const on2 = await setManualRest(client, true);
    check('toggle ON ke-2: 0 sesi baru (idempotent)', on2.sleeping && on2.started.length === 0, `started=${on2.started.length}`);
    const off = await setManualRest(client, false);
    toggleIds.push(...off.ended.map((s) => s.sessionId));
    check('toggle OFF: 16 sesi MANUAL diakhiri', !off.sleeping && off.ended.length === 16, `ended=${off.ended.length}`);
    const restingAfter = await getRestingAgents(client);
    check('setelah OFF: 0 sesi RESTING', restingAfter.size === 0, `got=${restingAfter.size}`);
    const off2 = await setManualRest(client, false);
    check('toggle OFF ke-2: 0 sesi diakhiri', !off2.sleeping && off2.ended.length === 0, `ended=${off2.ended.length}`);
  } finally {
    // Akhiri sisa MANUAL (uji / crash sebelumnya) + hapus sesi uji +
    // buat ulang sesi MANUAL yang sudah ada sebelum uji (bila ada).
    await setManualRest(client, false);
    if (toggleIds.length > 0) {
      await client.agentRestSession.deleteMany({ where: { id: { in: toggleIds } } });
    }
    for (const r of preManual) {
      await client.agentRestSession.create({
        data: { agentId: r.agentId, bedId: r.bedId, status: 'RESTING', source: 'MANUAL' },
      });
    }
  }
  const leftoverResting = await client.agentRestSession.count({ where: { status: 'RESTING' } });
  check('tidak ada sesi RESTING tersisa setelah uji toggle', leftoverResting === preManual.length, `sisa=${leftoverResting} pre=${preManual.length}`);

  // === FASE 7 — Admin Management (helper lib/kantor/residence-admin.ts) ===
  // Semua uji tulis dipulihkan/dihapus di finally masing-masing.
  const room2 = rooms[1];
  const originalRoom2Name = room2.name;
  try {
    const renamed = await renameResidenceRoom(client, room2.id, 'Kamar 2 (Uji)');
    check('rename kamar -> nama baru', renamed.name === 'Kamar 2 (Uji)');
    const reloaded = await client.residenceRoom.findUnique({ where: { id: room2.id }, select: { name: true } });
    check('GET (query route) menunjukkan nama baru', reloaded?.name === 'Kamar 2 (Uji)');
    let errDup: any = null;
    try {
      await renameResidenceRoom(client, room2.id, rooms[0].name);
    } catch (e: any) {
      errDup = e;
    }
    check('rename ke nama kamar lain ditolak 409', errDup instanceof ResidenceAdminError && errDup.status === 409, `status=${errDup?.status ?? 'tidak throw'}`);
    let errEmpty: any = null;
    try {
      await renameResidenceRoom(client, room2.id, '   ');
    } catch (e: any) {
      errEmpty = e;
    }
    check('rename ke nama kosong ditolak 422', errEmpty instanceof ResidenceAdminError && errEmpty.status === 422, `status=${errEmpty?.status ?? 'tidak throw'}`);
  } finally {
    await renameResidenceRoom(client, room2.id, originalRoom2Name);
  }
  const restoredRoom2 = await client.residenceRoom.findUnique({ where: { id: room2.id }, select: { name: true } });
  check('nama kamar dipulihkan', restoredRoom2?.name === originalRoom2Name);

  // Status kasur: berpenghuni -> 409; kosong -> MAINTENANCE -> assign 409.
  let errOccupied: any = null;
  try {
    await setResidenceBedStatus(client, bedOfA.id, 'MAINTENANCE');
  } catch (e: any) {
    errOccupied = e;
  }
  check('kasur berpenghuni -> MAINTENANCE ditolak 409', errOccupied instanceof ResidenceAdminError && errOccupied.status === 409, `status=${errOccupied?.status ?? 'tidak throw'}`);
  const bedAAfter = await client.residenceBed.findUnique({ where: { id: bedOfA.id }, select: { status: true } });
  check('status kasur berpenghuni tetap AVAILABLE', bedAAfter?.status === 'AVAILABLE');
  let tmpBed7: { id: string } | null = null;
  try {
    tmpBed7 = await client.residenceBed.create({
      data: { roomId: rooms[0].id, bedCode: 'K1-TMP7', bedIndex: 99, status: 'AVAILABLE' },
      select: { id: true },
    });
    const maint = await setResidenceBedStatus(client, tmpBed7.id, 'MAINTENANCE');
    check('kasur kosong -> MAINTENANCE OK', maint.status === 'MAINTENANCE');
    let errAssignMaint: any = null;
    try {
      await assignAgentToBed(client, ORG_ID, agentA.id, tmpBed7.id);
    } catch (e: any) {
      errAssignMaint = e;
    }
    check('assign ke kasur MAINTENANCE ditolak 409', errAssignMaint instanceof ResidenceAdminError && errAssignMaint.status === 409, `status=${errAssignMaint?.status ?? 'tidak throw'}`);
    await setResidenceBedStatus(client, tmpBed7.id, 'AVAILABLE');
    const moved7 = await assignAgentToBed(client, ORG_ID, agentA.id, tmpBed7.id);
    check('pindah agent ke kasur kosong via helper assign', moved7.moved === true && moved7.assignment.bedCode === 'K1-TMP7');
    const countAfterMove = await client.agentResidenceAssignment.count({ where: { agentId: agentA.id, status: 'ACTIVE' } });
    check('pindah: agent tetap 1 assignment ACTIVE', countAfterMove === 1, `got=${countAfterMove}`);
    const back7 = await assignAgentToBed(client, ORG_ID, agentA.id, bedOfA.id);
    check('pindah kembali ke kasur asal', back7.moved === true && back7.assignment.bedCode === bedOfA.bedCode);
    const same7 = await assignAgentToBed(client, ORG_ID, agentA.id, bedOfA.id);
    check('assign ke kasur sendiri idempotent (moved false)', same7.moved === false);
  } finally {
    const current7 = await client.agentResidenceAssignment.findUnique({ where: { agentId: agentA.id }, select: { bedId: true } });
    if (current7 && current7.bedId !== bedOfA.id) {
      await client.agentResidenceAssignment.update({ where: { agentId: agentA.id }, data: { bedId: bedOfA.id } });
    }
    if (tmpBed7) {
      await client.residenceBed.deleteMany({ where: { id: tmpBed7.id } });
    }
  }
  check('kasur sementara Fase 7 dibersihkan', (await client.residenceBed.count({ where: { bedCode: 'K1-TMP7' } })) === 0);
  const finalA7 = await client.agentResidenceAssignment.findUnique({ where: { agentId: agentA.id }, select: { bedId: true } });
  check('assignment agent A kembali ke kasur seed (Fase 7)', finalA7?.bedId === bedOfA.id);

  // Pengaturan mess: rename + status + validasi.
  const originalResidenceName = residence.name;
  try {
    const updated = await updateResidence(client, residence.id, { name: 'Mess Uji' });
    check('update nama mess', updated.name === 'Mess Uji');
    let errStatus: any = null;
    try {
      await updateResidence(client, residence.id, { status: 'RUSAK' });
    } catch (e: any) {
      errStatus = e;
    }
    check('status mess tidak valid ditolak 422', errStatus instanceof ResidenceAdminError && errStatus.status === 422, `status=${errStatus?.status ?? 'tidak throw'}`);
    let errEmpty2: any = null;
    try {
      await updateResidence(client, residence.id, {});
    } catch (e: any) {
      errEmpty2 = e;
    }
    check('update mess tanpa field ditolak 422', errEmpty2 instanceof ResidenceAdminError && errEmpty2.status === 422, `status=${errEmpty2?.status ?? 'tidak throw'}`);
  } finally {
    await updateResidence(client, residence.id, { name: originalResidenceName });
  }
  const restoredRes = await client.residence.findUnique({ where: { id: residence.id }, select: { name: true } });
  check('nama mess dipulihkan', restoredRes?.name === originalResidenceName);

  // Jadwal istirahat: CRUD + validasi (dibersihkan di finally).
  const divisions = await client.department.findMany({ where: { organizationId: ORG_ID }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  check('divisi tersedia untuk jadwal', divisions.length >= 1, `got=${divisions.length}`);
  const schedIds: string[] = [];
  try {
    const sAgent = await createRestSchedule(client, ORG_ID, { agentId: agentA.id, startTime: '22:00', endTime: '06:00', scheduleType: 'NIGHT' });
    schedIds.push(sAgent.id);
    check('buat jadwal agent (NIGHT 22:00–06:00)', sAgent.agentId === agentA.id && sAgent.startTime === '22:00' && sAgent.endTime === '06:00' && sAgent.timezone === 'Asia/Jakarta');
    const sDiv = await createRestSchedule(client, ORG_ID, { divisionId: divisions[0].id, startTime: '12:00', endTime: '13:00', scheduleType: 'BREAK' });
    schedIds.push(sDiv.id);
    check('buat jadwal divisi (BREAK 12:00–13:00)', sDiv.divisionId === divisions[0].id && sDiv.scheduleType === 'BREAK');
    const listed = await listRestSchedules(client, ORG_ID);
    check('list jadwal: 2 baris + referensi agent/divisi', listed.schedules.length === 2 && listed.agents.length === 16 && listed.divisions.length === divisions.length, `got=${listed.schedules.length} jadwal`);
    const edited = await updateRestSchedule(client, ORG_ID, sAgent.id, { endTime: '05:30', enabled: false });
    check('ubah jadwal (endTime + nonaktif)', edited.endTime === '05:30' && edited.enabled === false && edited.startTime === '22:00');
    const badCases: Array<[string, any, number]> = [
      ['jam tidak valid', { agentId: agentA.id, startTime: '25:00', endTime: '06:00' }, 422],
      ['mulai = selesai', { agentId: agentA.id, startTime: '22:00', endTime: '22:00' }, 422],
      ['tanpa target', { startTime: '22:00', endTime: '06:00' }, 422],
      ['agent tidak dikenal', { agentId: 'agent-tidak-ada', startTime: '22:00', endTime: '06:00' }, 404],
      ['divisi tidak dikenal', { divisionId: 'divisi-tidak-ada', startTime: '22:00', endTime: '06:00' }, 404],
    ];
    for (const [label, input, want] of badCases) {
      let errBad: any = null;
      try {
        await createRestSchedule(client, ORG_ID, input);
      } catch (e: any) {
        errBad = e;
      }
      check(`jadwal ${label} ditolak ${want}`, errBad instanceof ResidenceAdminError && errBad.status === want, `status=${errBad?.status ?? 'tidak throw'}`);
    }
    await deleteRestSchedule(client, sDiv.id);
    schedIds.splice(schedIds.indexOf(sDiv.id), 1);
    const afterDelete = await client.agentRestSchedule.count();
    check('hapus jadwal divisi -> tersisa 1', afterDelete === 1, `got=${afterDelete}`);
  } finally {
    if (schedIds.length > 0) {
      await client.agentRestSchedule.deleteMany({ where: { id: { in: schedIds } } });
    }
  }
  check('jadwal uji dibersihkan (0 tersisa)', (await client.agentRestSchedule.count()) === 0);

  // Tenant tanpa Residence (KAYU) + activate idempotent.
  let errActivateExists: any = null;
  try {
    await activateResidence(client);
  } catch (e: any) {
    errActivateExists = e;
  }
  check('activate di tenant yang sudah punya mess ditolak 409', errActivateExists instanceof ResidenceAdminError && errActivateExists.status === 409, `status=${errActivateExists?.status ?? 'tidak throw'}`);
  const kayu = await getTenantClientForCode('woork_t_a4c39018');
  try {
    const kayuBefore = await getResidence(kayu);
    check('tenant KAYU belum punya Residence', kayuBefore === null);
    const created = await activateResidence(kayu);
    check('activate di KAYU membuat Residence kosong', created.name === 'WOORK STAFF RESIDENCE' && created.status === 'ACTIVE');
    const kayuRooms = await kayu.residenceRoom.count({ where: { residenceId: created.id } });
    check('Residence baru KAYU 0 kamar (tanpa seed otomatis)', kayuRooms === 0, `got=${kayuRooms}`);
    await kayu.residence.delete({ where: { id: created.id } });
    check('Residence uji KAYU dihapus', (await getResidence(kayu)) === null);
  } finally {
    await kayu.residence.deleteMany({});
    await kayu.$disconnect();
  }
  const kayuCheck = await getTenantClientForCode('woork_t_a4c39018');
  const kayuAfter = await getResidence(kayuCheck);
  await kayuCheck.$disconnect();
  check('KAYU kembali tanpa Residence', kayuAfter === null);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  await client.$disconnect();
  await masterPrisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('[verify-fase5-rest] GAGAL:', e?.message ?? e);
  try {
    await masterPrisma.$disconnect();
  } catch {
    /* abaikan */
  }
  process.exit(1);
});
