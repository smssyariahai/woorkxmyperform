import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { toCsv, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/** GET /api/customers/export — unduh seluruh pelanggan kantor sebagai CSV. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CRM_EXPORT', req);
    const customers = await prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      select: { name: true, phone: true, email: true, company: true, stage: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const csv = toCsv([
      ['Nama', 'Telepon', 'Email', 'Perusahaan', 'Tahap', 'Dibuat'],
      ...customers.map((c) => [
        c.name, c.phone, c.email, c.company, c.stage, c.createdAt.toISOString(),
      ]),
    ]);
    return csvResponse(csv, 'pelanggan.csv');
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengekspor pelanggan.', 500);
  }
}
