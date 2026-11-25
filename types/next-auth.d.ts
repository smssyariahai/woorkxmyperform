import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      organizationName: string;
      role: string;
      // LAPISAN D (database-per-tenant): null untuk sesi legacy.
      tenantCode?: string | null;
      tenantId?: string | null;
      tenantStatus?: string | null;
      isSuperAdmin?: boolean;
      loginDoor?: 'admin' | 'office';
    } & DefaultSession['user'];
  }
  interface User {
    organizationId?: string;
    organizationName?: string;
    role?: string;
    // LAPISAN D: ditempel authorize (kredensial) / callback signIn (Google).
    tenantCode?: string | null;
    tenantId?: string | null;
    tenantStatus?: string | null;
    isSuperAdmin?: boolean;
    loginDoor?: 'admin' | 'office';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    organizationId?: string;
    organizationName?: string;
    role?: string;
    // LAPISAN D: hanya ada di token tenant; token legacy tidak membawanya.
    tenantCode?: string;
    tenantId?: string;
    tenantStatus?: string;
    isSuperAdmin?: boolean;
    loginDoor?: 'admin' | 'office';
  }
}
