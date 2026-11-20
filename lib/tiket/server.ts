// Server helper Modul Tiket — dipakai API tenant (/api/tiket/*) dan API
// Administrator Pusat (/api/admin/tiket/*).
//
// Visibilitas (tenant):
// - Pemegang TIKET_MANAGE (OWNER/ADMIN) melihat SEMUA tiket kantor.
// - User biasa hanya tiket yang dibuatnya + tiket yang ditugaskan ke dia.
// Notifikasi in-app (model Notification, type 'TIKET') mengikuti pola
// fan-out pengumuman (app/api/pengumuman/[id]/publish): createMany
// sekali jalan, tanpa WA/email di v1.

import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/auth-helpers';
import { getUserPermissions } from '@/lib/auth-helpers';
import type { TicketCategory, TicketItem, TicketPriority, TicketStatus } from './client';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from './client';

export { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES };

export type TicketRow = {
  id: string;
  organizationId: string;
  createdById: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  organization?: { name: string } | null;
  createdBy?: { name: string; email: string } | null;
  assignedTo?: { name: string } | null;
  replies?: Array<{
    id: string;
    ticketId: string;
    authorId: string;
    content: string;
    createdAt: Date;
    author?: { name: string } | null;
  }>;
  _count?: { replies: number };
};

export function mapTicket(row: TicketRow): TicketItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization?.name,
    createdById: row.createdById,
    createdByName: row.createdBy?.name ?? 'Pengguna',
    createdByEmail: row.createdBy?.email,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    description: row.description,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo?.name ?? null,
    replyCount: row._count?.replies ?? row.replies?.length ?? 0,
    replies: row.replies?.map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      authorId: r.authorId,
      authorName: r.author?.name ?? 'Pengguna',
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Include standar untuk detail/daftar tiket. */
export const ticketInclude = {
  organization: { select: { name: true } },
  createdBy: { select: { name: true, email: true } },
  assignedTo: { select: { name: true } },
  _count: { select: { replies: true } },
} as const;

export const ticketDetailInclude = {
  organization: { select: { name: true } },
  createdBy: { select: { name: true, email: true } },
  assignedTo: { select: { name: true } },
  replies: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { name: true } } },
  },
} as const;

export async function userCanManageTicket(ctx: AuthContext): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const keys = await getUserPermissions(ctx);
  return keys.has('TIKET_MANAGE');
}

/**
 * Filter visibilitas tenant: admin kantor (TIKET_MANAGE) = semua tiket
 * kantor; user biasa = tiket buatannya + yang ditugaskan ke dia.
 */
export function ticketVisibilityWhere(
  ctx: AuthContext,
  canManage: boolean
): Record<string, unknown> {
  if (canManage) return { organizationId: ctx.organizationId };
  return {
    organizationId: ctx.organizationId,
    OR: [{ createdById: ctx.userId }, { assignedToId: ctx.userId }],
  };
}

export function parseTicketInput(body: Record<string, unknown>): {
  error?: string;
  data?: { title: string; category: TicketCategory; priority: TicketPriority; description: string };
} {
  const title = String(body.title ?? '').trim();
  if (!title) return { error: 'Judul tiket wajib diisi.' };
  if (title.length > 200) return { error: 'Judul tiket maksimal 200 karakter.' };
  const category = String(body.category ?? 'Umum');
  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    return { error: 'Kategori tidak dikenal.' };
  }
  const priority = String(body.priority ?? 'normal');
  if (!(TICKET_PRIORITIES as readonly string[]).includes(priority)) {
    return { error: 'Prioritas tidak dikenal.' };
  }
  return {
    data: {
      title,
      category: category as TicketCategory,
      priority: priority as TicketPriority,
      description: String(body.description ?? '').trim(),
    },
  };
}

