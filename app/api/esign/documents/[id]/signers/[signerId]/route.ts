import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { esignSignerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const patchSignerSchema = esignSignerSchema.partial().omit({ userId: true });

async function findSigner(ctx: { organizationId: string }, docId: string, signerId: string) {
  const doc = await prisma.esignDocument.findFirst({
    where: { id: docId, organizationId: ctx.organizationId },
    select: { id: true, title: true, documentNumber: true, status: true },
  });
  if (!doc) return { doc: null, signer: null };
  const signer = await prisma.esignSigner.findFirst({
    where: { id: signerId, documentId: doc.id },
  });
  return { doc, signer };
}

/** PATCH /api/esign/documents/[id]/signers/[signerId] — ubah urutan/posisi (hanya saat DRAFT). */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; signerId: string } }
) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const { doc, signer } = await findSigner(ctx, params.id, params.signerId);
    if (!doc || !signer) return apiErr('Penandatangan tidak ditemukan.', 404);
    if (doc.status !== 'DRAFT') {
      return apiErr('Penandatangan hanya dapat diubah saat dokumen masih DRAFT.', 409);
    }
    const parsed = patchSignerSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    if (d.signingOrder !== undefined && d.signingOrder !== signer.signingOrder) {
      const orderDup = await prisma.esignSigner.findFirst({
        where: { documentId: doc.id, signingOrder: d.signingOrder, NOT: { id: signer.id } },
        select: { id: true },
      });
      if (orderDup) return apiErr(`Urutan tanda tangan ${d.signingOrder} sudah dipakai.`, 409);
    }

    const item = await prisma.esignSigner.update({
      where: { id: signer.id },
      data: {
        ...(d.signingOrder !== undefined ? { signingOrder: d.signingOrder } : {}),
        ...(d.placementPage !== undefined ? { placementPage: d.placementPage } : {}),
        ...(d.placementX !== undefined ? { placementX: d.placementX } : {}),
        ...(d.placementY !== undefined ? { placementY: d.placementY } : {}),
        ...(d.placementWidth !== undefined ? { placementWidth: d.placementWidth } : {}),
        ...(d.placementHeight !== undefined ? { placementHeight: d.placementHeight } : {}),
      },
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'UPDATE_ESIGN_SIGNER',
      description: `${ctx.name} memperbarui penandatangan ${signer.signerName} pada dokumen "${doc.title}" (${doc.documentNumber})`,
      metadata: { signerId: signer.id, signingOrder: item.signingOrder },
      req,
    });

    const { accessToken: _t, tokenExpiresAt: _e, ...safe } = item as any;
    return apiOk({ item: safe });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui penandatangan.', 500);
  }
}

/** DELETE /api/esign/documents/[id]/signers/[signerId] — hapus penandatangan (hanya saat DRAFT). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; signerId: string } }
) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const { doc, signer } = await findSigner(ctx, params.id, params.signerId);
    if (!doc || !signer) return apiErr('Penandatangan tidak ditemukan.', 404);
    if (doc.status !== 'DRAFT') {
      return apiErr('Penandatangan hanya dapat dihapus saat dokumen masih DRAFT.', 409);
    }
    await prisma.esignSigner.delete({ where: { id: signer.id } });
    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'REMOVE_ESIGN_SIGNER',
      description: `${ctx.name} menghapus ${signer.signerName} dari penandatangan dokumen "${doc.title}" (${doc.documentNumber})`,
      metadata: { signerId: signer.id, signerName: signer.signerName },
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus penandatangan.', 500);
  }
}
