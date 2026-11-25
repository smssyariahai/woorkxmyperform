// GET /api/meet/[id] — detail meeting (host/peserta/MEET_MANAGE).
// PATCH /api/meet/[id] — ubah meeting (host atau MEET_MANAGE; jadwal berubah
//   → fan-out MEET_RESCHEDULED).
// DELETE /api/meet/[id] — batalkan meeting (status CANCELLED, cabut semua
//   token tamu, fan-out MEET_CANCELLED, audit; row TIDAK dihapus).

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import {
  MEETING_TYPES,
  attachMeetingUsers,
  canManageMeeting,
  getMeetingSetting,
  hashMeetingPassword,
  loadMeetingForManage,
  loadMeetingForView,
  mapMeeting,
  meetRoomLink,
  meetingInclude,
  notifyMeetingParticipants,
  revokeAllGuestTokens,
  userCanManageMeet,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional().nullable(),
    timezone: z.string().trim().max(64).optional(),
    meetingType: z.enum(MEETING_TYPES).optional(),
    locationType: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).optional(),
    joinUrl: z.string().trim().max(500).optional().nullable(),
    location: z.string().trim().max(500).optional().nullable(),
    password: z.string().min(4).max(64).optional().nullable(),
    clearPassword: z.boolean().optional(),
    waitingRoom: z.boolean().optional(),
    allowJoinBeforeHost: z.boolean().optional(),
    muteOnEntry: z.boolean().optional(),
    allowScreenShare: z.boolean().optional(),
    allowChat: z.boolean().optional(),
    allowRecording: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Tidak ada perubahan yang dikirim.' });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForView(ctx, params.id);
    const canManage = await userCanManageMeet(ctx);
    const manageable = canManageMeeting(meeting, ctx, canManage);
    return apiOk({
      ...mapMeeting(meeting),
      canManage: manageable,
      canEdit: manageable,
      isHost: meeting.hostId === ctx.userId,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat meeting.', 500);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    if (meeting.status === 'CANCELLED' || meeting.status === 'COMPLETED') {
      return apiErr('Meeting yang sudah dibatalkan atau selesai tidak dapat diubah.', 400);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = updateMeetingSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data perubahan tidak valid.', 400);
    }
    const d = parsed.data;
    const startsAt = d.startsAt !== undefined ? new Date(d.startsAt) : meeting.startsAt;
    const endsAt =
      d.endsAt !== undefined ? (d.endsAt ? new Date(d.endsAt) : null) : meeting.endsAt;
    if (Number.isNaN(startsAt.getTime())) return apiErr('Waktu mulai tidak valid.', 400);
    if (endsAt && Number.isNaN(endsAt.getTime())) return apiErr('Waktu selesai tidak valid.', 400);
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      return apiErr('Waktu selesai harus setelah waktu mulai.', 400);
    }
    if (endsAt) {
      const setting = await getMeetingSetting(ctx.organizationId);
      const durationMin = (endsAt.getTime() - startsAt.getTime()) / 60000;
      if (durationMin > setting.maxDurationMinutes) {
        return apiErr(
          `Durasi meeting maksimal ${setting.maxDurationMinutes} menit sesuai pengaturan kantor.`,
          400
        );
      }
    }
    const scheduleChanged =
      startsAt.getTime() !== new Date(meeting.startsAt).getTime() ||
      (endsAt?.getTime() ?? null) !== (meeting.endsAt ? new Date(meeting.endsAt).getTime() : null);

    const data: Record<string, unknown> = {};
    if (d.title !== undefined) data.title = d.title;
    if (d.description !== undefined) data.description = d.description;
    if (d.startsAt !== undefined) data.startsAt = startsAt;
    if (d.endsAt !== undefined) data.endsAt = endsAt;
    if (d.timezone !== undefined) data.timezone = d.timezone;
    if (d.meetingType !== undefined) data.meetingType = d.meetingType;
    if (d.locationType !== undefined) data.locationType = d.locationType;
    if (d.joinUrl !== undefined) data.joinUrl = d.joinUrl;
    if (d.location !== undefined) data.location = d.location;
    if (d.waitingRoom !== undefined) data.waitingRoom = d.waitingRoom;
    if (d.allowJoinBeforeHost !== undefined) data.allowJoinBeforeHost = d.allowJoinBeforeHost;
    if (d.muteOnEntry !== undefined) data.muteOnEntry = d.muteOnEntry;
    if (d.allowScreenShare !== undefined) data.allowScreenShare = d.allowScreenShare;
    if (d.allowChat !== undefined) data.allowChat = d.allowChat;
    if (d.allowRecording !== undefined) data.allowRecording = d.allowRecording;
    if (d.clearPassword) data.password = null;
    else if (d.password) data.password = await hashMeetingPassword(d.password);

    const updatedRow = await prisma.meeting.update({
      where: { id: meeting.id },
      data: data as never,
      include: meetingInclude,
    });
    const [updated] = await attachMeetingUsers([updatedRow]);

    if (scheduleChanged) {
      const when = startsAt.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      await notifyMeetingParticipants(
        { id: meeting.id, organizationId: ctx.organizationId, title: meeting.title },
        'MEET_RESCHEDULED',
        `Jadwal meeting diubah: ${updated.title}`,
        `Meeting "${updated.title}" dijadwalkan ulang menjadi ${when}. Gabung lewat tautan ini: ${meetRoomLink(meeting.id)}`
      ).catch(() => {});
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_UPDATE',
      module: 'MEET',
      description: `Mengubah meeting "${updated.title}" (${meeting.id})${scheduleChanged ? ' — jadwal diubah' : ''}`,
    });

    return apiOk(mapMeeting(updated as never));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah meeting.', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    if (meeting.status === 'CANCELLED') {
      return apiErr('Meeting sudah dibatalkan.', 400);
    }
    if (meeting.status === 'COMPLETED') {
      return apiErr('Meeting yang sudah selesai tidak dapat dibatalkan.', 400);
    }
    const cancelledRow = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'CANCELLED' },
      include: meetingInclude,
    });
    const [cancelled] = await attachMeetingUsers([cancelledRow]);
    await revokeAllGuestTokens(meeting.id).catch(() => {});
    await notifyMeetingParticipants(
      { id: meeting.id, organizationId: ctx.organizationId, title: meeting.title },
      'MEET_CANCELLED',
      `Meeting dibatalkan: ${meeting.title}`,
      `Meeting "${meeting.title}" telah dibatalkan oleh host.`
    ).catch(() => {});
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_CANCEL',
      module: 'MEET',
      description: `Membatalkan meeting "${meeting.title}" (${meeting.id})`,
    });
    return apiOk(mapMeeting(cancelled as never));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membatalkan meeting.', 500);
  }
}
