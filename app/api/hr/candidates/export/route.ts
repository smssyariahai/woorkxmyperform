import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { toCsv, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/** GET /api/hr/candidates/export — unduh seluruh kandidat HR kantor sebagai CSV. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('HR_EXPORT', req);
    const candidates = await prisma.hrCandidate.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        name: true, email: true, phone: true, address: true, stage: true,
        appliedAt: true, vacancy: { select: { title: true } },
      },
      orderBy: { appliedAt: 'desc' },
    });
    const csv = toCsv([
      ['Nama', 'Email', 'Telepon', 'Alamat', 'Posisi', 'Tahap', 'Tanggal Lamar'],
      ...candidates.map((c) => [
        c.name, c.email, c.phone, c.address, c.vacancy?.title, c.stage, c.appliedAt.toISOString(),
      ]),
    ]);
    return csvResponse(csv, 'kandidat.csv');
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengekspor kandidat.', 500);
  }
}
