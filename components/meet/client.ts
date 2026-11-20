// Client helper Modul WOORK MEET — pengganti fetch mentah di halaman /meet.
// Respons API dibungkus { success, data } (apiOk / apiErr dari lib/utils);
// helper ini meng-unwrap `body.data ?? body` (pola lib/tal/client.ts dan
// lib/tiket/client.ts) — halaman JANGAN hand-roll apiJson sendiri.
//
// CATATAN SCOPE (Worker 4, Fase 2): file ini sengaja diletakkan di
// components/meet/ — bukan lib/meet/ — karena lib/ di luar scope worker
// halaman. Worker integrasi boleh memindahkannya ke lib/meet/client.ts
// tanpa mengubah impor halaman bila memakai alias yang sama.
//
// ASUMSI NAMA/FIELD API — DISELARASKAN DENGAN IMPLEMENTASI NYATA (integrasi Fase 2):
// - GET  /api/meet?filter=today|upcoming|ongoing|history|mine
//   -> { meetings: MeetingItem[], canManage?, filter } (TANPA stats/canCreate)
// - POST /api/meet -> MeetingItem datar (mapMeeting); body memakai
//   { userIds: string[], guests: [{ name, email?, phone? }] } — BUKAN `participants`
// - GET /api/meet/[id] -> MeetingItem datar (mapMeeting: participants +
//   counts + roomLink di dalam) + canManage/canEdit/isHost; TANPA agenda/notes
//   (agenda & notulen diambil getMeeting() dari endpoint masing-masing)
// - PATCH /api/meet/[id] (ubah; TANPA field status — batalkan pakai DELETE)
// - DELETE /api/meet/[id] -> MeetingItem datar berstatus CANCELLED (batalkan)
// - POST /api/meet/[id]/join { password?, guestToken? }
//   -> { waiting, meetingId, meeting, participants, videoConfigured: false }
// - POST /api/meet/[id]/leave -> { left, sessionId, ended, status }
// - POST /api/meet/[id]/participants { userIds, guests }
//   -> { participants: MeetingParticipantItem[], added }
// - POST /api/meet/[id]/invite { participantIds: string[] (min 1) }
//   -> { invitations: [{ participantId, name, email, isGuest, link }], sent }
// - GET  /api/meet/search-participants?q=
//   -> { participants: [{ id, name, email, avatar, jobTitle, department, departmentId, branch }] }
// - GET  /api/meet/guest/[token] (publik)
//   -> { meeting: GuestMeetingInfo, guestName, scope }
// - GET/POST /api/meet/[id]/agenda -> GET { agenda }, POST item datar
// - GET/POST /api/meet/[id]/notes  -> GET { notes }, POST item datar

