import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { startSession, disconnectSession, getSessionInfo } from '@/lib/wa/manager';

export const dynamic = 'force-dynamic';

/** POST /api/channels/whatsapp/session — mulai pairing QR WhatsApp */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    const s = await startSession(ctx.organizationId);
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'WA_SESSION_START', module: 'CHANNELS',
      description: 'Memulai pairing WhatsApp via QR',
      ipAddress: getClientIp(req),
    });
    return apiOk({ status: s.status });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memulai sesi WhatsApp.', 500);
  }
}

/** DELETE /api/channels/whatsapp/session — putuskan & hapus sesi */
export async function DELETE(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    await disconnectSession(ctx.organizationId);
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'WA_SESSION_STOP', module: 'CHANNELS',
      description: 'Memutuskan sesi WhatsApp',
      ipAddress: getClientIp(req),
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memutuskan sesi.', 500);
  }
}

/** GET /api/channels/whatsapp/session — info sesi (dipakai juga oleh qr) */
export async function GET() {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    return apiOk(getSessionInfo(ctx.organizationId));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat status sesi.', 500);
  }
}
