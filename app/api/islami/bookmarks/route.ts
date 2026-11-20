import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Bentuk item bookmark seperti yang dipakai halaman Al-Qur'an (porting MyPerform). */
function mapBookmark(b: any, ctx: { email: string; name: string }) {
  return {
    id: b.id as string,
    userId: b.userId as string,
    userEmail: ctx.email,
    userName: ctx.name,
    surahId: b.surahId as number,
    surahName: b.surahName as string,
    surahArabic: b.surahArabic ?? '',
    ayahNumber: b.ayahNumber as number,
    ayahArabic: b.ayahArabic ?? '',
    ayahTranslation: b.ayahTranslation ?? '',
    note: b.note ?? '',
    isPublic: !!b.isPublic,
    createdAt: (b.createdAt as Date).toISOString(),
    updatedAt: (b.updatedAt as Date).toISOString(),
  };
}

/** GET /api/islami/bookmarks — daftar bookmark milik user (atau publik bila ?public=true) */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(req.url);
    if (searchParams.get('public') === 'true') {
      const rows = await prisma.quranBookmark.findMany({
        where: { isPublic: true, note: { not: '' } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      return apiOk({ bookmarks: rows.map((b) => mapBookmark(b, ctx)) });
    }
    const rows = await prisma.quranBookmark.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      orderBy: [{ surahId: 'asc' }, { ayahNumber: 'asc' }],
    });
    return apiOk({ bookmarks: rows.map((b) => mapBookmark(b, ctx)) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat bookmark Al-Qur\u2019an.', 500);
  }
}

/** POST /api/islami/bookmarks — simpan/update bookmark (upsert per user+surah+ayat) */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const surahId = Number(b.surahId);
    const ayahNumber = Number(b.ayahNumber);
    if (!Number.isFinite(surahId) || !Number.isFinite(ayahNumber) || !b.surahName) {
      return apiErr('Data bookmark tidak lengkap (surahId, ayahNumber, surahName wajib).', 400);
    }
    const data = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      surahId,
      surahName: String(b.surahName),
      surahArabic: String(b.surahArabic ?? ''),
      ayahNumber,
      ayahArabic: String(b.ayahArabic ?? ''),
      ayahTranslation: String(b.ayahTranslation ?? ''),
      note: String(b.note ?? ''),
      isPublic: !!b.isPublic,
    };
    const existing = await prisma.quranBookmark.findFirst({
      where: { userId: ctx.userId, surahId, ayahNumber },
    });
    const saved = existing
      ? await prisma.quranBookmark.update({ where: { id: existing.id }, data })
      : await prisma.quranBookmark.create({ data });
    return apiOk({ id: saved.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan bookmark.', 500);
  }
}
