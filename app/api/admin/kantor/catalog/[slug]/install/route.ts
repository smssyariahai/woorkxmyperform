// POST /api/admin/kantor/catalog/[slug]/install — pasang template katalog
// sebagai Agent instance di DB TENANT pemanggil (bukan master).
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin
// (pola yang sama dengan POST /api/kantor/agents).
// Body: { name?, departmentId?, tools? }
//  - name: opsional, default nama template. Konflik nama per org -> 409.
//  - departmentId: opsional, harus milik org yang sama -> 404 bila tidak ada.
//  - tools: irisan dengan registry 7 tool WOORK; kunci tak dikenal -> 422.
// systemInstructions instance = isi template APA ADANYA (sudah tampil untuk
// di-review di UI katalog) — template diperlakukan sebagai data tak tepercaya,
// TIDAK PERNAH dieksekusi mentah; tools repo hanya informatif (requiredTools
// repo tidak punya padanan WOORK, jadi tidak pernah disimpan sebagai tools).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { masterPrisma } from '@/lib/tenant/master';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { canManageAgents, isBuiltinAgent } from '@/lib/agents/manage';
import { TOOLS } from '@/lib/agents/tools';
import { publishAgentEvent } from '@/lib/agents/events';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Client tenant (tipe dari skema tenant) — dipakai untuk field Fase 3/4
 *  (departmentId, templateSlug, templateVersion) yang tidak ada di skema
 *  legacy. Pola yang sama dengan /api/admin/departments (Fase 3a). */
const tprisma = prisma as unknown as TenantPrismaClient;

const KNOWN_TOOLS = new Set(Object.keys(TOOLS));

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh memasang agent dari katalog.', 403);
    }

    const template = await masterPrisma.agentTemplate.findUnique({
      where: { slug: params.slug },
    });
    if (!template) return apiErr('Template tidak ditemukan.', 404);
    if (!template.isActive) {
      return apiErr(
        `Template "${template.name}" sudah tidak aktif dan tidak bisa dipasang.`,
        409,
      );
    }

    const body = await req.json().catch(() => null);
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const name = rawName || template.name;
    if (name.length > 50) return apiErr('Nama instance maksimal 50 karakter.', 422);
    if (isBuiltinAgent(name)) {
      return apiErr(`Nama "${name}" sudah dipakai agent bawaan — pilih nama lain.`, 422);
    }

    let departmentId: string | null = null;
    if (body?.departmentId !== undefined && body?.departmentId !== null && body?.departmentId !== '') {
      const deptId = String(body.departmentId);
      const dept = await tprisma.department.findFirst({
        where: { id: deptId, organizationId: ctx.organizationId },
        select: { id: true, name: true },
      });
      if (!dept) return apiErr('Divisi tidak ditemukan di kantor ini.', 404);
      departmentId = dept.id;
    }

    let tools: string[] = [];
    if (body?.tools !== undefined && body?.tools !== null) {
      if (!Array.isArray(body.tools)) return apiErr('Daftar tools tidak valid.', 422);
      tools = body.tools.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean);
      const unknown = tools.filter((t) => !KNOWN_TOOLS.has(t));
      if (unknown.length > 0) {
        return apiErr(`Tool tidak dikenal: ${unknown.join(', ')}.`, 422);
      }
    }

    const clash = await tprisma.agent.findFirst({
      where: {
        organizationId: ctx.organizationId,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) {
      return apiErr(`Agent bernama "${name}" sudah ada di kantor ini — pilih nama lain.`, 409);
    }

    // Skills instance: turunan dari Deliverables template (maks 10, tiap
    // maks 50 karakter — mengikuti batas validasi agent di manage.ts).
    const skills = parseJsonStringArray(template.deliverables)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((s) => (s.length > 50 ? `${s.slice(0, 47)}…` : s));

    const created = await tprisma.agent.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        role: template.name.slice(0, 100),
        description: template.description.slice(0, 300),
        avatarColor: '#007AFD',
        skills: JSON.stringify(skills),
        systemInstructions: template.systemInstructions,
        tools: JSON.stringify(tools),
        departmentId,
        templateSlug: template.slug,
        templateVersion: template.templateVersion,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
        description: true,
        avatarColor: true,
        currentStatus: true,
        isEnabled: true,
        departmentId: true,
        templateSlug: true,
        templateVersion: true,
      },
    });

    await publishAgentEvent(ctx.organizationId, 'agent.connected', {
      agentId: created.id,
      name: created.name,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'INSTALL_CATALOG_AGENT',
      module: 'KANTOR',
      description: `Memasang agent "${created.name}" dari katalog "${template.slug}" (v${template.templateVersion})`,
      ipAddress: getClientIp(req),
    });

    return apiOk({ agent: created }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    // Race nama ganda (unique [organizationId, name]) -> 409 yang jelas.
    if (e?.code === 'P2002') {
      return apiErr('Agent dengan nama itu sudah ada di kantor ini — pilih nama lain.', 409);
    }
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memasang agent dari katalog.', 500);
  }
}
