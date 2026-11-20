// GET/POST /api/meet/[id]/notes — notulen meeting.
// Baca: peserta/host/MEET_MANAGE. Tulis (POST): host/MEET_MANAGE;
// authorId = user login.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { loadMeetingForManage, loadMeetingForView } from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

function mapNote(n: {
  id: string;
  meetingId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author?: { name: string } | null;
}) {
  return {
    id: n.id,
    meetingId: n.meetingId,
    authorId: n.authorId,
    authorName: n.author?.name ?? 'Pengguna',
    content: n.content,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForView(ctx, params.id);
    const rows = await prisma.meetingNote.findMany({
      where: { meetingId: meeting.id },
      orderBy: { createdAt: 'asc' },
    });
    // MeetingNote tidak punya relasi author — ambil nama penulis terpisah.
    const authorIds = [...new Set(rows.map((r) => r.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(authors.map((a) => [a.id, a.name]));
    return apiOk({
      notes: rows.map((r) =>
        mapNote({ ...r, author: { name: nameById.get(r.authorId) ?? 'Pengguna' } })
      ),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat notulen.', 500);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = z
      .object({
        content: z.string().trim().min(1, 'Isi notulen wajib diisi.').max(20000),
      })
      .safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data notulen tidak valid.', 400);
    }
    const created = await prisma.meetingNote.create({
      data: {
        meetingId: meeting.id,
        authorId: ctx.userId,
        content: parsed.data.content,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_NOTE_ADD',
      module: 'MEET',
      description: `Menambah notulen ke meeting "${meeting.title}"`,
    });
    return apiOk(
      mapNote({ ...created, author: { name: ctx.name } }),
      201
    );
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan notulen.', 500);
  }
}
