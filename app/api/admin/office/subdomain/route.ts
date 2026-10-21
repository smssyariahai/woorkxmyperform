import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { ensureOfficeDns, deleteOfficeDns } from '@/lib/cloudflare';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const subdomainSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Subdomain minimal 3 karakter.')
    .max(63, 'Subdomain maksimal 63 karakter.')
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Hanya huruf kecil, angka, dan strip (-).'),
});

const RESERVED = new Set(['www', 'api', 'admin', 'app', 'mail', 'blog', 'cdn', 'woork-saas', 'karir']);

/**
 * PUT /api/admin/office/subdomain — custom subdomain kantor.
 * Hanya role OWNER (atau Administrator Pusat). Hanya bisa diubah 1x;
 * pengisian pertama (dari kosong) tidak dihitung sebagai perubahan.
 * Body: { subdomain }
 */
export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE', req);
    if (!ctx.isSuperAdmin && ctx.role !== 'OWNER') {
      return apiErr('Hanya Owner yang dapat mengubah subdomain.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = subdomainSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Subdomain tidak valid.', 422);
    }
    const next = parsed.data.subdomain;
    if (RESERVED.has(next)) return apiErr('Subdomain ini tidak tersedia.', 422);

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, subdomain: true, subdomainChangedAt: true },
    });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);

    if (org.subdomain === next) {
      return apiOk({ subdomain: next, siteUrl: `https://${next}.xsramazys.dev` });
    }

    // Batasan 1x: berlaku bila sudah pernah mengubah sebelumnya (kecuali super admin)
    if (!ctx.isSuperAdmin && org.subdomainChangedAt) {
      return apiErr('Subdomain hanya dapat diubah 1 kali dan sudah digunakan.', 403);
    }

    const taken = await prisma.organization.findFirst({
      where: { subdomain: next, id: { not: org.id } },
      select: { id: true },
    });
    if (taken) return apiErr('Subdomain sudah dipakai kantor lain.', 409);

    // Buat DNS baru dulu; bila gagal, batalkan sebelum mengubah DB
    const dns = await ensureOfficeDns(next);
    if (!dns.ok) {
      return apiErr(`Gagal membuat DNS untuk ${next}.xsramazys.dev: ${dns.error ?? ''}`, 502);
    }

    const isFirstSet = !org.subdomain;
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        subdomain: next,
        // Pengisian pertama gratis; perubahan berikutnya mengunci
        subdomainChangedAt: isFirstSet ? org.subdomainChangedAt : new Date(),
      },
    });

    // Bersihkan DNS lama (best-effort)
    if (org.subdomain) deleteOfficeDns(org.subdomain).catch(() => {});

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_OFFICE_SUBDOMAIN',
      module: 'OFFICES',
      description: `Mengubah subdomain ${org.subdomain ?? '(kosong)'} → ${next}.xsramazys.dev${isFirstSet ? '' : ' (jatah 1x terpakai)'}`,
      ipAddress: getClientIp(req),
    });

    return apiOk({ subdomain: next, siteUrl: `https://${next}.xsramazys.dev`, locked: !isFirstSet });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah subdomain.', 500);
  }
}
