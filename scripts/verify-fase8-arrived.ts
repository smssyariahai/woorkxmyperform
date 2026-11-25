// Verifikasi Fase 8 (3.0) — penanda kedatangan peserta sesi
// (lib/kantor/session-arrival.ts).
//
// Menguji helper markPrayerArrivals / markBriefingArrivals langsung
// (pola verify-fase5-rest.ts / verify-fase8-isolation.ts — helper-level,
// tanpa HTTP karena route butuh sesi login):
//  - peserta INVITED dengan arrivedAt NULL -> arrivedAt terisi + status
//    naik (PRAYING / SEATED);
//  - peserta SKIPPED tidak disentuh;
//  - peserta yang arrivedAt-nya sudah terisi tidak disentuh (idempotent);
//  - pemanggilan kedua -> 0 baris (idempotent).
//
// Tenant uji: OMEGA (woork_t_af9d7975) — tidak punya sesi salat/briefing
// maupun pengaturan; sesi uji memakai tanggal 2027-01-01 (tidak akan
// bertabrakan dengan sesi nyata, tidak disentuh scheduler). Semua data
// uji dihapus di finally; OMEGA kembali 0 sesi.
// Baseline read-only: peserta briefing WOORK.ID hari ini masih
// arrivedAt NULL (fix belum deploy — diharapkan sebelum Dzuhur).
//
// Dijalankan:
//   eval $(grep -E '^(MASTER_)?DATABASE_URL=' .env | sed 's/^/export /') \
//     && npx tsx scripts/verify-fase8-arrived.ts
import { readFileSync } from 'node:fs';
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { markBriefingArrivals, markPrayerArrivals } from '../lib/kantor/session-arrival';

