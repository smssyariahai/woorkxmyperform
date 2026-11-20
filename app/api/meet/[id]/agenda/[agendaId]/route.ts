// PATCH/DELETE /api/meet/[id]/agenda/[agendaId] — ubah/hapus item agenda.
// Tulis: host/MEET_MANAGE.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { loadMeetingForManage } from '@/lib/meet/server';

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

const updateAgendaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  order: z.number().int().min(0).max(1000).optional(),
  presenterId: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED']).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; agendaId: string } }
) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    const existing = await prisma.meetingAgendaItem.findFirst({
      where: { id: params.agendaId, meetingId: meeting.id },
    });
    if (!existing) return apiErr('Item agenda tidak ditemukan.', 404);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = updateAgendaSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data agenda tidak valid.', 400);
    }
    if (Object.keys(parsed.data).length === 0) {
      return apiErr('Tidak ada perubahan yang dikirim.', 400);
    }
    const d = parsed.data;
    if (d.presenterId) {
      const isParticipant = (meeting.participants ?? []).some(
        (p) => p.userId === d.presenterId || p.id === d.presenterId
      );
      if (!isParticipant) return apiErr('Presenter harus peserta meeting ini.', 400);
    }
    const updated = await prisma.meetingAgendaItem.update({
      where: { id: existing.id },
      data: parsed.data as never,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_AGENDA_UPDATE',
      module: 'MEET',
      description: `Mengubah agenda "${updated.title}" di meeting "${meeting.title}"`,
    });
    return apiOk(mapAgendaItem(updated));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah agenda.', 500);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; agendaId: string } }
) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const meeting = await loadMeetingForManage(ctx, params.id);
    const existing = await prisma.meetingAgendaItem.findFirst({
      where: { id: params.agendaId, meetingId: meeting.id },
    });
    if (!existing) return apiErr('Item agenda tidak ditemukan.', 404);
    await prisma.meetingAgendaItem.delete({ where: { id: existing.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_AGENDA_DELETE',
      module: 'MEET',
      description: `Menghapus agenda "${existing.title}" dari meeting "${meeting.title}"`,
    });
    return apiOk({ deleted: true, agendaId: existing.id });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus agenda.', 500);
  }
}
