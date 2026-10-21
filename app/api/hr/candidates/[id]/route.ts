import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrCandidateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

async function findOne(ctx: { organizationId: string }, id: string) {
  return prisma.hrCandidate.findFirst({ where: { id, organizationId: ctx.organizationId } });
}

/** PUT /api/hr/candidates/[id] — ubah kandidat / pindah tahap */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Kandidat tidak ditemukan.', 404);
    const parsed = hrCandidateSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const item = await prisma.hrCandidate.update({
      where: { id: cur.id },
      data: {
        vacancyId: d.vacancyId || null,
        name: d.name.trim(),
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        address: d.address?.trim() || null,
        birthDate: d.birthDate ? new Date(d.birthDate) : null,
        education: d.education?.trim() || null,
        experience: d.experience?.trim() || null,
        source: d.source?.trim() || null,
        stage: d.stage,
        rating: d.rating ?? null,
        notes: d.notes?.trim() || null,
      },
      include: { vacancy: { select: { id: true, title: true } } },
    });
    if (cur.stage !== d.stage) {
      await audit({
        organizationId: ctx.organizationId, userId: ctx.userId,
        action: 'MOVE_CANDIDATE_STAGE', module: 'HR',
        description: `${ctx.name} memindahkan "${item.name}" dari ${cur.stage} ke ${d.stage}`,
      });
    }
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui kandidat.', 500);
  }
}

/** DELETE /api/hr/candidates/[id] — hapus kandidat */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Kandidat tidak ditemukan.', 404);
    await prisma.hrCandidate.delete({ where: { id: cur.id } });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'DELETE_CANDIDATE', module: 'HR',
      description: `${ctx.name} menghapus kandidat "${cur.name}"`,
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus kandidat.', 500);
  }
}
