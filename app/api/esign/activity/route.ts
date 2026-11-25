import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/esign/activity — riwayat aktivitas E-Sign lintas dokumen dalam satu org.
 * Query: ?documentId= (opsional), ?action= (opsional), ?page=, ?limit=.
 * Urut terbaru dulu. Guard: ESIGN_VIEW.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ESIGN_VIEW');
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId')?.trim() || '';
    const action = searchParams.get('action')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

    const where: any = { document: { organizationId: ctx.organizationId } };
    if (documentId) where.documentId = documentId;
    if (action) where.action = action;

    const [total, rows] = await Promise.all([
      prisma.esignAuditLog.count({ where }),
      prisma.esignAuditLog.findMany({
        where,
        include: {
          document: { select: { id: true, documentNumber: true, title: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    // EsignAuditLog TIDAK punya relasi `user` di tenant client — ambil dari
    // mirror User (Lapisan F).
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const items = rows.map((r) => ({ ...r, user: r.userId ? byId.get(r.userId) ?? null : null }));

    return apiOk({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat riwayat aktivitas E-Sign.', 500);
  }
}
