// GET /api/koperasi/check-nik?nik= — porting
// GET /api/pg/koperasi/anggota/check-nik backup (src/server/server.ts),
// org-scoped (backup tidak mengenal organisasi; WOORK memfilter
// organizationId dari sesi).
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const nik = (new URL(req.url).searchParams.get('nik') ?? '').trim();
    if (!nik) return apiOk({ exists: false, anggota: null });
    const hit = await prisma.koperasiAnggota.findFirst({
      where: { organizationId: ctx.organizationId, nik },
      select: { id: true, namaLengkap: true, cabang: true },
    });
    return apiOk({
      exists: !!hit,
      anggota: hit
        ? { id: hit.id, namaLengkap: hit.namaLengkap, cabang: hit.cabang }
        : null,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memeriksa NIK.', 500);
  }
}
