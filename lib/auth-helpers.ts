import { auth } from '@/lib/auth';
import { legacyPrisma, prisma } from '@/lib/db';
import {
  enterTenantContext,
  getCachedTenantInfo,
  getTenantClientForCode,
  runWithTenant,
} from '@/lib/tenant/resolver';
import { masterPrisma } from '@/lib/tenant/master';
import { apiErr } from '@/lib/utils';
import type { PermissionKey } from '@/lib/permissions';
import { AVAILABLE_MODULES, type ModuleKey } from '@/lib/modules';
import {
  LEVEL_RANK,
  PERMISSION_MODULE_LEVEL,
  legacyKeyOfPermission,
  type ModularKey,
} from '@/lib/modular';
import {
  effectiveModuleLevel,
  effectiveSubscriptionStatus,
  getSubscription,
  getUserModuleLevels,
  isModuleSubscribed,
} from '@/lib/subscription';
import { audit, getClientIp } from '@/lib/audit';
import { isWritePermission } from '@/lib/trial';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: string;
  isSuperAdmin: boolean;
  /**
   * Pintu login sesi ini ('admin' = /admin, 'office' = /login).
   * Sesi office-door adalah sesi karyawan murni: isSuperAdmin di konteks
   * ini sudah nilai EFEKTIF (false untuk sesi office), dan permission
   * platform dikosongkan (lihat getUserPlatformPermissions).
   */
  loginDoor: 'admin' | 'office';
  /**
   * Kode tenant sesi ini (hanya untuk pengguna tenant; `undefined` untuk
   * pengguna legacy). Dipakai pemanggil untuk masuk tenant context di
   * frame-nya sendiri — lihat catatan propagasi di
   * `lib/tenant/resolver.ts` (`enterTenantContext`).
   */
  tenantCode?: string;
}

export interface AuthOptions {
  /**
   * Organisasi otorisasi. Bila diisi, keanggotaan + permission dicek di
   * organisasi tersebut, BUKAN di organisasi aktif sesi. Dipakai endpoint
   * berbasis token (mis. tanda tangan E-Sign): dokumen bisa milik kantor
   * lain dari organisasi aktif user, selama user anggota AKTIF di kantor
   * pemilik dokumen. Tanpa ini, perilaku lama dipertahankan.
   */
  organizationId?: string;
  /**
   * Internal (Lapisan F). Bila `false`, JANGAN masuk tenant context —
   * verifikasi berjalan di jalur legacy. Dipakai rute platform
   * (`requirePlatformPermission`): rute platform memakai legacy + master,
   * dan super admin adalah user legacy di fase ini.
   */
  tenantContext?: boolean;
}

/**
 * Ambil sesi aktif; kembalikan 401 bila belum login.
 * Memverifikasi ke database setiap panggilan: user nonaktif / membership
 * dicabut / kantor dinonaktifkan langsung kehilangan akses (deny by default).
 * Dengan opts.organizationId, keanggotaan diverifikasi di organisasi itu.
 */
