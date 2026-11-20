// GET /api/meet/search-participants — cari karyawan dari Membership aktif
// di kantor (join User + Department + UserEmployment). Maksimal 20 hasil.
// Guard MEET_VIEW.

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const department = (url.searchParams.get('department') || '').trim();
    const branch = (url.searchParams.get('branch') || '').trim();

    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      status: 'ACTIVE',
    };
    if (q) {
      (where as Record<string, unknown>).OR = [
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (department) {
      (where as Record<string, unknown>).department = {
        name: { contains: department, mode: 'insensitive' },
      };
    }
    if (branch) {
      (where as Record<string, unknown>).employment = {
        branch: { contains: branch, mode: 'insensitive' },
      };
    }

    const rows = await prisma.membership.findMany({
      where: where as never,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        department: { select: { id: true, name: true } },
        employment: { select: { position: true, branch: true } },
      },
      orderBy: { user: { name: 'asc' } },
      take: 20,
    });
    return apiOk({
      participants: rows.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        avatar: r.user.avatar,
        jobTitle: r.jobTitle ?? r.employment?.position ?? null,
        department: r.department?.name ?? null,
        departmentId: r.departmentId ?? null,
        branch: r.employment?.branch ?? null,
      })),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mencari peserta.', 500);
  }
}
