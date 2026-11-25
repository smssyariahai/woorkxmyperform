import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isTalAdmin } from '@/lib/tal/server';
import { TAL_DEFAULT_ROUTINE_TEMPLATES, type TalRoutineTemplate } from '@/lib/tal/types';

export const dynamic = 'force-dynamic';

function mapTemplate(row: any): TalRoutineTemplate {
  const t = (row.template ?? {}) as Record<string, any>;
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description ?? undefined,
    categoryTag: row.categoryTag ?? undefined,
    color: row.color ?? undefined,
    isPreset: !!row.isPreset,
    userId: row.userId ?? undefined,
    monthlyTasks: Array.isArray(t.monthlyTasks) ? t.monthlyTasks : [],
    weeklyTasks: Array.isArray(t.weeklyTasks) ? t.weeklyTasks : [],
    dailyTasks: Array.isArray(t.dailyTasks) ? t.dailyTasks : [],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** Template bawaan backup (3 preset) — selalu tersedia bila belum ada di DB. */
function builtinPresets(): TalRoutineTemplate[] {
  return TAL_DEFAULT_ROUTINE_TEMPLATES.map((t) => ({
    ...t,
    isPreset: true,
  }));
}

/**
 * GET /api/tal/routine-templates — daftar template: milik sendiri +
 * preset organisasi + preset bawaan backup (bila belum tersimpan di DB).
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const rows = await prisma.talRoutineTemplate.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ userId: ctx.userId }, { isPreset: true }],
      },
      orderBy: [{ isPreset: 'desc' }, { updatedAt: 'desc' }],
    });
    const mapped = rows.map(mapTemplate);
    const dbIds = new Set(mapped.map((t) => t.id));
    const presets = builtinPresets().filter((t) => !dbIds.has(t.id));
    return apiOk({ templates: [...presets, ...mapped] });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat template rutinitas TAL.', 500);
  }
}

/**
 * POST /api/tal/routine-templates — simpan template milik sendiri.
 * Body: { id?, name, description?, categoryTag?, color?,
 * monthlyTasks[], weeklyTasks[], dailyTasks[] }.
 * Bila id = preset bawaan → buat salinan sebagai template user (preset
 * bawaan tidak diubah). Bila id = baris preset DB → admin-only (§5.3).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return apiErr('Nama template wajib diisi.', 400);

    const cleanList = (arr: unknown) =>
      Array.isArray(arr)
        ? arr.filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
        : [];
    const templateJson = {
      monthlyTasks: cleanList(body.monthlyTasks),
      weeklyTasks: cleanList(body.weeklyTasks),
      dailyTasks: cleanList(body.dailyTasks),
    };

    const data = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      categoryTag: typeof body.categoryTag === 'string' ? body.categoryTag : 'Umum',
      color: typeof body.color === 'string' ? body.color : '#2563eb',
      isPreset: false,
      template: templateJson as any,
    };

    const id = typeof body.id === 'string' ? body.id : undefined;
    if (id && !id.startsWith('preset_') && !id.startsWith('temp_')) {
      const existing = await prisma.talRoutineTemplate.findFirst({
        where: { organizationId: ctx.organizationId, id },
      });
      if (existing) {
        if (existing.isPreset && !isTalAdmin(ctx)) {
          return apiErr('Hanya Administrator yang boleh mengubah template preset.', 403);
        }
        if (!existing.isPreset && existing.userId !== ctx.userId) {
          return apiErr('Template ini bukan milik Anda.', 403);
        }
        const saved = await prisma.talRoutineTemplate.update({ where: { id: existing.id }, data });
        return apiOk({ template: mapTemplate(saved) });
      }
    }
    const saved = await prisma.talRoutineTemplate.create({ data });
    return apiOk({ template: mapTemplate(saved) }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan template rutinitas TAL.', 500);
  }
}
