/**
 * Cron: Morning Briefing Kantor Virtual (1 menit).
 *
 * Jalankan:  npx tsx scripts/kantor-briefing-scheduler.ts [organizationId]
 * Tanpa argumen: proses SEMUA organisasi dengan BriefingSettings.isEnabled.
 * Dengan argumen: proses satu organisasi saja.
 *
 * Untuk tiap org:
 *  1. Bila sekarang dalam jendela persiapan (startTime - preparationMinutes
 *     s.d. startTime) dan belum ada sesi hari ini -> mulai sesi (PREPARING).
 *  2. Bila ada sesi aktif -> majukan fasenya berdasarkan jam; bila sudah
 *     lewat endsAt -> akhiri (COMPLETED).
 *  3. Bila jam sudah lewat startTime + duration + 30 mnt dan tidak ada sesi
 *     -> tandai FAILED (terlewat) TANPA memutar ulang.
 *  4. Guard Prayer: jangan mulai briefing bila ada PrayerSession IN_PROGRESS.
 *  5. Idempotent: jalan dua kali tidak membuat sesi ganda (@@unique org +
 *     tanggal + cek status). Satu org gagal -> log + lanjut ke org berikut.
 *
 * Butuh DATABASE_URL + env Prisma. DATABASE_URL dibaca dari .env bila
 * belum ada di environment (pola scripts/calendar-sync.ts).
 *
 * Catatan: script ini jalan sebagai proses terpisah, jadi publish SSE dari
 * sini tidak mencapai client (broker SSE in-process di `next start`).
 * Layar ikut berubah lewat snapshot GET /api/kantor/office (`briefing`)
 * yang dibaca ulang client tiap batas langkah idle (~32 dtk).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../lib/db';
import {
  getBriefingSettings,
  getBriefingWindow,
} from '../lib/kantor/briefing';
import {
  markMissedBriefing,
  recoverStaleSessions,
  startBriefingSession,
  syncBriefingState,
} from '../lib/kantor/briefing-session';
import { listActiveTenants, listMigratedLegacyOrgIds, withTenant } from './tenant-cron';

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const envPath = join(process.cwd(), '.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) {
        process.env.DATABASE_URL = m[1].trim();
        return;
      }
    }
  } catch {
    // .env tidak ada — Prisma akan error dengan pesan yang jelas.
  }
}

async function processOrg(organizationId: string, now: Date): Promise<string> {
  const settings = await getBriefingSettings(organizationId);
  if (!settings.isEnabled) return 'disabled, dilewati';
  const window = getBriefingWindow(settings, now);

  // Guard Prayer: sesi salat sedang berjalan -> jangan mulai briefing.
  const praying = await prisma.prayerSession.findFirst({
    where: { organizationId, status: 'IN_PROGRESS' },
    select: { id: true, prayerName: true },
  });
  if (praying) return `sesi salat (${praying.prayerName}) berjalan, briefing ditunda`;

  const session = await prisma.briefingSession.findUnique({
    where: {
      organizationId_scheduledDate: { organizationId, scheduledDate: window.scheduledDate },
    },
    select: { id: true, status: true },
  });

  if (session) {
    if (['COMPLETED', 'FAILED'].includes(session.status)) {
      return `sesi hari ini sudah ${session.status}`;
    }
    const state = await syncBriefingState(organizationId, now);
    return `sesi aktif -> fase ${state?.phase ?? session.status}`;
  }

  // Belum ada sesi hari ini.
  if (now >= window.prepStartAt && now < window.endsAt) {
    const result = await startBriefingSession(organizationId, { manual: false });
    return result.alreadyExists
      ? 'sesi sudah ada (race), dipakai yang ada'
      : `sesi dimulai (PREPARING), leader: ${result.leaderName ?? '-'}, peserta: ${result.participantCount}`;
  }
  const missedAt = new Date(window.endsAt.getTime() + 30 * 60 * 1000);
  if (now >= missedAt) {
    await markMissedBriefing(organizationId, window);
    return 'terlewat >30 mnt -> ditandai FAILED (tanpa replay)';
  }
  if (now < window.prepStartAt) {
    return `belum waktunya (persiapan ${window.prepStartAt.toISOString()})`;
  }
  return 'tidak ada aksi';
}

async function main(): Promise<void> {
  loadEnv();
  const now = new Date();
  const onlyOrg = process.argv[2] ?? null;
  console.log(`[kantor-briefing-scheduler] ${now.toISOString()} org=${onlyOrg ?? 'semua'}`);

  const recovered = await recoverStaleSessions();
  if (recovered.recovered > 0 || recovered.failed > 0) {
    console.log(
      `  recovery: ${recovered.recovered} sesi diselesaikan, ${recovered.failed} sesi gagal (terlewat)`,
    );
  }

  const orgs = onlyOrg
    ? [{ organizationId: onlyOrg }]
    : await prisma.briefingSettings.findMany({
        where: { isEnabled: true },
        select: { organizationId: true },
      });

  // Phase 6: org yang sudah bermigrasi diproses pass tenant di bawah —
  // lewati di pass legacy agar tidak ada sesi ganda (legacy + tenant).
  const migrated = await listMigratedLegacyOrgIds();
  const activeOrgs = orgs.filter((o) => !migrated.has(o.organizationId));
  if (activeOrgs.length !== orgs.length) {
    console.log(`  lewati ${orgs.length - activeOrgs.length} org bermigrasi di pass legacy`);
  }

  let started = 0;
  let failed = 0;
  for (const { organizationId } of activeOrgs) {
    try {
      const note = await processOrg(organizationId, now);
      if (note.startsWith('sesi dimulai')) started += 1;
      console.log(`  ${organizationId}: ${note}`);
    } catch (e) {
      failed += 1;
      console.error(`  ${organizationId}: GAGAL — ${(e as Error).message}`);
    }
  }

  // Pass tenant (P1-4 Phase 4): hanya bila tanpa argumen org (mode cron).
  // Argumen org tunggal tetap legacy-only (alat operator manual).
  let tenantCount = 0;
  if (!onlyOrg) {
    const tenants = await listActiveTenants().catch((e: unknown) => {
      console.error(`  gagal membaca daftar tenant: ${(e as Error).message}`);
      return [];
    });
    for (const tenant of tenants) {
      tenantCount += 1;
      try {
        await withTenant(tenant, async () => {
          // Guard: JANGAN auto-buat pengaturan (getBriefingSettings membuat
          // default 08:00 bila belum ada — jadwal briefing tenant belum
          // dikonfirmasi admin). Lewati tenant tanpa pengaturan.
          const row = await prisma.briefingSettings.findUnique({
            where: { organizationId: tenant.id },
            select: { organizationId: true, isEnabled: true },
          });
          if (!row) {
            console.log(
              `  tenant ${tenant.tenantCode} (${tenant.companyName}): lewati — belum ada pengaturan briefing`,
            );
            return;
          }
          if (!row.isEnabled) return;
          const recovered = await recoverStaleSessions();
          if (recovered.recovered > 0 || recovered.failed > 0) {
            console.log(
              `  tenant ${tenant.tenantCode}: recovery: ${recovered.recovered} sesi diselesaikan, ${recovered.failed} sesi gagal (terlewat)`,
            );
          }
          const note = await processOrg(tenant.id, now);
          if (note.startsWith('sesi dimulai')) started += 1;
          console.log(`  tenant ${tenant.tenantCode}: ${note}`);
        });
      } catch (e) {
        failed += 1;
        console.error(`  tenant ${tenant.tenantCode}: GAGAL — ${(e as Error).message}`);
      }
    }
  }
  console.log(
    `[kantor-briefing-scheduler] selesai: ${orgs.length} org legacy + ${tenantCount} tenant, ${started} sesi dimulai, ${failed} gagal`,
  );
}

main()
  .catch((e: unknown) => {
    console.error('[kantor-briefing-scheduler] fatal:', (e as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
