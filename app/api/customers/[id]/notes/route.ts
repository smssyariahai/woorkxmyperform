import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { noteSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/customers/:id/notes */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_VIEW');
    const notes = await prisma.note.findMany({
      where: { customerId: params.id, organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    // Note TIDAK punya relasi `author` di tenant client (Lapisan F) —
    // ambil nama penulis dari mirror User.
    const authorIds = [...new Set(notes.map((n) => n.authorId).filter((id): id is string => !!id))];
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(authors.map((u) => [u.id, u]));
    return apiOk(notes.map((n) => ({ ...n, author: byId.get(n.authorId) ?? null })));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat catatan.', 500);
  }
}

/** POST /api/customers/:id/notes */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) return apiErr('Catatan tidak valid.', 422);
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!customer) return apiErr('Pelanggan tidak ditemukan.', 404);
    const note = await prisma.note.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: params.id,
        authorId: ctx.userId,
        body: parsed.data.body.trim(),
      },
    });
    return apiOk({ ...note, author: { id: ctx.userId, name: ctx.name } }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah catatan.', 500);
  }
}
