import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions, assertCanGrant } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { getUserDetail, validateUserDetailInput, buildUserDetailOps, runUserDetailOps } from '@/lib/user-detail';
import { effectiveModuleLevel, getUserModuleLevels } from '@/lib/subscription';
import { type ModularKey } from '@/lib/modular';
import { publishModuleAccess } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users/:id — detail lengkap pengguna (semua sidebar). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_VIEW', req);
    const detail = await getUserDetail(params.id, ctx.organizationId);
    if (!detail) return apiErr('Pengguna tidak ditemukan.', 404);
    return apiOk(detail);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengguna.', 500);
  }
}

/**
 * DELETE /api/admin/users/:id — hapus pengguna dari kantor ini.
 * Menghapus Membership (data kepegawaian, custom field & hak akses modul di
 * kantor ini ikut terhapus via Cascade); akun User-nya sendiri tetap ada
 * bila ia anggota kantor lain. Pengaman: bukan diri sendiri, bukan
 * Administrator Pusat (kecuali oleh sesama Administrator Pusat), hanya
 * OWNER yang boleh menghapus OWNER lain, dan kantor harus menyisakan
 * minimal 1 OWNER aktif.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_DELETE', req);
    // Membership TIDAK punya relasi `user` di tenant client — user diambil
    // terpisah lalu digabung (bentuk hasil sama).
    const membershipRow = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { role: true },
    });
    if (!membershipRow) return apiErr('Pengguna tidak ditemukan.', 404);
    const memberUser = await prisma.user.findUnique({ where: { id: membershipRow.userId } });
    if (!memberUser) return apiErr('Pengguna tidak ditemukan.', 404);
    const membership = { ...membershipRow, user: memberUser };
    if (membership.userId === ctx.userId) return apiErr('Tidak dapat menghapus akun sendiri.', 409);
    if (membership.user.isSuperAdmin && !ctx.isSuperAdmin) {
      return apiErr('Hanya Administrator Pusat yang dapat menghapus akun Administrator Pusat.', 403);
    }
    if (membership.role.name === 'OWNER' && ctx.role !== 'OWNER') {
      return apiErr('Hanya owner yang dapat menghapus akun owner lain.', 403);
    }
    if (membership.role.name === 'OWNER') {
      const ownerCount = await prisma.membership.count({
        where: { organizationId: ctx.organizationId, role: { name: 'OWNER' }, status: 'ACTIVE' },
      });
      if (ownerCount <= 1) return apiErr('Kantor harus memiliki minimal 1 owner.', 409);
    }
    await prisma.membership.delete({ where: { id: membership.id } });

    // Beri tahu sesi pengguna yang dihapus: sidebar-nya refresh otomatis.
    publishModuleAccess(ctx.organizationId, membership.userId);

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_USER',
      module: 'USERS',
      description: `Menghapus pengguna ${membership.user.name} (${membership.user.email}) dari kantor`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus pengguna.', 500);
  }
}
/**
 * PATCH /api/admin/users/:id — edit data pengguna lengkap (halaman edit).
 * Body: name, phone, username?, status?, departmentId?, jobTitle?, roleId?
 * + profile, family[], employment, educations[], experiences[],
 *   customValues{}, moduleAccess{} (lihat lib/user-detail.ts).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_UPDATE', req);
    // Membership TIDAK punya relasi `user` di tenant client — user diambil
    // terpisah lalu digabung (bentuk hasil sama).
    const membershipRow = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { role: true },
    });
    if (!membershipRow) return apiErr('Pengguna tidak ditemukan.', 404);
    const memberUser = await prisma.user.findUnique({ where: { id: membershipRow.userId } });
    if (!memberUser) return apiErr('Pengguna tidak ditemukan.', 404);
    const membership = { ...membershipRow, user: memberUser };
    const body = await req.json();

    const departmentId = body?.departmentId ? String(body.departmentId) : null;
    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: ctx.organizationId },
      });
      if (!dept) return apiErr('Divisi tidak ditemukan di kantor ini.', 404);
    }

    // Role baru (bila diubah): harus milik kantor ini + anti-eskalasi.
    let roleId: string | null = null;
    if (body?.roleId !== undefined && body.roleId !== null && String(body.roleId) !== '') {
      roleId = String(body.roleId);
      const role = await prisma.role.findFirst({
        where: { id: roleId, organizationId: ctx.organizationId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) return apiErr('Role tidak ditemukan di kantor ini.', 404);
      const granterKeys = await getUserPermissions(ctx);
      assertCanGrant(granterKeys, role.permissions.map((rp) => rp.permission.key));
    }

    const userData: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama tidak boleh kosong.', 422);
      userData.name = name;
    }
    if (body?.phone !== undefined) userData.phone = String(body.phone).trim() || null;
    if (body?.username !== undefined) {
      const username = String(body.username).trim().toLowerCase() || null;
      if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) {
        return apiErr('Username hanya boleh huruf kecil, angka, titik, _ dan -, panjang 3–32 karakter.', 422);
      }
      if (username) {
        const clash = await prisma.user.findFirst({ where: { username, id: { not: membership.userId } }, select: { id: true } });
        if (clash) return apiErr('Username sudah dipakai pengguna lain.', 409);
      }
      userData.username = username;
    }
    if (body?.status !== undefined) {
      const st = String(body.status);
      if (st !== 'ACTIVE' && st !== 'INACTIVE') return apiErr('Status tidak dikenal.', 422);
      userData.status = st;
    }

    // Validasi data lengkap (profil, keluarga, ketenagakerjaan, dll).
    const detail = await validateUserDetailInput(body, {
      organizationId: ctx.organizationId,
      userId: membership.userId,
      membershipId: membership.id,
    });

    const detailOps = buildUserDetailOps(detail, { userId: membership.userId, membershipId: membership.id });
    const ops: any[] = [];
    if (Object.keys(userData).length > 0) {
      ops.push(prisma.user.update({ where: { id: membership.userId }, data: userData }));
    }
    ops.push(
      prisma.membership.update({
        where: { id: membership.id },
        data: {
          departmentId,
          jobTitle: body?.jobTitle !== undefined ? String(body.jobTitle).trim() || null : undefined,
          ...(roleId ? { roleId } : {}),
          ...(body?.status !== undefined ? { status: String(body.status) } : {}),
        },
      })
    );
    // Fase 7 G3: jejak perubahan hak modul — bandingkan level EFEKTIF
    // sebelum vs sesudah simpan (hanya bila benar-benar berubah). Level
    // efektif penting di sini: modul sensitif tanpa baris = NONE, bukan
    // WRITE — jadi pengaktifan eksplisit NONE -> WRITE tercatat.
    const oldLevels = await getUserModuleLevels(membership.userId, ctx.organizationId);
    // Ops tenant (user/membership + detail tenant) satu transaksi;
    // ops profil global transaksi terpisah (lihat runUserDetailOps).
    await runUserDetailOps({ tenant: [...ops, ...detailOps.tenant], profile: detailOps.profile });
    const newLevels = await getUserModuleLevels(membership.userId, ctx.organizationId);
    const moduleChanges: string[] = [];
    const changedKeys = new Set([
      ...Object.keys(oldLevels),
      ...Object.keys(newLevels),
      ...detail.moduleAccess.map((m) => m.moduleKey),
    ]);
    for (const key of changedKeys) {
      const before = effectiveModuleLevel(oldLevels, key as ModularKey);
      const after = effectiveModuleLevel(newLevels, key as ModularKey);
      if (before !== after) moduleChanges.push(`${key}: ${before} → ${after}`);
    }
    if (moduleChanges.length > 0) {
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'UPDATE_MODULE_ACCESS',
        module: 'USERS',
        description: `Mengubah hak modul ${membership.user.name} (${membership.user.email}) — ${moduleChanges.join('; ')}`,
        ipAddress: getClientIp(req),
      });
    }

    // Beri tahu sesi pengguna yang diedit: sidebar-nya refresh otomatis
    // (menu modul yang dimatikan langsung hilang tanpa reload manual).
    publishModuleAccess(ctx.organizationId, membership.userId);

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_USER',
      module: 'USERS',
      description: `Mengedit pengguna ${membership.user.name} (${membership.user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengedit pengguna.', 500);
  }
}
