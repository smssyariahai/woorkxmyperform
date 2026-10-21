/**
 * Sinkronisasi permission HR ke database yang sudah ada.
 * Idempotent — aman dijalankan berulang kali.
 *
 *   npx tsx prisma/sync-hr-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../lib/permissions';

const prisma = new PrismaClient();

async function main() {
  const permKeys = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
  for (const key of permKeys) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const roles = await prisma.role.findMany({ where: { isSystem: true } });
  let added = 0;
  for (const role of roles) {
    const want = ROLE_PERMISSIONS[role.name] ?? [];
    for (const key of want) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key } });
      const exists = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      });
      if (!exists) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
        added++;
      }
    }
  }
  console.log(`permission HR tersinkron — ${added} relasi baru ditambahkan`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
