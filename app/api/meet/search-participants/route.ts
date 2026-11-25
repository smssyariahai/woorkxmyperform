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
      // Filter relasi `user` tidak bisa dipakai pada Membership di tenant
      // client — selesaikan dulu id user yang cocok, lalu filter dengan
      // `userId in [...]` (Lapisan F).
      const matched = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      (where as Record<string, unknown>).userId = { in: matched.map((u) => u.id) };
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

    // Membership TIDAK punya relasi `user` di tenant client (dan `orderBy`
    // relasi juga tidak bisa) — user diambil terpisah, digabung, diurutkan
    // per nama di JS, lalu diambil 20 pertama (sama seperti sebelumnya).
    const memberRows = await prisma.membership.findMany({
      where: where as never,
      include: {
        department: { select: { id: true, name: true } },
        employment: { select: { position: true, branch: true } },
      },
    });
    const participantUserIds = [...new Set(memberRows.map((r) => r.userId))];
    const participantUsers = participantUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: participantUserIds } },
          select: { id: true, name: true, email: true, avatar: true },
        })
      : [];
    const participantUserById = new Map(participantUsers.map((u) => [u.id, u]));
    const rows = memberRows
      .map((r) => ({ ...r, user: participantUserById.get(r.userId) ?? null }))
      .filter((r): r is typeof r & { user: { id: string; name: string; email: string; avatar: string | null } } => !!r.user)
      .sort((a, b) => a.user.name.localeCompare(b.user.name))
      .slice(0, 20);
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
