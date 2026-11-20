// POST /api/meet/[id]/join — validasi gabung meeting.
// - Meeting CANCELLED → 410.
// - Ber-password → verifikasi password (kecuali host).
// - Tamu (body guestToken) → verifikasi token (belum dicabut/kedaluwarsa,
//   milik meeting ini); token = hak join.
// - User login → harus host/peserta ATAU MEET_MANAGE.
// - waitingRoom aktif dan bukan host/co-host → { waiting: true } (sesi tetap dicatat).
// - Buat/update MeetingSession (joinedAt) + MeetingParticipant.joinedAt +
//   status ATTENDED.
// - Respons: info meeting aman + daftar peserta ringkas + waiting +
//   videoConfigured (selalu false di Fase 2 — belum ada engine video).

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import {
  findMeetingOr404,
  findMyParticipant,
  mapParticipantSummary,
  meetRoomLink,
  userCanManageMeet,
  verifyGuestToken,
  verifyMeetingPassword,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

const joinSchema = z.object({
  password: z.string().max(64).optional().nullable(),
  guestToken: z.string().trim().max(200).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const meeting = await findMeetingOr404(params.id);
    if (meeting.status === 'CANCELLED') {
      return apiErr('Meeting ini telah dibatalkan.', 410);
    }
    if (meeting.status === 'COMPLETED') {
      return apiErr('Meeting ini sudah selesai.', 410);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = joinSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data gabung tidak valid.', 400);
    }

    // Password (kecuali host — pemilik meeting tidak perlu memasukkan password buatannya).
    const session = await auth();
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
    const isHost = !!sessionUserId && sessionUserId === meeting.hostId;
    if (meeting.password && !isHost) {
      const plain = parsed.data.password ?? '';
      if (!plain || !(await verifyMeetingPassword(plain, meeting.password))) {
        return apiErr('Password meeting salah.', 403);
      }
    }

    let participantId: string | null = null;
    let userId: string | null = null;
    let guestName: string | null = null;
    let isGuest = false;
    let ctx: Awaited<ReturnType<typeof requireAuth>> | null = null;

    if (parsed.data.guestToken) {
      // Jalur tamu: token = hak join (tidak butuh sesi login).
      const verified = await verifyGuestToken(parsed.data.guestToken, meeting.id);
      participantId = verified.participant.id;
      guestName = verified.participant.guestName;
      isGuest = true;
    } else if (sessionUserId) {
      // Jalur login: verifikasi keanggotaan di kantor pemilik meeting.
      ctx = await requireAuth({ organizationId: meeting.organizationId });
      userId = ctx.userId;
      const canManage = await userCanManageMeet(ctx);
      const mine = findMyParticipant(meeting, ctx.userId);
      if (!mine && meeting.hostId !== ctx.userId && !canManage) {
        return apiErr('Anda tidak diundang ke meeting ini.', 403);
      }
      participantId = mine?.id ?? null;
    } else {
      return apiErr('Tautan tamu atau login diperlukan untuk gabung meeting ini.', 401);
    }

    const participant = participantId
      ? (meeting.participants ?? []).find((p) => p.id === participantId) ?? null
      : null;
    const isCoHost = participant?.role === 'CO_HOST';
    const waiting = !!meeting.waitingRoom && !isHost && !isCoHost;

    // Catat sesi kehadiran (buat baru bila belum ada sesi aktif).
    const now = new Date();
    const activeSession = await prisma.meetingSession.findFirst({
      where: {
        meetingId: meeting.id,
        leftAt: null,
        ...(userId ? { userId } : {}),
        ...(participantId ? { participantId } : {}),
        ...(guestName && !userId ? { guestName } : {}),
      },
      orderBy: { joinedAt: 'desc' },
    });
    let sessionRow = activeSession;
    if (!sessionRow) {
      sessionRow = await prisma.meetingSession.create({
        data: {
          meetingId: meeting.id,
          participantId,
          userId,
          guestName,
          joinedAt: now,
        },
      });
    }

    // Tandai peserta hadir.
    if (participantId) {
      await prisma.meetingParticipant
        .update({
          where: { id: participantId },
          data: { joinedAt: now, status: 'ATTENDED' },
        })
        .catch(() => {});
    }

    // Bila meeting masih SCHEDULED dan seseorang (host/peserta) bergabung,
    // tandai ONGOING agar filter "berlangsung" akurat.
    let status = meeting.status;
    if (status === 'SCHEDULED') {
      await prisma.meeting
        .update({ where: { id: meeting.id }, data: { status: 'ONGOING' } })
        .catch(() => {});
      status = 'ONGOING';
    }

    if (ctx) {
      await audit({
        organizationId: meeting.organizationId,
        userId: ctx.userId,
        action: 'MEET_JOIN',
        module: 'MEET',
        description: `${ctx.name} bergabung ke meeting "${meeting.title}" (${meeting.id})${waiting ? ' — menunggu di waiting room' : ''}`,
      }).catch(() => {});
    }

    const refreshed = await findMeetingOr404(params.id).catch(() => meeting);
    return apiOk({
      meeting: {
        id: refreshed.id,
        title: refreshed.title,
        description: refreshed.description,
        startsAt: refreshed.startsAt.toISOString(),
        endsAt: refreshed.endsAt?.toISOString() ?? null,
        timezone: refreshed.timezone,
        meetingType: refreshed.meetingType,
        locationType: refreshed.locationType,
        joinUrl: refreshed.joinUrl,
        location: refreshed.location,
        status,
        waitingRoom: refreshed.waitingRoom,
        allowScreenShare: refreshed.allowScreenShare,
        allowChat: refreshed.allowChat,
        allowRecording: refreshed.allowRecording,
        muteOnEntry: refreshed.muteOnEntry,
        hostName: refreshed.host?.name ?? '—',
        roomLink: meetRoomLink(refreshed.id),
      },
      participants: (refreshed.participants ?? []).map(mapParticipantSummary),
      participantId,
      sessionId: sessionRow.id,
      isGuest,
      guestName,
      waiting,
      // Fase 2: belum ada engine video. Fase 3 mengisi status engine sebenarnya.
      videoConfigured: false,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal bergabung ke meeting.', 500);
  }
}
