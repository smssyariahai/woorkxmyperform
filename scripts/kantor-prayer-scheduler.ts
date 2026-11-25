/**
 * Cron: scheduler sesi salat Musala Kantor Virtual (tiap 1 menit).
 *
 * Jalankan:  npx tsx scripts/kantor-prayer-scheduler.ts [organizationId]
 * Tanpa argumen: cek SEMUA organisasi dengan PrayerTimeSettings aktif
 * (legacy) + SEMUA tenant ACTIVE (P1-4 Phase 4).
 * Dengan argumen: cek satu organisasi legacy saja.
 *
 * Butuh DATABASE_URL + env Prisma (lihat README cron). DATABASE_URL dibaca
 * dari .env bila belum ada di environment.
 *
 * Logika per org (idempotent — jalan dua kali tidak membuat sesi ganda):
 *  1. Pulihkan sesi basi (recoverStaleSessions): IN_PROGRESS yang sudah
 *     lewat durasi -> COMPLETED; SCHEDULED yang terlewat -> MISSED.
 *  2. Akhiri sesi IN_PROGRESS yang sudah lewat endsAt (COMPLETED).
 *  3. Tiap waktu salat (Subuh/Zuhur/Asar/Magrib/Isya): bila waktunya
 *     berada dalam 1 menit terakhir (0..90 dtk) DAN belum ada sesi
 *     IN_PROGRESS/COMPLETED untuk (org, tanggal, salat) -> mulai sesi
 *     (startPrayerSession). Guard: JANGAN mulai bila ada BriefingSession
 *     yang sedang berjalan hari ini (status PREPARING s.d. RETURNING) —
 *     praktisnya waktu salat tak pernah jatuh 08:00, tapi guard ini
 *     mencegah dua aktivitas eksklusif berjalan bersamaan.
 *  4. Bila waktu salat sudah lewat durasi + 90 dtk dan tidak ada sesi
 *     sama sekali -> buat PrayerSession status MISSED (TANPA memutar
 *     ulang — kebijakan catch-up aman; sesi yang terlewat karena server
 *     down tidak dijalankan belakangan).
 *
 * Kegagalan satu org (mis. AlAdhan + fallback gagal) tidak menghentikan
 * org lain: error dicatat, lanjut ke org berikutnya.
 *
 * Pass tenant (P1-4): tenant dilewati bila BELUM ADA PrayerTimeSettings
 * di DB-nya — JANGAN auto-buat pengaturan default Jakarta (lokasi tenant
 * belum dikonfirmasi admin; getPrayerSettings membuat default bila belum
 * ada, jadi keberadaan dicek dulu dengan findUnique).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../lib/db';
import {
  combineDateTime,
  dateKeyInZone,
  dateKeyToMidnightUTC,
  getPrayerSettings,
  getTodaySchedule,
  PRAYER_LABELS,
  PRAYER_NAMES,
  tzOffsetHours,
  type PrayerName,
} from '../lib/kantor/prayer';
import {
  endPrayerSession,
  getActiveSession,
  recoverStaleSessions,
  startPrayerSession,
} from '../lib/kantor/prayer-session';
import { listActiveTenants, listMigratedLegacyOrgIds, withTenant } from './tenant-cron';

/** Status BriefingSession yang berarti briefing sedang berjalan. */
const ACTIVE_BRIEFING_STATUSES = [
  'PREPARING',
  'AGENTS_MOVING',
  'GATHERING',
  'IN_PROGRESS',
  'CLOSING',
  'RETURNING',
];

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

interface PrayerStats {
  started: number;
  ended: number;
  missed: number;
  deferred: number;
}

/**
 * Proses satu org (legacy bila tanpa ALS, tenant bila di dalam
 * runWithTenant). `label` hanya untuk log (default: organizationId).
 * Isi fungsi ini = logika per-org lama, tidak diubah; pemanggil
 * membungkus dengan try/catch per org.
 */
