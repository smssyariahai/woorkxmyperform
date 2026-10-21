import type { NextAuthConfig } from 'next-auth';

// Konfigurasi edge-safe untuk middleware (tanpa node:crypto, tanpa prisma).
export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  providers: [],
} satisfies NextAuthConfig;
