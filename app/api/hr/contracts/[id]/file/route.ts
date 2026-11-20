import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { sha256 } from '@/lib/esign/hash';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — sama seperti upload PDF E-Sign
const DIR = join(process.cwd(), 'uploads', 'hr', 'contracts');

/** Ambil nama file aman dari fileUrl yang tersimpan (pola E-Sign). */
function safeName(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  const name = fileUrl.split('/').pop()!.split('\\').pop()!;
  return name || null;
}

async function findOne(ctx: { organizationId: string }, id: string) {
  return prisma.hrContract.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { employee: { select: { id: true, name: true, employeeNo: true } } },
  });
}

/**
 * GET /api/hr/contracts/[id]/file — unduh file kontrak secara privat.
 * Gate HR_VIEW (Super Admin bypass via requirePermission). File tidak
 * pernah diserve via URL publik langsung; HrContract.fileUrl hanya
 * menyimpan path relatif "uploads/hr/contracts/<file>".
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const contract = await findOne(ctx, params.id);
    if (!contract) return apiErr('Kontrak tidak ditemukan.', 404);
    const name = safeName(contract.fileUrl);
    if (!name) return apiErr('Kontrak ini belum memiliki file.', 404);
    // Bila fileUrl berisi URL eksternal (bukan path lokal), teruskan saja.
    if (/^https?:\/\//i.test(contract.fileUrl!)) {
      return Response.redirect(contract.fileUrl!, 302);
    }
    const full = join(DIR, name);
    if (!existsSync(full)) return apiErr('File tidak ditemukan di server.', 404);
    const buf = await readFile(full);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${contract.contractNo.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunduh file kontrak.', 500);
  }
}

/**
 * POST /api/hr/contracts/[id]/file — unggah file kontrak (multipart field:
 * file, PDF saja, maks 10MB, validasi magic bytes %PDF- — pola
 * app/api/esign/documents/[id]/upload/route.ts). Gate HR_MANAGE.
 * Menyimpan path relatif ke HrContract.fileUrl; file lama dihapus bila
 * diunggah ulang.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const contract = await findOne(ctx, params.id);
    if (!contract) return apiErr('Kontrak tidak ditemukan.', 404);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return apiErr('Tidak ada file PDF.', 422);
    }
    if (file.type !== 'application/pdf') {
      return apiErr('Format harus PDF.', 422);
    }
    if (file.size > MAX_BYTES) {
      return apiErr('Ukuran maksimal 10MB.', 422);
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return apiErr('Ekstensi harus .pdf.', 422);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return apiErr('File bukan PDF yang valid.', 422);
    }
    const hash = sha256(buf);

    await mkdir(DIR, { recursive: true });
    const stored = `${contract.id}-${randomUUID().slice(0, 8)}.pdf`;
    await writeFile(join(DIR, stored), buf);

    // Hapus file lama bila upload ulang.
    const old = safeName(contract.fileUrl);
    if (old && old !== stored) {
      await unlink(join(DIR, old)).catch(() => {});
    }

    const fileUrl = `uploads/hr/contracts/${stored}`;
    await prisma.hrContract.update({
      where: { id: contract.id },
      data: { fileUrl },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPLOAD_CONTRACT_FILE',
      module: 'HR',
      description: `${ctx.name} mengunggah file kontrak ${contract.contractNo} ("${contract.employee.name}") — SHA-256 ${hash.slice(0, 12)}…`,
    });
    return apiOk({ fileUrl });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunggah file kontrak.', 500);
  }
}