export function parseTicketUpdate(body: Record<string, unknown>): {
  error?: string;
  data?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    title?: string;
    description?: string;
    assignedToId?: string | null;
    hasAssignee?: boolean;
  };
} {
  const data: NonNullable<ReturnType<typeof parseTicketUpdate>['data']> = {};
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!(TICKET_STATUSES as readonly string[]).includes(s)) return { error: 'Status tidak dikenal.' };
    data.status = s as TicketStatus;
  }
  if (body.priority !== undefined) {
    const p = String(body.priority);
    if (!(TICKET_PRIORITIES as readonly string[]).includes(p)) return { error: 'Prioritas tidak dikenal.' };
    data.priority = p as TicketPriority;
  }
  if (body.category !== undefined) {
    const c = String(body.category);
    if (!(TICKET_CATEGORIES as readonly string[]).includes(c)) return { error: 'Kategori tidak dikenal.' };
    data.category = c as TicketCategory;
  }
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return { error: 'Judul tiket wajib diisi.' };
    if (t.length > 200) return { error: 'Judul tiket maksimal 200 karakter.' };
    data.title = t;
  }
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.assignedToId !== undefined) {
    data.hasAssignee = true;
    data.assignedToId = body.assignedToId === null || body.assignedToId === '' ? null : String(body.assignedToId);
  }
  if (Object.keys(data).length === 0) return { error: 'Tidak ada perubahan yang dikirim.' };
  return { data };
}

/**
 * Transisi status otomatis saat ada balasan (hanya bila status masih aktif):
 * - Pembalas BUKAN pembuat (admin) & status TERBUKA -> DIPROSES; bila sudah
 *   DIPROSES -> MENUNGGU_BALASAN (menunggu balasan pembuat tiket).
 * - Pembalas adalah pembuat & status MENUNGGU_BALASAN -> DIPROSES.
 * - Tiket SELESAI/DITUTUP tidak berubah (admin membuka ulang lewat PATCH).
 */
export function nextStatusAfterReply(ticket: { status: string; createdById: string }, replierId: string): string | null {
  if (ticket.status === 'SELESAI' || ticket.status === 'DITUTUP') return null;
  if (replierId === ticket.createdById) {
    return ticket.status === 'MENUNGGU_BALASAN' ? 'DIPROSES' : null;
  }
  if (ticket.status === 'TERBUKA') return 'DIPROSES';
  if (ticket.status === 'DIPROSES') return 'MENUNGGU_BALASAN';
  return null;
}

// ---------------------------------------------------------------------------
// Notifikasi in-app (type 'TIKET')
// ---------------------------------------------------------------------------

/** Anggota aktif kantor (id + nama) — untuk dropdown penugasan di detail tiket. */
export async function listTicketMembers(organizationId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE' },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map((r) => ({ id: r.user.id, name: r.user.name }));
}

/** User aktif kantor ini yang memegang TIKET_MANAGE (= admin kantor). */
export async function ticketAdminUserIds(organizationId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      role: { permissions: { some: { permission: { key: 'TIKET_MANAGE' } } } },
    },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

async function createNotifications(
  organizationId: string,
  userIds: string[],
  title: string,
  body: string
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ organizationId, userId, type: 'TIKET', title, body })),
  });
}

/** Tiket baru -> beri tahu admin kantor (kecuali pembuatnya sendiri). */
export async function notifyTicketCreated(ticket: {
  organizationId: string;
  createdById: string;
  title: string;
  category: string;
}): Promise<void> {
  const admins = (await ticketAdminUserIds(ticket.organizationId)).filter((id) => id !== ticket.createdById);
  await createNotifications(
    ticket.organizationId,
    admins,
    `Tiket baru: ${ticket.title}`,
    `Kategori ${ticket.category}. Buka halaman Tiket untuk menindaklanjuti.`
  );
}

/**
 * Ada balasan -> beri tahu pihak lain: bila pembalas adalah pembuat tiket,
 * beri tahu admin kantor; bila pembalas admin, beri tahu pembuat tiket.
 */
export async function notifyTicketReply(
  ticket: { organizationId: string; createdById: string; title: string },
  replierId: string,
  replierName: string
): Promise<void> {
  if (replierId === ticket.createdById) {
    const admins = (await ticketAdminUserIds(ticket.organizationId)).filter((id) => id !== replierId);
    await createNotifications(
      ticket.organizationId,
      admins,
      `Balasan baru pada tiket: ${ticket.title}`,
      `${replierName} membalas tiket ini.`
    );
  } else {
    await createNotifications(
      ticket.organizationId,
      [ticket.createdById],
      `Balasan baru pada tiket: ${ticket.title}`,
      `${replierName} membalas tiket Anda.`
    );
  }
}