export const MEETING_TYPES = [
  'INTERNAL',
  'EXTERNAL',
  'DEPARTMENT',
  'BRANCH',
  'MANAGEMENT',
  'TRAINING',
  'WEBINAR',
  'INTERVIEW',
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_TYPE_LABEL: Record<string, string> = {
  INTERNAL: 'Internal',
  EXTERNAL: 'Eksternal',
  DEPARTMENT: 'Departemen',
  BRANCH: 'Cabang',
  MANAGEMENT: 'Manajemen',
  TRAINING: 'Pelatihan',
  WEBINAR: 'Webinar',
  INTERVIEW: 'Wawancara',
};

export const MEETING_STATUSES = ['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draf',
  SCHEDULED: 'Terjadwal',
  ONGOING: 'Berlangsung',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const PARTICIPANT_STATUS_LABEL: Record<string, string> = {
  INVITED: 'Diundang',
  ACCEPTED: 'Diterima',
  DECLINED: 'Ditolak',
  TENTATIVE: 'Mungkin hadir',
  ATTENDED: 'Hadir',
  ABSENT: 'Tidak hadir',
};

export const PARTICIPANT_ROLE_LABEL: Record<string, string> = {
  HOST: 'Host',
  CO_HOST: 'Co-Host',
  PARTICIPANT: 'Peserta',
};

export const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'UTC'] as const;

export interface MeetingParticipantItem {
  id: string;
  meetingId?: string;
  userId?: string | null;
  name: string;
  email?: string | null;
  position?: string | null;
  department?: string | null;
  branch?: string | null;
  role: string;
  status: string;
  joinedAt?: string | null;
}

export interface MeetingAgendaItem {
  id: string;
  meetingId?: string;
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  order?: number;
  status?: string;
}

export interface MeetingNoteItem {
  id: string;
  meetingId?: string;
  authorId?: string;
  authorName?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MeetingItem {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string;
  meetingType: string;
  status: string;
  hostId?: string;
  hostName?: string;
  participantCount?: number;
  participants?: MeetingParticipantItem[];
  waitingRoom?: boolean;
  allowJoinBeforeHost?: boolean;
  muteOnEntry?: boolean;
  allowScreenShare?: boolean;
  allowChat?: boolean;
  allowRecording?: boolean;
  /** true bila meeting memakai password (API tidak pernah mengembalikan password/hash). */
  hasPassword?: boolean;
  passwordProtected?: boolean;
  joinUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetStats {
  today?: number;
  upcoming?: number;
  ongoing?: number;
  thisMonth?: number;
  mine?: number;
}

export interface ParticipantSearchItem {
  id: string;
  name: string;
  email?: string | null;
  position?: string | null;
  department?: string | null;
  branch?: string | null;
}

export interface GuestMeetingInfo {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string;
  meetingType?: string;
  status?: string;
  hostName?: string;
  waitingRoom?: boolean;
}

export interface SelectedParticipant {
  /** userId karyawan (bila peserta internal). */
  userId?: string;
  /** Nama tamu eksternal (bila bukan karyawan). */
  guestName?: string;
  guestEmail?: string;
  name: string;
  position?: string | null;
  department?: string | null;
  branch?: string | null;
}

export interface MeetingInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  timezone: string;
  meetingType: MeetingType;
  password?: string;
  waitingRoom: boolean;
  muteOnEntry: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowRecording: boolean;
  participants: SelectedParticipant[];
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

/** Link undangan internal (untuk pengguna WOORK yang sudah login). */
export function meetingInviteLink(id: string): string {
  if (typeof window === 'undefined') return `/meet/${id}`;
  return `${window.location.origin}/meet/${id}`;
}

/** Link tamu publik (dibuka tanpa login, memakai token). */
export function guestInviteLink(token: string): string {
  if (typeof window === 'undefined') return `/meet/guest/${token}`;
  return `${window.location.origin}/meet/guest/${token}`;
}

/** ID singkat untuk tampilan (cuid dipotong 8 karakter pertama). */
export function shortMeetingId(id: string): string {
  return id ? id.slice(0, 8).toUpperCase() : '—';
}

export function formatDurasi(startsAt: string, endsAt?: string | null): string {
  if (!startsAt || !endsAt) return '—';
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (Number.isNaN(ms) || ms <= 0) return '—';
  const menit = Math.round(ms / 60000);
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;
  return sisa === 0 ? `${jam} jam` : `${jam} jam ${sisa} mnt`;
}

function normalizeMeeting(raw: any): MeetingItem {
  const m = raw?.meeting ?? raw ?? {};
  return {
    id: String(m.id ?? ''),
    title: String(m.title ?? 'Meeting tanpa judul'),
    description: m.description ?? null,
    startsAt: String(m.startsAt ?? ''),
    endsAt: m.endsAt ?? null,
    timezone: m.timezone ?? 'Asia/Jakarta',
    meetingType: String(m.meetingType ?? 'INTERNAL'),
    status: String(m.status ?? 'SCHEDULED'),
    hostId: m.hostId,
    hostName: m.hostName ?? m.host?.name ?? undefined,
    participantCount:
      typeof m.participantCount === 'number'
        ? m.participantCount
        : Array.isArray(m.participants)
          ? m.participants.length
          : undefined,
    participants: Array.isArray(m.participants) ? m.participants.map(normalizeParticipant) : undefined,
    waitingRoom: m.waitingRoom,
    allowJoinBeforeHost: m.allowJoinBeforeHost,
    muteOnEntry: m.muteOnEntry,
    allowScreenShare: m.allowScreenShare,
    allowChat: m.allowChat,
    allowRecording: m.allowRecording,
    hasPassword: m.hasPassword,
    passwordProtected: m.passwordProtected,
    joinUrl: m.joinUrl ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function normalizeParticipant(raw: any): MeetingParticipantItem {
  const user = raw?.user ?? {};
  return {
    id: String(raw?.id ?? raw?.userId ?? ''),
    meetingId: raw?.meetingId,
    userId: raw?.userId ?? user?.id ?? null,
    name: String(raw?.name ?? raw?.guestName ?? user?.name ?? 'Peserta'),
    email: raw?.email ?? raw?.guestEmail ?? user?.email ?? null,
    position: raw?.position ?? raw?.snapshotPosition ?? user?.position ?? null,
    department: raw?.department ?? raw?.snapshotDepartment ?? user?.department ?? null,
    branch: raw?.branch ?? raw?.snapshotBranch ?? user?.branch ?? null,
    role: String(raw?.role ?? 'PARTICIPANT'),
    status: String(raw?.status ?? 'INVITED'),
    joinedAt: raw?.joinedAt ?? null,
  };
}

export interface MeetingInvitation {
  participantId: string;
  name: string;
  email?: string | null;
  isGuest: boolean;
  link: string;
}

/** Pisah peserta internal (userIds) dan tamu (guests) sesuai skema API. */
function splitParticipants(participants: SelectedParticipant[]): {
  userIds: string[];
  guests: { name: string; email?: string; phone?: string }[];
} {
  const userIds: string[] = [];
  const guests: { name: string; email?: string; phone?: string }[] = [];
  for (const p of participants) {
    if (p.userId) {
      userIds.push(p.userId);
    } else if (p.guestName?.trim()) {
      guests.push({ name: p.guestName.trim(), email: p.guestEmail || undefined });
    }
  }
  return { userIds, guests };
}

export type MeetFilter = 'today' | 'upcoming' | 'ongoing' | 'history' | 'mine' | 'all';

export async function listMeetings(
  params: { filter?: MeetFilter } = {}
): Promise<{ meetings: MeetingItem[]; stats?: MeetStats; canCreate?: boolean; canManage?: boolean }> {
  const data = await apiJson(`/api/meet${qs(params)}`);
  if (Array.isArray(data)) return { meetings: data.map(normalizeMeeting) };
  const rawList: any[] = Array.isArray(data?.meetings) ? data.meetings : [];
  return {
    meetings: rawList.map(normalizeMeeting),
    stats: data?.stats,
    canCreate: data?.canCreate,
    canManage: data?.canManage,
  };
}

export async function getMeeting(id: string): Promise<{
  meeting: MeetingItem;
  participants: MeetingParticipantItem[];
  agenda: MeetingAgendaItem[];
  notes: MeetingNoteItem[];
  canManage?: boolean;
  canEdit?: boolean;
  isHost?: boolean;
  inviteUrl?: string;
}> {
  const data = await apiJson(`/api/meet/${id}`);
  const meeting = normalizeMeeting(data?.meeting ?? data);
  const participants = Array.isArray(data?.participants)
    ? data.participants.map(normalizeParticipant)
    : (meeting.participants ?? []);
  // GET /api/meet/[id] TIDAK mengembalikan agenda/notulen — ambil dari
  // endpoint masing-masing (best-effort agar detail tetap tampil bila gagal).
  const [agenda, notes] = await Promise.all([
    listAgenda(id).catch(() => [] as MeetingAgendaItem[]),
    listNotes(id).catch(() => [] as MeetingNoteItem[]),
  ]);
  return {
    meeting,
    participants,
    agenda,
    notes,
    canManage: data?.canManage,
    canEdit: data?.canEdit,
    isHost: data?.isHost,
    inviteUrl: data?.inviteUrl,
  };
}

export async function createMeeting(input: MeetingInput): Promise<MeetingItem> {
  const { userIds, guests } = splitParticipants(input.participants);
  const payload = {
    title: input.title,
    description: input.description || undefined,
    startsAt: input.startsAt,
    endsAt: input.endsAt || undefined,
    timezone: input.timezone,
    meetingType: input.meetingType,
    password: input.password || undefined,
    waitingRoom: input.waitingRoom,
    muteOnEntry: input.muteOnEntry,
    allowScreenShare: input.allowScreenShare,
    allowChat: input.allowChat,
    allowRecording: input.allowRecording,
    userIds,
    guests,
  };
  const data = await apiJson('/api/meet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return normalizeMeeting(data?.meeting ?? data);
}

export async function updateMeeting(
  id: string,
  input: Partial<MeetingInput>
): Promise<MeetingItem> {
  const { participants: _omitParticipants, ...rest } = input;
  void _omitParticipants;
  const data = await apiJson(`/api/meet/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rest),
  });
  return normalizeMeeting(data?.meeting ?? data);
}

/** Batalkan meeting = DELETE /api/meet/[id] (PATCH tidak menerima `status`). */
export async function cancelMeeting(id: string): Promise<MeetingItem> {
  const data = await apiJson(`/api/meet/${id}`, { method: 'DELETE' });
  return normalizeMeeting(data?.meeting ?? data);
}

export async function deleteMeeting(id: string): Promise<void> {
  await apiJson(`/api/meet/${id}`, { method: 'DELETE' });
}

export async function joinMeeting(
  id: string,
  input: { password?: string; guestToken?: string; guestName?: string } = {}
): Promise<{
  waiting?: boolean;
  meetingId?: string;
  meeting?: MeetingItem;
  /** ID peserta (dipakai tamu sebagai peerId `guest:<participantId>` di room). */
  participantId?: string | null;
  /** ID sesi kehadiran aktif (dipakai leave agar menutup sesi yang tepat). */
  sessionId?: string | null;
  guestName?: string | null;
  isGuest?: boolean;
}> {
  const data = await apiJson(`/api/meet/${id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return {
    waiting: data?.waiting ?? false,
    meetingId: data?.meetingId ?? data?.meeting?.id ?? id,
    meeting: data?.meeting ? normalizeMeeting(data.meeting) : undefined,
    participantId: data?.participantId ?? null,
    sessionId: data?.sessionId ?? null,
    guestName: data?.guestName ?? null,
    isGuest: data?.isGuest ?? false,
  };
}

/**
 * Keluar dari meeting (tutup sesi + durasi). Tamu WAJIB menyertakan
 * `guestToken` (tanpa login, API leave menolak tanpa token/sesi); bila ada,
 * sertakan `sessionId` dari join agar sesi yang ditutup tepat.
 * Host/pengelola dapat mengakhiri untuk semua dengan `endMeeting: true`.
 */
export async function leaveMeeting(
  id: string,
  opts: { guestToken?: string; sessionId?: string; endMeeting?: boolean } = {}
): Promise<{ left?: boolean; sessionId?: string | null; ended?: boolean; status?: string }> {
  const data = await apiJson(`/api/meet/${id}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestToken: opts.guestToken || undefined,
      sessionId: opts.sessionId || undefined,
      endMeeting: opts.endMeeting ?? false,
    }),
  });
  return {
    left: data?.left ?? false,
    sessionId: data?.sessionId ?? null,
    ended: data?.ended ?? false,
    status: data?.status,
  };
}

/** Ubah peran peserta (host saja; role HOST tidak dapat diberikan — lihat API). */
export async function updateParticipantRole(
  id: string,
  participantId: string,
  role: 'CO_HOST' | 'PARTICIPANT'
): Promise<MeetingParticipantItem> {
  const data = await apiJson(`/api/meet/${id}/participants`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId, role }),
  });
  return normalizeParticipant(data);
}

/** Hapus peserta dari meeting (host/MEET_MANAGE; token tamu ikut dicabut). */
export async function removeParticipant(id: string, participantId: string): Promise<void> {
  await apiJson(`/api/meet/${id}/participants`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId }),
  });
}

export interface MeetingChatMessageItem {
  id: string;
  meetingId?: string;
  senderId?: string | null;
  senderName: string;
  body: string;
  isPrivate?: boolean;
  recipientId?: string | null;
  createdAt: string;
}

function normalizeChatMessage(raw: any): MeetingChatMessageItem {
  return {
    id: String(raw?.id ?? ''),
    meetingId: raw?.meetingId,
    senderId: raw?.senderId ?? null,
    senderName: String(raw?.senderName ?? 'Peserta'),
    body: String(raw?.body ?? ''),
    isPrivate: !!raw?.isPrivate,
    recipientId: raw?.recipientId ?? null,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
  };
}

/** Riwayat chat meeting (GET /api/meet/[id]/chat). Tamu memakai guestToken. */
export async function listChatMessages(
  id: string,
  opts: { guestToken?: string } = {}
): Promise<MeetingChatMessageItem[]> {
  const qs = opts.guestToken ? `?guestToken=${encodeURIComponent(opts.guestToken)}` : '';
  const data = await apiJson(`/api/meet/${id}/chat${qs}`);
  const list: any[] = Array.isArray(data) ? data : (data?.messages ?? []);
  return list.map(normalizeChatMessage);
}

/**
 * Kirim pesan chat (POST /api/meet/[id]/chat — persistensi).
 * Real-time broadcast lewat signal { type: 'chat' } dilakukan pemanggil
 * setelah pesan tersimpan (kontrak signaling Fase 3).
 */
export async function sendChatMessage(
  id: string,
  body: string,
  opts: { guestToken?: string; senderName?: string } = {}
): Promise<MeetingChatMessageItem> {
  const data = await apiJson(`/api/meet/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, guestToken: opts.guestToken, senderName: opts.senderName }),
  });
  return normalizeChatMessage(data?.message ?? data);
}

export async function addParticipants(
  id: string,
  participants: SelectedParticipant[]
): Promise<MeetingParticipantItem[]> {
  const { userIds, guests } = splitParticipants(participants);
  const data = await apiJson(`/api/meet/${id}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds, guests }),
  });
  const list: any[] = Array.isArray(data) ? data : (data?.participants ?? []);
  return list.map(normalizeParticipant);
}

/** Kirim ulang undangan ke peserta terpilih (wajib participantIds, min 1). */
export async function inviteMeeting(
  id: string,
  participantIds: string[]
): Promise<{ invitations: MeetingInvitation[]; sent: number }> {
  const data = await apiJson(`/api/meet/${id}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIds }),
  });
  return {
    invitations: Array.isArray(data?.invitations) ? data.invitations : [],
    sent: data?.sent ?? 0,
  };
}

export async function searchParticipants(q: string): Promise<ParticipantSearchItem[]> {
  if (!q.trim()) return [];
  const data = await apiJson(`/api/meet/search-participants${qs({ q: q.trim() })}`);
  const list: any[] = Array.isArray(data) ? data : (data?.participants ?? data?.users ?? []);
  return list.map((r) => ({
    id: String(r?.id ?? r?.userId ?? ''),
    name: String(r?.name ?? 'Tanpa nama'),
    email: r?.email ?? null,
    position: r?.position ?? r?.jobTitle ?? r?.snapshotPosition ?? null,
    department: r?.department ?? r?.departmentName ?? r?.snapshotDepartment ?? null,
    branch: r?.branch ?? r?.snapshotBranch ?? null,
  }));
}

/** Lookup token tamu publik — ikut mengembalikan nama tamu tersimpan (bila ada). */
export async function getGuestMeeting(
  token: string
): Promise<GuestMeetingInfo & { guestName?: string | null }> {
  const data = await apiJson(`/api/meet/guest/${encodeURIComponent(token)}`);
  const m = data?.meeting ?? data ?? {};
  return {
    id: String(m.id ?? ''),
    title: String(m.title ?? 'Meeting'),
    description: m.description ?? null,
    startsAt: String(m.startsAt ?? ''),
    endsAt: m.endsAt ?? null,
    timezone: m.timezone ?? 'Asia/Jakarta',
    meetingType: m.meetingType,
    status: m.status,
    hostName: m.hostName ?? m.host?.name ?? undefined,
    waitingRoom: m.waitingRoom,
    guestName: data?.guestName ?? null,
  };
}

/**
 * Konfigurasi ICE server meeting (STUN + TURN bila dikonfigurasi admin)
 * dari GET /api/meet/[id]/ice. Gagal fetch -> lempar (pemanggil memakai
 * fallback STUN saja, bukan menggagalkan join).
 */
export async function getIceServers(
  id: string,
  opts: { guestToken?: string } = {}
): Promise<{ iceServers: RTCIceServer[]; turnConfigured: boolean }> {
  const data = await apiJson(
    `/api/meet/${id}/ice${qs({ guestToken: opts.guestToken })}`
  );
  const servers = Array.isArray(data?.iceServers) ? data.iceServers : [];
  return {
    iceServers: servers.filter(
      (s: unknown) => s && typeof s === 'object' && (s as { urls?: unknown }).urls
    ) as RTCIceServer[],
    turnConfigured: data?.turnConfigured === true,
  };
}

export async function listAgenda(id: string): Promise<MeetingAgendaItem[]> {
  const data = await apiJson(`/api/meet/${id}/agenda`);
  const list: any[] = Array.isArray(data) ? data : (data?.agenda ?? data?.items ?? []);
  return list;
}

export async function addAgenda(
  id: string,
  input: { title: string; description?: string; durationMinutes?: number }
): Promise<MeetingAgendaItem> {
  const data = await apiJson(`/api/meet/${id}/agenda`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data?.agenda ?? data;
}

export async function listNotes(id: string): Promise<MeetingNoteItem[]> {
  const data = await apiJson(`/api/meet/${id}/notes`);
  const list: any[] = Array.isArray(data) ? data : (data?.notes ?? data?.items ?? []);
  return list;
}

export async function addNote(id: string, content: string): Promise<MeetingNoteItem> {
  const data = await apiJson(`/api/meet/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return data?.note ?? data;
}
