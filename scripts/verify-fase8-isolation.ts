// Verifikasi Fase 8 — isolasi tenant Staff Residence (helper-level, tanpa
// HTTP: route handler butuh sesi login; logika yang diuji sama dengan yang
// dipakai route API, pola verify-fase5-rest.ts).
//
// Isolasi dijamin pemisahan database per tenant: client tenant A terhubung
// HANYA ke DB tenant A, jadi ID dari tenant lain tidak akan ditemukan di
// DB ini (findUnique -> null -> 404). Skrip ini membuktikannya dengan data
// nyata, bukan asumsi:
//  - Residence/kamar/kasur uji dibuat di KAYU, lalu dibuktikan tidak
//    terlihat dari WOORK.ID (getResidence tetap milik WOORK.ID; bed KAYU
//    tidak ditemukan; assign/rename/setStatus dengan ID KAYU -> 404).
//  - Jadwal uji dibuat di OMEGA (agent OMEGA asli), lalu dibuktikan tidak
//    muncul di daftar jadwal WOORK.ID.
//  - Target jadwal lintas tenant ditolak: agent OMEGA / divisi SINERGI
//    sebagai target jadwal WOORK.ID -> 404 (validateScheduleTarget).
//  - OMEGA + SINERGI tidak punya Residence (read-only, tanpa perubahan).
//
// Semua data uji dihapus di finally; KAYU kembali 0 Residence/0 kamar/
// 0 kasur, OMEGA kembali 0 jadwal; WOORK.ID diverifikasi utuh
// (1 Residence, 4 kamar, 16 kasur, 16 assignment ACTIVE).
//
// Dijalankan:
//   eval $(grep -E '^(MASTER_)?DATABASE_URL=' .env | sed 's/^/export /') \
//     && npx tsx scripts/verify-fase8-isolation.ts
import { getTenantClientForCode } from '../lib/tenant/resolver';
import {
  ResidenceAdminError,
  activateResidence,
  assignAgentToBed,
  createRestSchedule,
  getResidence,
  listRestSchedules,
  renameResidenceRoom,
  setResidenceBedStatus,
} from '../lib/kantor/residence-admin';

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

async function expectAdminError(name: string, status: number, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, 'tidak melempar error');
  } catch (e) {
    check(name, e instanceof ResidenceAdminError && e.status === status, e instanceof Error ? `${e.constructor.name} ${e.message}` : String(e));
  }
}

