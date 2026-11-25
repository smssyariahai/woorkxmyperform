import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  isTaskPlanLocked,
  mapTalTask,
  parseTaskInput,
  taskPeriodWhere,
} from '@/lib/tal/server';
import { dispatchTalNotification } from '@/lib/tal/notify';
import { parseDateKey } from '@/lib/tal/date';

export const dynamic = 'force-dynamic';

function dateRange(dateStr: string): { gte: Date; lt: Date } {
  const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const d = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : parseDateKey(dateStr);
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + 1);
  return { gte: d, lt: next };
}

/** GET /api/tal/tasks — daftar task MILIK SENDIRI (§5.1: userId dipaksa = sesi). */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const url = new URL(req.url);
    const q = url.searchParams;
    const type = q.get('type') ?? 'daily';
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return apiErr('type harus daily, weekly, atau monthly.', 400);
    }
    const status = q.get('status');
    const priority = q.get('priority');
    const search = q.get('search') ?? undefined;
    const where: Record<string, any> = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      type,
    };
    const period = taskPeriodWhere(type as 'daily' | 'weekly' | 'monthly', {
      dateStr: q.get('date') ?? undefined,
      weekNumber: q.get('weekNumber') ? Number(q.get('weekNumber')) : undefined,
      weekYear: q.get('weekYear') ? Number(q.get('weekYear')) : undefined,
      month: q.get('month') ? Number(q.get('month')) : undefined,
      year: q.get('year') ? Number(q.get('year')) : undefined,
    });
    // taskDate (kolom @db.Date) difilter lewat rentang agar tidak kena
    // pergeseran zona waktu saat perbandingan Date.
    if (period.taskDate) {
      where.taskDate = dateRange(q.get('date')!);
      delete period.taskDate;
    }
    Object.assign(where, period);
    if (status && ['todo', 'pending', 'on_progress', 'done'].includes(status)) where.status = status;
    if (priority && ['low', 'medium', 'high'].includes(priority)) where.priority = priority;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const rows = await prisma.talTask.findMany({
      where,
      orderBy: [{ orderNo: 'asc' }, { taskTime: 'asc' }, { createdAt: 'asc' }],
      take: 1000,
    });
    return apiOk({ tasks: rows.map(mapTalTask) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat task TAL.', 500);
  }
}

/** POST /api/tal/tasks — buat task milik sendiri (userId dari sesi). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    const body = await req.json().catch(() => ({}));
    const { data, error } = parseTaskInput(body, { isCreate: true });
    if (error || !data) return apiErr(error ?? 'Data task tidak valid.', 400);

    // Bila plan periode sudah terkunci, task baru masuk sebagai tugas
    // tambahan (pola copyTasksToPeriod backup).
    const probe = {
      type: data.type as string,
      taskDate: data.taskDate ?? null,
      weekNumber: data.weekNumber ?? null,
      weekYear: data.weekYear ?? null,
      month: data.month ?? null,
      year: data.year ?? null,
    };
    const locked = await isTaskPlanLocked(ctx.organizationId, ctx.userId, probe).catch(() => false);
    if (locked) data.isAdditional = true;

    const row = await prisma.talTask.create({
      data: {
        ...data,
        type: data.type,
        title: data.title,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userEmail: ctx.email,
        userName: ctx.name,
        assignedTo: data.assignedTo ?? [],
        assignedUserEmails: data.assignedUserEmails ?? [],
        assignedUsers: data.assignedUsers ?? [],
        attachments: data.attachments ?? [],
      },
    });

    // Notifikasi penugasan ke user lain (bila ada email lain di assignedUserEmails).
    const others = (data.assignedUserEmails as string[] | undefined ?? []).filter(
      (em) => em.toLowerCase() !== ctx.email.toLowerCase()
    );
    if (others.length > 0) {
      try {
        const users = await prisma.user.findMany({
          where: { email: { in: others } },
          select: { id: true, email: true },
        });
        for (const u of users) {
          await dispatchTalNotification(prisma, {
            organizationId: ctx.organizationId,
            userId: u.id,
            category: 'assignment',
            title: `Tugas baru dari ${ctx.name}: ${row.title}`,
            body: `Anda ditugaskan pada "${row.title}" (${row.type === 'daily' ? 'harian' : row.type === 'weekly' ? 'mingguan' : 'bulanan'}).`,
          });
        }
      } catch {
        // Notifikasi best-effort; task sudah tersimpan.
      }
    }

    return apiOk({ task: mapTalTask(row) }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat task TAL.', 500);
  }
}