export async function requireAuth(opts?: AuthOptions): Promise<AuthContext> {
  const session = await auth();
  const u = session?.user as any;
  if (!u?.id) {
    throw apiErr('Belum login. Silakan masuk kembali.', 401);
  }
  const targetOrgId = opts?.organizationId ?? (u.organizationId as string);
  if (!targetOrgId) {
    throw apiErr('Belum login. Silakan masuk kembali.', 401);
  }
  // Lapisan F: sesi tenant (punya tenantCode) diverifikasi di tenant DB.
  const tenantCode = (u as any).tenantCode as string | undefined | null;
  if (tenantCode && opts?.tenantContext !== false) {
    return requireAuthTenant(u, targetOrgId, tenantCode, opts);
  }
  const dbUser = await legacyPrisma.user.findUnique({
    where: { id: u.id as string },
    select: { status: true, isSuperAdmin: true },
  });
  if (!dbUser) {
    // Bukan "dinonaktifkan": pengguna tenant tidak ada di User legacy
    // (identitasnya di master) — ini yang terjadi bila sesi tenant memanggil
    // rute platform. Pesan lama ("Akun Anda dinonaktifkan") menyesatkan.
    throw apiErr('Akun tidak ditemukan. Silakan masuk kembali.', 401);
  }
  if (dbUser.status !== 'ACTIVE') {
    throw apiErr('Akun Anda dinonaktifkan. Hubungi administrator.', 401);
  }
  // Sesi ikut pintu (Opsi B): sesi office-door adalah sesi karyawan murni.
  // Tanpa pintu tercatat, perlakukan sebagai office (fail-closed); sesi JWT
  // normal selalu membawa pintu (ditentukan sekali oleh jwt() untuk sesi lama).
  const loginDoor = (u as any).loginDoor === 'admin' ? 'admin' : 'office';
  const effectiveSuperAdmin = dbUser.isSuperAdmin && loginDoor !== 'office';
  const membership = await legacyPrisma.membership.findFirst({
    where: { userId: u.id as string, organizationId: targetOrgId },
    include: {
      organization: { select: { isActive: true, name: true } },
      role: { select: { name: true } },
    },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    // Phase 6 P0 — super admin bermigrasi: tidak ada Membership legacy
    // dengan organizationId = tenant.id (organizationId sesi = tenant.id;
    // membership legacy memakai id org legacy) → tanpa bypass, /api/super/*
    // selalu 403 untuk sesi tenant super admin. Bypass HANYA bila
    // effectiveSuperAdmin (isSuperAdmin legacy + pintu admin) DAN pemanggil
    // meminta jalur legacy (tenantContext === false) — satu-satunya
    // pemanggil itu requirePlatformPermission (semua rute /api/super/*,
    // /api/billing, /api/admin/pengumuman). Pengguna tenant BUKAN super
    // admin tetap 403 di sini; rute tenant (tanpa tenantContext:false)
    // tidak berubah. Nama organisasi dibaca dari master (identitas
    // platform), fallback ke nama di sesi.
    if (effectiveSuperAdmin && opts?.tenantContext === false) {
      const tenant = await masterPrisma.tenant.findUnique({
        where: { id: targetOrgId },
        select: { companyName: true },
      });
      return {
        userId: u.id,
        email: u.email,
        name: u.name,
        organizationId: targetOrgId,
        organizationName: tenant?.companyName ?? (u.organizationName as string) ?? '',
        role: u.role,
        isSuperAdmin: true,
        loginDoor,
      };
    }
    if (opts?.organizationId) {
      throw apiErr(
        'Anda bukan anggota aktif kantor pemilik dokumen ini, jadi Anda tidak dapat memproses dokumen ini.',
        403
      );
    }
    throw apiErr('Akses Anda ke kantor ini telah dicabut.', 403);
  }
  if (!membership.organization.isActive && !effectiveSuperAdmin) {
    throw apiErr('Kantor ini sedang dinonaktifkan.', 403);
  }
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    organizationId: targetOrgId,
    organizationName: membership.organization.name,
    // Role sesi berlaku untuk organisasi aktif sesi; bila otorisasi
    // dialihkan ke organisasi dokumen, pakai role di organisasi itu.
    role: opts?.organizationId ? (membership.role?.name ?? u.role) : u.role,
    isSuperAdmin: effectiveSuperAdmin,
    loginDoor,
  };
}

/**
 * Cabang tenant `requireAuth` (Lapisan F). Verifikasi memakai client
 * tenant SECARA LANGSUNG (bukan lewat proxy `prisma` — chicken-and-egg:
 * proxy butuh context, context baru ada setelah verifikasi ini):
 * 1) resolve client tenant + cek Tenant.tenantStatus di master (status
 *    di-cache saat resolve; pengguna tenant PENDING/FAILED tidak boleh
 *    memanggil API — halaman /provisioning yang menangani mereka,
 *    dijaga juga backstop root layout). Fase 4: tenant SUSPENDED tetap
 *    lolos SAMPAI lookup membership — hanya OWNER yang diizinkan masuk;
 *    pengguna Standar ditolak 403 dengan pesan penangguhan;
 * 2) user ACTIVE + Membership ACTIVE di TENANT DB (organizationId =
 *    tenantId; mirror Organization tidak punya relasi, jadi organisasi
 *    dibaca terpisah — `include organization` TIDAK bisa di tenant client);
 * 3) `enterTenantContext(code)` agar sisa eksekusi di frame ini berjalan
 *    dalam context tenant (lihat catatan propagasi di resolver: pemanggil
 *    TETAP harus masuk context di frame-nya sendiri).
 *
 * Override `AuthOptions.organizationId` (E-Sign lintas-org / MEET):
 * tenant context SELALU mengikuti tenant sesi. Bila override menunjuk
 * organisasi yang BUKAN tenant sesi, otorisasi lintas-tenant itu belum
 * didukung fase ini → fail closed (403). Bila override == tenant sesi,
 * perilaku sama persis dengan jalur legacy (role diambil dari membership
 * di organisasi itu, yang di sini = tenant sesi).
 */
