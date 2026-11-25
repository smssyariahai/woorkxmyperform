import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { randomUUID } from 'node:crypto';
import { authConfig } from './auth.config';
import { legacyPrisma as prisma } from './db';
// CATATAN (perbaikan resolver header): SEMUA pemakaian `prisma` di file
// ini bersifat LEGACY by definition — authorize fallback, lookup Google
// legacy, cabang switch-org, refresh token legacy, sesi/audit legacy di
// events, isAdminDoorUser, dan seedOrgDefaults (peninggalan jalur lama).
// Karena itu file ini memakai `legacyPrisma` mentah, bukan proxy `prisma`:
// proxy merutekan ke tenant client bila header `x-tenant-code` ada di
// request, padahal query-query di sini berjalan SEBELUM/SAAT auth (client
// tenant belum ter-resolve) dan/atau membaca model yang tidak ada di
// skema tenant (SystemSetting, password User, Session legacy).
// Cabang tenant memakai masterPrisma / tenant client langsung.
import { verifyPassword } from './password';
import { loginSchema } from './validation';
import { audit } from './audit';
import { getSystemSettings, verifyTurnstile } from './system-settings';
import { getSubscription } from './subscription';
import { masterPrisma } from './tenant/master';
import { registerCompany } from './tenant/registration';

/**
 * Langganan kantor yang statusnya PENDING_PAYMENT / CANCELLED memblokir
 * login anggotanya (kecuali Administrator Pusat). EXPIRED / SUSPENDED
 * masih boleh login (baca saja; tulis diblokir di assertPermission).
 */
async function isLoginBlockedBySubscription(organizationId: string, isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) return false;
  const sub = await getSubscription(organizationId);
  if (!sub) return false;
  return sub.status === 'PENDING_PAYMENT' || sub.status === 'CANCELLED';
}

// Login terpisah (lihat files/login-terpisah-admin-vs-kantor.md):
// pintu /admin hanya untuk Administrator Pusat + Admin WOORK (platform role
// dengan organizationId null); pintu /login hanya untuk pengguna kantor.
// Pemeriksaan ini HANYA dipanggil setelah password terverifikasi, supaya
// pesan "salah pintu" tidak bisa dipakai untuk menebak jenis akun.
async function isAdminDoorUser(userId: string, isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) return true;
  const n = await prisma.platformRoleAssignment.count({
    where: { userId, role: { organizationId: null } },
  });
  return n > 0;
}

function wrongDoorError(code: 'wrong-door-admin' | 'wrong-door-office'): CredentialsSignin {
  const err = new CredentialsSignin(
    code === 'wrong-door-admin'
      ? 'Akun Administrator WOORK login lewat /admin'
      : 'Akun ini bukan akun Administrator WOORK'
  );
  err.code = code;
  return err;
}

