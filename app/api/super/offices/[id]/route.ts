import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { AVAILABLE_MODULES } from '@/lib/modules';
import { ensureOfficeDns, deleteOfficeDns } from '@/lib/cloudflare';
import { slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** PATCH /api/super/offices/:id — edit kantor (nama, status aktif, modul). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const org = await prisma.organization.findUnique({ where: { id: params.id } });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);

    const body = await req.json();
    const data: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama kantor tidak boleh kosong.', 422);
      data.name = name;
    }
    if (body?.isActive !== undefined) data.isActive = body.isActive === true;
    let dnsResult: { ok: boolean; error?: string } | undefined;
    if (body?.subdomain !== undefined) {
      if (body.subdomain === null || String(body.subdomain).trim() === '') {
        if (org.subdomain) await deleteOfficeDns(org.subdomain).catch(() => {});
        data.subdomain = null;
        data.subdomainChangedAt = null;
      } else {
      const raw = slugify(String(body.subdomain)).replace(/-/g, '');
      if (!raw) return apiErr('Subdomain tidak valid.', 422);
      const RESERVED = new Set(['www', 'api', 'admin', 'app', 'mail', 'ftp', 'blog', 'shop', 'woork', 'router', 'karir']);
      if (RESERVED.has(raw)) return apiErr('Subdomain tersebut dicadangkan sistem.', 422);
      const clash = await prisma.organization.findUnique({ where: { subdomain: raw } });
      if (clash && clash.id !== org.id) return apiErr('Subdomain sudah dipakai kantor lain.', 409);
      const oldSub = org.subdomain;
      data.subdomain = raw;
      data.subdomainChangedAt = null; // admin override: beri owner kesempatan 1x lagi
      // Buat DNS untuk subdomain baru, hapus yang lama
      const dns = await ensureOfficeDns(raw);
      dnsResult = { ok: dns.ok, error: dns.error };
      if (oldSub && oldSub !== raw) {
        await deleteOfficeDns(oldSub).catch(() => {});
      }
      }
    }
    if (Array.isArray(body?.modules)) {
      const valid: Set<string> = new Set(AVAILABLE_MODULES.map((m) => m.key));
      data.modules = JSON.stringify([...new Set(body.modules)].filter((k) => valid.has(k as string)));
    }

    const updated = await prisma.organization.update({ where: { id: org.id }, data });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_OFFICE',
      module: 'OFFICES',
      description: `Administrator Pusat memperbarui kantor "${org.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      subdomain: updated.subdomain,
      siteUrl: updated.subdomain ? `https://${updated.subdomain}.xsramazys.dev` : null,
      dnsOk: dnsResult?.ok,
      dnsError: dnsResult?.error,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui kantor.', 500);
  }
}

/** DELETE /api/super/offices/:id — hapus kantor permanen (HANYA Administrator Pusat). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);

    const org = await prisma.organization.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, subdomain: true, logoPath: true, coverPath: true },
    });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);

    // Jangan hapus kantor tempat admin sedang login
    if (org.id === ctx.organizationId) {
      return apiErr('Tidak dapat menghapus kantor tempat Anda sedang aktif.', 403);
    }

    // Hapus DNS subdomain (best-effort)
    if (org.subdomain) await deleteOfficeDns(org.subdomain).catch(() => {});

    // Hapus file logo/cover (best-effort)
    const { unlink } = await import('fs/promises');
    const { join } = await import('path');
    for (const f of [org.logoPath, org.coverPath]) {
      if (f) await unlink(join(process.cwd(), 'uploads', 'offices', f)).catch(() => {});
    }
    // Hapus sesi WhatsApp kantor (best-effort)
    const { rm } = await import('fs/promises');
    await rm(join(process.cwd(), '.wa-sessions', org.id), { recursive: true, force: true }).catch(() => {});

    // Hapus organisasi — relasi anak ter-cascade di level DB
    await prisma.organization.delete({ where: { id: org.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_OFFICE',
      module: 'OFFICES',
      description: `Administrator Pusat menghapus kantor "${org.name}" permanen`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus kantor.', 500);
  }
}
