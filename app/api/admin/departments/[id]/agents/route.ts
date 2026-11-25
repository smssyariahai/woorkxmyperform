import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Client tenant (tipe dari skema tenant) — lihat departments/route.ts. */
const tprisma = prisma as unknown as TenantPrismaClient;

/** POST /api/admin/departments/:id/agents — tempatkan agent AI ke divisi.
 *  Body: { agentId } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const dept = await tprisma.department.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!dept) return apiErr('Divisi tidak ditemukan.', 404);
    const body = await req.json().catch(() => null);
    const agentId = body?.agentId ? String(body.agentId) : '';
    if (!agentId) return apiErr('agentId wajib diisi.', 422);
    const agent = await tprisma.agent.findFirst({
      where: { id: agentId, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);
    await tprisma.agent.update({ where: { id: agent.id }, data: { departmentId: dept.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ASSIGN_AGENT_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Menempatkan agent "${agent.name}" ke divisi "${dept.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ agentId: agent.id, departmentId: dept.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menempatkan agent.', 500);
  }
}

/** DELETE /api/admin/departments/:id/agents?agentId=... — lepas agent AI
 *  dari divisi (departmentId → null). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const dept = await tprisma.department.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!dept) return apiErr('Divisi tidak ditemukan.', 404);
    const url = new URL(req.url);
    const body = await req.json().catch(() => null);
    const agentId = url.searchParams.get('agentId') || (body?.agentId ? String(body.agentId) : '');
    if (!agentId) return apiErr('agentId wajib diisi.', 422);
    const agent = await tprisma.agent.findFirst({
      where: { id: agentId, organizationId: ctx.organizationId },
      select: { id: true, name: true, departmentId: true },
    });
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);
    if (agent.departmentId !== dept.id) {
      return apiErr(`Agent "${agent.name}" tidak berada di divisi ini.`, 409);
    }
    await tprisma.agent.update({ where: { id: agent.id }, data: { departmentId: null } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UNASSIGN_AGENT_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Melepas agent "${agent.name}" dari divisi "${dept.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ agentId: agent.id, departmentId: null });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal melepas agent.', 500);
  }
}
