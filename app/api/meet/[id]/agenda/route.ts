// GET/POST /api/meet/[id]/agenda — daftar + tambah item agenda.
// Baca: peserta/host/MEET_MANAGE. Tulis: host/MEET_MANAGE.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { loadMeetingForManage, loadMeetingForView } from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

function mapAgendaItem(a: {
  id: string;
  meetingId: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  order: number;
  presenterId: string | null;
  status: string;
}) {
  return { ...a };
}

const agendaSchema = z.object({
  title: z.string().trim().min(1, 'Judul agenda wajib diisi.').max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  order: z.number().int().min(0).max(1000).optional(),
  presenterId: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED']).optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForView(ctx, params.id);
    const rows = await prisma.meetingAgendaItem.findMany({
      where: { meetingId: meeting.id },
      // Model MeetingAgendaItem tidak punya createdAt — urut hanya by order.
      orderBy: { order: 'asc' },
    });
    return apiOk({ agenda: rows.map(mapAgendaItem) });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat agenda.', 500);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = agendaSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data agenda tidak valid.', 400);
    }
    const d = parsed.data;
    if (d.presenterId) {
      const isParticipant = (meeting.participants ?? []).some(
        (p) => p.userId === d.presenterId || p.id === d.presenterId
      );
      if (!isParticipant) return apiErr('Presenter harus peserta meeting ini.', 400);
    }
    const order =
      d.order ??
      ((await prisma.meetingAgendaItem.count({ where: { meetingId: meeting.id } })) as number);
    const created = await prisma.meetingAgendaItem.create({
      data: {
        meetingId: meeting.id,
        title: d.title,
        description: d.description ?? null,
        durationMinutes: d.durationMinutes ?? null,
        order,
        presenterId: d.presenterId ?? null,
        status: d.status ?? 'PENDING',
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_AGENDA_ADD',
      module: 'MEET',
      description: `Menambah agenda "${d.title}" ke meeting "${meeting.title}"`,
    });
    return apiOk(mapAgendaItem(created), 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah agenda.', 500);
  }
}
