import { apiOk, apiErr } from '@/lib/utils';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/wa-health — status koneksi WA per organisasi.
 * Diamankan dengan CRON_SECRET (header x-cron-secret).
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return apiErr('CRON_SECRET belum dikonfigurasi di server.', 500);
    const got = req.headers.get('x-cron-secret');
    if (got !== secret) return apiErr('Unauthorized.', 401);

    const { getSessionInfo } = await import('@/lib/wa/manager');
    const orgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const health = orgs.map((org) => {
      const info = getSessionInfo(org.id);
      return { orgId: org.id, name: org.name, status: info.status, hasCreds: info.hasCreds, phone: info.phone };
    });

    return apiOk({ health });
  } catch (e: any) {
    return apiErr('Gagal cek kesehatan WA.', 500);
  }
}
