// POST /api/meet/[id]/leave — tutup sesi kehadiran aktif (leftAt,
// durationSeconds) + update MeetingParticipant.leftAt.
// - Host leave saat ONGOING → meeting tetap ONGOING (end-for-all Fase 3).
// - Bila host memanggil dengan { endMeeting: true } dan dia host/MEET_MANAGE
//   → status COMPLETED + cabut token tamu + audit.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import {
  findMeetingOr404,
  findMyParticipant,
  revokeAllGuestTokens,
  userCanManageMeet,
  verifyGuestToken,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const meeting = await findMeetingOr404(params.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = z
      .object({
        endMeeting: z.boolean().optional(),
        guestToken: z.string().trim().max(200).optional().nullable(),
        sessionId: z.string().optional().nullable(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data keluar tidak valid.', 400);
    }

    let userId: string | null = null;
    let participantId: string | null = null;
    let guestName: string | null = null;
    let ctx: Awaited<ReturnType<typeof requireAuth>> | null = null;
    let isHost = false;
    let canManage = false;

    if (parsed.data.guestToken) {
      const verified = await verifyGuestToken(parsed.data.guestToken, meeting.id);
      participantId = verified.participant.id;
      guestName = verified.participant.guestName;
    } else {
      const session = await auth();
      const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
      if (!sessionUserId) return apiErr('Belum login. Silakan masuk kembali.', 401);
      ctx = await requireAuth({ organizationId: meeting.organizationId });
      userId = ctx.userId;
      canManage = await userCanManageMeet(ctx);
      const mine = findMyParticipant(meeting, ctx.userId);
      isHost = meeting.hostId === ctx.userId;
      if (!mine && !isHost && !canManage) {
        return apiErr('Anda tidak terdaftar sebagai peserta meeting ini.', 403);
      }
      participantId = mine?.id ?? null;
    }

    const now = new Date();
    let closedSessionId: string | null = null;

    // Tutup sesi aktif (bila sessionId diberikan, tutup sesi itu; bila tidak,
    // tutup sesi aktif terakhir milik pemanggil).
    const activeWhere: Record<string, unknown> = { meetingId: meeting.id, leftAt: null };
    if (parsed.data.sessionId) activeWhere.id = parsed.data.sessionId;
    else if (userId) activeWhere.userId = userId;
    else if (participantId) activeWhere.participantId = participantId;
    else if (guestName) activeWhere.guestName = guestName;

    const active = await prisma.meetingSession.findFirst({
      where: activeWhere as never,
      orderBy: { joinedAt: 'desc' },
    });
    if (active) {
      const durationSeconds = Math.max(
        0,
        Math.floor((now.getTime() - new Date(active.joinedAt).getTime()) / 1000)
      );
      await prisma.meetingSession.update({
        where: { id: active.id },
        data: { leftAt: now, durationSeconds },
      });
      closedSessionId = active.id;
    }

    if (participantId) {
      await prisma.meetingParticipant
        .update({ where: { id: participantId }, data: { leftAt: now } })
        .catch(() => {});
    }

    let ended = false;
    if (parsed.data.endMeeting) {
      if (!isHost && !canManage && !ctx?.isSuperAdmin) {
        return apiErr('Hanya host atau pengelola meeting yang dapat mengakhiri meeting untuk semua.', 403);
      }
      if (meeting.status !== 'COMPLETED' && meeting.status !== 'CANCELLED') {
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { status: 'COMPLETED' },
        });
        await revokeAllGuestTokens(meeting.id).catch(() => {});
        ended = true;
        await audit({
          organizationId: meeting.organizationId,
          userId: ctx?.userId ?? null,
          action: 'MEET_END',
          module: 'MEET',
          description: `Mengakhiri meeting "${meeting.title}" (${meeting.id})`,
        });
      }
    }

    if (ctx) {
      await audit({
        organizationId: meeting.organizationId,
        userId: ctx.userId,
        action: 'MEET_LEAVE',
        module: 'MEET',
        description: `${ctx.name} keluar dari meeting "${meeting.title}" (${meeting.id})${ended ? ' — meeting diakhiri' : ''}`,
      }).catch(() => {});
    }

    return apiOk({
      left: true,
      sessionId: closedSessionId,
      ended,
      status: ended ? 'COMPLETED' : meeting.status,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal keluar dari meeting.', 500);
  }
}
