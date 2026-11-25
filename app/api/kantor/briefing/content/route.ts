// GET /api/kantor/briefing/content — konten monitor ruang meeting + agenda
// Morning Briefing (data NYATA WOORK: Meeting, Announcement, CalendarEvent,
// TalTask, Agent). Tanpa login -> 401; tanpa modul kantor -> 403.
// Query opsional `date=YYYY-MM-DD` (default: hari ini, timezone perusahaan).
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getBriefingContent } from '@/lib/kantor/briefing';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const url = new URL(req.url);
    const date = url.searchParams.get('date') ?? undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('date harus format "YYYY-MM-DD".', 400);
    }
    const content = await getBriefingContent(ctx.organizationId, date);
    return apiOk(content);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat konten briefing.', 500);
  }
}
