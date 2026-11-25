import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  attachAuthor,
  attachAuthors,
  mapAnnouncement,
  parseAnnouncementInput,
} from '@/lib/pengumuman/server';

export const dynamic = 'force-dynamic';

/** GET /api/pengumuman — daftar pengumuman organisasi (terbaru dulu) */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const q = (url.searchParams.get('q') || '').trim();
    const limitRaw = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 50;
    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
    };
    if (status && ['draft', 'scheduled', 'published'].includes(status)) {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await prisma.announcement.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const withAuthors = await attachAuthors(rows);
    return apiOk({ announcements: withAuthors.map(mapAnnouncement) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengumuman.', 500);
  }
}

/** POST /api/pengumuman — buat draft / jadwal baru (tidak langsung mengirim) */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const parsed = parseAnnouncementInput(body, false);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    const targetMode = d.targetMode ?? 'all';
    const target: any =
      targetMode === 'targeted'
        ? { userEmails: (d.target as any)?.userEmails ?? [] }
        : {};
    const summary =
      d.summary ?? (d.content ? d.content.slice(0, 160) : '');
    const saved = await prisma.announcement.create({
      data: {
        organizationId: ctx.organizationId,
        authorId: ctx.userId,
        title: d.title!,
        summary,
        content: d.content ?? '',
        imageUrl: d.imageUrl ?? null,
        category: d.category ?? 'announcement',
        priority: d.priority ?? 'normal',
        targetMode,
        target,
        filters: d.filters ?? {},
        channels: d.channels ?? { app: true, email: false },
        recipientEmails: d.recipientEmails ?? [],
        status: d.scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: d.scheduledAt ?? null,
      },
    });
    return apiOk(mapAnnouncement(await attachAuthor(saved)), 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat pengumuman.', 500);
  }
}