async function requireAuthTenant(
  u: any,
  targetOrgId: string,
  tenantCode: string,
  opts?: AuthOptions
): Promise<AuthContext> {
  const tenantId = (u as any).tenantId as string | undefined | null;
  if (opts?.organizationId && tenantId && opts.organizationId !== tenantId) {
    throw apiErr(
      'Dokumen/meeting ini milik kantor lain di luar tenant Anda, jadi Anda tidak dapat memprosesnya.',
      403
    );
  }
  const tenantClient = await getTenantClientForCode(tenantCode);
  const info = getCachedTenantInfo(tenantCode);
  const tenantStatus = info?.tenantStatus;
  const isSuspended = tenantStatus === 'SUSPENDED';
  if (!info || (tenantStatus !== 'ACTIVE' && !isSuspended)) {
    throw apiErr(
      'Kantor Anda belum aktif. Silakan cek halaman provisioning atau hubungi Administrator Pusat.',
      403
    );
  }
  const dbUser = await tenantClient.user.findUnique({
    where: { id: u.id as string },
    select: { status: true, isSuperAdmin: true },
  });
  if (!dbUser) {
    throw apiErr('Akun tidak ditemukan. Silakan masuk kembali.', 401);
  }
  if (dbUser.status !== 'ACTIVE') {
    throw apiErr('Akun Anda dinonaktifkan. Hubungi administrator.', 401);
  }
  const loginDoor = (u as any).loginDoor === 'admin' ? 'admin' : 'office';
  const effectiveSuperAdmin = dbUser.isSuperAdmin && loginDoor !== 'office';
  const membership = await tenantClient.membership.findFirst({
    where: { userId: u.id as string, organizationId: targetOrgId },
    include: { role: { select: { name: true } } },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    if (opts?.organizationId) {
      throw apiErr(
        'Anda bukan anggota aktif kantor pemilik dokumen ini, jadi Anda tidak dapat memproses dokumen ini.',
        403
      );
    }
    throw apiErr('Akses Anda ke kantor ini telah dicabut.', 403);
  }
  // Fase 4 (§5.5/7.4): tenant DITANGGUHKAN — hanya OWNER yang boleh masuk
  // (untuk melihat status dan menghubungi Master); pengguna Standar
  // ditolak di sini, sebelum halaman/modul apa pun.
  if (isSuspended && membership.role?.name !== 'OWNER') {
    throw apiErr(
      'Kantor Anda ditangguhkan. Hanya admin kantor (OWNER) yang masih bisa masuk untuk melihat status — hubungi Administrator Pusat.',
      403
    );
  }
  const org = await tenantClient.organization.findUnique({
    where: { id: targetOrgId },
    select: { isActive: true, name: true },
  });
  if (!org) {
    throw apiErr('Akses Anda ke kantor ini telah dicabut.', 403);
  }
  if (!org.isActive && !effectiveSuperAdmin) {
    throw apiErr('Kantor ini sedang dinonaktifkan.', 403);
  }
  enterTenantContext(tenantCode);
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    organizationId: targetOrgId,
    organizationName: org.name,
    role: opts?.organizationId ? (membership.role?.name ?? u.role) : u.role,
    isSuperAdmin: effectiveSuperAdmin,
    loginDoor,
    tenantCode,
  };
}

/** Kunci permission milik user pada organisasi aktif (sumber: database). */
export async function getUserPermissions(ctx: AuthContext): Promise<Set<string>> {
  if (ctx.isSuperAdmin) return new Set(['*']);
  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId, status: 'ACTIVE' },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return new Set(membership?.role.permissions.map((rp) => rp.permission.key) ?? []);
}

