// POST /api/meet/[id]/signal — signaling WOORK MEET (Fase 3).
//
// Client -> server. Transport sinyal WebRTC mesh (offer/answer/ICE) +
// presence + kontrol room, diteruskan ke peer lain lewat SSE di
// GET /api/meet/[id]/events. TIDAK ADA layanan media
// eksternal; TIDAK ADA persistensi di sini (chat persist tetap lewat
// POST /api/meet/[id]/chat yang sudah ada).
//
// Auth: sesi NextAuth (peserta/host/MEET_MANAGE) ATAU `guestToken` di
// body/query (validasi sama seperti GET /api/meet/guest/[token]).
// Rate limit: 120 POST/menit per peer (in-memory, pola E-Sign).

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/esign/rate-limit';
import {
  findMeetingOr404,
  revokeAllGuestTokens,
} from '@/lib/meet/server';
import {
  getPeer,
  getRoomState,
  heartbeatPeer,
  isWaitingPeer,
  joinRoom,
  leaveRoom,
  publish,
  publishRoomState,
  removeRoom,
  resolveSignalIdentity,
  type SignalIdentity,
} from '@/lib/meet/signaling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIGNAL_RATE_MAX = 120;
const SIGNAL_RATE_WINDOW_MS = 60_000;

const signalSchema = z.object({
  type: z.enum([
    'hello',
    'bye',
    'offer',
    'answer',
    'ice',
    'chat',
    'raise-hand',
    'lower-hand',
    'reaction',
    'mute-request',
    'mute-state',
    'remove',
    'admit',
    'end',
    'heartbeat',
  ]),
  /** peerId tujuan (wajib untuk offer/answer/ice/mute-request/remove/admit). */
  to: z.string().trim().max(200).optional().nullable(),
  /** Payload bebas per tipe (divalidasi secukupnya di bawah). */
  data: z.unknown().optional(),
  guestToken: z.string().trim().max(200).optional().nullable(),
});

type SignalBody = z.infer<typeof signalSchema>;

const HOST_ONLY = new Set(['mute-request', 'remove', 'admit', 'end']);
/** Hanya peserta AKTIF (bukan waiting) yang boleh mengirim ini. */
const ACTIVE_ONLY = new Set(['offer', 'answer', 'ice', 'chat', 'raise-hand', 'lower-hand', 'reaction', 'mute-state']);
/** Butuh `to` yang terisi. */
const NEEDS_TARGET = new Set(['offer', 'answer', 'ice', 'mute-request', 'remove', 'admit']);

