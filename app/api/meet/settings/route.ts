// GET /api/meet/settings — baca MeetingSetting kantor (buat row default bila belum ada).
// PATCH /api/meet/settings — ubah MeetingSetting kantor (MEET_MANAGE).

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { getOrCreateMeetingSetting } from '@/lib/meet/server';

export const dynamic = 'force-dynamic';

const settingsSchema = z.object({
  maxDurationMinutes: z.number().int().min(5).max(1440).optional(),
  maxParticipants: z.number().int().min(2).max(500).optional(),
  waitingRoomDefault: z.boolean().optional(),
  allowGuest: z.boolean().optional(),
  allowScreenShare: z.boolean().optional(),
  allowChat: z.boolean().optional(),
  allowRecording: z.boolean().optional(),
  recordingRetentionDays: z.number().int().min(1).max(365).optional(),
  defaultTimezone: z.string().trim().min(1).max(64).optional(),
});

function mapSetting(s: {
  organizationId: string;
  maxDurationMinutes: number;
  maxParticipants: number;
  waitingRoomDefault: boolean;
  allowGuest: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowRecording: boolean;
  recordingRetentionDays: number;
  defaultTimezone: string;
}) {
  return { ...s };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('MEET_VIEW', req);
    const setting = await getOrCreateMeetingSetting(ctx.organizationId);
    return apiOk(mapSetting(setting));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan meeting.', 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requirePermission('MEET_MANAGE', req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.issues[0]?.message ?? 'Data pengaturan tidak valid.', 400);
    }
    if (Object.keys(parsed.data).length === 0) {
      return apiErr('Tidak ada perubahan yang dikirim.', 400);
    }
    const updated = await prisma.meetingSetting.upsert({
      where: { organizationId: ctx.organizationId },
      update: parsed.data,
      create: { organizationId: ctx.organizationId, ...parsed.data },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MEET_SETTINGS_UPDATE',
      module: 'MEET',
      description: 'Mengubah pengaturan WOORK MEET kantor',
    });
    return apiOk(mapSetting(updated));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan meeting.', 500);
  }
}