async function processPrayerOrg(
  organizationId: string,
  stats: PrayerStats,
  label = organizationId,
): Promise<void> {
  const settings = await getPrayerSettings(organizationId);
  const offset = tzOffsetHours(settings.timezone);
  const now = new Date();
  const todayKey = dateKeyInZone(now, offset);
  const prayerDate = dateKeyToMidnightUTC(todayKey);
  const schedule = await getTodaySchedule(organizationId, todayKey, now);
  const times: Record<PrayerName, string> = {
    subuh: schedule.fajr,
    dzuhur: schedule.dhuhr,
    ashar: schedule.asr,
    maghrib: schedule.maghrib,
    isya: schedule.isha,
  };

  // 1. Akhiri sesi aktif yang sudah lewat durasi.
  const active = await getActiveSession(organizationId);
  if (active?.startedAt) {
    const endsAt = new Date(
      active.startedAt.getTime() + settings.sessionDurationMinutes * 60 * 1000
    );
    if (now >= endsAt) {
      await endPrayerSession(organizationId, 'completed');
      stats.ended++;
      console.log(`[prayer] ${label} ${active.prayerName}: sesi diakhiri (durasi habis)`);
    }
  }

  // 2. Cek tiap waktu salat.
  for (const name of PRAYER_NAMES) {
    const scheduledAt = combineDateTime(todayKey, times[name], offset);
    const diffSec = (now.getTime() - scheduledAt.getTime()) / 1000;
    const existing = await prisma.prayerSession.findUnique({
      where: {
        organizationId_prayerDate_prayerName: { organizationId, prayerDate, prayerName: name },
      },
    });

    if (diffSec >= 0 && diffSec <= 90) {
      // Jendela mulai (1 menit terakhir).
      if (existing && (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED')) {
        continue; // Sudah berjalan / sudah selesai — idempotent.
      }
      // Guard Morning Briefing: jangan mulai bila briefing sedang berjalan.
      const briefing = await prisma.briefingSession.findFirst({
        where: {
          organizationId,
          scheduledDate: prayerDate,
          status: { in: ACTIVE_BRIEFING_STATUSES },
        },
        select: { id: true, status: true },
      });
      if (briefing) {
        stats.deferred++;
        console.log(
          `[prayer] ${label} ${PRAYER_LABELS[name]} (${times[name]}): DITUNDA — briefing ${briefing.status} sedang berjalan`
        );
        continue;
      }
      await startPrayerSession(organizationId, name, { scheduledAt });
      stats.started++;
      console.log(
        `[prayer] ${label} ${PRAYER_LABELS[name]} (${times[name]}): sesi dimulai`
      );
    } else if (diffSec > settings.sessionDurationMinutes * 60 + 90) {
      // Sudah lewat jendela + durasi dan tidak ada sesi -> MISSED (tanpa replay).
      if (!existing) {
        await prisma.prayerSession.create({
          data: {
            organizationId,
            prayerName: name,
            prayerDate,
            scheduledAt,
            endedAt: now,
            status: 'MISSED',
            participantCount: 0,
          },
        });
        stats.missed++;
        console.log(
          `[prayer] ${label} ${PRAYER_LABELS[name]} (${times[name]}): MISSED (terlewat, tidak diulang)`
        );
      }
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const orgArg = process.argv[2];
  const stats: PrayerStats = { started: 0, ended: 0, missed: 0, deferred: 0 };

  // Pass legacy (perilaku lama, tidak berubah).
  const recovered = await recoverStaleSessions();
  console.log(
    `[prayer] recovery: ${recovered.completed} sesi IN_PROGRESS dipulihkan, ${recovered.missed} SCHEDULED -> MISSED`
  );

  const settingsRows = orgArg
    ? await prisma.prayerTimeSettings.findMany({
        where: { organizationId: orgArg, isEnabled: true },
        select: { organizationId: true },
      })
    : await prisma.prayerTimeSettings.findMany({
        where: { isEnabled: true },
        select: { organizationId: true },
      });

  // Phase 6: org yang sudah bermigrasi diproses pass tenant di bawah —
  // lewati di pass legacy agar tidak ada sesi ganda (legacy + tenant).
  const migrated = await listMigratedLegacyOrgIds();
  const activeRows = settingsRows.filter((row) => !migrated.has(row.organizationId));
  if (activeRows.length !== settingsRows.length) {
    console.log(`[prayer] lewati ${settingsRows.length - activeRows.length} org bermigrasi di pass legacy`);
  }

  for (const row of activeRows) {
    const organizationId = row.organizationId;
    try {
      await processPrayerOrg(organizationId, stats);
    } catch (e) {
      console.error(`[prayer] ${organizationId}: gagal — ${(e as Error).message}`);
      continue;
    }
  }

  // Pass tenant (P1-4 Phase 4): hanya bila tanpa argumen org (mode cron).
  // Argumen org tunggal tetap legacy-only (alat operator manual).
  if (!orgArg) {
    const tenants = await listActiveTenants().catch((e: unknown) => {
      console.error(`[prayer] gagal membaca daftar tenant: ${(e as Error).message}`);
      return [];
    });
    for (const tenant of tenants) {
      try {
        await withTenant(tenant, async () => {
          // Guard: JANGAN auto-buat pengaturan (getPrayerSettings membuat
          // default Jakarta — lokasi tenant belum dikonfirmasi admin).
          const row = await prisma.prayerTimeSettings.findUnique({
            where: { organizationId: tenant.id },
            select: { organizationId: true, isEnabled: true },
          });
          if (!row) {
            console.log(
              `[prayer] tenant ${tenant.tenantCode} (${tenant.companyName}): lewati — belum ada pengaturan salat`,
            );
            return;
          }
          if (!row.isEnabled) return;
          const rec = await recoverStaleSessions();
          if (rec.completed > 0 || rec.missed > 0) {
            console.log(
              `[prayer] tenant ${tenant.tenantCode}: recovery: ${rec.completed} sesi dipulihkan, ${rec.missed} SCHEDULED -> MISSED`,
            );
          }
          await processPrayerOrg(tenant.id, stats, `tenant ${tenant.tenantCode}`);
        });
      } catch (e) {
        console.error(`[prayer] tenant ${tenant.tenantCode}: gagal — ${(e as Error).message}`);
        continue;
      }
    }
  }

  console.log(
    `[prayer] selesai: ${stats.started} dimulai, ${stats.ended} diakhiri, ${stats.missed} MISSED, ${stats.deferred} ditunda (briefing).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[prayer] fatal:', (e as Error).message);
    process.exit(1);
  });
