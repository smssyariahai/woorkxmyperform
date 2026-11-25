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
        department: { select: { name: true } },
      },
    });
    if (!membership) return apiErr('Pengguna bukan anggota aktif kantor ini.', 422);
    // Membership TIDAK punya relasi `user` di tenant client — ambil dari
    // mirror User (Lapisan F).
    const memberUser = await prisma.user.findUnique({
      where: { id: d.userId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!memberUser) return apiErr('Pengguna bukan anggota aktif kantor ini.', 422);

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

    // Grup: bila tidak dipilih, signer baru membuka grup (langkah) baru
    // setelah grup terakhir — perilaku default tetap berurutan seperti dulu.
    const maxGroup = await prisma.esignSigner.aggregate({
      where: { documentId: doc.id },
      _max: { signingGroup: true },
    });
    const signingGroup = d.signingGroup ?? (maxGroup._max.signingGroup ?? 0) + 1;

    const emp = await prisma.hrEmployee.findFirst({
      where: { organizationId: ctx.organizationId, email: memberUser.email },
      select: { position: true, department: true },
    });

    const { token, expiresAt } = createAccessToken();
    const signer = await prisma.esignSigner.create({
      data: {
        documentId: doc.id,
        userId: d.userId,
        signerName: d.signerName?.trim() || memberUser.name,
        signerEmail: d.signerEmail?.trim() || memberUser.email,
        signerPhone: memberUser.phone,
        signerPosition:
          d.signerPosition?.trim() || membership.jobTitle || emp?.position || null,
        signerDepartment:
          d.signerDepartment?.trim() || membership.department?.name || emp?.department || null,
        signingOrder: d.signingOrder,
        signingGroup,
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
      description: `${ctx.name} menambahkan ${signer.signerName} sebagai penandatangan urutan ${signer.signingOrder} (Grup ${signer.signingGroup}) pada dokumen "${doc.title}" (${doc.documentNumber})`,
      metadata: { signerId: signer.id, signerName: signer.signerName, signingOrder: signer.signingOrder, signingGroup: signer.signingGroup },
      req,
    });

    const { accessToken: _t, tokenExpiresAt: _e, ...safe } = signer as any;
    return apiOk({
      item: safe,
      // Peringatan (bukan error): tanpa nomor HP, signer tidak akan
      // menerima notifikasi WhatsApp E-Sign — hanya notifikasi in-app.
      ...(memberUser.phone
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

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        signerId: z.string().min(1),
        signingGroup: z.coerce.number().int().min(1).max(100),
      })
    )
    .min(1)
    .max(100),
});

/**
 * PUT /api/esign/documents/[id]/signers — atur ulang urutan + grup
 * penandatangan sekaligus (dipakai drag-and-drop di SignerManager).
 * Urutan array = urutan tampil; signingOrder dihitung ulang 1..N.
 * Grup dinormalisasi 1..N sesuai urutan kemunculan pertama.
 * Hanya saat DRAFT; daftar harus memuat SEMUA penandatangan dokumen.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true, documentNumber: true, status: true },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status !== 'DRAFT') {
      return apiErr('Urutan penandatangan hanya dapat diubah saat dokumen masih DRAFT.', 409);
    }
    const parsed = reorderSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const items = parsed.data.items;

    const existing = await prisma.esignSigner.findMany({
      where: { documentId: doc.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const seen = new Set(items.map((it) => it.signerId));
    if (
      items.length !== existing.length ||
      seen.size !== items.length ||
      items.some((it) => !existingIds.has(it.signerId))
    ) {
      return apiErr('Daftar penandatangan tidak lengkap atau tidak valid.', 422);
    }

    const groupMap = new Map<number, number>();
    const normalized = items.map((it, i) => {
      if (!groupMap.has(it.signingGroup)) groupMap.set(it.signingGroup, groupMap.size + 1);
      return {
        signerId: it.signerId,
        signingOrder: i + 1,
        signingGroup: groupMap.get(it.signingGroup)!,
      };
    });

    await prisma.$transaction(
      normalized.map((n) =>
        prisma.esignSigner.update({
          where: { id: n.signerId },
          data: { signingOrder: n.signingOrder, signingGroup: n.signingGroup },
        })
      )
    );

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'UPDATE_ESIGN_SIGNER',
      description: `${ctx.name} mengatur ulang urutan dan grup penandatangan (${groupMap.size} grup) pada dokumen "${doc.title}" (${doc.documentNumber})`,
      metadata: { groups: groupMap.size, signers: normalized.length },
      req,
    });

    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengatur ulang penandatangan.', 500);
  }
}
