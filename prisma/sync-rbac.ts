/**
 * Sinkronisasi katalog permission & role sistem ke database.
 * Idempotent — aman dijalankan berulang (dipakai setelah menambah permission baru).
 *
 * - Upsert seluruh PERMISSION_CATALOG (key + module + description).
 * - Untuk setiap organisasi: pastikan role sistem (OWNER/ADMIN/SUPERVISOR/AGENT/VIEWER)
 *   ada dan permission-nya persis sama dengan ROLE_PERMISSIONS (tambah yang kurang,
 *   cabut yang tidak lagi termasuk).
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, ROLE_PERMISSIONS } from '../lib/permissions';

const prisma = new PrismaClient();

async function main() {
  // 1) Katalog permission
  for (const def of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: def.key },
      update: { module: def.module, description: def.description },
      create: { key: def.key, module: def.module, description: def.description },
    });
  }
  console.log(`katalog: ${PERMISSION_CATALOG.length} permission`);

  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id])
  );

  // 2) Role sistem per organisasi
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await prisma.role.upsert({
        where: { organizationId_name: { organizationId: org.id, name: roleName } },
        update: { isSystem: true },
        create: { organizationId: org.id, name: roleName, isSystem: true },
      });
      const want = new Set(perms.map((k) => permByKey.get(k)).filter(Boolean) as string[]);
      const existing = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const have = new Set(existing.map((r) => r.permissionId));
      for (const pid of want) {
        if (!have.has(pid)) {
          await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: pid } });
        }
      }
      for (const pid of have) {
        if (!want.has(pid)) {
          await prisma.rolePermission.delete({
            where: { roleId_permissionId: { roleId: role.id, permissionId: pid } },
          });
        }
      }
    }
    console.log(`org ${org.name}: role sistem tersinkron`);
  }
  console.log('selesai.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
