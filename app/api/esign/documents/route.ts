import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { esignAudit } from '@/lib/esign/audit';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { esignDocumentSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/esign/documents — daftar dokumen E-Sign kantor ini */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ESIGN_VIEW');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = { organizationId: ctx.organizationId };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { documentNumber: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.esignDocument.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        signers: {
          select: { id: true, signerName: true, signingStatus: true, signingOrder: true },
          orderBy: { signingOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat dokumen E-Sign.', 500);
  }
}

/** POST /api/esign/documents — buat dokumen (status awal DRAFT, tanpa file) */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const parsed = esignDocumentSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const dup = await prisma.esignDocument.findFirst({
      where: { organizationId: ctx.organizationId, documentNumber: d.documentNumber.trim() },
    });
    if (dup) return apiErr('Nomor dokumen sudah dipakai.', 409);
    if (d.approverId) {
      const approver = await prisma.membership.findFirst({
        where: { userId: d.approverId, organizationId: ctx.organizationId, status: 'ACTIVE' },
      });
      if (!approver) return apiErr('Pemberi persetujuan bukan anggota kantor ini.', 422);
    }
    const item = await prisma.esignDocument.create({
      data: {
        organizationId: ctx.organizationId,
        documentNumber: d.documentNumber.trim(),
        title: d.title.trim(),
        category: d.category.trim(),
        description: d.description?.trim() || null,
        workflowType: d.workflowType,
        approvalStatus: d.approvalStatus,
        approverId: d.approverId || null,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        showSignerName: d.showSignerName ?? true,
        showSignerPosition: d.showSignerPosition ?? true,
        showSignedDate: d.showSignedDate ?? true,
        showDocRef: d.showDocRef ?? true,
        status: 'DRAFT',
        createdById: ctx.userId,
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'CREATE_ESIGN_DOCUMENT', module: 'ESIGN',
      description: `${ctx.name} membuat dokumen E-Sign "${item.title}" (${item.documentNumber})`,
    });
    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: item.id,
      userId: ctx.userId,
      action: 'CREATE_ESIGN_DOCUMENT',
      description: `${ctx.name} membuat dokumen E-Sign "${item.title}" (${item.documentNumber})`,
      metadata: {
        documentNumber: item.documentNumber,
        title: item.title,
        category: item.category,
        workflowType: item.workflowType,
        approvalStatus: item.approvalStatus,
      },
      req,
    });
    // Realtime (best-effort, Fase 8).
    publishEsignEvent(ctx.organizationId, 'esign:document:created', {
      documentId: item.id,
      documentNumber: item.documentNumber,
      status: 'DRAFT',
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat dokumen E-Sign.', 500);
  }
}
