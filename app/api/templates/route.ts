import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { templateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Template bawaan untuk organisasi yang belum punya satupun */
const DEFAULT_TEMPLATES = [
  {
    name: 'Sapaan awal',
    category: 'Sapaan',
    body: 'Halo {{nama}}, terima kasih sudah menghubungi kami! Ada yang bisa kami bantu hari ini?',
  },
  {
    name: 'Kirim perbandingan paket',
    category: 'Paket & Harga',
    body: 'Halo {{nama}}, berikut perbandingan paket kami:\n\n• Free — cocok untuk coba-coba\n• Starter — untuk tim kecil\n• Professional — fitur lengkap + prioritas\n\nBoleh tahu kebutuhan {{nama}} seperti apa? Saya bantu rekomendasikan yang paling pas.',
  },
  {
    name: 'Jadwalkan follow up besok',
    category: 'Follow Up',
    body: 'Halo {{nama}}, izin follow up ya. Apakah sudah ada keputusan terkait penawaran kami kemarin? Saya siap bantu jika ada yang perlu didiskusikan.',
  },
  {
    name: 'Penutup ramah',
    category: 'Penutup',
    body: 'Terima kasih {{nama}}! Jangan ragu menghubungi kami kembali jika ada pertanyaan. Sukses selalu!',
  },
];

async function seedDefaults(organizationId: string, userId: string) {
  const count = await prisma.replyTemplate.count({ where: { organizationId } });
  if (count > 0) return;
  await prisma.replyTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({
      organizationId,
      name: t.name,
      category: t.category,
      body: t.body,
      createdById: userId,
    })),
  });
}

/** GET /api/templates — daftar template balasan (auto-seed bila kosong) */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const activeOnly = searchParams.get('active') !== '0';

    await seedDefaults(ctx.organizationId, ctx.userId);

    const where: any = { organizationId: ctx.organizationId };
    if (activeOnly) where.isActive = true;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    // ReplyTemplate TIDAK punya relasi `createdBy` di tenant client —
    // ambil dari mirror User lalu gabung (pola baku Lapisan F).
    const rows = await prisma.replyTemplate.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      take: 100,
    });
    const authorIds = [...new Set(rows.map((t) => t.createdById).filter((id): id is string => !!id))];
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(authors.map((u) => [u.id, u]));
    const items = rows.map((t) => ({
      ...t,
      createdBy: t.createdById ? byId.get(t.createdById) ?? null : null,
    }));
    const categories = await prisma.replyTemplate.findMany({
      where: { organizationId: ctx.organizationId },
      select: { category: true },
      distinct: ['category'],
    });
    return apiOk({ items, categories: categories.map((c) => c.category) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat template.', 500);
  }
}

/** POST /api/templates — buat template baru */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const body = await req.json();
    const parsed = templateSchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);

    const tpl = await prisma.replyTemplate.create({
      data: {
        organizationId: ctx.organizationId,
        name: parsed.data.name.trim(),
        category: parsed.data.category.trim() || 'Umum',
        body: parsed.data.body.trim(),
        isActive: parsed.data.isActive ?? true,
        createdById: ctx.userId,
      },
    });
    // ReplyTemplate TIDAK punya relasi `createdBy` di tenant client.
    const author = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_TEMPLATE',
      module: 'INBOX',
      description: `${ctx.name} membuat template balasan "${tpl.name}"`,
      ipAddress: getClientIp(req),
    });

    return apiOk({ ...tpl, createdBy: author ?? null }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat template.', 500);
  }
}
