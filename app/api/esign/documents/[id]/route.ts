import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { esignAudit } from '@/lib/esign/audit';
import { esignDocumentSchema } from '@/lib/validation';
import { isSignerTurn } from '@/lib/esign/workflow';
import { isTokenValid } from '@/lib/esign/tokens';

export const dynamic = 'force-dynamic';

async function findOne(ctx: { organizationId: string }, id: string) {
  return prisma.esignDocument.findFirst({ where: { id, organizationId: ctx.organizationId } });
}

/** GET /api/esign/documents/[id] — detail dokumen + penandatangan + riwayat */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_VIEW');
    const row = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        // Token akses signer TIDAK dikembalikan di detail (kredensial akses
        // tautan sign — hanya pemegang tautan yang boleh memakainya).
        signers: {
          orderBy: { signingOrder: 'asc' },
          select: {
            id: true, documentId: true, userId: true, signerName: true,
            signerEmail: true, signerPhone: true, signerPosition: true,
            signerDepartment: true, signingOrder: true, signingGroup: true, signingStatus: true,
            placementPage: true, placementX: true, placementY: true,
            placementWidth: true, placementHeight: true, signedAt: true,
            rejectedReason: true,
          },
        },
        signatures: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!row) return apiErr('Dokumen tidak ditemukan.', 404);
    // EsignDocument TIDAK punya relasi `createdBy`/`approver` di tenant
    // client — ambil dari mirror User (Lapisan F).
    const [createdByUser, approverUser] = await Promise.all([
      row.createdById
        ? prisma.user.findUnique({ where: { id: row.createdById }, select: { id: true, name: true } })
        : Promise.resolve(null),
      row.approverId
        ? prisma.user.findUnique({ where: { id: row.approverId }, select: { id: true, name: true } })
        : Promise.resolve(null),
    ]);
    const item = { ...row, createdBy: createdByUser, approver: approverUser };
    // Token milik viewer sendiri (bila ia penandatangan dokumen ini) —
    // token signer LAIN tidak pernah dikembalikan (lihat select di atas).
    // mySignToken hanya diisi bila sekarang memang gilirannya, agar token
    // tidak beredar di respons saat tidak bisa dipakai.
    const mySigner = await prisma.esignSigner.findFirst({
      where: { documentId: item.id, userId: ctx.userId },
      select: { accessToken: true, tokenExpiresAt: true, signingStatus: true, signingOrder: true, signingGroup: true },
    });
    const signing = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(item.status);
    const mySigningStatus = mySigner?.signingStatus ?? null;
    const myTurn =
      signing &&
      mySigner?.signingStatus === 'PENDING' &&
      !!mySigner.accessToken &&
      isTokenValid(mySigner.tokenExpiresAt) &&
      isSignerTurn(item.workflowType, mySigner, item.signers);
    const myWaiting =
      signing && mySigner?.signingStatus === 'PENDING' && !isSignerTurn(item.workflowType, mySigner, item.signers);
    return apiOk({
      item,
      viewerUserId: ctx.userId,
      mySignToken: myTurn ? mySigner!.accessToken : null,
      mySigningStatus,
      myTurn,
      myWaiting,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat dokumen E-Sign.', 500);
  }
}

/** PATCH /api/esign/documents/[id] — ubah metadata (hanya saat DRAFT).
 * Pengecualian: keempat flag tampilan tanda tangan boleh diubah kapan saja
 * (preferensi rendering, bukan status workflow) — PATCH yang hanya berisi
 * flag tampilan diterima meski dokumen sudah tidak DRAFT. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Dokumen tidak ditemukan.', 404);
    const parsed = esignDocumentSchema.partial().safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const DISPLAY_FLAG_KEYS = ['showSignerName', 'showSignerPosition', 'showSignedDate', 'showDocRef'] as const;
    const hasNonFlagChanges =
      d.documentNumber !== undefined || d.title !== undefined || d.category !== undefined ||
      d.description !== undefined || d.workflowType !== undefined || d.approvalStatus !== undefined ||
      d.approverId !== undefined || d.expiresAt !== undefined;
    if (cur.status !== 'DRAFT' && hasNonFlagChanges) {
      return apiErr('Dokumen hanya dapat diubah saat masih DRAFT (kecuali pengaturan tampilan tanda tangan).', 409);
    }
    const displayData = Object.fromEntries(
      DISPLAY_FLAG_KEYS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])
    );
    if (cur.status !== 'DRAFT' && Object.keys(displayData).length === 0) {
      return apiErr('Dokumen hanya dapat diubah saat masih DRAFT (kecuali pengaturan tampilan tanda tangan).', 409);
    }
    if (d.documentNumber && d.documentNumber.trim() !== cur.documentNumber) {
      const dup = await prisma.esignDocument.findFirst({
        where: {
          organizationId: ctx.organizationId,
          documentNumber: d.documentNumber.trim(),
          NOT: { id: cur.id },
        },
      });
      if (dup) return apiErr('Nomor dokumen sudah dipakai.', 409);
    }
    if (d.approverId) {
      const approver = await prisma.membership.findFirst({
        where: { userId: d.approverId, organizationId: ctx.organizationId, status: 'ACTIVE' },
      });
      if (!approver) return apiErr('Pemberi persetujuan bukan anggota kantor ini.', 422);
    }
    const item = await prisma.esignDocument.update({
      where: { id: cur.id },
      data: {
        ...(d.documentNumber !== undefined ? { documentNumber: d.documentNumber.trim() } : {}),
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.category !== undefined ? { category: d.category.trim() } : {}),
        ...(d.description !== undefined ? { description: d.description?.trim() || null } : {}),
        ...(d.workflowType !== undefined ? { workflowType: d.workflowType } : {}),
        ...(d.approvalStatus !== undefined ? { approvalStatus: d.approvalStatus } : {}),
        ...(d.approverId !== undefined ? { approverId: d.approverId || null } : {}),
        ...(d.expiresAt !== undefined ? { expiresAt: d.expiresAt ? new Date(d.expiresAt) : null } : {}),
        ...displayData,
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'UPDATE_ESIGN_DOCUMENT', module: 'ESIGN',
      description: `${ctx.name} memperbarui dokumen E-Sign "${item.title}" (${item.documentNumber})`,
    });
    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: item.id,
      userId: ctx.userId,
      action: 'UPDATE_ESIGN_DOCUMENT',
      description: `${ctx.name} memperbarui dokumen E-Sign "${item.title}" (${item.documentNumber})`,
      metadata: { documentNumber: item.documentNumber, changedFields: Object.keys(d), fromStatus: cur.status },
      req,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui dokumen E-Sign.', 500);
  }
}

/** DELETE /api/esign/documents/[id] — hapus dokumen (hanya saat DRAFT) */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Dokumen tidak ditemukan.', 404);
    if (cur.status !== 'DRAFT') {
      return apiErr('Dokumen hanya dapat dihapus saat masih DRAFT.', 409);
    }
    await prisma.esignDocument.delete({ where: { id: cur.id } });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'DELETE_ESIGN_DOCUMENT', module: 'ESIGN',
      description: `${ctx.name} menghapus dokumen E-Sign "${cur.title}" (${cur.documentNumber})`,
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus dokumen E-Sign.', 500);
  }
}
