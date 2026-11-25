// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/memberships/:id/deactivate — nonaktifkan / aktifkan
 * keanggotaan pengguna di satu kantor (khusus Administrator Pusat).
 * Body: { active: boolean }. Cerminan /api/admin/users/[id]/deactivate,
 * tanpa batasan kantor (endpoint per-kantor tidak bisa dipakai lintas kantor).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    const membership = await prisma.membership.findUnique({
      where: { id: params.id },
      include: { user: true, role: true, organization: { select: { id: true, name: true } } },
    });
    if (!membership) return apiErr('Pengguna tidak ditemukan.', 404);
    if (membership.userId === ctx.userId) {
      return apiErr('Anda tidak dapat menonaktifkan akun sendiri.', 409);
    }

    const body = await req.json();
    const active = body?.active !== false;
    const status = active ? 'ACTIVE' : 'INACTIVE';

    // Jangan nonaktifkan OWNER terakhir yang aktif di kantor itu.
    if (!active && membership.role.name === 'OWNER') {
      const activeOwners = await prisma.membership.count({
        where: {
          organizationId: membership.organizationId,
          status: 'ACTIVE',
          role: { name: 'OWNER' },
          NOT: { id: membership.id },
        },
      });
      if (activeOwners === 0) {
        return apiErr('Tidak dapat menonaktifkan OWNER terakhir di kantor ini.', 409);
      }
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { status } });

    await audit({
      organizationId: membership.organizationId,
      userId: ctx.userId,
      action: active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      module: 'USERS',
      description: `Administrator Pusat ${active ? 'mengaktifkan' : 'menonaktifkan'} pengguna ${membership.user.name} (${membership.user.email}) di kantor ${membership.organization.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id, status });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status pengguna.', 500);
  }
}