/**
 * Pastikan modul paket aktif untuk kantor pemanggil (Sistem Modular).
 * Administrator Pusat bypass. Tanpa langganan / tanpa pilihan modul =
 * semua aktif (grandfathering: tenant lama tanpa pembatasan tidak terkunci).
 * Modul non-billable (Dashboard, Setting, Administrator Pusat) selalu aktif.
 */
export async function requireModule(ctx: AuthContext, moduleKey: ModuleKey): Promise<void> {
  if (ctx.isSuperAdmin) return;
  const { LEGACY_TO_MODULAR } = await import('@/lib/modular');
  const modularKey = LEGACY_TO_MODULAR[moduleKey] as ModularKey | undefined;
  if (!modularKey) return;
  const sub = await getSubscription(ctx.organizationId);
  if (!isModuleSubscribed(sub, modularKey)) {
    const label = AVAILABLE_MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey;
    throw apiErr(`Modul ${label} tidak aktif dalam langganan kantor ini.`, 403);
  }
}

/** Pastikan modul baru aktif untuk kantor pemanggil. */
export async function requireModularModule(ctx: AuthContext, moduleKey: ModularKey): Promise<void> {
  if (ctx.isSuperAdmin) return;
  const sub = await getSubscription(ctx.organizationId);
  if (!isModuleSubscribed(sub, moduleKey)) {
    const label = (await import('@/lib/modular')).MODULAR_MODULE_MAP.get(moduleKey)?.label ?? moduleKey;
    throw apiErr(`Modul ${label} tidak aktif dalam langganan kantor ini.`, 403);
  }
}

/**
 * Gerbang modul penuh — Bab 8 Fase 7: dipakai route API modul yang TIDAK
 * punya permission di katalog (tal, koperasi, emas, islami, kantor).
 * Menegakkan DUA lapis sekaligus, dengan pesan yang sama seperti
 * assertPermission:
 *   1) Paket: modul harus aktif dalam langganan kantor (403 bila tidak).
 *   2) Level pengguna: READ butuh >= READ, WRITE butuh WRITE; modul
 *      sensitif tanpa baris = NONE (403). Administrator Pusat bypass.
 * Penolakan dicatat ACCESS_DENIED di audit log tenant (pola
 * assertPermission) agar bisa dibuktikan di verify-fase7-access.
 * Route GET memakai 'READ', route tulis (POST/PUT/PATCH/DELETE) 'WRITE'.
 */
export async function requireModularAccess(
  ctx: AuthContext,
  moduleKey: ModularKey,
  level: 'READ' | 'WRITE'
): Promise<void> {
  if (ctx.isSuperAdmin) return;
  const label = (await import('@/lib/modular')).MODULAR_MODULE_MAP.get(moduleKey)?.label ?? moduleKey;
  const sub = await getSubscription(ctx.organizationId);
  if (!isModuleSubscribed(sub, moduleKey)) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: `Ditolak: modul ${label} tidak aktif dalam langganan kantor ini.`,
    }).catch(() => {});
    throw apiErr(`Modul ${label} tidak aktif dalam langganan kantor ini.`, 403);
  }
  const levels = await getUserModuleLevels(ctx.userId, ctx.organizationId);
  const effective = effectiveModuleLevel(levels, moduleKey);
  if (LEVEL_RANK[effective] < LEVEL_RANK[level]) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: `Ditolak: modul ${label} membutuhkan ${level} (akses saat ini: ${effective}).`,
    }).catch(() => {});
    throw apiErr(
      effective === 'NONE'
        ? `Modul ${label} tidak diaktifkan untuk akun Anda. Hubungi admin kantor.`
        : `Akses Anda ke modul ${label} hanya baca (Read). Tindakan ini butuh akses Write.`,
      403
    );
  }
}

/**
 * Inti pemeriksaan permission untuk sebuah AuthContext yang sudah
 * terverifikasi (keanggotaan + status user sudah dicek pemanggil).
 * Dipakai requirePermission (sesi) dan requirePermissionForUser (tanpa
 * sesi, mis. bot WhatsApp) agar aturannya identik.
 */
