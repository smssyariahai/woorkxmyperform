import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { buildContractLetter } from '@/lib/hr/letter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/contracts/[id]/letter — unduh surat perjanjian kerja (PDF).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const contract = await prisma.hrContract.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { employee: true },
    });
    if (!contract) return apiErr('Kontrak tidak ditemukan.', 404);
    const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId } });

    const pdf = await buildContractLetter({
      orgName: org?.name || 'Perusahaan',
      signerName: ctx.name || 'Pimpinan Perusahaan',
      contract: {
        contractNo: contract.contractNo,
        type: contract.type,
        position: contract.position,
        startDate: contract.startDate,
        endDate: contract.endDate,
        probationEnd: contract.probationEnd,
        salary: contract.salary,
      },
      employee: {
        name: contract.employee.name,
        nik: contract.employee.nik,
        address: contract.employee.address,
        birthDate: contract.employee.birthDate,
        phone: contract.employee.phone,
        department: contract.employee.department,
      },
    });

    const filename = `Surat-${contract.type}-${contract.contractNo.replace(/\//g, '-')}.pdf`;
    const body = new Uint8Array(pdf);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(body.length),
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('[hr-letter]', e);
    return apiErr('Gagal membuat surat perjanjian.', 500);
  }
}
