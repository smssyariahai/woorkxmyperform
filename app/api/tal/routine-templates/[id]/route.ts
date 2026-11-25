import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isTalAdmin } from '@/lib/tal/server';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/tal/routine-templates/[id] — hapus template milik sendiri.
 * Preset (bawaan backup / isPreset DB) hanya boleh dihapus admin (§5.3);
 * preset bawaan yang belum ada di DB tidak bisa dihapus (tidak ada barisnya).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (params.id.startsWith('preset_')) {
      return apiErr('Template preset bawaan tidak bisa dihapus.', 400);
    }
    const row = await prisma.talRoutineTemplate.findFirst({
      where: { organizationId: ctx.organizationId, id: params.id },
    });
    if (!row) return apiErr('Template tidak ditemukan.', 404);
    if (row.isPreset && !isTalAdmin(ctx)) {
      return apiErr('Hanya Administrator yang boleh menghapus template preset.', 403);
    }
    if (!row.isPreset && row.userId !== ctx.userId) {
      return apiErr('Template ini bukan milik Anda.', 403);
    }
    await prisma.talRoutineTemplate.delete({ where: { id: row.id } });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus template rutinitas TAL.', 500);
  }
}
