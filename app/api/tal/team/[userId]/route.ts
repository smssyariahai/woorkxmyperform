// GET /api/tal/team/[userId] — laporan TAL satu anggota tim.
// 403 bila target tidak terlihat (persis backup server.ts:689-692),
// 404 bila user tidak ada. Laporan orang lain selalu read-only.
// (Porting GET /api/pg/tal/team/:userId/report.)
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  canViewTalOf,
  talLoadOrgUsers,
  talTasksOfUser,
  talTeamBuildReport,
} from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  try {
    const ctx = await requireAuth();
    const targetId = params.userId;
    if (!(await canViewTalOf(ctx, targetId))) {
      return apiErr('Anda tidak memiliki akses melihat TAL karyawan ini.', 403);
    }
    const users = await talLoadOrgUsers(ctx.organizationId);
    const target = users.find((u) => u.id === targetId);
    if (!target) return apiErr('Karyawan tidak ditemukan.', 404);
    const tasks = await talTasksOfUser(ctx.organizationId, target);
    return apiOk({
      scope: 'member',
      member: {
        id: target.id,
        email: target.email,
        nama: target.nama,
        divisi: target.divisi,
        role: target.role,
        posisi: target.posisi,
      },
      isSelf: targetId === ctx.userId,
      readOnly: targetId !== ctx.userId,
      ...talTeamBuildReport(tasks, new Date()),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat laporan TAL karyawan.', 500);
  }
}
