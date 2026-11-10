import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { randomUUID } from 'node:crypto';
import { authConfig } from './auth.config';
import { prisma } from './db';
import { verifyPassword } from './password';
import { loginSchema } from './validation';
import { audit } from './audit';
import { slugify } from './utils';
import { getSystemSettings, verifyTurnstile } from './system-settings';
import { trialEndsAtFromNow } from './trial';
import { getSubscription } from './subscription';

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
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password || user.status !== 'ACTIVE') return null;
        const ok = await verifyPassword(parsed.data.password, user.password);
        if (!ok) return null;
        // Pintu login (Opsi B — sesi ikut pintu): /admin hanya untuk
        // Administrator WOORK; /login untuk pengguna kantor — TAPI admin yang
        // juga anggota aktif kantor boleh masuk /login sebagai karyawan murni
        // (sesi office-door tidak membawa hak admin). Penolakan peran tetap
        // hanya setelah password benar.
        const loginType = (credentials as any)?.loginType === 'admin' ? 'admin' : 'office';
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
        // Google OAuth: auto-provision user + workspace pribadi
        if (account?.provider === 'google' && user.email) {
          const email = user.email.toLowerCase();
          let dbUser = await prisma.user.findUnique({ where: { email } });
          if (!dbUser) {
            const base = slugify(user.name || email.split('@')[0]);
            const slug = `${base}-${randomUUID().slice(0, 6)}`;
            const org = await prisma.organization.create({
              data: {
                name: `${user.name || 'Workspace'}'s Workspace`,
                slug,
                subscription: { create: { plan: 'FREE', trialEndsAt: trialEndsAtFromNow() } },
              },
            });
            await seedOrgDefaults(org.id);
            dbUser = await prisma.user.create({
              data: { name: user.name || email.split('@')[0], email, avatar: user.image },
            });
            const role = await prisma.role.findFirst({
              where: { organizationId: org.id, name: 'OWNER' },
            });
            await prisma.membership.create({
              data: { userId: dbUser.id, organizationId: org.id, roleId: role!.id },
            });
            (user as any).organizationId = org.id;
            (user as any).organizationName = org.name;
            (user as any).role = 'OWNER';
            (user as any).isSuperAdmin = false;
            (user as any).loginDoor = 'office';
            // Samakan id sesi dengan id user di DB (cabang user lama sudah melakukannya).
            // Tanpa ini, token JWT memakai id OAuth (Google sub) yang tidak ada di tabel
            // User -> Session FK gagal + layout dashboard redirect loop /login <-> /dashboard.
            user.id = dbUser.id;
            user.name = dbUser.name;
          } else {
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
        // Bypass kantor/langganan hanya untuk sesi pintu admin; sesi karyawan
        // tunduk pada aturan kantor (lihat isSuperAdmin efektif di bawah).
        const doorAdmin = (token as any).loginDoor !== 'office';
        const effSuperAdmin = (token as any).isSuperAdmin === true && doorAdmin;
        if (trigger === 'update' && (session as any)?.organizationId) {
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
          token.organizationId = (user as any).organizationId;
          token.organizationName = (user as any).organizationName;
          token.role = (user as any).role;
          token.isSuperAdmin = (user as any).isSuperAdmin === true;
          // Sesi ikut pintu: catat pintu login di token.
          token.loginDoor = (user as any).loginDoor === 'admin' ? 'admin' : 'office';
        }
        // Refresh berkala agar pencabutan akses / penonaktifan cepat berlaku
        if (token.sub && (token as any)._permAt) {
          const age = Date.now() - (token as any)._permAt;
          if (age > 5 * 60_000) {
            const u = await prisma.user.findUnique({
              where: { id: token.sub as string },
              select: { status: true, isSuperAdmin: true },
            });
            if (!u || u.status !== 'ACTIVE') return { ...token, _expired: true } as any;
            (token as any).isSuperAdmin = u.isSuperAdmin;
            (token as any)._permAt = Date.now();
          }
        } else if (token.sub) {
          (token as any)._permAt = Date.now();
        }
        // Sesi lama (dibuat sebelum pintu login dicatat): tentukan pintunya
        // sekali dari peran user, supaya sesi admin yang sudah berjalan tidak
        // kehilangan aksesnya — dan sesi karyawan tetap karyawan.
        if (!(token as any).loginDoor && token.sub) {
          (token as any).loginDoor = (await isAdminDoorUser(
            token.sub as string,
            (token as any).isSuperAdmin === true
          ))
            ? 'admin'
            : 'office';
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.sub!;
          (session.user as any).organizationId = token.organizationId;
          (session.user as any).organizationName = token.organizationName;
          (session.user as any).role = token.role;
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
