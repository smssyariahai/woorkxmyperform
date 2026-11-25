// GET /api/daily/deadlines?days=3|7 — deadline mendekat: TalTask (milik saya)
// + Invoice (jatuh tempo). TIDAK menampilkan nominal invoice. Status tidak
// diubah otomatis berdasarkan tanggal — hanya indikator severity.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getUserTimezone,
  dateKeyInTz,
  addDaysToKey,
  diffDays,
  dbDateKey,
  serializeTask,
} from '@/lib/daily/helpers';

export const dynamic = 'force-dynamic';

export interface DeadlineItem {
  kind: 'task' | 'invoice';
  id: string;
  name: string;
  deadline: string;
  daysLeft: number;
  timeLeftLabel: string;
  assigneeName: string | null;
  status: string;
  statusLabel: string;
  priorityLabel: string;
  severity: 'normal' | 'approaching' | 'critical' | 'overdue';
  sourceUrl: string | null;
}

function severityFor(daysLeft: number): DeadlineItem['severity'] {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 1) return 'critical';
  if (daysLeft <= 3) return 'approaching';
  return 'normal';
}

function timeLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft} hari terlambat`;
  if (daysLeft === 0) return 'Hari ini';
  if (daysLeft === 1) return 'Besok';
  return `${daysLeft} hari lagi`;
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const todayKey = dateKeyInTz(new Date(), tz);
    const sp = new URL(req.url).searchParams;
    const days = parseInt(sp.get('days') ?? '7', 10);
    if (![3, 7].includes(days)) return apiErr('Parameter days harus 3 atau 7.', 400);
    const untilKey = addDaysToKey(todayKey, days);
    const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
    const untilDate = new Date(`${untilKey}T00:00:00.000Z`);

    const tasks = await prisma.talTask.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        status: { not: 'done' },
        OR: [
          // Mendekat: dalam rentang [hari ini, hari ini+days].
          { taskDate: { gte: todayDate, lte: untilDate } },
          // Terlambat: tanggal sudah lewat & belum selesai (agar severity
          // 'overdue' bisa muncul — tidak tercakup rentang di atas).
          { taskDate: { lt: todayDate } },
        ],
      },
      orderBy: { taskDate: 'asc' },
      take: 100,
    });

    const invoices = await prisma.invoice.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['PENDING', 'OVERDUE'] },
        OR: [
          { dueDate: { gte: todayDate, lte: untilDate } },
          { dueDate: { lt: todayDate } },
        ],
      },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });

    const items: DeadlineItem[] = [];
    for (const t of tasks) {
      const st = serializeTask(t, todayKey);
      items.push({
        kind: 'task',
        id: t.id,
        name: t.title,
        deadline: st.taskDate ?? todayKey,
        daysLeft: st.daysLeft ?? 0,
        timeLeftLabel: timeLeftLabel(st.daysLeft ?? 0),
        assigneeName: t.userName ?? null,
        status: t.status,
        statusLabel: st.statusLabel,
        priorityLabel: st.priorityLabel,
        severity: severityFor(st.daysLeft ?? 0),
        sourceUrl: '/tal/tasks',
      });
    }
    for (const inv of invoices) {
      const dueKey = dbDateKey(inv.dueDate) ?? todayKey;
      const left = diffDays(todayKey, dueKey);
      items.push({
        kind: 'invoice',
        id: inv.id,
        name: `Jatuh tempo invoice ${inv.number}`,
        deadline: dueKey,
        daysLeft: left,
        timeLeftLabel: timeLeftLabel(left),
        assigneeName: null,
        status: inv.status,
        statusLabel: inv.status === 'OVERDUE' ? 'Terlambat' : 'Menunggu pembayaran',
        priorityLabel: '—',
        severity: severityFor(left),
        sourceUrl: null, // detail invoice hanya /admin/invoices (Administrator Pusat)
      });
    }

    items.sort((a, b) => a.deadline.localeCompare(b.deadline));
    return apiOk({ days, today: todayKey, timezone: tz, items });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/deadlines GET]', e);
    return apiErr('Gagal memuat deadline.', 500);
  }
}
