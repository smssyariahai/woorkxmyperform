// GET /api/tal/team — anggota tim yang terlihat + canManage (§5.5)
// GET /api/tal/team?report=team — laporan agregat tim terlihat
// (porting GET /api/pg/tal/team dan /api/pg/tal/team/report, server.ts:682-711)
import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  talTeamMembers,
  talTeamVisible,
  talLoadOrgUsers,
  talTeamTaskOfUser,
  talTeamBuildReport,
} from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const url = new URL(req.url);

    if (url.searchParams.get('report') === 'team') {
      const { visible } = { visible: await talTeamVisible(ctx.organizationId, ctx.userId) };
      const users = await talLoadOrgUsers(ctx.organizationId);
      const byId = new Map(users.map((u) => [u.id, u]));
      const memberUsers = [...visible.keys()]
        .map((id) => byId.get(id))
        .filter((u) => u && (u.isActive || u.id === ctx.userId));
      const allTasks = await prisma.talTask.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: 'desc' },
      });
      const mine = allTasks.filter((t) => memberUsers.some((u) => u && talTeamTaskOfUser(t, u)));
      const seen = new Set<string>();
      const dedup = mine.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      return apiOk({
        scope: 'team',
        memberCount: memberUsers.length,
        ...talTeamBuildReport(dedup, new Date()),
      });
    }

    const { members, canManage } = await talTeamMembers(ctx);
    return apiOk({ members, canManage });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tim TAL.', 500);
  }
}
