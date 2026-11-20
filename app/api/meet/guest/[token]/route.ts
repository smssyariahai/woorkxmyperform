// GET /api/meet/guest/[token] — lookup token tamu PUBLIK (tanpa login).
// Rate limit 30/menit/IP (pola lookup E-Sign), 404 generik bila tak dikenal,
// 410 bila kedaluwarsa/dicabut. Respons hanya field aman: info meeting +
// nama tamu + scope. TIDAK mengembalikan daftar peserta lain atau email karyawan.

import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { checkRateLimit } from '@/lib/esign/rate-limit';
import { getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const LOOKUP_MAX = 30;
const LOOKUP_WINDOW_MS = 60_000;

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const rl = checkRateLimit(
      `meet:guest-lookup-ip:${getClientIp(req)}`,
      LOOKUP_MAX,
      LOOKUP_WINDOW_MS
    );
    if (!rl.allowed) {
      return apiErr('Terlalu banyak percobaan. Coba lagi dalam satu menit.', 429);
    }
    const row = await prisma.meetingGuestToken.findUnique({
      where: { accessToken: params.token },
      include: {
        participant: { select: { guestName: true } },
        meeting: {
          select: {
            id: true,
            title: true,
            description: true,
            startsAt: true,
            endsAt: true,
            status: true,
            waitingRoom: true,
            host: { select: { name: true } },
          },
        },
      },
    });
    if (!row || !row.meeting) {
      return apiErr('Tautan undangan tidak valid atau sudah tidak berlaku.', 404);
    }
    const now = new Date();
    if (
      row.revokedAt ||
      !row.tokenExpiresAt ||
      row.tokenExpiresAt.getTime() <= now.getTime() ||
      row.meeting.status === 'CANCELLED' ||
      row.meeting.status === 'COMPLETED'
    ) {
      return apiErr('Tautan undangan sudah kedaluwarsa atau dicabut.', 410);
    }
    return apiOk({
      meeting: {
        id: row.meeting.id,
        title: row.meeting.title,
        description: row.meeting.description,
        startsAt: row.meeting.startsAt.toISOString(),
        endsAt: row.meeting.endsAt?.toISOString() ?? null,
        status: row.meeting.status,
        hostName: row.meeting.host?.name ?? '—',
        waitingRoom: row.meeting.waitingRoom,
      },
      guestName: row.participant.guestName,
      scope: row.scope,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memeriksa tautan undangan.', 500);
  }
}
