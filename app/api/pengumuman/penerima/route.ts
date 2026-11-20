import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getActiveMembers } from '@/lib/pengumuman/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pengumuman/penerima — hitung + pratinjau penerima server-side
 * (dipakai tombol kirim / form target tertarget).
 * Query: ?mode=all (default) | targeted &emails=a@x.id,b@y.id
 * Respons: { total, users: [{ id, name, email }] } — maks 100 pertama.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'all';
    const members = await getActiveMembers(ctx.organizationId);
    let users = members;
    if (mode === 'targeted') {
      const wanted = new Set(
        (url.searchParams.get('emails') || '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      );
      users = members.filter((m) => wanted.has(m.email.toLowerCase()));
    }
    return apiOk({ total: users.length, users: users.slice(0, 100) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghitung penerima.', 500);
  }
}
