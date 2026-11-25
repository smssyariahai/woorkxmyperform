// POST /api/meet/[id]/participants — tambah peserta (host/MEET_MANAGE).
//   Body: { userIds: string[] } dan/atau { guests: [{ name, email?, phone? }] }.
// DELETE — hapus peserta (body { participantId }); token tamunya ikut dicabut.
// PATCH — ubah peran peserta (body { participantId, role }); hanya host.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import {
  PARTICIPANT_ROLES,
  attachParticipantUsers,
  createGuestToken,
  getMeetingSetting,
  inviteNotification,
  loadMeetingForManage,
  mapParticipant,
  notifyMeetingParticipants,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

const addParticipantsSchema = z.object({
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
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    if (meeting.status === 'CANCELLED' || meeting.status === 'COMPLETED') {
      return apiErr('Peserta tidak dapat ditambahkan ke meeting yang sudah dibatalkan atau selesai.', 400);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = addParticipantsSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data peserta tidak valid.', 400);
    }
    const setting = await getMeetingSetting(ctx.organizationId);
    const userIds = [...new Set(parsed.data.userIds ?? [])];
    const guests = parsed.data.guests ?? [];
    if (userIds.length === 0 && guests.length === 0) {
      return apiErr('Tidak ada peserta yang ditambahkan.', 400);
    }
    if (guests.length > 0 && !setting.allowGuest) {
      return apiErr('Tamu eksternal tidak diizinkan sesuai pengaturan kantor.', 400);
    }
    const currentCount = (meeting.participants ?? []).length;
    if (currentCount + userIds.length + guests.length > setting.maxParticipants) {
      return apiErr(
        `Jumlah peserta maksimal ${setting.maxParticipants} orang sesuai pengaturan kantor.`,
        400
      );
    }

    // Lewati user yang sudah menjadi peserta (idempotent).
    const existingUserIds = new Set(
      (meeting.participants ?? []).map((p) => p.userId).filter(Boolean) as string[]
    );
    const newUserIds = userIds.filter((id) => id !== meeting.hostId && !existingUserIds.has(id));

    let memberships: Array<{
      userId: string;
      jobTitle: string | null;
      department: { name: string } | null;
      employment: { position: string | null; branch: string | null } | null;
    }> = [];
    if (newUserIds.length > 0) {
      memberships = await prisma.membership.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: newUserIds }, status: 'ACTIVE' },
        select: {
          userId: true,
          jobTitle: true,
          department: { select: { name: true } },
          employment: { select: { position: true, branch: true } },
        },
      });
      if (memberships.length !== newUserIds.length) {
        return apiErr('Sebagian peserta bukan anggota aktif kantor ini.', 400);
      }
    }

    const created = await prisma.$transaction(
      [
        ...memberships.map((m) =>
          prisma.meetingParticipant.create({
            data: {
              meetingId: meeting.id,
              userId: m.userId,
              role: 'PARTICIPANT',
              status: 'INVITED',
              snapshotPosition: m.jobTitle ?? m.employment?.position ?? null,
              snapshotDepartment: m.department?.name ?? null,
              snapshotBranch: m.employment?.branch ?? null,
            },
            // MeetingParticipant TIDAK punya relasi `user` di tenant client
            // — digabung belakangan via `attachParticipantUsers`.
            include: {
              guestToken: {
                select: { accessToken: true, tokenExpiresAt: true, revokedAt: true, scope: true },
              },
            },
          })
        ),
        ...guests.map((g) =>
          prisma.meetingParticipant.create({
            data: {
              meetingId: meeting.id,
              userId: null,
              guestName: g.name,
              guestEmail: g.email ?? null,
              guestPhone: g.phone ?? null,
              role: 'PARTICIPANT',
              status: 'INVITED',
            },
            include: {
              guestToken: {
                select: { accessToken: true, tokenExpiresAt: true, revokedAt: true, scope: true },
              },
            },
          })
        ),
      ].map((op) => op as never)
    );

    // Token tamu untuk peserta eksternal yang baru.
    const tokenByParticipant = new Map<string, string>();
    for (const p of created as Array<{ id: string; userId: string | null }>) {
      if (!p.userId) {
        const t = await createGuestToken(p.id, meeting.id).catch(() => null);
        if (t) tokenByParticipant.set(p.id, t.accessToken);
      }
    }

    // Fan-out MEET_INVITE ke peserta internal yang baru.
    const newInternalIds = memberships.map((m) => m.userId);
    if (newInternalIds.length > 0) {
      const invite = inviteNotification(meeting, null);
      await notifyMeetingParticipants(
        { id: meeting.id, organizationId: ctx.organizationId, title: meeting.title },
        'MEET_INVITE',
        invite.title,
        invite.body,
        { onlyUserIds: newInternalIds }
      ).catch(() => {});
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_PARTICIPANT_ADD',
      module: 'MEET',
      description: `Menambah ${created.length} peserta ke meeting "${meeting.title}" (${meeting.id})`,
    });

    const mapped = (await attachParticipantUsers(created as Array<{ userId: string | null }>))
      .map((p) => {
        const row = p as Parameters<typeof mapParticipant>[0];
        const withToken = tokenByParticipant.has(row.id)
          ? { ...row, guestToken: { accessToken: tokenByParticipant.get(row.id)!, tokenExpiresAt: null, revokedAt: null, scope: 'JOIN' } }
          : row;
        return mapParticipant(withToken, meeting.id);
      });
    return apiOk({ participants: mapped, added: mapped.length }, 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah peserta.', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const participantId = String(body.participantId ?? '').trim();
    if (!participantId) return apiErr('participantId wajib diisi.', 400);
    const participant = (meeting.participants ?? []).find((p) => p.id === participantId);
    if (!participant) return apiErr('Peserta tidak ditemukan di meeting ini.', 404);
    if (participant.userId === meeting.hostId || participant.role === 'HOST') {
      return apiErr('Host meeting tidak dapat dihapus dari peserta.', 400);
    }
    // Cabut token tamu dulu (bila ada), lalu hapus baris peserta.
    await prisma.meetingGuestToken
      .updateMany({ where: { participantId }, data: { revokedAt: new Date() } })
      .catch(() => {});
    await prisma.meetingParticipant.delete({ where: { id: participantId } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_PARTICIPANT_REMOVE',
      module: 'MEET',
      description: `Menghapus peserta dari meeting "${meeting.title}" (${meeting.id})`,
    });
    return apiOk({ removed: true, participantId });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus peserta.', 500);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    // Ubah peran hanya boleh dilakukan host (bukan co-host / MEET_MANAGE).
    if (meeting.hostId !== ctx.userId && !ctx.isSuperAdmin) {
      return apiErr('Hanya host meeting yang dapat mengubah peran peserta.', 403);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = z
      .object({
        participantId: z.string().min(1),
        role: z.enum(PARTICIPANT_ROLES),
      })
      .safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data peran tidak valid.', 400);
    }
    const participant = (meeting.participants ?? []).find((p) => p.id === parsed.data.participantId);
    if (!participant) return apiErr('Peserta tidak ditemukan di meeting ini.', 404);
    if (participant.userId === meeting.hostId) {
      return apiErr('Peran host tidak dapat diubah.', 400);
    }
    if (parsed.data.role === 'HOST') {
      return apiErr('Peran HOST hanya dimiliki pembuat meeting.', 400);
    }
    const updatedRow = await prisma.meetingParticipant.update({
      where: { id: participant.id },
      data: { role: parsed.data.role },
      include: {
        guestToken: {
          select: { accessToken: true, tokenExpiresAt: true, revokedAt: true, scope: true },
        },
      },
    });
    const [updated] = await attachParticipantUsers([updatedRow]);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_PARTICIPANT_ROLE',
      module: 'MEET',
      description: `Mengubah peran peserta di meeting "${meeting.title}" menjadi ${parsed.data.role}`,
    });
    return apiOk(mapParticipant(updated as never, meeting.id));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah peran peserta.', 500);
  }
}
