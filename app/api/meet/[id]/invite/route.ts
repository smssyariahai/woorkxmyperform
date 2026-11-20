// POST /api/meet/[id]/invite — kirim ulang undangan ke peserta terpilih
// (host/MEET_MANAGE). Pastikan token tamu ada/valid, fan-out MEET_INVITE,
// kembalikan link undangan per peserta.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import {
  ensureGuestToken,
  inviteNotification,
  loadMeetingForManage,
  notifyMeetingParticipants,
  participantDisplayName,
  participantInviteLink,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    if (meeting.status === 'CANCELLED' || meeting.status === 'COMPLETED') {
      return apiErr('Undangan tidak dapat dikirim untuk meeting yang sudah dibatalkan atau selesai.', 400);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = z
      .object({ participantIds: z.array(z.string()).min(1, 'Pilih minimal satu peserta.').max(200) })
      .safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data undangan tidak valid.', 400);
    }
    const selected = (meeting.participants ?? []).filter((p) =>
      parsed.data.participantIds.includes(p.id)
    );
    if (selected.length === 0) return apiErr('Tidak ada peserta yang dipilih.', 400);

    // Pastikan setiap tamu punya token yang masih berlaku.
    const tokenByParticipant = new Map<string, string>();
    for (const p of selected) {
      if (!p.userId) {
        const t = await ensureGuestToken(p.id, meeting.id).catch(() => null);
        if (t) tokenByParticipant.set(p.id, t.accessToken);
      }
    }

    // Fan-out MEET_INVITE (idempotent: peserta yang sudah menerima undangan
    // dengan isi sama tidak mendapat baris ganda). Link tamu disisipkan
    // per peserta internal? Peserta internal memakai link room.
    const internalIds = selected.filter((p) => p.userId).map((p) => p.userId as string);
    if (internalIds.length > 0) {
      const invite = inviteNotification(meeting, null);
      await notifyMeetingParticipants(
        { id: meeting.id, organizationId: ctx.organizationId, title: meeting.title },
        'MEET_INVITE',
        invite.title,
        invite.body,
        { onlyUserIds: internalIds }
      ).catch(() => {});
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_INVITE_RESEND',
      module: 'MEET',
      description: `Mengirim ulang undangan meeting "${meeting.title}" ke ${selected.length} peserta`,
    });

    const invitations = selected.map((p) => {
      const token = tokenByParticipant.get(p.id) ?? p.guestToken?.accessToken ?? null;
      return {
        participantId: p.id,
        name: participantDisplayName(p),
        email: p.user?.email ?? p.guestEmail,
        isGuest: !p.userId,
        link: participantInviteLink(meeting.id, { ...p, guestToken: token ? { accessToken: token, tokenExpiresAt: null, revokedAt: null, scope: 'JOIN' } : p.guestToken ?? null }),
      };
    });
    return apiOk({ invitations, sent: invitations.length });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim undangan.', 500);
  }
}
