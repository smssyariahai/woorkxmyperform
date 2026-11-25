// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { slugify } from '@/lib/utils';
import { randomUUID } from 'node:crypto';
import { ensureOfficeDns } from '@/lib/cloudflare';
import { masterPrisma } from '@/lib/tenant/master';
import { registerCompany } from '@/lib/tenant/registration';
import { syncPackageModulesToTenant } from '@/lib/tenant/package-sync';
import { changePackage } from '@/lib/tenant/subscription-lifecycle';
import { getBillingSettings, validatePackageSelection } from '@/lib/pricing-catalog';
import { LEGACY_TO_MODULAR, PAID_MODULE_KEYS } from '@/lib/modular';

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
 * POST /api/super/offices — buat kantor baru via provisioning engine
 * (database-per-tenant). Body: { name, description?, phone?, email?,
 * address?, adminName, adminEmail, adminPassword, modules?, userQuota?,
 * billingCycle?, startDate? }
 *
 * LAPISAN B: TIDAK ADA lagi pembuatan org/subscription/invoice/seed/
 * membership di woork_saas. Tenant baru dibuat lewat registerCompany:
 * PlatformUser + Tenant + ProvisioningJob + Membership OWNER +
 * Subscription FREE trial 14 hari di master DB, lalu provisioning database
 * tenant dipicu async.
 *
 * PENYIMPANGAN dari perilaku lama (dicatat untuk koordinator):
 * - TIDAK ADA lagi Invoice PENDING_PAYMENT: trial FREE 14 hari langsung
 *   ACTIVE (bila sistem trial dimatikan di Pengaturan: langsung AKTIF).
 * - Paket wizard (userTierId/storageTierId/modules/billingCycle) DITERAPKAN
 *   via changePackage (validasi + snapshot + sinkronisasi modul eksplisit);
 *   userQuota/startDate masih DIABAIKAN (trial selalu kuota 10, mulai saat dibuat).
 * - description/phone/email/address kantor DIABAIKAN — Tenant master tidak
 *   punya kolom untuk itu (bisa ditambah di lapisan berikutnya bila perlu).
 * - Audit CREATE_OFFICE ke log audit legacy DIHAPUS (itu tulis ke
 *   woork_saas); jejak audit kini COMPANY_REGISTERED di master DB.
 * - Subdomain DNS diturunkan dari slug tenant; keunikannya tidak lagi
 *   dicek ke registry mana pun (Organization.subdomain sudah tidak dipakai)
 *   — bila CNAME sudah ada, ensureOfficeDns mengembalikan alreadyExisted.
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

    // Paket langganan (Bab 9, wizard Buat Kantor): tier pengguna + tier
    // storage + modul berbayar + siklus. Dipetakan dari kunci lama ke kunci
    // berbayar, lalu divalidasi SEBELUM tenant dibuat — paket tidak valid
    // menggagalkan pembuatan (400), bukan meninggalkan tenant tanpa paket.
    // Tanpa tier yang dipilih, tenant dibuat dengan paket bawaan trial dan
    // modul yang dipilih tetap disinkronkan eksplisit (fail-closed).
    const picked = (Array.isArray(body?.modules) ? body.modules : [])
      .map((k: unknown) => LEGACY_TO_MODULAR[String(k)] ?? String(k))
      .filter((k: string) => (PAID_MODULE_KEYS as readonly string[]).includes(k));
    const userTierId = typeof body?.userTierId === 'string' ? body.userTierId : '';
    const storageTierId = typeof body?.storageTierId === 'string' ? body.storageTierId : '';
    const billingCycle =
      body?.billingCycle === 'YEARLY' || body?.billingCycle === 'MONTHLY' ? body.billingCycle : 'MONTHLY';
    const withPackage = Boolean(userTierId || storageTierId);
    // Toggle trial (2026-11-25): bila trial dimatikan, tenant baru Jalur A
    // langsung AKTIF (berbayar) — validasi paket memakai aturan berbayar
    // (wajib ≥1 modul berbayar).
    const trialOn = (await getBillingSettings()).trialEnabled;
    if (withPackage) {
      const validation = await validatePackageSelection({
        userTierId: userTierId || null,
        storageTierId: storageTierId || null,
        moduleKeys: picked,
        isPaid: !trialOn,
      });
      if (!validation.ok) return apiErr(validation.errors.join(' '), 400);
    }

    // Slug tenant: unik di Tenant.companySlug (master). Bila bentrok,
    // tambah suffix acak seperti perilaku lama.
    const baseSlug = slugify(name) || 'kantor';
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const taken = await masterPrisma.tenant.findUnique({ where: { companySlug: slug } });
      if (!taken) break;
      slug = `${baseSlug}-${randomUUID().slice(0, 6)}`;
    }

    // Bila email owner SUDAH terdaftar sebagai PlatformUser, pakai akun itu
    // sebagai OWNER tenant baru (jangan gagal) — via platformUserId.
    const existingPlatformUser = await masterPrisma.platformUser.findUnique({
      where: { email: adminEmail },
    });

    let created: { tenantId: string; tenantCode: string; platformUserId: string };
    try {
      created = await registerCompany({
        companyName: name,
        slug,
        adminName,
        adminEmail,
        adminPassword,
        billingCycle,
        startChoice: trialOn ? 'TRIAL' : 'PAID',
        ...(existingPlatformUser ? { platformUserId: existingPlatformUser.id } : {}),
      });
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('slug sudah dipakai') || msg.includes('email sudah terdaftar')) {
        return apiErr(msg, 409);
      }
      if (
        msg.startsWith('Nama perusahaan') ||
        msg.startsWith('Nama admin') ||
        msg.startsWith('format email') ||
        msg.startsWith('Password minimal') ||
        msg.startsWith('slug tidak valid')
      ) {
        return apiErr(msg, 422);
      }
      throw e;
    }

    // Subdomain otomatis dari slug tenant (unik per tenant karena slug unik).
    const RESERVED = new Set(['www', 'api', 'admin', 'app', 'mail', 'ftp', 'blog', 'shop', 'woork', 'router', 'karir']);
    let subdomain = slug.replace(/-/g, '') || 'kantor';
    if (RESERVED.has(subdomain)) subdomain = `${subdomain}-kantor`;

    // Trial FREE 14 hari bila trial aktif; bila trial dimatikan, tenant
    // langsung AKTIF dengan akhir periode berjalan (30/365 hari).
    // (registerCompany tidak mengembalikan tanggal-tanggal ini; dihitung
    // ulang di sini hanya untuk ditampilkan di respons.)
    const trialEndsAt = trialOn ? new Date(Date.now() + 14 * 24 * 3600 * 1000) : null;
    const currentPeriodEndsAt = trialOn
      ? null
      : new Date(Date.now() + (billingCycle === 'YEARLY' ? 365 : 30) * 24 * 3600 * 1000);

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

    // Terapkan paket (Bab 8 + 9, fail-closed 2026-11-25): bila Master
    // memilih tier di wizard, paket diterapkan penuh via changePackage
    // (validasi + snapshot harga + sinkronisasi modul eksplisit). Tanpa
    // tier, modul yang dipilih tetap disinkronkan eksplisit — tanpa
    // pilihan, tenant baru TIDAK mendapat modul berbayar sampai paket
    // diatur di Langganan. Kegagalan sync tidak menggagalkan pembuatan
    // kantor (peringatan dikembalikan).
    let packageSyncWarning: string | undefined;
    try {
      if (withPackage) {
        const changed = await changePackage(
          created.tenantId,
          { userTierId, storageTierId, moduleKeys: picked },
          ctx.userId,
        );
        packageSyncWarning = changed.packageSyncWarning;
      } else {
        await syncPackageModulesToTenant(created.tenantId, { moduleKeys: picked });
      }
    } catch (e: any) {
      packageSyncWarning = e?.message ?? String(e);
      console.error('[super/offices] penerapan paket gagal:', packageSyncWarning);
    }

    return apiOk(
      {
        id: created.tenantId,
        tenantCode: created.tenantCode,
        name,
        slug,
        subdomain,
        siteUrl: `https://${subdomain}.xsramazys.dev`,
        dnsOk,
        dnsError,
        packageSyncWarning,
        subscription: {
          plan: 'FREE',
          status: 'ACTIVE',
          billingCycle,
          userQuota: 10,
          trialEndsAt,
          currentPeriodEndsAt,
        },
        // PENYIMPANGAN: tidak ada invoice untuk trial FREE.
        invoice: null,
      },
      201
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat kantor.', 500);
  }
}
