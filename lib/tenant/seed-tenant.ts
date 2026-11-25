// Seed a fresh tenant database — replicates lib/auth.ts `seedOrgDefaults`
// (roles, permissions, lead/deal stages, channels) using the TENANT
// Prisma client. All rows are created with the given organizationId
// (which equals the Tenant.id in the master database).
//
// Idempotent: every write is an upsert, so re-running the seed after a
// failed provisioning attempt is safe.
import type { PrismaClient } from '@prisma/tenant-client';
import { ROLE_PERMISSIONS } from '../permissions';

export interface SeedTenantResult {
  roles: number;
  permissions: number;
  leadStages: number;
  dealStages: number;
  channels: number;
}

const LEAD_STAGES = [
  { name: 'Baru', color: '#087BFF' },
  { name: 'Dihubungi', color: '#8B5CF6' },
  { name: 'Terkualifikasi', color: '#22C55E' },
  { name: 'Proposal', color: '#F59E0B' },
  { name: 'Negosiasi', color: '#F97316' },
  { name: 'Menang', color: '#16A34A' },
  { name: 'Kalah', color: '#EF4444' },
];

const DEAL_STAGES = ['Prospek', 'Kualifikasi', 'Penawaran', 'Negosiasi', 'Closing'];

const CHANNELS = [
  { type: 'WHATSAPP', name: 'WhatsApp' },
  { type: 'INSTAGRAM', name: 'Instagram' },
  { type: 'FACEBOOK', name: 'Facebook' },
  { type: 'WEBSITE', name: 'Website Chat' },
];

export async function seedTenantDb(
  client: PrismaClient,
  organizationId: string,
): Promise<SeedTenantResult> {
  // 1. Permission catalog — every key used by any system role.
  const permKeys = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
  for (const key of permKeys) {
    await client.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  // 2. System roles + their RolePermission links, exactly as ROLE_PERMISSIONS.
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await client.role.upsert({
      where: { organizationId_name: { organizationId, name: roleName } },
      update: {},
      create: { organizationId, name: roleName, isSystem: true },
    });
    for (const p of perms) {
      const perm = await client.permission.findUniqueOrThrow({ where: { key: p } });
      await client.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  // 3. Lead stages (7).
  for (const [i, s] of LEAD_STAGES.entries()) {
    await client.leadStage.upsert({
      where: { organizationId_name: { organizationId, name: s.name } },
      update: {},
      create: { organizationId, name: s.name, color: s.color, order: i },
    });
  }

  // 4. Deal stages (5).
  for (const [i, name] of DEAL_STAGES.entries()) {
    await client.dealStage.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name, order: i },
    });
  }

  // 5. Channels (4).
  for (const c of CHANNELS) {
    await client.channel.upsert({
      where: { organizationId_type: { organizationId, type: c.type } },
      update: {},
      create: { organizationId, type: c.type, name: c.name },
    });
  }

  // Counts are read back from the database so the caller gets verified
  // numbers, not assumptions.
  const [roles, permissions, leadStages, dealStages, channels] = await Promise.all([
    client.role.count({ where: { organizationId } }),
    client.permission.count(),
    client.leadStage.count({ where: { organizationId } }),
    client.dealStage.count({ where: { organizationId } }),
    client.channel.count({ where: { organizationId } }),
  ]);

  return { roles, permissions, leadStages, dealStages, channels };
}

/** Number of distinct permission keys in the catalog (used by verification). */
export function expectedPermissionCount(): number {
  return new Set(Object.values(ROLE_PERMISSIONS).flat()).size;
}

// ---------------------------------------------------------------------------
// Mirror Organization & User — LAPISAN E.
// Salinan lokal skalar dari Tenant (master) + PlatformUser admin, agar kode
// aplikasi yang membaca prisma.organization / prisma.user tidak menemukan
// dashboard kosong di tenant baru. Idempotent (upsert). Master tetap
// otoritas identitas — mirror TIDAK menyimpan password.
// ---------------------------------------------------------------------------
export interface TenantMirrorInput {
  id: string;
  companySlug: string;
  companyName: string;
}

export interface TenantMirrorAdmin {
  id: string;
  email: string;
  name: string;
}

export async function seedTenantMirrors(
  client: PrismaClient,
  tenant: TenantMirrorInput,
  admin: TenantMirrorAdmin,
): Promise<{ organization: boolean; user: boolean }> {
  await client.organization.upsert({
    where: { id: tenant.id },
    update: {},
    create: {
      id: tenant.id,
      slug: tenant.companySlug,
      name: tenant.companyName,
      subdomain: tenant.companySlug,
      isActive: true,
      modules: '[]',
    },
  });
  await client.user.upsert({
    where: { id: admin.id },
    update: {},
    create: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
  });
  const [organization, user] = await Promise.all([
    client.organization.count({ where: { id: tenant.id } }),
    client.user.count({ where: { id: admin.id } }),
  ]);
  return { organization: organization === 1, user: user === 1 };
}
