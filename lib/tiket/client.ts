// Client helper Modul Tiket — pengganti fetch mentah di halaman /tiket dan
// /admin/tiket. Respons API dibungkus { success, data } (apiOk / apiErr
// dari lib/utils); helper ini meng-unwrap `body.data ?? body` (pola
// lib/tal/client.ts) — halaman JANGAN hand-roll apiJson sendiri.

export const TICKET_CATEGORIES = ['Teknis/IT', 'HRD', 'Keuangan', 'Umum'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ['rendah', 'normal', 'tinggi', 'mendesak'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ['TERBUKA', 'DIPROSES', 'MENUNGGU_BALASAN', 'SELESAI', 'DITUTUP'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  TERBUKA: 'Terbuka',
  DIPROSES: 'Diproses',
  MENUNGGU_BALASAN: 'Menunggu Balasan',
  SELESAI: 'Selesai',
  DITUTUP: 'Ditutup',
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  rendah: 'Rendah',
  normal: 'Normal',
  tinggi: 'Tinggi',
  mendesak: 'Mendesak',
};

export interface TicketReplyItem {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface TicketItem {
  id: string;
  organizationId: string;
  organizationName?: string;
  createdById: string;
  createdByName: string;
  createdByEmail?: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  assignedToId: string | null;
  assignedToName: string | null;
  replyCount: number;
  replies?: TicketReplyItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketInput {
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  description?: string;
}

export interface MemberItem {
  id: string;
  name: string;
}

export interface TicketUpdateInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  title?: string;
  description?: string;
  /** null = lepas penugasan; string = tugaskan ke user itu (harus anggota kantor). */
  assignedToId?: string | null;
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data ?? body;
}

function qs<T extends object>(params: T): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

export interface ListTicketsParams {
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
}

export async function listTickets(
  params: ListTicketsParams = {}
): Promise<{ tickets: TicketItem[]; canManage: boolean }> {
  return apiJson(`/api/tiket${qs(params)}`);
}

export async function getTicket(id: string): Promise<{ ticket: TicketItem; canManage: boolean; members?: MemberItem[] }> {
  return apiJson(`/api/tiket/${id}`);
}

export async function createTicket(input: TicketInput): Promise<TicketItem> {
  return apiJson('/api/tiket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateTicket(id: string, input: TicketUpdateInput): Promise<TicketItem> {
  return apiJson(`/api/tiket/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function replyTicket(
  id: string,
  content: string
): Promise<{ reply: TicketReplyItem; ticket: TicketItem }> {
  return apiJson(`/api/tiket/${id}/balasan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

// --- Administrator Pusat (/admin/tiket) ---

export interface ListAdminTicketsParams extends ListTicketsParams {
  organizationId?: string;
}

export async function listAdminTickets(
  params: ListAdminTicketsParams = {}
): Promise<{ tickets: TicketItem[]; organizations: Array<{ id: string; name: string }> }> {
  return apiJson(`/api/admin/tiket${qs(params)}`);
}

export async function getAdminTicket(id: string): Promise<{ ticket: TicketItem; members?: MemberItem[] }> {
  return apiJson(`/api/admin/tiket/${id}`);
}

export async function updateAdminTicket(id: string, input: TicketUpdateInput): Promise<TicketItem> {
  return apiJson(`/api/admin/tiket/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function replyAdminTicket(
  id: string,
  content: string
): Promise<{ reply: TicketReplyItem; ticket: TicketItem }> {
  return apiJson(`/api/admin/tiket/${id}/balasan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}