// Konfigurasi NextAuth dibuat per-request (async) agar kredensial Google OAuth
// dapat dibaca dari SystemSetting (dikelola Administrator Pusat) tanpa restart.
// Env GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET tetap didukung sebagai fallback.
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const settings = await getSystemSettings();
  const googleId = settings.google_client_id || process.env.GOOGLE_CLIENT_ID || '';
  const googleSecret = settings.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || '';

  const providers: any[] = [
    Credentials({
      name: 'Kredensial',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile', type: 'text' },
        // Pintu asal login: 'admin' (halaman /admin) atau 'office' (halaman /login).
        loginType: { label: 'Pintu login', type: 'text' },
      },
      async authorize(credentials) {
        // Cloudflare Turnstile: wajib lolos bila dikonfigurasi
        const tOk = await verifyTurnstile((credentials as any)?.turnstileToken);
        if (!tOk) return null;
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const loginType = (credentials as any)?.loginType === 'admin' ? 'admin' : 'office';
        // LAPISAN D (database-per-tenant): cek PlatformUser di master DULU.
        // - Cocok (status ACTIVE + passwordHash terverifikasi) -> sesi tenant:
        //   id = PlatformUser.id, tenant dari TenantMembership ACTIVE.
        // - Tidak ada di master, passwordHash null, atau password tidak cocok
        //   -> jatuh ke lookup User legacy di bawah (perilaku lama).
        // - Password cocok TAPI status master bukan ACTIVE, atau tidak ada
        //   membership ACTIVE -> return null (jangan jatuh ke legacy: identitas
        //   platform sudah terverifikasi, jadi penolakan ini disengaja).
        // Pesan error tetap generik di semua cabang (LoginForm hanya menampilkan
        // "Email atau password salah"), jadi tidak bocor apakah email ada di
        // master atau di legacy.
        const platformUser = await masterPrisma.platformUser.findUnique({ where: { email } });
        if (platformUser?.passwordHash) {
          const pwOk = await verifyPassword(parsed.data.password, platformUser.passwordHash);
          if (pwOk) {
            if (platformUser.status !== 'ACTIVE') return null;
            // Pintu login: tenant (office) selalu boleh; pintu admin hanya
            // untuk Administrator Pusat (PlatformUser.isSuperAdmin).
            if (loginType === 'admin' && !platformUser.isSuperAdmin) {
              throw wrongDoorError('wrong-door-office');
            }
            // Multi-membership: pakai membership ACTIVE pertama secara
            // deterministik (createdAt paling awal). User single-tenant —
            // satu-satunya kasus yang didukung lapisan ini — tidak terdampak.
            // Ganti tenant aktif (switch-org) belum didukung untuk tenant
            // (lihat LAPISAN D di callback jwt + laporan).
            const tenantMembership = await masterPrisma.tenantMembership.findFirst({
              where: { userId: platformUser.id, membershipStatus: 'ACTIVE' },
              include: { tenant: { select: { id: true, tenantCode: true, companyName: true, tenantStatus: true } } },
              orderBy: { createdAt: 'asc' },
            });
            if (!tenantMembership) {
              // Administrator Pusat tanpa membership tetap boleh masuk pintu
              // admin (konsisten dengan cabang Google lapisan B yang tidak
              // mewajibkan membership); selain itu tidak ada tenant untuk
              // dimasuki -> tolak.
              if (loginType === 'admin' && platformUser.isSuperAdmin) {
                return {
                  id: platformUser.id,
                  name: platformUser.name,
                  email: platformUser.email,
                  image: null,
                  isSuperAdmin: true,
                  loginDoor: loginType,
                  tenantCode: null,
                  tenantId: null,
                  tenantStatus: null,
                };
              }
              return null;
            }
            // Tenant yang masih PENDING_PROVISIONING / FAILED TIDAK diblokir
            // di sini — login tetap sukses, lalu alur login (LoginForm +
            // backstop root layout) mengarahkan ke /provisioning.
            // Pengecekan langganan legacy tidak berlaku untuk tenant.
            return {
              id: platformUser.id,
              name: platformUser.name,
              email: platformUser.email,
              image: null,
              organizationId: tenantMembership.tenant.id,
              organizationName: tenantMembership.tenant.companyName,
              role: tenantMembership.roleReference,
              isSuperAdmin: platformUser.isSuperAdmin,
              loginDoor: loginType,
              tenantCode: tenantMembership.tenant.tenantCode,
              tenantId: tenantMembership.tenant.id,
              tenantStatus: tenantMembership.tenant.tenantStatus,
            };
          }
          // Password tidak cocok di master -> jatuh ke legacy di bawah.
        }
        // --- Jalur legacy (woork_saas), perilaku LAMA, tidak diubah. ---
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password || user.status !== 'ACTIVE') return null;
        const ok = await verifyPassword(parsed.data.password, user.password);
        if (!ok) return null;
        // Pintu login (Opsi B — sesi ikut pintu): /admin hanya untuk
        // Administrator WOORK; /login untuk pengguna kantor — TAPI admin yang
        // juga anggota aktif kantor boleh masuk /login sebagai karyawan murni
        // (sesi office-door tidak membawa hak admin). Penolakan peran tetap
        // hanya setelah password benar.
        const isAdminDoor = await isAdminDoorUser(user.id, user.isSuperAdmin);
        if (loginType === 'admin' && !isAdminDoor) throw wrongDoorError('wrong-door-office');
        const membership = await prisma.membership.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          include: { organization: true, role: true },
          orderBy: { joinedAt: 'asc' },
        });
        if (!membership) {
          // Admin tanpa keanggotaan kantor tidak bisa masuk /login — arahkan
          // ke pintu admin (bukan gagal generik).
          if (loginType === 'office' && isAdminDoor) throw wrongDoorError('wrong-door-admin');
          return null;
        }
        // Bypass kantor/langganan hanya untuk Administrator Pusat yang login
        // lewat pintu admin; sesi karyawan tunduk pada aturan kantor seperti
        // karyawan lainnya.
        const adminBypass = user.isSuperAdmin && loginType === 'admin';
        if (!membership.organization.isActive && !adminBypass) return null;
        if (await isLoginBlockedBySubscription(membership.organizationId, adminBypass)) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatar ?? null,
          organizationId: membership.organizationId,
          organizationName: membership.organization.name,
          role: membership.role.name,
          isSuperAdmin: user.isSuperAdmin,
          loginDoor: loginType,
        };
      },
    }),
  ];

  if (googleId && googleSecret) {
    providers.push(
      Google({
        clientId: googleId,
        clientSecret: googleSecret,
      })
    );
  }

  return {
    ...authConfig,
    pages: { signIn: '/login', error: '/login' },
    providers,
    callbacks: {
      async signIn({ user, account }) {
        // Google OAuth — LAPISAN B (database-per-tenant). Tiga cabang:
        // (a) email sudah ada di PlatformUser (master) -> lanjut normal,
        //     JANGAN buat tenant baru; tenantCode/tenantId ditempel di user
        //     untuk lapisan D (auth bridge) yang akan mempersist-nya ke token.
        // (b) email belum ada di master MAUPUN di legacy User (woork_saas)
        //     -> registerCompany (tanpa password; provisioning async jalan),
        //     lalu lanjutkan sign-in dengan user tersebut.
        // (c) email hanya ada di legacy User -> jalur legacy seperti dulu
        //     (baca saja; JANGAN buat tenant baru, JANGAN tulis ke woork_saas).
        // Callback jwt/session TIDAK diubah di sini — itu tugas lapisan D.
        if (account?.provider === 'google' && user.email) {
          const email = user.email.toLowerCase();
          const platformUser = await masterPrisma.platformUser.findUnique({ where: { email } });
          if (platformUser) {
            // (a) Akun platform sudah ada: pakai membership OWNER-nya.
            const membership = await masterPrisma.tenantMembership.findFirst({
              where: { userId: platformUser.id, membershipStatus: 'ACTIVE' },
              include: { tenant: { select: { id: true, tenantCode: true, companyName: true } } },
              orderBy: { createdAt: 'asc' },
            });
            (user as any).tenantId = membership?.tenant.id ?? null;
            (user as any).tenantCode = membership?.tenant.tenantCode ?? null;
            (user as any).organizationName = membership?.tenant.companyName ?? platformUser.name;
            (user as any).role = 'OWNER';
            (user as any).isSuperAdmin = false;
            (user as any).loginDoor = 'office';
            user.id = platformUser.id;
            user.name = platformUser.name;
            return true;
          }

          let dbUser = await prisma.user.findUnique({ where: { email } });
          if (!dbUser) {
            // (b) Pengguna baru sama sekali: buat tenant via provisioning
            // engine. Nama perusahaan dari profil Google; bila kosong,
            // pakai bagian sebelum '@' dari email.
            const adminName = user.name || email.split('@')[0];
            const companyName = user.name || email.split('@')[0];
            const created = await registerCompany({
              companyName,
              adminName,
              adminEmail: email,
              adminPassword: undefined,
            });
            (user as any).tenantId = created.tenantId;
            (user as any).tenantCode = created.tenantCode;
            (user as any).organizationName = companyName;
            (user as any).role = 'OWNER';
            (user as any).isSuperAdmin = false;
            (user as any).loginDoor = 'office';
            // Samakan id sesi dengan id PlatformUser di master DB.
            // Tanpa ini, token JWT memakai id OAuth (Google sub) yang tidak
            // ada di tabel mana pun -> sesi tidak konsisten.
            user.id = created.platformUserId;
            user.name = adminName;
            return true;
          }
          // (c) Hanya ada di legacy — jalur lama, tidak berubah.
          {
            const membership = await prisma.membership.findFirst({
              where: { userId: dbUser.id, status: 'ACTIVE' },
              include: { organization: true, role: true },
              orderBy: { joinedAt: 'asc' },
            });
            if (!membership || dbUser.status !== 'ACTIVE') return false;
            // Google hanya ada di /login (pintu office): sesi karyawan murni,
            // tanpa bypass kantor/langganan untuk Administrator Pusat.
            if (!membership.organization.isActive) return false;
            if (await isLoginBlockedBySubscription(membership.organizationId, false)) return false;
            (user as any).organizationId = membership.organizationId;
            (user as any).organizationName = membership.organization.name;
            (user as any).role = membership.role.name;
            (user as any).isSuperAdmin = dbUser.isSuperAdmin;
            (user as any).loginDoor = 'office';
            user.id = dbUser.id;
            user.name = dbUser.name;
          }
        }
        return true;
      },
      async jwt({ token, user, trigger, session }) {
        // Ganti kantor aktif: client memanggil update({ organizationId }) —
        // server memvalidasi membership sebelum mengganti token.
        // LAPISAN D: cabang ini hanya untuk sesi LEGACY. Sesi tenant tidak
        // bisa ganti tenant lewat sini (switch-org tenant belum didukung —
        // lihat laporan Lapisan D butir 6); token tenant dibiarkan apa adanya.
        // Bypass kantor/langganan hanya untuk sesi pintu admin; sesi karyawan
        // tunduk pada aturan kantor (lihat isSuperAdmin efektif di bawah).
        const doorAdmin = (token as any).loginDoor !== 'office';
        const effSuperAdmin = (token as any).isSuperAdmin === true && doorAdmin;
        if (trigger === 'update' && (session as any)?.organizationId && !(token as any).tenantCode) {
          const targetOrg = String((session as any).organizationId);
          const m = await prisma.membership.findFirst({
            where: { userId: token.sub as string, organizationId: targetOrg, status: 'ACTIVE' },
            include: { organization: true, role: true },
          });
          if (m && (m.organization.isActive || effSuperAdmin)) {
            // Jangan pindah ke kantor yang langganannya menunggu pembayaran.
            if (await isLoginBlockedBySubscription(targetOrg, effSuperAdmin)) {
              return token;
            }
            token.organizationId = m.organizationId;
            token.organizationName = m.organization.name;
            token.role = m.role.name;
            (token as any)._permAt = Date.now();
          }
          return token;
        }
        if (user) {
          // Pengguna Google tenant (lapisan B) tidak membawa organizationId —
          // pakai tenantId sebagai organizationId agar kode yang membaca
          // organizationId tetap jalan. Pengguna legacy selalu membawa
          // organizationId, jadi fallback ini tidak mengubah jalur legacy.
          token.organizationId = (user as any).organizationId ?? (user as any).tenantId;
          token.organizationName = (user as any).organizationName;
          token.role = (user as any).role;
          token.isSuperAdmin = (user as any).isSuperAdmin === true;
          // Sesi ikut pintu: catat pintu login di token.
          token.loginDoor = (user as any).loginDoor === 'admin' ? 'admin' : 'office';
          // LAPISAN D: persist field tenant ke token. Hanya ditulis bila ada
          // (user legacy / Google legacy tidak membawa tenantCode, jadi token
          // mereka tetap tanpa field tenant — tidak ditulis undefined).
          // tenantStatus ikut ditulis bila dibawa authorize (kredensial);
          // Google lapisan B belum membawanya — status segar dibaca ulang
          // di cabang refresh tenant di bawah + backstop root layout.
          if ((user as any).tenantCode) {
            (token as any).tenantCode = (user as any).tenantCode;
            (token as any).tenantId = (user as any).tenantId;
            if ((user as any).tenantStatus) {
              (token as any).tenantStatus = (user as any).tenantStatus;
            }
          }
        }
        // Refresh berkala agar pencabutan akses / penonaktifan cepat berlaku.
        // LAPISAN D: token tenant (punya tenantCode) di-refresh dari MASTER,
        // BUKAN dari prisma.user legacy — token.sub di sini adalah id
        // PlatformUser yang tidak ada di woork_saas (bug yang ditandai
        // lapisan B bila memakai jalur legacy). Token tanpa tenantCode memakai
        // jalur refresh legacy seperti dulu, tidak diubah.
        if (token.sub && (token as any)._permAt) {
          const age = Date.now() - (token as any)._permAt;
          if (age > 5 * 60_000) {
            if ((token as any).tenantCode) {
              const pu = await masterPrisma.platformUser.findUnique({
                where: { id: token.sub as string },
                select: { status: true, isSuperAdmin: true },
              });
              if (!pu || pu.status !== 'ACTIVE') return { ...token, _expired: true } as any;
              (token as any).isSuperAdmin = pu.isSuperAdmin;
              // Membership ACTIVE pertama (createdAt paling awal) — sama
              // seperti authorize. Bila membership hilang: user biasa
              // kehilangan akses -> sesi di-expire; Administrator Pusat
              // (pintu admin) dipertahankan apa adanya karena ia tidak
              // butuh membership untuk bekerja sebagai admin platform.
              const m = await masterPrisma.tenantMembership.findFirst({
                where: { userId: token.sub as string, membershipStatus: 'ACTIVE' },
                include: {
                  tenant: { select: { id: true, tenantCode: true, companyName: true, tenantStatus: true } },
                },
                orderBy: { createdAt: 'asc' },
              });
              if (!m) {
                if (!pu.isSuperAdmin) return { ...token, _expired: true } as any;
              } else {
                (token as any).tenantCode = m.tenant.tenantCode;
                (token as any).tenantId = m.tenant.id;
                (token as any).tenantStatus = m.tenant.tenantStatus;
                token.organizationId = m.tenant.id;
                token.organizationName = m.tenant.companyName;
                token.role = m.roleReference;
              }
              (token as any)._permAt = Date.now();
            } else {
              const u = await prisma.user.findUnique({
                where: { id: token.sub as string },
                select: { status: true, isSuperAdmin: true },
              });
              if (!u || u.status !== 'ACTIVE') return { ...token, _expired: true } as any;
              (token as any).isSuperAdmin = u.isSuperAdmin;
              // Phase 6 — AUTO-CONVERT: bila user legacy ini sudah punya
              // membership ACTIVE di master (org-nya sudah bermigrasi),
              // ubah sesi legacy menjadi sesi tenant. No-op bila tidak
              // ada membership master (belum migrasi) — perilaku tidak
              // berubah. Rollback = hapus membership master: refresh
              // berikutnya tidak menemukan membership (cabang tenant di
              // atas meng-expire sesi bila bukan super admin).
              const tm = await masterPrisma.tenantMembership.findFirst({
                where: { userId: token.sub as string, membershipStatus: 'ACTIVE' },
                include: {
                  tenant: { select: { id: true, tenantCode: true, companyName: true, tenantStatus: true } },
                },
                orderBy: { createdAt: 'asc' },
              });
              if (tm && tm.tenant.tenantStatus === 'ACTIVE') {
                (token as any).tenantCode = tm.tenant.tenantCode;
                (token as any).tenantId = tm.tenant.id;
                (token as any).tenantStatus = tm.tenant.tenantStatus;
                token.organizationId = tm.tenant.id;
                token.organizationName = tm.tenant.companyName;
                token.role = tm.roleReference;
              }
              (token as any)._permAt = Date.now();
            }
          }
        } else if (token.sub) {
          (token as any)._permAt = Date.now();
        }
        // Sesi lama (dibuat sebelum pintu login dicatat): tentukan pintunya
        // sekali dari peran user, supaya sesi admin yang sudah berjalan tidak
        // kehilangan aksesnya — dan sesi karyawan tetap karyawan.
        // LAPISAN D: token tenant selalu office-door (authorize / Google
        // lapisan B sudah mencatatnya); jangan query legacy untuknya.
        if (!(token as any).loginDoor && token.sub) {
          if ((token as any).tenantCode) {
            (token as any).loginDoor = 'office';
          } else {
            (token as any).loginDoor = (await isAdminDoorUser(
              token.sub as string,
              (token as any).isSuperAdmin === true
            ))
              ? 'admin'
              : 'office';
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.sub!;
          (session.user as any).organizationId = token.organizationId;
          (session.user as any).organizationName = token.organizationName;
          (session.user as any).role = token.role;
          // LAPISAN D: expose field tenant ke session (null untuk legacy).
          (session.user as any).tenantCode = (token as any).tenantCode ?? null;
          (session.user as any).tenantId = (token as any).tenantId ?? null;
          (session.user as any).tenantStatus = (token as any).tenantStatus ?? null;
          // Sesi ikut pintu: isSuperAdmin di sesi adalah nilai EFEKTIF —
          // sesi office-door tidak membawa status admin, walau user-nya
          // Administrator Pusat. Token tetap menyimpan nilai mentahnya.
          (session.user as any).isSuperAdmin =
            (token as any).isSuperAdmin === true && (token as any).loginDoor !== 'office';
          (session.user as any).loginDoor = (token as any).loginDoor ?? 'office';
        }
        return session;
      },
    },
    events: {
      async signIn({ user }) {
        // LAPISAN D: sesi tenant tidak punya Organization legacy — jangan
        // tulis prisma.session / audit legacy di sini (organizationId-nya
        // adalah tenantId master, bukan id Organization woork_saas).
        // Audit platform tenant menyusul di lapisan berikutnya.
        if ((user as any).tenantCode) return;
        try {
          const orgId = (user as any).organizationId as string | undefined;
          await prisma.session.create({
            data: {
              userId: user.id as string,
              organizationId: orgId,
              tokenId: randomUUID(),
              expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
            },
          });
          if (orgId) {
            await audit({
              organizationId: orgId,
              userId: user.id as string,
              action: 'LOGIN',
              module: 'AUTH',
              description: `${user.email} masuk ke workspace`,
            });
          }
        } catch {
          /* abaikan */
        }
      },
      async signOut(message: any) {
        try {
          const userId = message?.token?.sub as string | undefined;
          if (userId) {
            await prisma.session.deleteMany({
              where: { userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
            });
          }
        } catch {
          /* abaikan */
        }
      },
    },
  };
});

