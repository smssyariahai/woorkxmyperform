import * as fs from 'node:fs';
import * as path from 'node:path';
import { auth } from '@/lib/auth';
import { apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  TENANT_BACKUP_DIR,
  backupTenantDb,
  listTenantBackups,
} from '@/lib/tenant/backup';
import { resolveOwnSubscription } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** GET /api/tenant/subscription/export — unduh backup SQL tenant (Bab 7.5).
 *  TANPA tenant context (seperti status). OWNER saja + lifecycle HARUS
 *  NONAKTIF (selain itu 409). Bila belum ada backup, buat dulu dengan
 *  backupTenantDb, lalu stream file terbaru. Audit
 *  SUBSCRIPTION_EXPORT_DOWNLOADED. */
export async function GET() {
  try {
    const session = await auth();
    const u = session?.user as any;
    if (!u?.id && !u?.email) {
      return apiErr('Belum login. Silakan masuk kembali.', 401);
    }
    const own = await resolveOwnSubscription({ id: u.id, email: u.email });
    if (!own) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    if (!own.isOwner) {
      return apiErr(
        'Hanya admin kantor (OWNER) yang bisa mengunduh data tenant.',
        403,
      );
    }
    if (own.subscription.lifecycleStatus !== 'NONAKTIF') {
      return apiErr(
        'Ekspor data hanya tersedia selama masa retensi setelah berhenti berlangganan.',
        409,
      );
    }
    const code = own.tenant.tenantCode;
    let backups = listTenantBackups(code);
    let filename = backups[0]?.filename;
    if (!filename) {
      const created = await backupTenantDb(own.tenant.id, u.id);
      filename = created.filename;
    }
    const filePath = path.join(TENANT_BACKUP_DIR, path.basename(filename));
    if (!fs.existsSync(filePath)) {
      return apiErr('File backup tidak ditemukan.', 404);
    }
    const buf = fs.readFileSync(filePath);
    await masterPrisma.platformAuditLog.create({
      data: {
        actorUserId: u.id,
        action: 'SUBSCRIPTION_EXPORT_DOWNLOADED',
        tenantId: own.tenant.id,
        metadata: JSON.stringify({ tenantCode: code, filename }),
      },
    });
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunduh data tenant.', 500);
  }
}
