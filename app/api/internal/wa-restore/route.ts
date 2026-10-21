import { apiOk, apiErr } from '@/lib/utils';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/wa-restore — pulihkan sesi WhatsApp yang mati.
 * Dipanggil oleh stack script setelah startup & cron watchdog.
 * Diamankan dengan CRON_SECRET (header x-cron-secret).
 *
 * Untuk setiap organisasi yang punya kredensial WA tersimpan (.wa-sessions/<orgId>/creds.json)
 * tapi tidak ada socket aktif di proses ini, panggil startSession().
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return apiErr('CRON_SECRET belum dikonfigurasi di server.', 500);
    const got = req.headers.get('x-cron-secret');
    if (got !== secret) return apiErr('Unauthorized.', 401);

    const { getSessionInfo, startSession } = await import('@/lib/wa/manager');
    const fs = await import('fs');
    const path = await import('path');

    const orgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const results: Array<{ orgId: string; name: string; action: string; status?: string }> = [];
    for (const org of orgs) {
      const credsPath = path.join(process.cwd(), '.wa-sessions', org.id, 'creds.json');
      if (!fs.existsSync(credsPath)) {
        results.push({ orgId: org.id, name: org.name, action: 'skip-no-creds' });
        continue;
      }
      const info = getSessionInfo(org.id);
      if (info.status === 'open') {
        results.push({ orgId: org.id, name: org.name, action: 'already-open', status: info.status });
        continue;
      }
      try {
        const s = await startSession(org.id);
        results.push({ orgId: org.id, name: org.name, action: 'restoring', status: s.status });
      } catch (e: any) {
        results.push({ orgId: org.id, name: org.name, action: 'failed', status: e?.message?.slice(0, 100) });
      }
    }

    return apiOk({ restored: results.filter((r) => r.action === 'restoring').length, results });
  } catch (e: any) {
    return apiErr('Gagal memulihkan sesi WhatsApp.', 500);
  }
}
