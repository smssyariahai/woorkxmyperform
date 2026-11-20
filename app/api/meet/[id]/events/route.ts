// GET /api/meet/[id]/events — SSE signaling WOORK MEET (Fase 3).
//
// Server -> client. Pola yang ditiru: app/api/realtime/route.ts
// (ReadableStream, heartbeat `: ping` tiap 25 detik, `force-dynamic`,
// `runtime='nodejs'`, subscribe/unsubscribe).
//
// Auth: sesi NextAuth (peserta/host/MEET_MANAGE) ATAU `?guestToken=`
// (validasi sama seperti GET /api/meet/guest/[token]).
// Event SSE (`event:` + `data:` JSON):
//   room-state   — daftar peer aktif + waiting (dikirim segera setelah subscribe)
//   peer-joined / peer-left
//   signal       — { from, type: 'offer'|'answer'|'ice', data } (hanya ke `to`)
//   chat         — broadcast, TIDAK persist
//   raise-hand   — { from, raised: true|false }
//   reaction
//   mute-state   — { from, muted } (status mic peer; dikirim client via POST signal)
//   room-control — { kind: 'mute-request'|'removed'|'admitted'|'ended', ... }
//   ended        — meeting diakhiri host
//
// Membuka SSE = bergabung presence (peer didaftarkan lewat `joinRoom`
// dengan status aktif/waiting sesuai waiting room). Putusnya SSE tidak
// langsung menghapus peer: sink dilepas + lastSeen disentuh, peer diberi
// masa tenggang ~75 detik untuk reconnect (EventSource reconnect
// otomatis) sebelum sapu berkala menganggapnya pergi (`peer-left`).

import { apiErr } from '@/lib/utils';
import { getClientIp } from '@/lib/audit';
import { checkRateLimit } from '@/lib/esign/rate-limit';
import { findMeetingOr404 } from '@/lib/meet/server';
import {
  attachPeer,
  getRoomState,
  isWaitingPeer,
  joinRoom,
  resolveSignalIdentity,
  type SignalIdentity,
} from '@/lib/meet/signaling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SSE per IP: long-lived, reconnect otomatis — batas longgar (60/menit/IP)
// supaya reconnect yang sah tidak dimatikan.
const EVENTS_RATE_MAX = 60;
const EVENTS_RATE_WINDOW_MS = 60_000;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const rl = checkRateLimit(
      `meet:events-ip:${getClientIp(req)}`,
      EVENTS_RATE_MAX,
      EVENTS_RATE_WINDOW_MS
    );
    if (!rl.allowed) {
      return apiErr('Terlalu banyak koneksi. Coba lagi dalam satu menit.', 429);
    }

    const meeting = await findMeetingOr404(params.id);
    const url = new URL(req.url);
    const guestToken = url.searchParams.get('guestToken');
    const identity: SignalIdentity = await resolveSignalIdentity(meeting, guestToken);

    // Gabung presence (idempotent — hello ulang via POST signal tidak ganda).
    const waiting = isWaitingPeer(meeting, identity);
    const { peer } = joinRoom(meeting.id, {
      peerId: identity.peerId,
      displayName: identity.displayName,
      role: identity.role,
      isHost: identity.isHost,
      isGuest: identity.isGuest,
      participantId: identity.participantId,
      userId: identity.userId,
      waiting,
    });

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let detach: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const enqueue = (chunk: string) => {
          try {
            controller.enqueue(new TextEncoder().encode(chunk));
          } catch {
            /* koneksi sudah tutup */
          }
        };
        detach = attachPeer(meeting.id, peer.peerId, enqueue);
        // room-state segera setelah subscribe (kontrak).
        enqueue(`event: room-state\ndata: ${JSON.stringify(getRoomState(meeting.id))}\n\n`);
        // Heartbeat tiap 25 dtk agar proxy/tunnel tidak menutup koneksi idle.
        heartbeat = setInterval(() => enqueue(`: ping\n\n`), 25000);
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
        // Lepas sink saja — peer tetap di registry dengan masa tenggang
        // ~75 detik (lihat attachPeer); sapu berkala yang mengirim peer-left
        // bila client tidak reconnect.
        if (detach) detach();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuka stream meeting.', 500);
  }
}
