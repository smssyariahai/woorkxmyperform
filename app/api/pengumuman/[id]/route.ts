import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  attachAuthor,
  mapAnnouncement,
  parseAnnouncementInput,
} from '@/lib/pengumuman/server';

export const dynamic = 'force-dynamic';

/** GET /api/pengumuman/[id] — satu pengumuman */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.announcement.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Pengumuman tidak ditemukan.', 404);
    return apiOk({ announcement: mapAnnouncement(await attachAuthor(row)) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengumuman.', 500);
  }
}

/** PATCH /api/pengumuman/[id] — ubah draft / jadwal (published tidak bisa diubah) */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.announcement.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Pengumuman tidak ditemukan.', 404);
    if (row.status === 'published') {
      return apiErr('Pengumuman yang sudah terkirim tidak bisa diubah.', 400);
    }
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    // Validasi target tertarget butuh target lama bila body tidak membawa target.
    const effectiveBody = { ...body };
    if (
      effectiveBody.targetMode === 'targeted' &&
      effectiveBody.target === undefined
    ) {
      effectiveBody.target = row.target as Record<string, unknown>;
    }
    const parsed = parseAnnouncementInput(effectiveBody, true);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    const update: Record<string, unknown> = {};
    if (d.title !== undefined) update.title = d.title;
    if (d.summary !== undefined) update.summary = d.summary;
    if (d.content !== undefined) {
      update.content = d.content;
      // Bila ringkasan tidak diisi eksplisit, turunkan lagi dari isi baru.
      if (d.summary === undefined && d.content) {
        update.summary = d.content.slice(0, 160);
      }
    }
    if (d.imageUrl !== undefined) update.imageUrl = d.imageUrl;
    if (d.category !== undefined) update.category = d.category;
    if (d.priority !== undefined) update.priority = d.priority;
    if (d.targetMode !== undefined) {
      update.targetMode = d.targetMode;
      update.target =
        d.targetMode === 'targeted'
          ? { userEmails: (d.target as any)?.userEmails ?? [] }
          : {};
    } else if (d.target !== undefined) {
      update.target = d.target;
    }
    if (d.filters !== undefined) update.filters = d.filters;
    if (d.channels !== undefined) update.channels = d.channels;
    if (d.recipientEmails !== undefined) {
      update.recipientEmails = d.recipientEmails;
    }
    if (d.scheduledAt !== undefined) {
      update.scheduledAt = d.scheduledAt;
      update.status = d.scheduledAt ? 'scheduled' : 'draft';
    } else if (d.scheduledAtCleared) {
      update.scheduledAt = null;
      update.status = 'draft';
    }
    const updated = await prisma.announcement.update({
      where: { id: row.id },
      data: update as never,
    });
    return apiOk({ announcement: mapAnnouncement(await attachAuthor(updated)) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah pengumuman.', 500);
  }
}

/** DELETE /api/pengumuman/[id] — hapus draft / jadwal (published tidak bisa dihapus) */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.announcement.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Pengumuman tidak ditemukan.', 404);
    if (row.status === 'published') {
      return apiErr('Pengumuman yang sudah terkirim tidak bisa dihapus.', 400);
    }
    await prisma.announcement.delete({ where: { id: row.id } });
    return apiOk({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus pengumuman.', 500);
  }
}
