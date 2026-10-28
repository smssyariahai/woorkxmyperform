import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { seedOrgDefaults } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { randomUUID } from 'node:crypto';
import { ensureOfficeDns } from '@/lib/cloudflare';

export const dynamic = 'force-dynamic';

/** GET /api/super/offices — daftar seluruh kantor + statistik. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = {};
    if (q) where.name = { contains: q, mode: 'insensitive' };
    const orgs = await prisma.organization.findMany({
      where,
      include: {
        _count: { select: { memberships: true, customers: true } },
        memberships: {
          where: { role: { name: 'OWNER' }, status: 'ACTIVE' },
          include: { user: { select: { name: true, email: true } } },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return apiOk(
      orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        subdomain: o.subdomain,
        siteUrl: o.subdomain ? `https://${o.subdomain}.xsramazys.dev` : null,
        isActive: o.isActive,
        modules: JSON.parse(o.modules || '[]'),
        userCount: o._count.memberships,
        customerCount: o._count.customers,
        owners: o.memberships.map((m) => m.user),
        createdAt: o.createdAt,
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar kantor.', 500);
  }
}

/**
 * POST /api/super/offices — buat kantor baru + admin kantor.
 * Body: { name, adminName, adminEmail, adminPassword }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const adminName = String(body?.adminName || '').trim();
    const adminEmail = String(body?.adminEmail || '').toLowerCase().trim();
    const adminPassword = String(body?.adminPassword || '');
    if (!name) return apiErr('Nama kantor wajib diisi.', 422);
    if (!adminName || !adminEmail || !adminPassword) {
      return apiErr('Data admin kantor (nama, email, password) wajib diisi.', 422);
    }
    if (adminPassword.length < 8) return apiErr('Password admin minimal 8 karakter.', 422);

    const slug = `${slugify(name)}-${randomUUID().slice(0, 6)}`;

    // Subdomain otomatis dari nama kantor (unik)
    const RESERVED = new Set(['www', 'api', 'admin', 'app', 'mail', 'ftp', 'blog', 'shop', 'woork', 'router', 'karir']);
    let base = slugify(name).replace(/-/g, '') || 'kantor';
    if (RESERVED.has(base)) base = `${base}-kantor`;
    let subdomain = base;
    for (let i = 2; i < 100; i++) {
      const exists = await prisma.organization.findUnique({ where: { subdomain } });
      if (!exists) break;
      subdomain = `${base}${i}`;
    }

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name, slug, subdomain, subscription: { create: { plan: 'FREE' } } },
      });
      let adminUser = await tx.user.findUnique({ where: { email: adminEmail } });
      if (!adminUser) {
        adminUser = await tx.user.create({
          data: {
            name: adminName,
            email: adminEmail,
            password: await hashPassword(adminPassword),
            status: 'ACTIVE',
          },
        });
      }
      return { org, adminUser };
    });

    await seedOrgDefaults(result.org.id);
    const ownerRole = await prisma.role.findFirst({
      where: { organizationId: result.org.id, name: 'OWNER' },
    });
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: result.adminUser.id, organizationId: result.org.id } },
      update: { roleId: ownerRole!.id, status: 'ACTIVE' },
      create: { userId: result.adminUser.id, organizationId: result.org.id, roleId: ownerRole!.id },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_OFFICE',
      module: 'OFFICES',
      description: `Administrator Pusat membuat kantor "${name}" dengan admin ${adminName} (${adminEmail})`,
      ipAddress: getClientIp(req),
    });

    // Buatkan subdomain + DNS otomatis (tidak menggagalkan pembuatan kantor bila gagal)
    let dnsOk = false;
    let dnsError: string | undefined;
    try {
      const dns = await ensureOfficeDns(subdomain);
      dnsOk = dns.ok;
      dnsError = dns.error;
    } catch (e: any) {
      dnsError = e.message;
    }

    return apiOk(
      {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
        subdomain,
        siteUrl: `https://${subdomain}.xsramazys.dev`,
        dnsOk,
        dnsError,
      },
      201
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat kantor.', 500);
  }
}
