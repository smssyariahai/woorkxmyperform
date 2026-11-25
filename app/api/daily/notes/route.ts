// Daily Work Notes — satu catatan per pengguna per hari (upsert).
// GET: catatan sendiri (default hari ini). GET ?userId= lain hanya dengan
// DAILY_MANAGE + visibilitas TEAM/MANAGER (TEAM = departemen sama).
// PUT: upsert catatan sendiri (visibility PRIVATE|TEAM|MANAGER).
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  getUserTimezone,
  dateKeyInTz,
  getMyDepartmentId,
} from '@/lib/daily/helpers';

export const dynamic = 'force-dynamic';

const VISIBILITIES = ['PRIVATE', 'TEAM', 'MANAGER'] as const;

function serializeNote(n: any) {
  return {
    id: n.id,
    userId: n.userId,
    date: new Date(n.date).toISOString().slice(0, 10),
    title: n.title ?? null,
    content: n.content ?? null,
    visibility: n.visibility,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const sp = new URL(req.url).searchParams;
    const date = sp.get('date')?.trim() || dateKeyInTz(new Date(), tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('Parameter date harus YYYY-MM-DD.', 400);
    }
    const userId = sp.get('userId')?.trim() || ctx.userId;

    if (userId !== ctx.userId) {
      // Membaca catatan orang lain: butuh DAILY_MANAGE + visibilitas mengizinkan.
      const { getUserPermissions } = await import('@/lib/auth-helpers');
      const perms = await getUserPermissions(ctx);
      if (!(perms.has('*') || perms.has('DAILY_MANAGE'))) {
        return apiErr('Hanya pengelola yang bisa membaca catatan anggota tim.', 403);
      }
      const note = await prisma.dailyWorkNote.findUnique({
        where: {
          organizationId_userId_date: {
            organizationId: ctx.organizationId,
            userId,
            date: new Date(`${date}T00:00:00.000Z`),
          },
        },
      });
      if (!note) return apiOk({ note: null, date, timezone: tz });
      if (note.visibility === 'PRIVATE') {
        return apiErr('Catatan ini bersifat pribadi.', 403);
      }
      if (note.visibility === 'TEAM') {
        const [myDept, theirDept] = await Promise.all([
          getMyDepartmentId(ctx.organizationId, ctx.userId),
          getMyDepartmentId(ctx.organizationId, userId),
        ]);
        if (!myDept || !theirDept || myDept !== theirDept) {
          return apiErr('Catatan ini hanya dibagikan untuk anggota tim yang sama.', 403);
        }
      }
      return apiOk({ note: serializeNote(note), date, timezone: tz });
    }

    const note = await prisma.dailyWorkNote.findUnique({
      where: {
        organizationId_userId_date: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          date: new Date(`${date}T00:00:00.000Z`),
        },
      },
    });
    return apiOk({ note: note ? serializeNote(note) : null, date, timezone: tz });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/notes GET]', e);
    return apiErr('Gagal memuat catatan harian.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiErr('Body tidak valid.', 400);
    const date = typeof body.date === 'string' && body.date.trim()
      ? body.date.trim()
      : dateKeyInTz(new Date(), tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('Field date harus YYYY-MM-DD.', 400);
    }
    const visibility = body.visibility ?? 'PRIVATE';
    if (!(VISIBILITIES as readonly string[]).includes(visibility)) {
      return apiErr('Visibility harus PRIVATE, TEAM, atau MANAGER.', 400);
    }
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : null;
    const content = typeof body.content === 'string' ? body.content.slice(0, 20000) : null;
    if (!title && !content) {
      return apiErr('Judul atau isi catatan wajib diisi.', 400);
    }

    const note = await prisma.dailyWorkNote.upsert({
      where: {
        organizationId_userId_date: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          date: new Date(`${date}T00:00:00.000Z`),
        },
      },
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        date: new Date(`${date}T00:00:00.000Z`),
        title,
        content,
        visibility,
      },
      update: { title, content, visibility },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DAILY_SAVE_NOTE',
      module: 'DAILY',
      description: `Menyimpan catatan harian ${date} (visibilitas ${visibility})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ note: serializeNote(note), date, timezone: tz });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/notes PUT]', e);
    return apiErr('Gagal menyimpan catatan harian.', 500);
  }
}
