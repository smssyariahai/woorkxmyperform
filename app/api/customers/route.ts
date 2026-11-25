import { prisma } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { customerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/customers — daftar + search + filter + pagination */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CRM_VIEW');
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const stage = searchParams.get('stage') ?? '';
    const score = searchParams.get('score') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('perPage') ?? '10')));
    const sort = searchParams.get('sort') ?? 'updatedAt';
    const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

    const where: any = { organizationId: ctx.organizationId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (stage) where.stage = stage;
    if (score) where.score = score;

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          conversations: { select: { channelType: true }, take: 1, orderBy: { lastMessageAt: 'desc' } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    // Customer TIDAK punya relasi `owner` di tenant client — ambil dari
    // mirror User (Lapisan F).
    const ownerIds = [...new Set(rows.map((c) => c.ownerId).filter((id): id is string => !!id))];
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(owners.map((u) => [u.id, u]));
    const items = rows.map((c) => ({
      ...c,
      owner: c.ownerId ? byId.get(c.ownerId) ?? null : null,
    }));

    return apiOk({
      items: items.map((c) => ({
        ...c,
        tags: c.tags.map((t) => t.tag),
        channel: c.conversations[0]?.channelType ?? null,
      })),
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pelanggan.', 500);
  }
}

/** POST /api/customers — buat pelanggan baru */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;
    const customer = await prisma.customer.create({
      data: {
        organizationId: ctx.organizationId,
        name: d.name.trim(),
        phone: d.phone?.trim() || null,
        email: d.email?.trim() || null,
        company: d.company?.trim() || null,
        industry: d.industry?.trim() || null,
        source: d.source?.trim() || null,
        stage: d.stage || 'Baru',
        score: d.score || null,
        business: d.business?.trim() || null,
        interest: d.interest?.trim() || null,
        budget: d.budget?.trim() || null,
        ownerId: d.ownerId || ctx.userId,
        tags: d.tags?.length
          ? {
              create: await Promise.all(
                d.tags.map(async (name) => {
                  const tag = await prisma.tag.upsert({
                    where: { organizationId_name: { organizationId: ctx.organizationId, name } },
                    update: {},
                    create: { organizationId: ctx.organizationId, name },
                  });
                  return { tagId: tag.id };
                })
              ),
            }
          : undefined,
      },
      // Customer TIDAK punya relasi `owner` di tenant client — buat tanpa
      // include owner, lalu ambil nama owner dari mirror User seperti GET.
      include: { tags: { include: { tag: true } } },
    });
    const owner = customer.ownerId
      ? await prisma.user.findUnique({ where: { id: customer.ownerId }, select: { id: true, name: true } })
      : null;

    await prisma.activity.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        actorId: ctx.userId,
        type: 'CUSTOMER_CREATED',
        title: 'Pelanggan dibuat',
        description: `${ctx.name} menambahkan ${customer.name}`,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_CUSTOMER',
      module: 'CRM',
      description: `Membuat pelanggan ${customer.name}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return apiOk({ ...customer, owner: owner ?? null }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat pelanggan.', 500);
  }
}