async function assertPermission(
  ctx: AuthContext,
  permission: PermissionKey,
  req?: Request
): Promise<void> {
  if (ctx.isSuperAdmin) {
    // Akses global eksplisit & tercatat
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'SUPERADMIN_ACCESS',
      module: 'AUTH',
      description: `Administrator Pusat mengakses ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    return;
  }
  const keys = await getUserPermissions(ctx);
  if (!keys.has(permission)) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: `Ditolak: membutuhkan ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    throw apiErr('Anda tidak memiliki akses untuk tindakan ini.', 403);
  }
  // Batasan langganan Sistem Modular:
  // 1) Modul harus aktif dalam langganan kantor (modul berbayar saja).
  // 2) Level akses pengguna: permission READ butuh >= READ, WRITE butuh WRITE.
  //    Baris modul baru (mis. 'chat') berlaku se-modul; bila tidak ada,
  //    baris kunci lama (mis. 'inbox') tetap dihormati per halaman.
  //    Tanpa baris = ikut aturan kantor (WRITE bila modul aktif).
  const permModule = PERMISSION_MODULE_LEVEL.get(permission);
  if (permModule) {
    const sub = await getSubscription(ctx.organizationId);
    if (!isModuleSubscribed(sub, permModule.module)) {
      const label =
        (await import('@/lib/modular')).MODULAR_MODULE_MAP.get(permModule.module)?.label ??
        permModule.module;
      throw apiErr(`Modul ${label} tidak aktif dalam langganan kantor ini.`, 403);
    }
    const levels = await getUserModuleLevels(ctx.userId, ctx.organizationId);
    const level = effectiveModuleLevel(levels, permModule.module, legacyKeyOfPermission(permission));
    if (LEVEL_RANK[level] < LEVEL_RANK[permModule.level]) {
      const label =
        (await import('@/lib/modular')).MODULAR_MODULE_MAP.get(permModule.module)?.label ??
        permModule.module;
      throw apiErr(
        level === 'NONE'
          ? `Modul ${label} tidak diaktifkan untuk akun Anda. Hubungi admin kantor.`
          : `Akses Anda ke modul ${label} hanya baca (Read). Tindakan ini butuh akses Write.`,
        403
      );
    }
    // 3) Langganan tidak aktif: semua API tulis ditolak (baca tetap boleh
    //    agar pengguna bisa melihat halaman Langganan & Tagihan).
    if (isWritePermission(permission)) {
      const status = effectiveSubscriptionStatus(sub);
      if (status !== 'ACTIVE') {
        const msg =
          status === 'PENDING_PAYMENT'
            ? 'Langganan kantor ini menunggu pembayaran. Hubungi Administrator Pusat untuk mengaktifkan.'
            : status === 'EXPIRED'
              ? 'Masa langganan kantor telah berakhir. Perpanjang langganan untuk melanjutkan.'
              : status === 'SUSPENDED'
                ? 'Langganan kantor ini ditangguhkan. Hubungi Administrator Pusat.'
                : 'Langganan kantor ini tidak aktif. Hubungi Administrator Pusat.';
        throw apiErr(msg, 403);
      }
    }
  }
}

/**
 * Pastikan user punya permission; 403 bila tidak.
 * Administrator Pusat memiliki akses global eksplisit (dicatat di audit).
 * Deny by default: hanya permission di database yang berlaku.
 * Fase 2: permission modul fitur juga dibatasi modul paket kantor.
 * opts.organizationId mengalihkan otorisasi ke organisasi tersebut
 * (modul gate + langganan ikut memakai organisasi itu) — lihat AuthOptions.
 */
export async function requirePermission(
  permission: PermissionKey,
  req?: Request,
  opts?: AuthOptions
): Promise<AuthContext> {
  const ctx = await requireAuth(opts);
  // Lapisan F: cek permission (RolePermission, langganan, audit) harus
  // berjalan SETELAH masuk tenant context — dibungkus di sini karena
  // `enterWith` di `requireAuth` tidak menembus batas await ke pemanggil.
  if (ctx.tenantCode && opts?.tenantContext !== false) {
    return runWithTenant(ctx.tenantCode, async () => {
      await assertPermission(ctx, permission, req);
      return ctx;
    });
  }
  await assertPermission(ctx, permission, req);
  return ctx;
}

