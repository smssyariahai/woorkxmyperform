// GET /api/meet — daftar meeting (filter today/upcoming/ongoing/history/mine + q).
// POST /api/meet — buat meeting + peserta + token tamu + fan-out MEET_INVITE.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import {
  MEETING_TYPES,
  attachMeetingUsers,
  createGuestToken,
  getMeetingSetting,
  hashMeetingPassword,
  inviteNotification,
  mapMeeting,
  meetVisibilityWhere,
  meetingInclude,
  notifyMeetingParticipants,
  userCanManageMeet,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

const createMeetingSchema = z
  .object({
    title: z.string().trim().min(1, 'Judul meeting wajib diisi.').max(200),
    description: z.string().trim().max(5000).optional().nullable(),
    startsAt: z.string().min(1, 'Waktu mulai wajib diisi.'),
    endsAt: z.string().optional().nullable(),
    timezone: z.string().trim().max(64).optional(),
    meetingType: z.enum(MEETING_TYPES).optional(),
    locationType: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).optional(),
    joinUrl: z.string().trim().max(500).optional().nullable(),
    location: z.string().trim().max(500).optional().nullable(),
    password: z.string().min(4, 'Password meeting minimal 4 karakter.').max(64).optional().nullable(),
    waitingRoom: z.boolean().optional(),
    allowJoinBeforeHost: z.boolean().optional(),
    muteOnEntry: z.boolean().optional(),
    allowScreenShare: z.boolean().optional(),
    allowChat: z.boolean().optional(),
    allowRecording: z.boolean().optional(),
    userIds: z.array(z.string()).max(200).optional(),
    guests: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          email: z.string().trim().email().max(200).optional().nullable(),
          phone: z.string().trim().max(32).optional().nullable(),
        })
      )
      .max(200)
      .optional(),
  })
  .refine(
    (d) => {
      if (!d.endsAt) return true;
      return new Date(d.endsAt).getTime() > new Date(d.startsAt).getTime();
    },
    { message: 'Waktu selesai harus setelah waktu mulai.', path: ['endsAt'] }
  );

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const canManage = await userCanManageMeet(ctx);
    const url = new URL(req.url);
    const filter = url.searchParams.get('filter') || 'upcoming';
    const q = (url.searchParams.get('q') || '').trim();
    const limitRaw = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const where: Record<string, unknown> = meetVisibilityWhere(ctx, canManage);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    let orderBy: Record<string, string> = { startsAt: 'asc' };
    if (filter === 'today') {
      where.startsAt = { gte: startOfDay, lte: endOfDay };
      where.status = { notIn: ['CANCELLED'] };
    } else if (filter === 'ongoing') {
      where.status = 'ONGOING';
    } else if (filter === 'history') {
      const visOr = (where as { OR?: unknown }).OR;
      delete (where as Record<string, unknown>).OR;
      const historyCond = {
        OR: [{ status: { in: ['COMPLETED', 'CANCELLED'] } }, { endsAt: { lt: now } }],
      };
      if (visOr) {
        (where as Record<string, unknown>).AND = [{ OR: visOr }, historyCond];
      } else {
        Object.assign(where, historyCond);
      }
      orderBy = { startsAt: 'desc' };
    } else if (filter === 'mine') {
      const visOr = (where as { OR?: unknown }).OR;
      if (visOr) {
        delete (where as Record<string, unknown>).OR;
        (where as Record<string, unknown>).AND = [
          { OR: visOr },
          { OR: [{ hostId: ctx.userId }, { participants: { some: { userId: ctx.userId } } }] },
        ];
      }
      where.status = { notIn: ['CANCELLED'] };
    } else {
      // upcoming (default)
      where.startsAt = { gte: startOfDay };
      where.status = { in: ['SCHEDULED', 'DRAFT', 'ONGOING'] };
    }

    if (q) {
      const searchOr = [{ title: { contains: q, mode: 'insensitive' } }];
      const existingAnd = (where as { AND?: unknown[] }).AND;
      if (existingAnd) {
        (where as Record<string, unknown>).AND = [...existingAnd, { OR: searchOr }];
      } else if ((where as { OR?: unknown }).OR) {
        const visOr = (where as { OR?: unknown }).OR;
        delete (where as Record<string, unknown>).OR;
        (where as Record<string, unknown>).AND = [{ OR: visOr }, { OR: searchOr }];
      } else {
        where.OR = searchOr;
      }
    }

    // Meeting TIDAK punya relasi `host` dan MeetingParticipant TIDAK punya
    // relasi `user` di tenant client — digabung via `attachMeetingUsers`
    // (bentuk hasil sama seperti include lama).
    const rows = await attachMeetingUsers(
      await prisma.meeting.findMany({
        where: where as never,
        orderBy,
        take: limit,
        include: meetingInclude,
      })
    );
    return apiOk({
      meetings: rows.map((r) => mapMeeting(r as never)),
      canManage,
      filter,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar meeting.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('MEET_CREATE', req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = createMeetingSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data meeting tidak valid.', 400);
    }
    const d = parsed.data;
    const startsAt = new Date(d.startsAt);
    const endsAt = d.endsAt ? new Date(d.endsAt) : null;
    if (Number.isNaN(startsAt.getTime())) return apiErr('Waktu mulai tidak valid.', 400);
    if (endsAt && Number.isNaN(endsAt.getTime())) return apiErr('Waktu selesai tidak valid.', 400);

    const setting = await getMeetingSetting(ctx.organizationId);
    if (endsAt) {
      const durationMin = (endsAt.getTime() - startsAt.getTime()) / 60000;
      if (durationMin > setting.maxDurationMinutes) {
        return apiErr(
          `Durasi meeting maksimal ${setting.maxDurationMinutes} menit sesuai pengaturan kantor.`,
          400
        );
      }
    }
    const userIds = [...new Set(d.userIds ?? [])].filter((id) => id !== ctx.userId);
    const guests = d.guests ?? [];
    if (userIds.length + guests.length + 1 > setting.maxParticipants) {
      return apiErr(
        `Jumlah peserta maksimal ${setting.maxParticipants} orang sesuai pengaturan kantor.`,
        400
      );
    }
    if (guests.length > 0 && !setting.allowGuest) {
      return apiErr('Tamu eksternal tidak diizinkan sesuai pengaturan kantor.', 400);
    }

    // Validasi peserta internal: harus anggota AKTIF kantor ini.
    let memberships: Array<{
      userId: string;
      jobTitle: string | null;
      department: { name: string } | null;
      employment: { position: string | null; branch: string | null } | null;
    }> = [];
    if (userIds.length > 0) {
      memberships = await prisma.membership.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: userIds }, status: 'ACTIVE' },
        select: {
          userId: true,
          jobTitle: true,
          department: { select: { name: true } },
          employment: { select: { position: true, branch: true } },
        },
      });
      const found = new Set(memberships.map((m) => m.userId));
      const missing = userIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        return apiErr('Sebagian peserta bukan anggota aktif kantor ini.', 400);
      }
    }

    const passwordHash = d.password ? await hashMeetingPassword(d.password) : null;
    const meeting = await prisma.meeting.create({
      data: {
        organizationId: ctx.organizationId,
        hostId: ctx.userId,
        title: d.title,
        description: d.description ?? null,
        startsAt,
        endsAt,
        timezone: d.timezone || setting.defaultTimezone,
        meetingType: d.meetingType ?? 'INTERNAL',
        locationType: d.locationType ?? 'ONLINE',
        joinUrl: d.joinUrl ?? null,
        location: d.location ?? null,
        status: 'SCHEDULED',
        password: passwordHash,
        waitingRoom: d.waitingRoom ?? setting.waitingRoomDefault,
        allowJoinBeforeHost: d.allowJoinBeforeHost ?? false,
        muteOnEntry: d.muteOnEntry ?? false,
        allowScreenShare: d.allowScreenShare ?? setting.allowScreenShare,
        allowChat: d.allowChat ?? setting.allowChat,
        allowRecording: d.allowRecording ?? setting.allowRecording,
        participants: {
          create: [
            { userId: ctx.userId, role: 'HOST', status: 'ACCEPTED', respondedAt: new Date() },
            ...memberships.map((m) => ({
              userId: m.userId,
              role: 'PARTICIPANT',
              status: 'INVITED',
              snapshotPosition: m.jobTitle ?? m.employment?.position ?? null,
              snapshotDepartment: m.department?.name ?? null,
              snapshotBranch: m.employment?.branch ?? null,
            })),
            ...guests.map((g) => ({
              userId: null,
              guestName: g.name,
              guestEmail: g.email ?? null,
              guestPhone: g.phone ?? null,
              role: 'PARTICIPANT',
              status: 'INVITED',
            })),
          ],
        },
      },
      include: meetingInclude,
    });

    // Token tamu untuk peserta eksternal.
    const guestParticipants = (meeting.participants as Array<{ id: string; userId: string | null }>).filter(
      (p) => !p.userId
    );
    for (const gp of guestParticipants) {
      await createGuestToken(gp.id, meeting.id).catch(() => {});
    }

    // Fan-out MEET_INVITE ke peserta internal (bukan host).
    const invite = inviteNotification(meeting, null);
    await notifyMeetingParticipants(
      { id: meeting.id, organizationId: ctx.organizationId, title: meeting.title },
      'MEET_INVITE',
      invite.title,
      invite.body,
      { excludeUserIds: [ctx.userId] }
    ).catch(() => {});

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_CREATE',
      module: 'MEET',
      description: `Membuat meeting "${meeting.title}" (${meeting.id})`,
      ipAddress: undefined,
    });

    const freshRow = await prisma.meeting.findUnique({
      where: { id: meeting.id },
      include: meetingInclude,
    });
    const [fresh] = await attachMeetingUsers(freshRow ? [freshRow] : []);
    return apiOk(mapMeeting(fresh as never), 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat meeting.', 500);
  }
}
