// Singleton Prisma client for the master database (woork_master).
// Platform-level data only: tenants, database registry, global users,
// memberships, billing, provisioning jobs, audit logs.
// Tenant operational data NEVER goes through this client — it lives in each
// tenant's own database (woork_t_*) via the tenant resolver.
import { PrismaClient } from '@prisma/master-client';
import { loadTenantEnv } from './env';

loadTenantEnv();

const globalForMaster = globalThis as unknown as { masterPrisma?: PrismaClient };

export const masterPrisma =
  globalForMaster.masterPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForMaster.masterPrisma = masterPrisma;