function dataObj(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const meeting = await findMeetingOr404(params.id);
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = signalSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Sinyal tidak valid.', 400);
    }
    const d: SignalBody = parsed.data;
    const guestToken = d.guestToken ?? url.searchParams.get('guestToken');

    // Identitas + otorisasi dasar (401/403/404/410 seperti join/chat).
    const identity: SignalIdentity = await resolveSignalIdentity(meeting, guestToken);

    // Rate limit per peer (120/menit). Dijalankan SETELAH auth agar kunci
    // memakai peerId yang terverifikasi, bukan IP mentah.
    const rl = checkRateLimit(
      `meet:signal:${meeting.id}:${identity.peerId}`,
      SIGNAL_RATE_MAX,
      SIGNAL_RATE_WINDOW_MS
    );
    if (!rl.allowed) {
      return apiErr('Terlalu banyak sinyal. Coba lagi sebentar lagi.', 429);
    }

    const waiting = isWaitingPeer(meeting, identity);

    // --- hello / bye / heartbeat: boleh dari peer mana pun (termasuk waiting).
    if (d.type === 'hello') {
      const input = dataObj(d.data);
      const displayName =
        typeof input.displayName === 'string' && input.displayName.trim()
          ? input.displayName.trim().slice(0, 200)
          : identity.displayName;
      // Nama tampil diutamakan dari record MeetingParticipant (DB); nama
      // kiriman client hanya dipakai bila record tidak punya nama.
      const name =
        identity.displayName && identity.displayName !== 'Tamu'
          ? identity.displayName
          : displayName;
      const { peer, isNew } = joinRoom(meeting.id, {
        peerId: identity.peerId,
        displayName: name,
        role: identity.role,
        isHost: identity.isHost,
        isGuest: identity.isGuest,
        participantId: identity.participantId,
        userId: identity.userId,
        waiting,
      });
      // Peer waiting yang baru: host perlu melihat daftar waiting terbaru.
      if (peer.status === 'waiting') publishRoomState(meeting.id);
      return apiOk({
        peerId: peer.peerId,
        status: peer.status,
        isNew,
        waiting: peer.status === 'waiting',
        room: getRoomState(meeting.id),
      });
    }

    if (d.type === 'bye') {
      leaveRoom(meeting.id, identity.peerId);
      return apiOk({ ok: true, left: true });
    }

    if (d.type === 'heartbeat') {
      const known = heartbeatPeer(meeting.id, identity.peerId);
      if (!known) {
        // Peer belum hello (mis. restart proses): gabungkan lagi otomatis.
        joinRoom(meeting.id, {
          peerId: identity.peerId,
          displayName: identity.displayName,
          role: identity.role,
          isHost: identity.isHost,
          isGuest: identity.isGuest,
          participantId: identity.participantId,
          userId: identity.userId,
          waiting,
        });
      }
      return apiOk({ ok: true, room: getRoomState(meeting.id) });
    }

    // --- Aksi host saja.
    if (HOST_ONLY.has(d.type) && !identity.canManage) {
      return apiErr('Hanya host atau pengelola meeting yang dapat melakukan tindakan ini.', 403);
    }

    // --- Sinyal lain butuh peer terdaftar; bila belum hello, gabungkan
    // otomatis (client yang membuka SSE dulu lalu kirim sinyal langsung).
    let peer = getPeer(meeting.id, identity.peerId);
    if (!peer) {
      peer = joinRoom(meeting.id, {
        peerId: identity.peerId,
        displayName: identity.displayName,
        role: identity.role,
        isHost: identity.isHost,
        isGuest: identity.isGuest,
        participantId: identity.participantId,
        userId: identity.userId,
        waiting,
      }).peer;
    } else {
      heartbeatPeer(meeting.id, identity.peerId);
    }

    // Peer waiting hanya boleh hello/bye/heartbeat (sudah ditangani di
    // atas); sinyal media/chat/kontrol tidak diteruskan.
    if (peer.status === 'waiting' && ACTIVE_ONLY.has(d.type)) {
      return apiErr('Anda masih menunggu di waiting room.', 403);
    }

    const to = d.to?.trim() || null;
    if (NEEDS_TARGET.has(d.type) && !to) {
      return apiErr('Sinyal ini membutuhkan peer tujuan (`to`).', 400);
    }
    if (to && to === identity.peerId) {
      return apiErr('Tidak dapat mengirim sinyal ke diri sendiri.', 400);
    }

    const from = { from: identity.peerId, displayName: identity.displayName };

    switch (d.type) {
      case 'offer':
      case 'answer':
      case 'ice': {
        const target = getPeer(meeting.id, to as string);
        if (!target || target.status !== 'active') {
          return apiErr('Peer tujuan tidak ada di room.', 404);
        }
        publish(meeting.id, 'signal', { ...from, type: d.type, data: d.data ?? null }, { to: to as string });
        return apiOk({ ok: true, delivered: true });
      }

      case 'chat': {
        // Broadcast saja, TIDAK persist (persistensi lewat /api/meet/[id]/chat).
        if (!meeting.allowChat && !identity.isHost && identity.role !== 'CO_HOST') {
          return apiErr('Chat dimatikan untuk meeting ini.', 403);
        }
        const input = dataObj(d.data);
        const text = typeof input.body === 'string' ? input.body.trim() : '';
        if (!text || text.length > 4000) {
          return apiErr('Pesan chat harus 1–4000 karakter.', 400);
        }
        const recipient =
          typeof input.recipientId === 'string' && input.recipientId.trim()
            ? input.recipientId.trim()
            : null;
        const payload = {
          ...from,
          body: text,
          isPrivate: !!input.isPrivate,
          recipientId: recipient,
          at: new Date().toISOString(),
        };
        if (recipient) {
          const target = getPeer(meeting.id, recipient);
          if (!target || target.status !== 'active') {
            return apiErr('Penerima tidak ada di room.', 404);
          }
          publish(meeting.id, 'chat', payload, { to: recipient });
        } else {
          publish(meeting.id, 'chat', payload);
        }
        return apiOk({ ok: true, delivered: true });
      }

      case 'raise-hand':
        publish(meeting.id, 'raise-hand', { ...from, raised: true, at: new Date().toISOString() });
        return apiOk({ ok: true });

      case 'lower-hand':
        publish(meeting.id, 'raise-hand', { ...from, raised: false, at: new Date().toISOString() });
        return apiOk({ ok: true });

      case 'reaction': {
        const input = dataObj(d.data);
        const reaction =
          typeof input.emoji === 'string'
            ? input.emoji
            : typeof input.reaction === 'string'
              ? input.reaction
              : typeof input.kind === 'string'
                ? input.kind
                : '👍';
        if (!reaction || reaction.length > 32) {
          return apiErr('Reaksi tidak valid.', 400);
        }
        publish(meeting.id, 'reaction', { ...from, reaction, at: new Date().toISOString() });
        return apiOk({ ok: true });
      }

      case 'mute-request': {
        const target = getPeer(meeting.id, to as string);
        if (!target || target.status !== 'active') {
          return apiErr('Peer tujuan tidak ada di room.', 404);
        }
        publish(
          meeting.id,
          'room-control',
          { kind: 'mute-request', ...from, to: to as string, at: new Date().toISOString() },
          { to: to as string }
        );
        return apiOk({ ok: true, delivered: true });
      }

      case 'mute-state': {
        const input = dataObj(d.data);
        // Client mengirim { micOn, camOn } — teruskan keduanya apa adanya
        // (plus `muted` turunan) agar peer lain melihat status yang benar.
        const micOn = typeof input.micOn === 'boolean' ? input.micOn : undefined;
        const camOn = typeof input.camOn === 'boolean' ? input.camOn : undefined;
        publish(meeting.id, 'mute-state', {
          ...from,
          ...(micOn !== undefined ? { micOn } : {}),
          ...(camOn !== undefined ? { camOn } : {}),
          muted: input.muted === true || micOn === false,
          at: new Date().toISOString(),
        });
        return apiOk({ ok: true });
      }

      case 'remove': {
        const target = getPeer(meeting.id, to as string);
        if (!target) return apiErr('Peer tujuan tidak ada di room.', 404);
        // Beri tahu target dulu (sebelum dihapus dari registry) agar
        // client-nya bisa menampilkan "Anda dikeluarkan".
        publish(
          meeting.id,
          'room-control',
          { kind: 'removed', ...from, peerId: to as string, at: new Date().toISOString() },
          { to: to as string, includeWaiting: true }
        );
        leaveRoom(meeting.id, to as string);
        publishRoomState(meeting.id);
        if (identity.ctx) {
          await audit({
            organizationId: meeting.organizationId,
            userId: identity.ctx.userId,
            action: 'MEET_PEER_REMOVE',
            module: 'MEET',
            description: `${identity.ctx.name} mengeluarkan ${target.displayName} dari meeting "${meeting.title}" (${meeting.id})`,
          }).catch(() => {});
        }
        return apiOk({ ok: true, removed: to });
      }

      case 'admit': {
        const target = getPeer(meeting.id, to as string);
        if (!target) return apiErr('Peer tujuan tidak ada di room.', 404);
        if (target.status !== 'waiting') {
          return apiErr('Peer tersebut tidak sedang menunggu di waiting room.', 400);
        }
        target.status = 'active';
        target.lastSeen = Date.now();
        publish(
          meeting.id,
          'room-control',
          { kind: 'admitted', ...from, peerId: to as string, at: new Date().toISOString() },
          { to: to as string, includeWaiting: true }
        );
        publish(meeting.id, 'peer-joined', {
          peer: {
            peerId: target.peerId,
            displayName: target.displayName,
            role: target.role,
            isHost: target.isHost,
            isGuest: target.isGuest,
            status: 'active' as const,
            joinedAt: new Date(target.joinedAt).toISOString(),
          },
        });
        publishRoomState(meeting.id);
        if (identity.ctx) {
          await audit({
            organizationId: meeting.organizationId,
            userId: identity.ctx.userId,
            action: 'MEET_PEER_ADMIT',
            module: 'MEET',
            description: `${identity.ctx.name} mengizinkan ${target.displayName} masuk dari waiting room meeting "${meeting.title}" (${meeting.id})`,
          }).catch(() => {});
        }
        return apiOk({ ok: true, admitted: to });
      }

      case 'end': {
        const now = new Date();
        // Beri tahu semua peer (aktif + waiting) sebelum registry dibersihkan.
        publish(meeting.id, 'ended', { ...from, at: now.toISOString() }, { includeWaiting: true });
        publish(
          meeting.id,
          'room-control',
          { kind: 'ended', ...from, at: now.toISOString() },
          { includeWaiting: true }
        );
        removeRoom(meeting.id);
        if (meeting.status !== 'COMPLETED' && meeting.status !== 'CANCELLED') {
          await prisma.meeting
            .update({ where: { id: meeting.id }, data: { status: 'COMPLETED' } })
            .catch(() => {});
          await revokeAllGuestTokens(meeting.id).catch(() => {});
        }
        await audit({
          organizationId: meeting.organizationId,
          userId: identity.ctx?.userId ?? null,
          action: 'MEET_END',
          module: 'MEET',
          description: `${identity.displayName} mengakhiri meeting "${meeting.title}" (${meeting.id}) lewat signaling`,
        }).catch(() => {});
        return apiOk({ ok: true, ended: true });
      }

      default:
        return apiErr('Tipe sinyal tidak dikenal.', 400);
    }
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses sinyal meeting.', 500);
  }
}
