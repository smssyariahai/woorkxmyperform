// Pengaturan TAL Tim Saya — porting endpoint backup:
//   GET  /api/pg/tal/team/settings
//   POST /api/pg/tal/team/settings/manager  -> POST { action: 'manager' }
//   POST /api/pg/tal/team/settings/grants   -> POST { action: 'grant' }
//   DELETE /api/pg/tal/team/settings/grants/:id -> DELETE ?grantId=
// Plus kewajiban anggota (TalUserObligation) -> POST { action: 'obligation' }.
// Semua tulis: gate canManage (§5.3) + TalAuditLog dengan alasan wajib.
// Atasan ditulis ke UserEmployment.managerId (via Membership), BUKAN kolom baru.
import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  talTeamCanManage,
  talLoadOrgUsers,
  talManagerWouldCycle,
  talWriteAuditLog,
} from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

const GATE_MSG = 'Hanya Administrator atau pengguna dengan akses tulis halaman ini yang boleh mengatur tim.';

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    if (!(await talTeamCanManage(ctx))) return apiErr(GATE_MSG, 403);
    const users = await talLoadOrgUsers(ctx.organizationId);
    const byId = new Map(users.map((u) => [u.id, u]));
    const grants = await prisma.talTeamVisibility.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const obligations = await prisma.talUserObligation.findMany({
      where: { organizationId: ctx.organizationId },
    });
    return apiOk({
      users: users.map((u) => ({
        id: u.id, email: u.email, nama: u.nama, divisi: u.divisi,
        posisi: u.posisi, role: u.role, isActive: u.isActive,
        manajerAtasanId: u.managerId,
      })),
      grants: grants.map((g) => ({
        id: g.id,
        viewerId: g.viewerId,
        viewerNama: byId.get(g.viewerId)?.nama || '',
        targetId: g.targetId,
        targetNama: byId.get(g.targetId)?.nama || '',
      })),
      obligations: obligations.map((o) => ({
        id: o.id, userId: o.userId, userEmail: o.userEmail, userName: o.userName,
        daily: o.daily, weekly: o.weekly, monthly: o.monthly,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan tim.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!(await talTeamCanManage(ctx))) return apiErr(GATE_MSG, 403);
    const b = (await req.json().catch(() => ({}))) as any;
    const reason = String(b.reason || '').trim();
    if (!reason) return apiErr('Alasan wajib diisi untuk perubahan pengaturan tim.', 400);

    // --- Set atasan langsung (tulis UserEmployment.managerId) ---
    if (b.action === 'manager') {
      const userId = String(b.userId || '');
      const managerId = b.managerId ? String(b.managerId) : '';
      if (!userId) return apiErr('userId wajib diisi.', 400);
      const users = await talLoadOrgUsers(ctx.organizationId);
      const target = users.find((u) => u.id === userId);
      if (!target) return apiErr('Karyawan tidak ditemukan.', 404);
      let managerName = '';
      if (managerId) {
        const mgr = users.find((u) => u.id === managerId);
        if (!mgr) return apiErr('Atasan tidak ditemukan.', 404);
        if (managerId === userId) return apiErr('Atasan tidak boleh diri sendiri.', 400);
        if (await talManagerWouldCycle(ctx.organizationId, userId, managerId)) {
          return apiErr('Atasan ini akan membentuk lingkaran hirarki.', 400);
        }
        managerName = mgr.nama;
      }
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId: ctx.organizationId } },
        select: { id: true },
      });
      if (!membership) return apiErr('Keanggotaan karyawan tidak ditemukan.', 404);
      await prisma.userEmployment.upsert({
        where: { membershipId: membership.id },
        create: { membershipId: membership.id, managerId: managerId || null },
        update: { managerId: managerId || null },
      });
      await talWriteAuditLog(ctx, {
        actionType: 'update_team_settings',
        actionTitle: 'Ubah atasan langsung',
        reason,
        targetSummary: `${target.nama} → atasan: ${managerName || '(tanpa atasan)'}`,
        affectedCount: 1,
        details: { userId, managerId: managerId || null },
      });
      return apiOk({ ok: true, userId, managerId: managerId || null, managerName });
    }

    // --- Tambah grant visibilitas kustom ---
    if (b.action === 'grant') {
      const viewerId = String(b.viewerId || '');
      const targetId = String(b.targetId || '');
      if (!viewerId || !targetId) return apiErr('viewerId dan targetId wajib diisi.', 400);
      if (viewerId === targetId) return apiErr('Tidak bisa memberi akses ke diri sendiri (sudah otomatis).', 400);
      const users = await talLoadOrgUsers(ctx.organizationId);
      const viewer = users.find((u) => u.id === viewerId);
      const target = users.find((u) => u.id === targetId);
      if (!viewer || !target) return apiErr('Karyawan tidak ditemukan.', 404);
      const row = await prisma.talTeamVisibility.upsert({
        where: { organizationId_viewerId_targetId: { organizationId: ctx.organizationId, viewerId, targetId } },
        create: { organizationId: ctx.organizationId, viewerId, targetId, createdById: ctx.userId },
        update: {},
      });
      await talWriteAuditLog(ctx, {
        actionType: 'update_team_settings',
        actionTitle: 'Tambah akses kustom tim',
        reason,
        targetSummary: `${viewer.nama} boleh melihat TAL ${target.nama}`,
        affectedCount: 1,
        details: { viewerId, targetId, grantId: row.id },
      });
      return apiOk({ ok: true, id: row.id });
    }

    // --- Simpan kewajiban TAL satu anggota ---
    if (b.action === 'obligation') {
      const userId = String(b.userId || '');
      if (!userId) return apiErr('userId wajib diisi.', 400);
      const users = await talLoadOrgUsers(ctx.organizationId);
      const target = users.find((u) => u.id === userId);
      if (!target) return apiErr('Karyawan tidak ditemukan.', 404);
      const row = await prisma.talUserObligation.upsert({
        where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
        create: {
          organizationId: ctx.organizationId, userId,
          userEmail: target.email, userName: target.nama,
          daily: b.daily !== false, weekly: b.weekly !== false, monthly: b.monthly !== false,
          updatedBy: ctx.userId,
        },
        update: {
          daily: b.daily !== false, weekly: b.weekly !== false, monthly: b.monthly !== false,
          updatedBy: ctx.userId,
        },
      });
      await talWriteAuditLog(ctx, {
        actionType: 'update_obligations',
        actionTitle: 'Ubah kewajiban TAL',
        reason,
        targetSummary: `${target.nama}: harian=${row.daily ? 'ya' : 'tidak'}, mingguan=${row.weekly ? 'ya' : 'tidak'}, bulanan=${row.monthly ? 'ya' : 'tidak'}`,
        affectedCount: 1,
        details: { userId, daily: row.daily, weekly: row.weekly, monthly: row.monthly },
      });
      return apiOk({ ok: true, id: row.id });
    }

    return apiErr('action tidak dikenal (manager | grant | obligation).', 400);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan tim.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!(await talTeamCanManage(ctx))) return apiErr(GATE_MSG, 403);
    const url = new URL(req.url);
    const grantId = url.searchParams.get('grantId') || '';
    if (!grantId) return apiErr('grantId wajib diisi.', 400);
    const reason = (url.searchParams.get('reason') || '').trim();
    if (!reason) return apiErr('Alasan wajib diisi untuk menghapus akses kustom.', 400);
    const row = await prisma.talTeamVisibility.findFirst({
      where: { id: grantId, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Akses tidak ditemukan.', 404);
    await prisma.talTeamVisibility.delete({ where: { id: grantId } });
    await talWriteAuditLog(ctx, {
      actionType: 'update_team_settings',
      actionTitle: 'Hapus akses kustom tim',
      reason,
      targetSummary: `grant ${grantId}`,
      affectedCount: 1,
      details: { viewerId: row.viewerId, targetId: row.targetId },
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus akses.', 500);
  }
}
