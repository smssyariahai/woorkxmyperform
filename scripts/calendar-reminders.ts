/**
 * Cron: kirim pengingat event kalender (CalendarReminder).
 *
 * Jalankan:  npx tsx scripts/calendar-reminders.ts
 *
 * Cari CalendarReminder PENDING dengan remindAt <= sekarang, buat
 * Notification (type 'CALENDAR_REMINDER') untuk user-nya, tandai SENT.
 * Hanya yang masih PENDING yang diproses — tidak ada pengiriman ganda.
 * Reminder untuk event yang sudah CANCELLED / sudah berakhir dibersihkan
 * (dihapus) tanpa notifikasi.
 *
 * Butuh DATABASE_URL + env Prisma. DATABASE_URL dibaca dari .env bila
 * belum ada di environment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../lib/db';
import { listActiveTenants, listMigratedLegacyOrgIds, withTenant } from './tenant-cron';

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const envPath = join(process.cwd(), '.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) {
        process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
        return;
      }
    }
  } catch {
    // .env tidak ada — Prisma akan error dengan pesan yang jelas.
  }
}

function formatWaktuJakarta(d: Date): string {
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ReminderStats {
  sent: number;
  cleaned: number;
  failed: number;
}

/**
 * Proses semua reminder jatuh tempo di DB aktif (legacy bila tanpa ALS,
 * tenant bila di dalam runWithTenant). Mengembalikan jumlah jatuh tempo.
 * Per-reminder try/catch dipertahankan; hapus reminder basi tetap di luar
 * try (perilaku lama — gagal hapus menggagalkan pass DB ini, seperti dulu).
 * `excludeOrgIds` (Phase 6): lewati reminder milik org legacy yang sudah
 * bermigrasi — pass tenant yang memproses salinannya. Aman untuk pass
 * tenant karena organizationId tenant (id master) tidak pernah sama
 * dengan id org legacy.
 */
async function processReminders(now: Date, stats: ReminderStats, excludeOrgIds?: Set<string>): Promise<number> {
  const allDue = await prisma.calendarReminder.findMany({
    where: { deliveryStatus: 'PENDING', remindAt: { lte: now } },
    include: {
      event: { select: { id: true, title: true, startAt: true, endAt: true, status: true, organizationId: true } },
    },
    orderBy: { remindAt: 'asc' },
    take: 500,
  });
  const due = excludeOrgIds
    ? allDue.filter((r) => !excludeOrgIds.has(r.event?.organizationId ?? ''))
    : allDue;
  for (const r of due) {
    const ev = r.event;
    // Event batal / sudah berakhir: reminder tidak relevan lagi.
    if (!ev || ev.status !== 'SCHEDULED' || ev.endAt < now) {
      await prisma.calendarReminder.delete({ where: { id: r.id } });
      stats.cleaned += 1;
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.notification.create({
          data: {
            organizationId: ev.organizationId,
            userId: r.userId,
            type: 'CALENDAR_REMINDER',
            title: ev.title,
            body: `Event dimulai ${formatWaktuJakarta(ev.startAt)} WIB.`,
          },
        });
        await tx.calendarReminder.update({
          where: { id: r.id },
          data: { deliveryStatus: 'SENT', sentAt: new Date() },
        });
      });
      stats.sent += 1;
    } catch (e) {
      console.error(`[calendar-reminders] reminder ${r.id} GAGAL:`, (e as Error).message);
      await prisma.calendarReminder
        .update({ where: { id: r.id }, data: { deliveryStatus: 'FAILED' } })
        .catch(() => {});
      stats.failed += 1;
    }
  }
  return due.length;
}

async function main(): Promise<void> {
  loadEnv();
  const now = new Date();
  const stats: ReminderStats = { sent: 0, cleaned: 0, failed: 0 };
  // Pass legacy (perilaku lama, tidak berubah).
  // Phase 6: lewati reminder org yang sudah bermigrasi (pass tenant yang
  // memproses salinannya) — kalau tidak, reminder legacy ditandai SENT
  // dan notifikasi dibuat di legacy (tak terlihat pengguna tenant), lalu
  // saat rollback reminder itu sudah SENT sehingga tidak pernah terkirim.
  const migrated = await listMigratedLegacyOrgIds();
  let total = await processReminders(now, stats, migrated);

  // Pass tenant (P1-4 Phase 4): query berjalan DALAM runWithTenant
  // sehingga membaca pengingat DB tenant saja, bukan legacy.
  const tenants = await listActiveTenants().catch((e: unknown) => {
    console.error(`[calendar-reminders] gagal membaca daftar tenant:`, (e as Error).message);
    return [];
  });
  for (const tenant of tenants) {
    try {
      const n = await withTenant(tenant, () => processReminders(now, stats));
      total += n;
      if (n > 0) {
        console.log(`[calendar-reminders] tenant ${tenant.tenantCode}: ${n} jatuh tempo diproses`);
      }
    } catch (e) {
      console.error(`[calendar-reminders] tenant ${tenant.tenantCode}: gagal — ${(e as Error).message}`);
      continue;
    }
  }
  console.log(`[calendar-reminders] terkirim=${stats.sent} dibersihkan=${stats.cleaned} gagal=${stats.failed} (dari ${total} jatuh tempo)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
