// GET /api/meet/[id]/chat — daftar pesan chat meeting (peserta/host/MEET_MANAGE,
// atau tamu via ?guestToken=).
// POST — kirim pesan (body 1–4000 karakter, pola chat existing).
// Sender dari sesi user login, atau tamu via guestToken di body + senderName.
// TIDAK ada transport real-time di Fase 2 (client polling bila perlu).

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  findMeetingOr404,
  findMyParticipant,
  loadMeetingForView,
  userCanManageMeet,
  verifyGuestToken,
} from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url);
    const guestToken = url.searchParams.get('guestToken') || undefined;
    // Tamu memakai guestToken (tanpa login); peserta login seperti biasa.
    // INTEGRASI Fase 3: sebelumnya GET hanya requireAuth() sehingga riwayat
    // chat tamu selalu kosong — padahal POST sudah mendukung guestToken.
    let meeting: { id: string };
    try {
      const ctx = await requireAuth();
      meeting = await loadMeetingForView(ctx, params.id);
    } catch (e) {
      if (!guestToken) throw e;
      const verified = await verifyGuestToken(guestToken, params.id);
      meeting = verified.meeting;
    }
    const limitRaw = Number(url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const rows = await prisma.meetingChatMessage.findMany({
      where: { meetingId: meeting.id },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return apiOk({
      messages: rows.map((m) => ({
        id: m.id,
        meetingId: m.meetingId,
        senderId: m.senderId,
        senderName: m.senderName,
        body: m.body,
        isPrivate: m.isPrivate,
        recipientId: m.recipientId,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat chat meeting.', 500);
  }
}

const sendChatSchema = z.object({
  body: z.string().trim().min(1, 'Pesan tidak boleh kosong.').max(4000, 'Pesan maksimal 4000 karakter.'),
  isPrivate: z.boolean().optional(),
  recipientId: z.string().optional().nullable(),
  guestToken: z.string().trim().max(200).optional().nullable(),
  senderName: z.string().trim().max(200).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const meeting = await findMeetingOr404(params.id);
    if (meeting.status === 'CANCELLED' || meeting.status === 'COMPLETED') {
      return apiErr('Chat meeting yang sudah dibatalkan atau selesai tidak dapat digunakan.', 400);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = sendChatSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Pesan tidak valid.', 400);
    }
    const d = parsed.data;

    let senderId: string | null = null;
    let senderName: string;
    let isHostOrCoHost = false;

    if (d.guestToken) {
      const verified = await verifyGuestToken(d.guestToken, meeting.id);
      senderName = d.senderName?.trim() || verified.participant.guestName || 'Tamu';
    } else {
      const session = await auth();
      const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
      if (!sessionUserId) return apiErr('Belum login. Silakan masuk kembali.', 401);
      const ctx = await requireAuth({ organizationId: meeting.organizationId });
      const canManage = await userCanManageMeet(ctx);
      const mine = findMyParticipant(meeting, ctx.userId);
      const isHost = meeting.hostId === ctx.userId;
      if (!mine && !isHost && !canManage) {
        return apiErr('Anda tidak diundang ke meeting ini.', 403);
      }
      senderId = ctx.userId;
      senderName = ctx.name;
      isHostOrCoHost = isHost || mine?.role === 'CO_HOST';
    }

    // Bila chat dimatikan di pengaturan meeting, hanya host/co-host yang boleh bicara.
    if (!meeting.allowChat && !isHostOrCoHost) {
      return apiErr('Chat dimatikan untuk meeting ini.', 403);
    }

    // Pesan privat harus ditujukan ke peserta meeting.
    let recipientId: string | null = null;
    if (d.isPrivate) {
      recipientId = d.recipientId?.trim() || null;
      if (!recipientId) return apiErr('Pesan privat membutuhkan recipientId.', 400);
      const target = (meeting.participants ?? []).find(
        (p) => p.userId === recipientId || p.id === recipientId
      );
      if (!target) return apiErr('Penerima bukan peserta meeting ini.', 400);
      recipientId = target.userId ?? target.id;
    }

    const saved = await prisma.meetingChatMessage.create({
      data: {
        meetingId: meeting.id,
        senderId,
        senderName,
        body: d.body,
        isPrivate: d.isPrivate ?? false,
        recipientId,
      },
    });
    return apiOk(
      {
        id: saved.id,
        meetingId: saved.meetingId,
        senderId: saved.senderId,
        senderName: saved.senderName,
        body: saved.body,
        isPrivate: saved.isPrivate,
        recipientId: saved.recipientId,
        createdAt: saved.createdAt.toISOString(),
      },
      201
    );
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim pesan.', 500);
  }
}