const WOORK_CODE = 'woork_t_7862d085';
const OMEGA_CODE = 'woork_t_af9d7975';

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
  const omega = await getTenantClientForCode(OMEGA_CODE);

  // --- baseline read-only: briefing WOORK.ID hari ini (fix belum live) ---
  const todayBriefing = await woork.briefingSession.findFirst({
    where: { scheduledDate: new Date('2026-11-24T00:00:00.000Z') },
    select: { id: true, status: true },
  });
  if (todayBriefing) {
    const nullCount = await woork.briefingParticipant.count({
      where: { sessionId: todayBriefing.id, arrivedAt: null },
    });
    const total = await woork.briefingParticipant.count({ where: { sessionId: todayBriefing.id } });
    check(`baseline briefing 2026-11-24 WOORK.ID: ${nullCount}/${total} arrivedAt NULL (fix belum live)`, nullCount === total && total === 16);
    check('baseline briefing status COMPLETED', todayBriefing.status === 'COMPLETED');
  } else {
    check('baseline briefing 2026-11-24 ada', false, 'tidak ditemukan');
  }

  // --- data uji di OMEGA ---
  const org = await omega.organization.findFirst({ select: { id: true } });
  if (!org) {
    check('OMEGA punya Organization mirror', false);
    throw new Error('no org');
  }
  const orgId = org.id;
  const scratchDate = new Date('2027-01-01T00:00:00.000Z');
  const placedAt = new Date('2026-11-24T01:00:00.000Z');
  const presetAt = new Date('2026-11-24T00:30:00.000Z');

  let prayerSessionId = '';
  let briefingSessionId = '';
  try {
    // --- salat ---
    const ps = await omega.prayerSession.create({
      data: {
        organizationId: orgId,
        prayerName: 'dzuhur',
        prayerDate: scratchDate,
        scheduledAt: new Date('2027-01-01T04:40:00.000Z'),
        startedAt: new Date('2027-01-01T04:40:00.000Z'),
        status: 'IN_PROGRESS',
        participantCount: 3,
      },
    });
    prayerSessionId = ps.id;
    await omega.prayerSessionParticipant.createMany({
      data: [
        { sessionId: ps.id, agentId: 'uji-1', agentName: 'Uji 1', status: 'INVITED' },
        { sessionId: ps.id, agentId: 'uji-2', agentName: 'Uji 2', status: 'INVITED' },
        { sessionId: ps.id, agentId: 'uji-3', agentName: 'Uji 3', status: 'INVITED' },
        { sessionId: ps.id, agentId: 'uji-skip', agentName: 'Uji Skip', status: 'SKIPPED' },
        { sessionId: ps.id, agentId: 'uji-preset', agentName: 'Uji Preset', status: 'INVITED', arrivedAt: presetAt },
      ],
    });
    const n1 = await markPrayerArrivals(omega, ps.id, placedAt);
    check('salat: 3 peserta INVITED ditandai tiba', n1 === 3, `count=${n1}`);
    const after = await omega.prayerSessionParticipant.findMany({ where: { sessionId: ps.id }, orderBy: { agentId: 'asc' } });
    const byId = new Map(after.map((p) => [p.agentId, p]));
    check('salat: peserta 1-3 status PRAYING', ['uji-1', 'uji-2', 'uji-3'].every((id) => byId.get(id)?.status === 'PRAYING'));
    check(
      'salat: peserta 1-3 arrivedAt = placedAt',
      ['uji-1', 'uji-2', 'uji-3'].every((id) => byId.get(id)?.arrivedAt?.getTime() === placedAt.getTime()),
    );
    check(
      'salat: SKIPPED tidak disentuh',
      byId.get('uji-skip')?.status === 'SKIPPED' && byId.get('uji-skip')?.arrivedAt === null,
    );
    check(
      'salat: preset tidak disentuh (arrivedAt + status utuh)',
      byId.get('uji-preset')?.arrivedAt?.getTime() === presetAt.getTime() && byId.get('uji-preset')?.status === 'INVITED',
    );
    const n2 = await markPrayerArrivals(omega, ps.id, placedAt);
    check('salat: pemanggilan kedua 0 baris (idempotent)', n2 === 0, `count=${n2}`);

    // --- briefing ---
    const bs = await omega.briefingSession.create({
      data: {
        organizationId: orgId,
        scheduledDate: scratchDate,
        scheduledAt: new Date('2027-01-01T01:00:00.000Z'),
        startedAt: new Date('2027-01-01T01:00:00.000Z'),
        status: 'IN_PROGRESS',
        participantCount: 3,
      },
    });
    briefingSessionId = bs.id;
    await omega.briefingParticipant.createMany({
      data: [
        { sessionId: bs.id, agentId: 'uji-1', agentName: 'Uji 1', status: 'INVITED' },
        { sessionId: bs.id, agentId: 'uji-2', agentName: 'Uji 2', status: 'INVITED' },
        { sessionId: bs.id, agentId: 'uji-3', agentName: 'Uji 3', status: 'INVITED' },
        { sessionId: bs.id, agentId: 'uji-skip', agentName: 'Uji Skip', status: 'SKIPPED' },
        { sessionId: bs.id, agentId: 'uji-preset', agentName: 'Uji Preset', status: 'INVITED', arrivedAt: presetAt },
      ],
    });
    const m1 = await markBriefingArrivals(omega, bs.id, placedAt);
    check('briefing: 3 peserta INVITED ditandai tiba', m1 === 3, `count=${m1}`);
    const bAfter = await omega.briefingParticipant.findMany({ where: { sessionId: bs.id }, orderBy: { agentId: 'asc' } });
    const bById = new Map(bAfter.map((p) => [p.agentId, p]));
    check('briefing: peserta 1-3 status SEATED', ['uji-1', 'uji-2', 'uji-3'].every((id) => bById.get(id)?.status === 'SEATED'));
    check(
      'briefing: peserta 1-3 arrivedAt = placedAt',
      ['uji-1', 'uji-2', 'uji-3'].every((id) => bById.get(id)?.arrivedAt?.getTime() === placedAt.getTime()),
    );
    check(
      'briefing: SKIPPED tidak disentuh',
      bById.get('uji-skip')?.status === 'SKIPPED' && bById.get('uji-skip')?.arrivedAt === null,
    );
    check(
      'briefing: preset tidak disentuh (arrivedAt + status utuh)',
      bById.get('uji-preset')?.arrivedAt?.getTime() === presetAt.getTime() && bById.get('uji-preset')?.status === 'INVITED',
    );
    const m2 = await markBriefingArrivals(omega, bs.id, placedAt);
    check('briefing: pemanggilan kedua 0 baris (idempotent)', m2 === 0, `count=${m2}`);
  } finally {
    if (prayerSessionId) await omega.prayerSession.delete({ where: { id: prayerSessionId } }).catch(() => {});
    if (briefingSessionId) await omega.briefingSession.delete({ where: { id: briefingSessionId } }).catch(() => {});
  }

  // --- pemicu scheduler: start sesi menandai kedatangan (keputusan user
  // 2026-11-24) — arrivedAt = waktu mulai sesi, tanpa menunggu snapshot ---
  const prayerSessionSrc = readFileSync('lib/kantor/prayer-session.ts', 'utf8');
  const briefingSessionSrc = readFileSync('lib/kantor/briefing-session.ts', 'utf8');
  check(
    'scheduler §8b: startPrayerSession memanggil markPrayerArrivals(prisma, session.id, now)',
    prayerSessionSrc.includes("import { markPrayerArrivals } from './session-arrival';") &&
      prayerSessionSrc.includes('await markPrayerArrivals(prisma, session.id, now);'),
    'wiring tidak ditemukan',
  );
  check(
    'scheduler §8b: startBriefingSession memanggil markBriefingArrivals(prisma, session.id, now)',
    briefingSessionSrc.includes("import { markBriefingArrivals } from './session-arrival';") &&
      briefingSessionSrc.includes('await markBriefingArrivals(prisma, session.id, now);'),
    'wiring tidak ditemukan',
  );

  // --- cleanup terverifikasi: OMEGA kembali 0 sesi ---
  check('OMEGA kembali 0 PrayerSession', (await omega.prayerSession.count()) === 0);
  check('OMEGA kembali 0 BriefingSession', (await omega.briefingSession.count()) === 0);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
