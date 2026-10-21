import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrHireSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/candidates/[id]/hire
 * Terima kandidat → buat data karyawan + kontrak (PKWTT/PKWT) sekaligus.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const candidate = await prisma.hrCandidate.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { employee: true },
    });
    if (!candidate) return apiErr('Kandidat tidak ditemukan.', 404);
    if (candidate.employee) return apiErr('Kandidat ini sudah menjadi karyawan.', 409);

    const parsed = hrHireSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const dupContract = await prisma.hrContract.findFirst({
      where: { organizationId: ctx.organizationId, contractNo: d.contractNo.trim() },
    });
    if (dupContract) return apiErr('Nomor kontrak sudah dipakai.', 409);

    const joinDate = new Date(d.joinDate);
    const probationEnd = d.probationMonths > 0
      ? new Date(joinDate.getFullYear(), joinDate.getMonth() + d.probationMonths, joinDate.getDate())
      : null;
    const endDate = d.contractType === 'PKWT'
      ? new Date(joinDate.getFullYear() + 1, joinDate.getMonth(), joinDate.getDate())
      : null;

    // Nomor karyawan otomatis: EMP-YYYY-XXX
    const year = joinDate.getFullYear();
    const count = await prisma.hrEmployee.count({
      where: { organizationId: ctx.organizationId, employeeNo: { startsWith: `EMP-${year}-` } },
    });
    const employeeNo = `EMP-${year}-${String(count + 1).padStart(3, '0')}`;

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.hrEmployee.create({
        data: {
          organizationId: ctx.organizationId,
          employeeNo,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          address: candidate.address,
          birthDate: candidate.birthDate,
          position: d.position.trim(),
          department: d.department?.trim() || null,
          joinDate,
          status: 'AKTIF',
          candidateId: candidate.id,
          createdById: ctx.userId,
        },
      });
      const contract = await tx.hrContract.create({
        data: {
          organizationId: ctx.organizationId,
          employeeId: employee.id,
          contractNo: d.contractNo.trim(),
          type: d.contractType,
          startDate: joinDate,
          endDate,
          probationEnd,
          salary: d.salary ?? null,
          position: d.position.trim(),
          status: 'AKTIF',
          notes: `Kontrak awal dari hasil rekrutmen kandidat "${candidate.name}".`,
          createdById: ctx.userId,
        },
      });
      await tx.hrCandidate.update({ where: { id: candidate.id }, data: { stage: 'DITERIMA' } });
      return { employee, contract };
    });

    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'HIRE_CANDIDATE', module: 'HR',
      description: `${ctx.name} menerima "${candidate.name}" sebagai karyawan (${result.employee.employeeNo}) dengan kontrak ${d.contractType} ${d.contractNo.trim()}`,
    });
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses penerimaan karyawan.', 500);
  }
}
