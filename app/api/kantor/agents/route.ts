// GET /api/kantor/agents — daftar Agent kantor (read-only).
// POST /api/kantor/agents — tambah agent baru (Wave 13).
// Guard GET: auth + modul 'kantor' (tidak ada permission KANTOR_* di v1).
// Guard POST: + hanya OWNER / ADMIN kantor atau Super Admin.
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  canManageAgents,
  isBuiltinAgent,
  validateAgentInput,
} from '@/lib/agents/manage';
import { publishAgentEvent } from '@/lib/agents/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const agents = await prisma.agent.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        role: true,
        avatarColor: true,
        currentStatus: true,
        isEnabled: true,
        description: true,
      },
    });
    return apiOk({
      agents: agents.map((a) => ({ ...a, isBuiltin: isBuiltinAgent(a.name) })),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar agent.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengelola agent.', 403);
    }
    const body = await req.json().catch(() => null);
    const checked = validateAgentInput(body);
    if (!checked.ok || !checked.data) return apiErr(checked.message ?? 'Input tidak valid.', 422);
    const data = checked.data;

    if (isBuiltinAgent(data.name)) {
      return apiErr(
        `Nama "${data.name}" sudah dipakai agent bawaan — pilih nama lain.`,
        422
      );
    }
    const clash = await prisma.agent.findFirst({
      where: {
        organizationId: ctx.organizationId,
        name: { equals: data.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) {
      return apiErr(`Agent bernama "${data.name}" sudah ada di kantor ini.`, 422);
    }

    const created = await prisma.agent.create({
      data: {
        organizationId: ctx.organizationId,
        name: data.name,
        role: data.role,
        description: data.description,
        avatarColor: data.avatarColor,
        skills: JSON.stringify(data.skills),
        systemInstructions: data.systemInstructions,
        tools: JSON.stringify(data.tools),
        isEnabled: data.isEnabled,
      },
      select: {
        id: true,
        name: true,
        role: true,
        avatarColor: true,
        currentStatus: true,
        isEnabled: true,
        description: true,
      },
    });
    await publishAgentEvent(ctx.organizationId, 'agent.connected', {
      agentId: created.id,
      name: created.name,
    });
    return apiOk({ agent: { ...created, isBuiltin: false } }, 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah agent.', 500);
  }
}
