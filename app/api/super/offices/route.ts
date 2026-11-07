import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { seedOrgDefaults } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { randomUUID } from 'node:crypto';
import { ensureOfficeDns } from '@/lib/cloudflare';
import { calcSubscriptionTotal, MODULAR_MODULE_MAP, periodEndFrom } from '@/lib/modular';
import { getModulePrices, nextInvoiceNumber } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/** GET /api/super/offices — daftar seluruh kantor + statistik + langganan. */
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
        subscription: { include: { modules: true } },
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
        subscription: o.subscription
          ? {
              status: o.subscription.status,
              billingCycle: o.subscription.billingCycle,
              userQuota: o.subscription.userQuota,
              startDate: o.subscription.startDate,
              endDate: o.subscription.endDate,
              modules: o.subscription.modules.map((m) => m.moduleKey),
            }
          : null,
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar kantor.', 500);
  }
}

/**
 * POST /api/super/offices — buat kantor baru + admin kantor + langganan + invoice.
 * Body: { name, description?, phone?, email?, address?, adminName, adminEmail, adminPassword,
 *         modules?: ('chat'|'hris'|'audit')[], userQuota?: number, billingCycle?: 'MONTHLY'|'YEARLY', startDate?: string }
 * Modul & kuota tidak diisi = semua modul berbayar, kuota 10, bulanan, mulai hari ini.
 * Kantor dibuat dengan langganan PENDING_PAYMENT + Invoice PENDING — admin
 * kantor baru bisa login setelah invoice ditandai lunas.
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

    // --- Langganan ---
    const BILLABLE = ['chat', 'hris', 'audit'] as const;
    let modules: string[] = Array.isArray(body?.modules) ? body.modules.map(String) : [...BILLABLE];
    modules = [...new Set(modules.filter((m) => (BILLABLE as readonly string[]).includes(m)))];
    const userQuota = body?.userQuota === undefined || body?.userQuota === null ? 10 : Number(body.userQuota);
    if (!Number.isInteger(userQuota) || userQuota < 1 || userQuota > 10000) {
      return apiErr('Kuota karyawan harus angka 1–10000.', 422);
    }
    const billingCycle = body?.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    const startDate = body?.startDate ? new Date(String(body.startDate)) : new Date();
    if (Number.isNaN(startDate.getTime())) return apiErr('Tanggal mulai tidak valid.', 422);
    const endDate = periodEndFrom(startDate, billingCycle as 'MONTHLY' | 'YEARLY');

    const prices = await getModulePrices();
    const chosenPrices = prices.filter((p) => modules.includes(p.moduleKey));
    const total = calcSubscriptionTotal({
      modules: chosenPrices,
      userQuota,
      cycle: billingCycle as 'MONTHLY' | 'YEARLY',
    });
    const cycleLabel = billingCycle === 'YEARLY' ? 'tahunan' : 'bulanan';

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

    const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : null;
    const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 30) : null;
    const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 120) : null;
    const address = typeof body?.address === 'string' ? body.address.trim().slice(0, 300) : null;

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          subdomain,
          description,
          phone,
          email,
          address,
          subscription: {
            create: {
              plan: 'FREE',
              status: 'PENDING_PAYMENT',
              billingCycle,
              userQuota,
              startDate,
              endDate,
              modules: {
                create: chosenPrices.map((p) => ({
                  moduleKey: p.moduleKey,
                  pricePerUserSnapshot:
                    billingCycle === 'YEARLY' ? p.yearlyPerUser : p.monthlyPerUser,
                  status: 'ACTIVE',
                })),
              },
            },
          },
        },
        include: { subscription: true },
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
      const number = await nextInvoiceNumber(tx as any);
      const dueDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const invoice = await tx.invoice.create({
        data: {
          organizationId: org.id,
          subscriptionId: org.subscription!.id,
          number,
          status: 'PENDING',
          billingCycle,
          periodStart: startDate,
          periodEnd: endDate,
          subtotal: total,
          total,
          dueDate,
          items: {
            create: chosenPrices.map((p) => {
              const unit = billingCycle === 'YEARLY' ? p.yearlyPerUser : p.monthlyPerUser;
              const label = MODULAR_MODULE_MAP.get(p.moduleKey as any)?.label ?? p.moduleKey;
              return {
                moduleKey: p.moduleKey,
                description: `Modul ${label} — ${userQuota} pengguna (${cycleLabel})`,
                quantity: userQuota,
                unitPrice: unit,
                amount: unit * userQuota,
              };
            }),
          },
        },
        include: { items: true },
      });
      return { org, adminUser, invoice };
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
      description: `Administrator Pusat membuat kantor "${name}" dengan admin ${adminName} (${adminEmail}) — modul: ${modules.join(', ') || 'tidak ada modul berbayar'}, kuota ${userQuota}, ${cycleLabel}, invoice ${result.invoice.number} Rp${total.toLocaleString('id-ID')} (PENDING)`,
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
        subscription: {
          status: 'PENDING_PAYMENT',
          billingCycle,
          userQuota,
          startDate,
          endDate,
          modules,
        },
        invoice: {
          id: result.invoice.id,
          number: result.invoice.number,
          status: result.invoice.status,
          total: result.invoice.total,
          dueDate: result.invoice.dueDate,
        },
      },
      201
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat kantor.', 500);
  }
}
