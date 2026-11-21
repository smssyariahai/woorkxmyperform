// GET /api/kantor/agents/[id] — detail satu agent (termasuk konfigurasi).
// PATCH — ubah agent. DELETE — hapus agent (Wave 13).
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin.
// Batasan hapus: agent bawaan tidak bisa dihapus; agent yang sudah punya
// riwayat tugas/persetujuan tidak bisa dihapus — nonaktifkan saja.
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  agentHasHistory,
  agentRowToInput,
  canManageAgents,
  isBuiltinAgent,
  validateAgentInput,
} from '@/lib/agents/manage';
import { publishAgentEvent } from '@/lib/agents/events';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

async function loadAgent(organizationId: string, id: string) {
  return prisma.agent.findFirst({
    where: { id, organizationId },
  });
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengelola agent.', 403);
    }
    const agent = await loadAgent(ctx.organizationId, params.id);
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);
    const input = agentRowToInput(agent);
    return apiOk({
      agent: {
        id: agent.id,
        ...input,
        currentStatus: agent.currentStatus,
        isBuiltin: isBuiltinAgent(agent.name),
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat agent.', 500);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengelola agent.', 403);
    }
    const agent = await loadAgent(ctx.organizationId, params.id);
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);
    const builtin = isBuiltinAgent(agent.name);
    const existing = agentRowToInput(agent);

    const body = await req.json().catch(() => null);
    const checked = validateAgentInput(body, {
      existing,
      allowNameChange: !builtin,
    });
    if (!checked.ok || !checked.data) return apiErr(checked.message ?? 'Input tidak valid.', 422);
    const data = checked.data;

    if (data.name.toLowerCase() !== agent.name.toLowerCase()) {
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
          NOT: { id: agent.id },
        },
        select: { id: true },
      });
      if (clash) {
        return apiErr(`Agent bernama "${data.name}" sudah ada di kantor ini.`, 422);
      }
    }

    const wasEnabled = agent.isEnabled;
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
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
    if (wasEnabled !== data.isEnabled) {
      await publishAgentEvent(
        ctx.organizationId,
        data.isEnabled ? 'agent.connected' : 'agent.disconnected',
        { agentId: updated.id, name: updated.name }
      );
    }
    return apiOk({ agent: { ...updated, isBuiltin: builtin } });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah agent.', 500);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengelola agent.', 403);
    }
    const agent = await loadAgent(ctx.organizationId, params.id);
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);
    if (isBuiltinAgent(agent.name)) {
      return apiErr(
        'Agent bawaan tidak bisa dihapus — nonaktifkan saja bila tidak dipakai.',
        409
      );
    }
    if (await agentHasHistory(ctx.organizationId, agent.id)) {
      return apiErr(
        'Agent ini sudah punya riwayat tugas — hapus tidak bisa, nonaktifkan saja.',
        409
      );
    }
    await prisma.agent.delete({ where: { id: agent.id } });
    await publishAgentEvent(ctx.organizationId, 'agent.disconnected', {
      agentId: agent.id,
      name: agent.name,
    });
    return apiOk({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus agent.', 500);
  }
}
