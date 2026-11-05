import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { esignAudit } from '@/lib/esign/audit';
import { sha256 } from '@/lib/esign/hash';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** POST /api/esign/documents/[id]/upload — upload PDF asli (multipart field: file). Status tetap DRAFT. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true, documentNumber: true, status: true, originalFilePath: true },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status !== 'DRAFT') {
      return apiErr('File hanya dapat diunggah saat dokumen masih DRAFT.', 409);
    }

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
    // Validasi isi: file PDF diawali magic bytes %PDF-
    if (buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return apiErr('File bukan PDF yang valid.', 422);
    }
    const hash = sha256(buf);

    const dir = join(process.cwd(), 'uploads', 'esign', 'originals');
    await mkdir(dir, { recursive: true });
    const stored = `${doc.id}-${randomUUID().slice(0, 8)}.pdf`;
    await writeFile(join(dir, stored), buf);

    // Hapus file lama bila upload ulang.
    if (doc.originalFilePath) {
      const old = join(dir, doc.originalFilePath.split('/').pop()!.split('\\').pop()!);
      if (old !== join(dir, stored)) await unlink(old).catch(() => {});
    }

    await prisma.esignDocument.update({
      where: { id: doc.id },
      data: { originalFilePath: stored, originalHash: hash },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPLOAD_ESIGN_DOCUMENT',
      module: 'ESIGN',
      description: `${ctx.name} mengunggah PDF untuk dokumen "${doc.title}" (${doc.documentNumber}) — SHA-256 ${hash.slice(0, 12)}…`,
      ipAddress: getClientIp(req),
    });
    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'UPLOAD_ESIGN_DOCUMENT',
      description: `${ctx.name} mengunggah PDF untuk dokumen "${doc.title}" (${doc.documentNumber}) — SHA-256 ${hash.slice(0, 12)}…`,
      metadata: { fileName: stored, originalHash: hash, fileSize: file.size },
      documentHash: hash,
      req,
    });
    return apiOk({
      fileUrl: `/api/esign/documents/${doc.id}/file`,
      originalFilePath: stored,
      originalHash: hash,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunggah PDF.', 500);
  }
}
