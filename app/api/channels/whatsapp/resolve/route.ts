import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { resolveLid } from '@/lib/wa/manager';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/whatsapp/resolve — resolve LID -> nomor asli,
 * lalu perbaiki pelanggan yang nomornya masih berupa LID.
 * Body: { lid }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    const body = await req.json();
    const lid = String(body.lid || '').replace(/\D/g, '');
    if (!lid) return apiErr('Parameter lid wajib diisi.', 422);

    const phone = await resolveLid(ctx.organizationId, lid);
    if (!phone) return apiErr('LID tidak dapat di-resolve (sesi tidak aktif?).', 422);

    // perbaiki pelanggan yang phone-nya masih LID ini
    const fixed = await prisma.customer.updateMany({
      where: { organizationId: ctx.organizationId, phone: lid },
      data: { phone, waLid: lid },
    });

    return apiOk({ lid, phone, fixed: fixed.count });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal resolve LID.', 500);
  }
}