// Seed default org: roles, permissions, lead/deal stages, channels
export async function seedOrgDefaults(organizationId: string) {
  const { ROLE_PERMISSIONS } = await import('./permissions');
  const permKeys = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
  for (const key of permKeys) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { organizationId_name: { organizationId, name: roleName } },
      update: {},
      create: { organizationId, name: roleName, isSystem: true },
    });
    for (const p of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key: p } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  const leadStages = [
    { name: 'Baru', color: '#087BFF' },
    { name: 'Dihubungi', color: '#8B5CF6' },
    { name: 'Terkualifikasi', color: '#22C55E' },
    { name: 'Proposal', color: '#F59E0B' },
    { name: 'Negosiasi', color: '#F97316' },
    { name: 'Menang', color: '#16A34A' },
    { name: 'Kalah', color: '#EF4444' },
  ];
  for (const [i, s] of leadStages.entries()) {
    await prisma.leadStage.upsert({
      where: { organizationId_name: { organizationId, name: s.name } },
      update: {},
      create: { organizationId, name: s.name, color: s.color, order: i },
    });
  }
  const dealStages = ['Prospek', 'Kualifikasi', 'Penawaran', 'Negosiasi', 'Closing'];
  for (const [i, name] of dealStages.entries()) {
    await prisma.dealStage.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name, order: i },
    });
  }
  const channels = [
    { type: 'WHATSAPP', name: 'WhatsApp' },
    { type: 'INSTAGRAM', name: 'Instagram' },
    { type: 'FACEBOOK', name: 'Facebook' },
    { type: 'WEBSITE', name: 'Website Chat' },
  ];
  for (const c of channels) {
    await prisma.channel.upsert({
      where: { organizationId_type: { organizationId, type: c.type } },
      update: {},
      create: { organizationId, type: c.type, name: c.name },
    });
  }
}
