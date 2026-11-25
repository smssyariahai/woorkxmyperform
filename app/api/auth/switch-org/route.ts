import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/switch-org — validasi kepindahan kantor aktif.
 * Client kemudian memanggil update({ organizationId }) dari next-auth/react
 * agar JWT diperbarui (divalidasi ulang di callback jwt).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const organizationId = String(body?.organizationId || '');
    if (!organizationId) return apiErr('organizationId wajib diisi.', 422);

    // Membership TIDAK punya relasi `organization` di tenant client —
    // organisasi diambil terpisah (validasi + bentuk hasil sama).
    const mRow = await prisma.membership.findFirst({
      where: { userId: ctx.userId, organizationId, status: 'ACTIVE' },
      include: { role: true },
    });
    if (!mRow) return apiErr('Anda tidak memiliki akses ke kantor ini.', 403);
    const mOrg = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, isActive: true },
    });
    if (!mOrg) return apiErr('Anda tidak memiliki akses ke kantor ini.', 403);
    const m = { ...mRow, organization: mOrg };
    if (!m.organization.isActive && !ctx.isSuperAdmin) {
      return apiErr('Kantor ini sedang dinonaktifkan.', 403);
    }
    return apiOk({
      organizationId: m.organization.id,
      organizationName: m.organization.name,
      role: m.role.name,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal berganti kantor.', 500);
  }
}
