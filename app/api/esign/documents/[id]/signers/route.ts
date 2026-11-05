import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { esignSignerSchema } from '@/lib/validation';
import { createAccessToken } from '@/lib/esign/tokens';

export const dynamic = 'force-dynamic';

const addSignerSchema = esignSignerSchema.extend({
  signerName: z.string().min(1).max(120).optional().nullable(),
  signerEmail: z.string().email('Email tidak valid').optional().nullable(),
  signerPosition: z.string().max(120).optional().nullable(),
  signerDepartment: z.string().max(120).optional().nullable(),
});

/** POST /api/esign/documents/[id]/signers — tambah penandatangan (hanya saat DRAFT). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true, documentNumber: true, status: true },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status !== 'DRAFT') {
      return apiErr('Penandatangan hanya dapat ditambah saat dokumen masih DRAFT.', 409);
    }

    const parsed = addSignerSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    // Target harus anggota aktif kantor ini.
    const membership = await prisma.membership.findFirst({
      where: { userId: d.userId, organizationId: ctx.organizationId, status: 'ACTIVE' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        department: { select: { name: true } },
      },
    });
    if (!membership) return apiErr('Pengguna bukan anggota aktif kantor ini.', 422);

    const dup = await prisma.esignSigner.findFirst({
      where: { documentId: doc.id, userId: d.userId },
      select: { id: true },
    });
    if (dup) return apiErr('Pengguna sudah menjadi penandatangan dokumen ini.', 409);

    const orderDup = await prisma.esignSigner.findFirst({
      where: { documentId: doc.id, signingOrder: d.signingOrder },
      select: { id: true },
    });
    if (orderDup) return apiErr(`Urutan tanda tangan ${d.signingOrder} sudah dipakai.`, 409);

    const emp = await prisma.hrEmployee.findFirst({
      where: { organizationId: ctx.organizationId, email: membership.user.email },
      select: { position: true, department: true },
    });

    const { token, expiresAt } = createAccessToken();
    const signer = await prisma.esignSigner.create({
      data: {
        documentId: doc.id,
        userId: d.userId,
        signerName: d.signerName?.trim() || membership.user.name,
        signerEmail: d.signerEmail?.trim() || membership.user.email,
        signerPhone: membership.user.phone,
        signerPosition:
          d.signerPosition?.trim() || membership.jobTitle || emp?.position || null,
        signerDepartment:
          d.signerDepartment?.trim() || membership.department?.name || emp?.department || null,
        signingOrder: d.signingOrder,
        placementPage: d.placementPage ?? null,
        placementX: d.placementX ?? null,
        placementY: d.placementY ?? null,
        placementWidth: d.placementWidth ?? null,
        placementHeight: d.placementHeight ?? null,
        accessToken: token,
        tokenExpiresAt: expiresAt,
      },
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'ADD_ESIGN_SIGNER',
      description: `${ctx.name} menambahkan ${signer.signerName} sebagai penandatangan urutan ${signer.signingOrder} pada dokumen "${doc.title}" (${doc.documentNumber})`,
      metadata: { signerId: signer.id, signerName: signer.signerName, signingOrder: signer.signingOrder },
      req,
    });

    const { accessToken: _t, tokenExpiresAt: _e, ...safe } = signer as any;
    return apiOk({
      item: safe,
      // Peringatan (bukan error): tanpa nomor HP, signer tidak akan
      // menerima notifikasi WhatsApp E-Sign — hanya notifikasi in-app.
      ...(membership.user.phone
        ? {}
        : {
            warning:
              'Pengguna ini belum memiliki nomor HP — ia tidak akan menerima notifikasi WhatsApp E-Sign (hanya notifikasi in-app).',
          }),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambahkan penandatangan.', 500);
  }
}