/**
 * Otorisasi TANPA sesi login (dipakai bot WhatsApp E-Sign).
 * Memverifikasi hal yang sama seperti requireAuth + requirePermission,
 * tapi identitas user berasal dari nomor WhatsApp yang sudah dicocokkan
 * ke User (bukan dari cookie sesi): user ACTIVE + membership ACTIVE di
 * organisasi yang dimaksud + role punya permission + module gate + langganan.
 * Pesan error disamakan dengan jalur sesi. Dipakai SEBELUM executeSign.
 */
/**
 * Identitas keanggotaan pengguna tenant (mirror di DB tenant + master).
 * Pola yang sama dengan requireAuthTenant: user mirror → membership
 * (include role saja; Organization mirror scalar-only, dibaca terpisah).
 * null bila org bukan tenant ACTIVE atau user bukan anggota aktif di sana.
 * Dipakai fallback requirePermissionForUser (jalur bot WA, tanpa sesi).
 */
async function resolveTenantMemberIdentity(
  userId: string,
  organizationId: string
): Promise<{
  email: string;
  name: string;
  membership: {
    status: string;
    organization: { isActive: boolean; name: string };
    role: { name: string } | null;
  };
} | null> {
  try {
    const tenant = await masterPrisma.tenant.findUnique({
      where: { id: organizationId },
      select: { tenantCode: true, tenantStatus: true },
    });
    if (!tenant || tenant.tenantStatus !== 'ACTIVE') return null;
    const tenantClient = await getTenantClientForCode(tenant.tenantCode);
    const mirrorUser = await tenantClient.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, status: true },
    });
    if (!mirrorUser || mirrorUser.status !== 'ACTIVE') return null;
    const membership = await tenantClient.membership.findFirst({
      where: { userId, organizationId },
      include: { role: { select: { name: true } } },
    });
    if (!membership) return null;
    const org = await tenantClient.organization.findUnique({
      where: { id: organizationId },
      select: { isActive: true, name: true },
    });
    if (!org) return null;
    return {
      email: mirrorUser.email,
      name: mirrorUser.name,
      membership: { status: membership.status, organization: org, role: membership.role },
    };
  } catch {
    return null;
  }
}

export async function requirePermissionForUser(
  userId: string,
  permission: PermissionKey,
  organizationId: string,
  req?: Request
): Promise<AuthContext> {
  // Jalur legacy (perilaku lama, tidak berubah): user + membership di woork_saas.
  const dbUser = await legacyPrisma.user.findUnique({
    where: { id: userId },
    select: { status: true, isSuperAdmin: true, email: true, name: true },
  });
  // Identitas + keanggotaan yang sudah dinormalisasi dari salah satu sumber.
  let identity: { email: string; name: string; isSuperAdmin: boolean } | null = null;
  let membership: {
    status: string;
    organization: { isActive: boolean; name: string };
    role: { name: string } | null;
  } | null = null;
  if (dbUser) {
    if (dbUser.status !== 'ACTIVE') {
      throw apiErr('Akun Anda dinonaktifkan. Hubungi administrator.', 401);
    }
    membership = await legacyPrisma.membership.findFirst({
      where: { userId, organizationId },
      include: {
        organization: { select: { isActive: true, name: true } },
        role: { select: { name: true } },
      },
    });
    identity = { email: dbUser.email, name: dbUser.name, isSuperAdmin: dbUser.isSuperAdmin };
  } else {
    // Fallback tenant (P1-5): pengguna tenant hanya ada di master + mirror
    // tenant, bukan di User legacy — tanpa ini, semua pengguna tenant
    // selalu 401 di jalur bot WA (E-Sign WA signing tidak pernah bisa jalan).
    const t = await resolveTenantMemberIdentity(userId, organizationId);
    if (!t) {
      throw apiErr('Akun tidak ditemukan. Silakan masuk kembali.', 401);
    }
    identity = { email: t.email, name: t.name, isSuperAdmin: false };
    membership = t.membership;
  }
  if (!membership || membership.status !== 'ACTIVE') {
    throw apiErr(
      'Anda bukan anggota aktif kantor pemilik dokumen ini, jadi Anda tidak dapat memproses dokumen ini.',
      403
    );
  }
  if (!membership.organization.isActive && !identity.isSuperAdmin) {
    throw apiErr('Kantor ini sedang dinonaktifkan.', 403);
  }
  const ctx: AuthContext = {
    userId,
    email: identity.email,
    name: identity.name,
    organizationId,
    organizationName: membership.organization.name,
    role: membership.role?.name ?? '',
    isSuperAdmin: identity.isSuperAdmin,
    // Tanpa sesi (jalur bot): tidak ada pintu; perlakukan seperti akses
    // penuh user — jalur ini bukan sesi browser dan tidak menyentuh /admin.
    loginDoor: 'admin',
  };
  await assertPermission(ctx, permission, req);
  return ctx;
}

