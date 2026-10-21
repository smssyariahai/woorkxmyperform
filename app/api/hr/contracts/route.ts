import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrContractSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/hr/contracts — daftar kontrak */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? '';
    const status = searchParams.get('status') ?? '';
    const employeeId = searchParams.get('employeeId') ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = { organizationId: ctx.organizationId };
    if (type) where.type = type;
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (q) {
      where.OR = [
        { contractNo: { contains: q, mode: 'insensitive' } },
        { employee: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const items = await prisma.hrContract.findMany({
      where,
      include: { employee: { select: { id: true, name: true, employeeNo: true } } },
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat kontrak.', 500);
  }
}

/** POST /api/hr/contracts — buat kontrak */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const parsed = hrContractSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const emp = await prisma.hrEmployee.findFirst({
      where: { id: d.employeeId, organizationId: ctx.organizationId },
    });
    if (!emp) return apiErr('Karyawan tidak ditemukan.', 404);
    const dup = await prisma.hrContract.findFirst({
      where: { organizationId: ctx.organizationId, contractNo: d.contractNo.trim() },
    });
    if (dup) return apiErr('Nomor kontrak sudah dipakai.', 409);
    const item = await prisma.hrContract.create({
      data: {
        organizationId: ctx.organizationId,
        employeeId: emp.id,
        contractNo: d.contractNo.trim(),
        type: d.type,
        startDate: new Date(d.startDate),
        endDate: d.endDate ? new Date(d.endDate) : null,
        probationEnd: d.probationEnd ? new Date(d.probationEnd) : null,
        salary: d.salary ?? null,
        position: d.position.trim(),
        status: d.status,
        notes: d.notes?.trim() || null,
        createdById: ctx.userId,
      },
      include: { employee: { select: { id: true, name: true, employeeNo: true } } },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'CREATE_CONTRACT', module: 'HR',
      description: `${ctx.name} membuat kontrak ${d.type} ${item.contractNo} untuk "${emp.name}"`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat kontrak.', 500);
  }
}
