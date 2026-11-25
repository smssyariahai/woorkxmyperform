// GET/PUT /api/kantor/briefing/settings — pengaturan Morning Briefing.
// GET: auth + modul 'kantor' (semua yang melihat kantor boleh membaca).
// PUT: + hanya OWNER / ADMIN kantor atau Super Admin (pola Kelola Agent,
// lib/agents/manage.ts `canManageAgents`). Perubahan dicatat di AuditLog.
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { canManageAgents } from '@/lib/agents/manage';
import {
  getBriefingSettings,
  validateBriefingSettingsInput,
} from '@/lib/kantor/briefing';

export const dynamic = 'force-dynamic';

function serializeSettings(s: Awaited<ReturnType<typeof getBriefingSettings>>) {
  return {
    id: s.id,
    organizationId: s.organizationId,
    isEnabled: s.isEnabled,
    startTime: s.startTime,
    timezone: s.timezone,
    durationMinutes: s.durationMinutes,
    preparationMinutes: s.preparationMinutes,
    meetingLeaderId: s.meetingLeaderId,
    participantMode: s.participantMode,
    excludedAgentIds: s.excludedAgentIds,
    autoReturn: s.autoReturn,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const settings = await getBriefingSettings(ctx.organizationId);
    return apiOk(serializeSettings(settings));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan briefing.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengubah pengaturan briefing.', 403);
    }
    const body = await req.json().catch(() => null);
    const checked = validateBriefingSettingsInput(body);
    if (!checked.ok) return apiErr(checked.message, 422);
    const data = checked.data;

    // meetingLeaderId harus menunjuk agent aktif di kantor ini (bila diisi).
    if (data.meetingLeaderId) {
      const leader = await prisma.agent.findFirst({
        where: { id: data.meetingLeaderId, organizationId: ctx.organizationId },
        select: { id: true, isEnabled: true },
      });
      if (!leader) return apiErr('meetingLeaderId tidak ditemukan di kantor ini.', 422);
      if (!leader.isEnabled) return apiErr('Agent yang dipilih sebagai leader sedang nonaktif.', 422);
    }
    // excludedAgentIds harus menunjuk agent di kantor ini (bila diisi).
    if (data.excludedAgentIds && data.excludedAgentIds.length > 0) {
      const found = await prisma.agent.count({
        where: { id: { in: data.excludedAgentIds }, organizationId: ctx.organizationId },
      });
      if (found !== data.excludedAgentIds.length) {
        return apiErr('excludedAgentIds memuat agent yang tidak ada di kantor ini.', 422);
      }
    }

    const updated = await prisma.briefingSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, ...data },
      update: data,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'BRIEFING_SETTINGS_UPDATE',
      module: 'KANTOR',
      description: `Pengaturan Morning Briefing diubah (${Object.keys(data).join(', ')}).`,
    });
    return apiOk(serializeSettings(updated));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan briefing.', 500);
  }
}