/** Pastikan pemanggil adalah Administrator Pusat; 403 bila bukan. */
export async function requireSuperAdmin(req?: Request): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.isSuperAdmin) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: 'Ditolak: membutuhkan Administrator Pusat',
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    throw apiErr('Hanya Administrator Pusat yang dapat melakukan tindakan ini.', 403);
  }
  return ctx;
}

/**
 * Kunci permission platform milik user (sumber: penugasan role platform).
 * Terpisah dari permission tenant: role platform HARUS ber-organizationId null;
 * penugasan yang menunjuk role tenant diabaikan.
 */
export async function getUserPlatformPermissions(ctx: AuthContext): Promise<Set<string>> {
  // Sesi office-door = karyawan murni: tidak ada permission platform,
  // walau user-nya Administrator WOORK.
  if (ctx.loginDoor === 'office') return new Set();
  // Lapisan F: pengguna tenant tidak punya permission platform di fase ini
  // (role platform hanya ada di legacy; tenant super-admin masa depan pun
  // tidak boleh mendapat akses platform dari keanggotaan tenant).
  if (ctx.tenantCode) return new Set();
  if (ctx.isSuperAdmin) return new Set(['*']);
  const assigns = await legacyPrisma.platformRoleAssignment.findMany({
    where: { userId: ctx.userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const keys = new Set<string>();
  for (const a of assigns) {
    if (a.role.organizationId !== null) continue;
    for (const rp of a.role.permissions) keys.add(rp.permission.key);
  }
  return keys;
}

/**
 * Pastikan user punya permission platform (Admin WOORK); 403 bila tidak.
 * Administrator Pusat bypass penuh (tercatat). Berbeda dari requirePermission:
 * guard ini TIDAK membaca role tenant — Admin WOORK tidak mendapat akses
 * platform dari keanggotaan tenant apa pun, dan sebaliknya.
 */
export async function requirePlatformPermission(
  permission: PermissionKey,
  req?: Request
): Promise<AuthContext> {
  // Lapisan F: rute platform memakai legacy + master — JANGAN masuk tenant
  // context (super admin adalah user legacy tanpa tenantCode di fase ini).
  const ctx = await requireAuth({ tenantContext: false });
  if (ctx.isSuperAdmin) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'SUPERADMIN_ACCESS',
      module: 'AUTH',
      description: `Administrator Pusat mengakses platform ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    return ctx;
  }
  const keys = await getUserPlatformPermissions(ctx);
  if (!keys.has(permission)) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: `Ditolak: membutuhkan permission platform ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    throw apiErr('Anda tidak memiliki akses platform untuk tindakan ini.', 403);
  }
  return ctx;
}

/**
 * Validasi anti-eskalasi: pemberi role tidak boleh memberikan permission
 * yang tidak dimilikinya sendiri.
 */
export function assertCanGrant(granterKeys: Set<string>, targetKeys: string[]): void {
  if (granterKeys.has('*')) return; // Administrator Pusat
  const missing = targetKeys.filter((k) => !granterKeys.has(k));
  if (missing.length > 0) {
    throw apiErr(
      `Anda tidak dapat memberikan permission yang tidak Anda miliki: ${missing.join(', ')}`,
      403
    );
  }
}

/** Untuk Server Components: null bila belum login. */
export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}