async function main() {
  const woork = await getTenantClientForCode(WOORK_CODE);
  const kayu = await getTenantClientForCode(KAYU_CODE);
  const omega = await getTenantClientForCode(OMEGA_CODE);
  const sinergi = await getTenantClientForCode(SINERGI_CODE);

  // --- baseline read-only: OMEGA + SINERGI tidak punya Residence ---
  check('OMEGA tidak punya Residence', (await omega.residence.count()) === 0);
  check('SINERGI tidak punya Residence', (await sinergi.residence.count()) === 0);
  check('KAYU belum punya Residence', (await kayu.residence.count()) === 0);

  // --- referensi lintas tenant (read-only) ---
  const omegaAgent = await omega.agent.findFirst({ select: { id: true, name: true } });
  const sinergiDept = await sinergi.department.findFirst({ select: { id: true, name: true } });
  const woorkAgent = await woork.agent.findFirst({
    where: { organizationId: WOORK_ORG, isEnabled: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  check('OMEGA punya agent untuk uji target lintas tenant', !!omegaAgent, omegaAgent?.name ?? '');
  check('SINERGI punya divisi untuk uji target lintas tenant', !!sinergiDept, sinergiDept?.name ?? '');
  check('WOORK.ID punya agent untuk uji assign', !!woorkAgent, woorkAgent?.name ?? '');

  // --- target jadwal lintas tenant ditolak 404 ---
  if (omegaAgent) {
    await expectAdminError(
      'jadwal WOORK.ID dengan agent OMEGA -> 404',
      404,
      () =>
        createRestSchedule(woork, WOORK_ORG, {
          agentId: omegaAgent.id,
          startTime: '22:00',
          endTime: '06:00',
          scheduleType: 'NIGHT',
        }),
    );
  }
  if (sinergiDept) {
    await expectAdminError(
      'jadwal WOORK.ID dengan divisi SINERGI -> 404',
      404,
      () =>
        createRestSchedule(woork, WOORK_ORG, {
          divisionId: sinergiDept.id,
          startTime: '22:00',
          endTime: '06:00',
          scheduleType: 'NIGHT',
        }),
    );
  }

  // --- data uji di KAYU + jadwal uji di OMEGA ---
  const woorkResidenceBefore = await getResidence(woork);
  let kayuResidenceId: string | null = null;
  let kayuRoomId: string | null = null;
  let kayuBedId: string | null = null;
  let omegaScheduleId: string | null = null;
  try {
    const kayuResidence = await activateResidence(kayu);
    kayuResidenceId = kayuResidence.id;
    check('Residence uji dibuat di KAYU', kayuResidence.name === 'WOORK STAFF RESIDENCE');
    const kayuRoom = await kayu.residenceRoom.create({
      data: { residenceId: kayuResidence.id, name: 'Kamar Uji', floorNumber: 2, capacity: 1 },
      select: { id: true },
    });
    kayuRoomId = kayuRoom.id;
    const kayuBed = await kayu.residenceBed.create({
      data: { roomId: kayuRoom.id, bedCode: 'K-TEST-B1', bedIndex: 0, status: 'AVAILABLE' },
      select: { id: true },
    });
    kayuBedId = kayuBed.id;
    check('kamar + kasur uji dibuat di KAYU', !!kayuRoomId && !!kayuBedId);

    // Residence WOORK.ID tidak berubah walau KAYU kini punya Residence
    const woorkResidenceNow = await getResidence(woork);
    check(
      'getResidence WOORK.ID tetap milik WOORK.ID (bukan KAYU)',
      woorkResidenceNow?.id === woorkResidenceBefore?.id,
    );
    check(
      'WOORK.ID tetap 4 kamar / 16 kasur',
      (await woork.residenceRoom.count()) === 4 && (await woork.residenceBed.count()) === 16,
    );

    // ID KAYU tidak ditemukan dari client WOORK.ID
    check(
      'kasur KAYU tidak ditemukan di DB WOORK.ID',
      (await woork.residenceBed.findUnique({ where: { id: kayuBedId } })) === null,
    );
    check(
      'kamar KAYU tidak ditemukan di DB WOORK.ID',
      (await woork.residenceRoom.findUnique({ where: { id: kayuRoomId } })) === null,
    );

    // Operasi admin WOORK.ID dengan ID KAYU -> 404
    if (woorkAgent) {
      await expectAdminError('assign agent WOORK.ID ke kasur KAYU -> 404', 404, () =>
        assignAgentToBed(woork, WOORK_ORG, woorkAgent.id, kayuBedId as string),
      );
    }
    await expectAdminError('rename kamar KAYU dari WOORK.ID -> 404', 404, () =>
      renameResidenceRoom(woork, kayuRoomId as string, 'Kamar Palsu'),
    );
    await expectAdminError('set status kasur KAYU dari WOORK.ID -> 404', 404, () =>
      setResidenceBedStatus(woork, kayuBedId as string, 'MAINTENANCE'),
    );

    // Jadwal uji di OMEGA (agent OMEGA asli, insert langsung karena
    // helper createRestSchedule memvalidasi target di tenant pemanggil)
    if (omegaAgent) {
      const omegaSchedule = await omega.agentRestSchedule.create({
        data: {
          agentId: omegaAgent.id,
          startTime: '22:00',
          endTime: '06:00',
          timezone: 'Asia/Jakarta',
          scheduleType: 'NIGHT',
          enabled: true,
        },
        select: { id: true },
      });
      omegaScheduleId = omegaSchedule.id;
      const woorkList = await listRestSchedules(woork, WOORK_ORG);
      check(
        'jadwal OMEGA tidak muncul di daftar jadwal WOORK.ID',
        !woorkList.schedules.some((s) => s.id === omegaScheduleId),
        `got=${woorkList.schedules.length} jadwal di WOORK.ID`,
      );
      const omegaList = await listRestSchedules(omega, 'cmwsylw7w0000s7mfq4hcw96a');
      check(
        'jadwal uji memang ada di daftar OMEGA (sanity)',
        omegaList.schedules.some((s) => s.id === omegaScheduleId),
      );
    }
  } finally {
    // --- cleanup: semua data uji dihapus ---
    if (omegaScheduleId) await omega.agentRestSchedule.deleteMany({ where: { id: omegaScheduleId } });
    if (kayuBedId) await kayu.residenceBed.deleteMany({ where: { id: kayuBedId } });
    if (kayuRoomId) await kayu.residenceRoom.deleteMany({ where: { id: kayuRoomId } });
    if (kayuResidenceId) await kayu.residence.deleteMany({ where: { id: kayuResidenceId } });
    check('KAYU kembali 0 Residence', (await kayu.residence.count()) === 0);
    check('KAYU kembali 0 kamar', (await kayu.residenceRoom.count()) === 0);
    check('KAYU kembali 0 kasur', (await kayu.residenceBed.count()) === 0);
    check('OMEGA kembali 0 jadwal', (await omega.agentRestSchedule.count()) === 0);

    // --- WOORK.ID utuh setelah uji ---
    check(
      'WOORK.ID tetap 1 Residence',
      (await woork.residence.count()) === 1,
    );
    check(
      'WOORK.ID tetap 4 kamar / 16 kasur',
      (await woork.residenceRoom.count()) === 4 && (await woork.residenceBed.count()) === 16,
    );
    check(
      'WOORK.ID tetap 16 assignment ACTIVE',
      (await woork.agentResidenceAssignment.count({ where: { status: 'ACTIVE' } })) === 16,
    );
    check('WOORK.ID tetap 0 jadwal', (await woork.agentRestSchedule.count()) === 0);
  }

  await woork.$disconnect();
  await kayu.$disconnect();
  await omega.$disconnect();
  await sinergi.$disconnect();

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
