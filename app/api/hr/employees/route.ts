import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrEmployeeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/hr/employees — daftar karyawan */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? '';
    const department = searchParams.get('department') ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = { organizationId: ctx.organizationId };
    if (status) where.status = status;
    // HrEmployee.department teks bebas — filter cocok persis dengan nilai
    // yang ada (daftar nilai diisi client dari data yang dimuat).
    if (department) where.department = department;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { employeeNo: { contains: q, mode: 'insensitive' } },
        { nik: { contains: q, mode: 'insensitive' } },
        { position: { contains: q, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.hrEmployee.findMany({
      where,
      include: {
        contracts: { orderBy: { startDate: 'desc' }, take: 1 },
        candidate: { select: { id: true, name: true } },
      },
      orderBy: { joinDate: 'desc' },
      take: 200,
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat karyawan.', 500);
  }
}

/** POST /api/hr/employees — tambah karyawan manual */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const parsed = hrEmployeeSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const dup = await prisma.hrEmployee.findFirst({
      where: { organizationId: ctx.organizationId, employeeNo: d.employeeNo.trim() },
    });
    if (dup) return apiErr('Nomor karyawan sudah dipakai.', 409);
    const item = await prisma.hrEmployee.create({
      data: {
        organizationId: ctx.organizationId,
        employeeNo: d.employeeNo.trim(),
        name: d.name.trim(),
        nik: d.nik?.trim() || null,
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        address: d.address?.trim() || null,
        birthDate: d.birthDate ? new Date(d.birthDate) : null,
        position: d.position.trim(),
        department: d.department?.trim() || null,
        joinDate: new Date(d.joinDate),
        status: d.status,
        createdById: ctx.userId,
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'CREATE_EMPLOYEE', module: 'HR',
      description: `${ctx.name} menambahkan karyawan "${item.name}" (${item.employeeNo})`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambahkan karyawan.', 500);
  }
}
