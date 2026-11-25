import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Bentuk satu simulasi — sama dengan backup simMapRow. */
function mapSimulation(r: any) {
  const d = (r.data || {}) as Record<string, any>;
  return {
    id: r.id as string,
    userId: r.userId as string,
    name: r.name as string,
    type: r.type as string,
    dataString: d.dataString || '',
    createdAt: (r.createdAt as Date).toISOString(),
    expiresAt: d.expiresAt || null,
    memberName: d.memberName || '',
    itemMerk: d.itemMerk || '',
    itemImei: d.itemImei || '',
    plafond: d.plafond ?? 0,
  };
}

/** GET /api/emas/simulations?type= — daftar simulasi milik user (terbaru dulu). */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'READ');
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || '';
    const rows = await prisma.simulation.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return apiOk({ simulations: rows.map(mapSimulation) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat simulasi.', 500);
  }
}

/** POST /api/emas/simulations — simpan simulasi baru.
 *  Body: { name, type, dataString?, expiresAt?, memberName?, itemMerk?, itemImei?, plafond? }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const b = await req.json().catch(() => ({}));
    if (!b.name) return apiErr('Nama simulasi wajib diisi.', 400);
    const data = {
      dataString: b.dataString || '',
      expiresAt: b.expiresAt || null,
      memberName: b.memberName || '',
      itemMerk: b.itemMerk || '',
      itemImei: b.itemImei || '',
      plafond: b.plafond ?? 0,
    };
    const saved = await prisma.simulation.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        type: String(b.type || ''),
        name: String(b.name),
        data,
      },
    });
    return apiOk({ success: true, simulation: mapSimulation(saved) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan simulasi.', 500);
  }
}
