import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions, assertCanGrant } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { validateUserDetailInput, buildUserDetailOps, runUserDetailOps } from '@/lib/user-detail';
import { checkUserQuota } from '@/lib/subscription';
import { SENSITIVE_MODULES_DEFAULT_NONE, type ModularKey } from '@/lib/modular';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users — daftar pengguna kantor (pencarian, filter, pagination). */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('USERS_VIEW', req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const roleId = searchParams.get('roleId') ?? '';
    const departmentId = searchParams.get('departmentId') ?? '';
    const status = searchParams.get('status') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('perPage') ?? '20')));

    const where: any = { organizationId: ctx.organizationId };
    if (roleId) where.roleId = roleId;
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;
    // Cari user tidak bisa memakai filter relasi `user` pada Membership di
    // tenant client — selesaikan dulu id user yang cocok, lalu filter dengan
    // `userId in [...]` (Lapisan F).
    if (q) {
      const matched = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      where.userId = { in: matched.map((u) => u.id) };
    }

    const [total, rows] = await Promise.all([
      prisma.membership.count({ where }),
      prisma.membership.findMany({
        where,
        include: {
          role: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    // Membership TIDAK punya relasi `user` di tenant client — gabung dari
    // mirror User (bentuk item sama seperti include lama).
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, phone: true, avatar: true, status: true, isSuperAdmin: true, createdAt: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const items = rows.map((r) => ({ ...r, user: byId.get(r.userId) ?? null }));
    return apiOk({ items, page, perPage, total, totalPages: Math.ceil(total / perPage) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengguna.', 500);
  }
}

/**
 * POST /api/admin/users — tambah pengguna langsung (tanpa undangan).
 * Body: name, email, password?, phone?, roleId, departmentId?, jobTitle?
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('USERS_CREATE', req);
    // Kuota karyawan langganan (Sistem Modular).
    await checkUserQuota(ctx.organizationId);
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').toLowerCase().trim();
    const roleId = String(body?.roleId || '');
    if (!name || !email || !roleId) return apiErr('Nama, email, dan role wajib diisi.', 422);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return apiErr('Format email tidak valid.', 422);

    // Role harus milik kantor ini & bukan role sistem global aneh
    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId: ctx.organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) return apiErr('Role tidak ditemukan di kantor ini.', 404);

    // Anti-eskalasi: tidak boleh memberi permission yang tidak dimiliki
    const granterKeys = await getUserPermissions(ctx);
    assertCanGrant(granterKeys, role.permissions.map((rp) => rp.permission.key));

    // Departemen harus milik kantor ini
    const departmentId = body?.departmentId ? String(body.departmentId) : null;
    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: ctx.organizationId },
      });
      if (!dept) return apiErr('Divisi tidak ditemukan di kantor ini.', 404);
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await prisma.membership.findFirst({
        where: { userId: existingUser.id, organizationId: ctx.organizationId },
      });
      if (existingMember) return apiErr('Email sudah terdaftar di kantor ini.', 409);
    }

    const password = String(body?.password || '').trim();
    const username = body?.username ? String(body.username).trim().toLowerCase() : null;
    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) {
      return apiErr('Username hanya boleh huruf kecil, angka, titik, _ dan -, panjang 3–32 karakter.', 422);
    }
    if (username) {
      const clash = await prisma.user.findFirst({ where: { username }, select: { id: true } });
      if (clash) return apiErr('Username sudah dipakai pengguna lain.', 409);
    }

    // Validasi data lengkap (profil, keluarga, ketenagakerjaan, dll) SEBELUM
    // membuat apa pun, agar gagal validasi tidak menyisakan user setengah jadi.
    // userId sementara = id user yang sudah ada (bila email dikenal) atau
    // placeholder — validasi manajer/approver memakai userId ini hanya untuk
    // cek "bukan diri sendiri", jadi placeholder aman untuk user baru.
    const detail = await validateUserDetailInput(body, {
      organizationId: ctx.organizationId,
      userId: existingUser ? existingUser.id : 'new',
    });

    const user = existingUser
      ? existingUser
      : await prisma.user.create({
          data: {
            name,
            email,
            username,
            phone: body?.phone ? String(body.phone).trim() : null,
            password: password ? await hashPassword(password) : null,
            status: 'ACTIVE',
          },
        });

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: ctx.organizationId,
        roleId: role.id,
        departmentId,
        jobTitle: body?.jobTitle ? String(body.jobTitle).trim() : null,
        status: 'ACTIVE',
      },
    });

    // Data lengkap (profil, keluarga, ketenagakerjaan, pendidikan,
    // pengalaman, nilai custom, akses modul) — dua transaksi terpisah
    // (tenant + profil global, lihat runUserDetailOps).
    await runUserDetailOps(buildUserDetailOps(detail, { userId: user.id, membershipId: membership.id }));

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_USER',
      module: 'USERS',
      description: `Menambah pengguna ${name} (${email}) sebagai ${role.name}`,
      ipAddress: getClientIp(req),
    });
    // Fase 7 G3: hak modul awal yang eksplisit (READ/NONE, atau WRITE
    // modul sensitif) dicatat terpisah — CREATE_USER saja tidak menyebutnya.
    const initialModuleRows = detail.moduleAccess.filter(
      (m) =>
        m.access !== 'WRITE' ||
        SENSITIVE_MODULES_DEFAULT_NONE.has(m.moduleKey as ModularKey)
    );
    if (initialModuleRows.length > 0) {
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'UPDATE_MODULE_ACCESS',
        module: 'USERS',
        description: `Hak modul awal ${name} (${email}) — ${initialModuleRows
          .map((m) => `${m.moduleKey}: ${m.access}`)
          .join('; ')}`,
        ipAddress: getClientIp(req),
      });
    }
    // Membership TIDAK punya relasi `user`/`role` di tenant client — bentuk
    // respons sama seperti include lama (Lapisan F).
    return apiOk(
      {
        ...membership,
        user: { id: user.id, name: user.name, email: user.email },
        role: { name: role.name },
      },
      201
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah pengguna.', 500);
  }
}
