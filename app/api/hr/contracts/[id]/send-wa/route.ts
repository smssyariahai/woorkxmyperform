import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { buildContractLetter } from '@/lib/hr/letter';
import { sendDocument, getSessionInfo } from '@/lib/wa/manager';
import { normalizePhone } from '@/lib/wa/phone';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  phone: z.string().min(9, 'Nomor WhatsApp tidak valid').max(20),
});

/**
 * POST /api/hr/contracts/[id]/send-wa — kirim surat perjanjian (PDF) via WhatsApp.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Nomor WhatsApp tidak valid.', 422);
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return apiErr('Nomor WhatsApp tidak valid.', 422);

    // Tunggu sesi pulih bila server baru di-restart (maks ~20 detik)
    let session = getSessionInfo(ctx.organizationId);
    for (let i = 0; i < 20 && session.status !== 'open' && session.hasCreds; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      session = getSessionInfo(ctx.organizationId);
    }
    if (session.status !== 'open') {
      return apiErr(
        `WhatsApp belum terhubung (status: ${session.status}). Buka menu Saluran dan pastikan status "Terhubung", lalu coba lagi.`,
        409
      );
    }

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
    const sent = await sendDocument(
      ctx.organizationId,
      phone,
      pdf,
      filename,
      `Surat Perjanjian Kerja ${contract.type} No. ${contract.contractNo} untuk ${contract.employee.name} (${contract.employee.employeeNo}). Mohon untuk diprint.`
    );
    if (!sent.ok) return apiErr(`Gagal mengirim via WhatsApp: ${sent.error || 'coba lagi.'}`, 500);

    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'SEND_CONTRACT_WA', module: 'HR',
      description: `${ctx.name} mengirim surat ${contract.type} ${contract.contractNo} via WhatsApp ke ${phone}`,
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('[hr-send-wa]', e);
    return apiErr('Gagal mengirim surat via WhatsApp.', 500);
  }
}
