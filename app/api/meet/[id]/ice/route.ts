// GET /api/meet/[id]/ice — konfigurasi ICE server (STUN + TURN) untuk
// satu meeting. Dipakai client saat join agar RTCPeerConnection memakai
// server yang dikonfigurasi admin, bukan STUN hardcode.
//
// Auth: sama seperti signaling (GET /api/meet/[id]/events) — sesi
// NextAuth (peserta/host/MEET_MANAGE) ATAU `?guestToken=` yang valid.
// Tanpa keduanya -> 401 (resolveSignalIdentity); bukan peserta -> 403;
// meeting tidak ada -> 404; dibatalkan/selesai -> 410.
//
// Respons: { iceServers: RTCIceServer[], turnConfigured: boolean }.
// Bila env MEET_TURN_* kosong, hanya STUN Google yang dikembalikan
// (perilaku lama). Kredensial TURN TIDAK PERNAH ditulis ke log.

import { apiOk, apiErr } from '@/lib/utils';
import { findMeetingOr404 } from '@/lib/meet/server';
import { getMeetIceServers } from '@/lib/meet/ice';
import { resolveSignalIdentity } from '@/lib/meet/signaling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const meeting = await findMeetingOr404(params.id);
    const url = new URL(req.url);
    const guestToken = url.searchParams.get('guestToken');
    // Guard identitas saja — hasilnya tidak dipakai selain otorisasi.
    await resolveSignalIdentity(meeting, guestToken);
    return apiOk(getMeetIceServers());
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat konfigurasi ICE meeting.', 500);
  }
}
