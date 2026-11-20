// Registry signaling in-memory untuk WOORK MEET (Fase 3).
//
// Transport: client -> server lewat POST /api/meet/[id]/signal, server ->
// client lewat SSE di GET /api/meet/[id]/events. TIDAK ADA layanan media
// eksternal — media WebRTC mengalir peer-to-peer,
// server ini hanya meneruskan sinyal (offer/answer/ICE) + presence.
//
// CATATAN PENTING — STATE HILANG BILA PROSES RESTART:
// Registry ini hanya hidup di memori satu proses `next start`. Bila VM
// reset / proses restart, semua room kosong: client harus rejoin (POST
// `hello` lagi atau membuka ulang SSE — keduanya memanggil `joinRoom`
// dan membangun ulang presence). Kehadiran persisten (siapa diundang,
// siapa pernah join) tetap ada di DB (`MeetingParticipant` /
// `MeetingSession`); yang hilang hanya presence real-time sesaat.
// Perilaku ini disengaja untuk Fase 3 (single-proses, tanpa Redis).

import { auth } from '@/lib/auth';
import { requireAuth, getUserPermissions, type AuthContext } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import {
  canManageMeeting,
  findMyParticipant,
  participantDisplayName,
  userCanManageMeet,
  verifyGuestToken,
  type MeetingRow,
} from '@/lib/meet/server';

// ---------------------------------------------------------------------------
// Tipe
// ---------------------------------------------------------------------------

export type PeerStatus = 'active' | 'waiting';

export interface PeerEntry {
  peerId: string;
  displayName: string;
  role: 'HOST' | 'CO_HOST' | 'PARTICIPANT';
  isHost: boolean;
  isGuest: boolean;
  status: PeerStatus;
  joinedAt: number;
  lastSeen: number;
  /** Peserta internal (userId) atau tamu (participantId). */
  participantId: string | null;
  userId: string | null;
  /** Sink SSE yang sedang terpasang; null bila peer hanya via POST signal. */
  enqueue: ((chunk: string) => void) | null;
}

/** Bentuk peer yang dikirim ke client (tanpa enqueue / field internal). */
export interface PeerPublic {
  peerId: string;
  displayName: string;
  role: 'HOST' | 'CO_HOST' | 'PARTICIPANT';
  isHost: boolean;
  isGuest: boolean;
  status: PeerStatus;
  joinedAt: string;
}

export interface RoomState {
  meetingId: string;
  peers: PeerPublic[];
  waiting: PeerPublic[];
  generatedAt: string;
}

/** Peer basi: tanpa heartbeat/sinyal selama ini dianggap pergi. */
export const PEER_STALE_AFTER_MS = 75_000;
/** Interval sapu peer basi. */
const SWEEP_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Registry: meetingId -> Map<peerId, PeerEntry>
// ---------------------------------------------------------------------------

const rooms = new Map<string, Map<string, PeerEntry>>();

function getRoom(meetingId: string): Map<string, PeerEntry> {
  let room = rooms.get(meetingId);
  if (!room) {
    room = new Map<string, PeerEntry>();
    rooms.set(meetingId, room);
  }
  return room;
}

export function publicPeer(p: PeerEntry): PeerPublic {
  return {
    peerId: p.peerId,
    displayName: p.displayName,
    role: p.role,
    isHost: p.isHost,
    isGuest: p.isGuest,
    status: p.status,
    joinedAt: new Date(p.joinedAt).toISOString(),
  };
}

/** Daftar peer aktif + waiting sebuah meeting (untuk event `room-state`). */
export function getRoomState(meetingId: string): RoomState {
  const room = rooms.get(meetingId);
  const peers: PeerPublic[] = [];
  const waiting: PeerPublic[] = [];
  if (room) {
    for (const p of room.values()) {
      if (p.status === 'waiting') waiting.push(publicPeer(p));
      else peers.push(publicPeer(p));
    }
  }
  return { meetingId, peers, waiting, generatedAt: new Date().toISOString() };
}

export function getPeer(meetingId: string, peerId: string): PeerEntry | undefined {
  return rooms.get(meetingId)?.get(peerId);
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export interface PublishOptions {
  /** Kirim hanya ke peer ini (string) atau daftar peer ini. */
  to?: string | string[];
  /** Jangan kirim ke peer ini (mis. pengirim sendiri). */
  except?: string | string[];
  /**
   * Sertakan peer `waiting` sebagai penerima. Default false: peer waiting
   * tidak menerima sinyal media/chat/presence — kecuali event `room-state`
   * dan `room-control` yang ditujukan langsung ke mereka.
   */
  includeWaiting?: boolean;
}

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Teruskan satu event SSE ke peer(-peer) di sebuah room.
 * `event` = nama event SSE (`room-state`, `peer-joined`, `signal`, ...),
 * `data` = payload JSON. Bila `to` diisi, hanya peer itu yang menerima
 * (dipakai untuk `signal` offer/answer/ICE dan `room-control` terarah);
 * bila tidak, broadcast ke semua peer aktif room (kecuali `except`).
 * Peer yang enqueue-nya gagal dianggap putus dan dihapus dari registry
 * (tanpa broadcast — sapu berkala / detach yang mengurus `peer-left`).
 */
export function publish(
  meetingId: string,
  event: string,
  data: unknown,
  opts: PublishOptions = {}
): void {
  const room = rooms.get(meetingId);
  if (!room || room.size === 0) return;
  const targets = opts.to ? (Array.isArray(opts.to) ? opts.to : [opts.to]) : [...room.keys()];
  const except = new Set(
    opts.except ? (Array.isArray(opts.except) ? opts.except : [opts.except]) : []
  );
  const chunk = sseChunk(event, data);
  for (const peerId of targets) {
    if (except.has(peerId)) continue;
    const peer = room.get(peerId);
    if (!peer || !peer.enqueue) continue;
    // Peer waiting hanya menerima room-state dan room-control yang
    // ditujukan langsung ke mereka (mis. `admitted` / `removed`).
    if (peer.status === 'waiting' && !opts.includeWaiting && !opts.to) continue;
    try {
      peer.enqueue(chunk);
    } catch {
      peer.enqueue = null;
    }
  }
}

/** Broadcast room-state terbaru ke semua peer room (aktif + waiting). */
export function publishRoomState(meetingId: string): void {
  publish(meetingId, 'room-state', getRoomState(meetingId), { includeWaiting: true });
}

// ---------------------------------------------------------------------------
// Join / leave / heartbeat
// ---------------------------------------------------------------------------

export interface JoinPeerInput {
  peerId: string;
  displayName: string;
  role: 'HOST' | 'CO_HOST' | 'PARTICIPANT';
  isHost: boolean;
  isGuest: boolean;
  participantId: string | null;
  userId: string | null;
  /** Bila true (waiting room aktif dan bukan host/co-host), peer menunggu. */
  waiting: boolean;
}

/**
 * Daftarkan (atau segarkan) peer di room. Idempotent: `hello` ulang hanya
 * memperbarui lastSeen/nama. Peer BARU yang aktif memicu broadcast
 * `peer-joined` ke peer aktif lain; peer waiting TIDAK memicu `peer-joined`
 * (host melihatnya lewat daftar `waiting` di `room-state`).
 */
export function joinRoom(
  meetingId: string,
  input: JoinPeerInput
): { peer: PeerEntry; isNew: boolean } {
  const room = getRoom(meetingId);
  const now = Date.now();
  const existing = room.get(input.peerId);
  if (existing) {
    existing.displayName = input.displayName;
    existing.role = input.role;
    existing.isHost = input.isHost;
    existing.status = input.waiting ? 'waiting' : 'active';
    existing.lastSeen = now;
    return { peer: existing, isNew: false };
  }
  const peer: PeerEntry = {
    peerId: input.peerId,
    displayName: input.displayName,
    role: input.role,
    isHost: input.isHost,
    isGuest: input.isGuest,
    status: input.waiting ? 'waiting' : 'active',
    joinedAt: now,
    lastSeen: now,
    participantId: input.participantId,
    userId: input.userId,
    enqueue: null,
  };
  room.set(input.peerId, peer);
  if (peer.status === 'active') {
    publish(meetingId, 'peer-joined', { peer: publicPeer(peer) }, { except: peer.peerId });
  }
  return { peer, isNew: true };
}

/**
 * Keluarkan peer dari room + broadcast `peer-left` ke peer aktif lain.
 * Mengembalikan peer yang dihapus (null bila tidak ada).
 */
export function leaveRoom(meetingId: string, peerId: string): PeerEntry | null {
  const room = rooms.get(meetingId);
  const peer = room?.get(peerId);
  if (!room || !peer) return null;
  room.delete(peerId);
  if (room.size === 0) rooms.delete(meetingId);
  if (peer.status === 'active') {
    publish(meetingId, 'peer-left', { peerId, displayName: peer.displayName });
  } else {
    // Peer waiting pergi: host perlu tahu — kirim room-state terbaru.
    publishRoomState(meetingId);
  }
  return peer;
}

/**
 * Hapus SELURUH room tanpa broadcast `peer-left` per peer (dipakai saat
 * host mengakhiri meeting — client sudah menerima event `ended`).
 */
export function removeRoom(meetingId: string): PeerEntry[] {
  const room = rooms.get(meetingId);
  const peers = room ? [...room.values()] : [];
  rooms.delete(meetingId);
  return peers;
}

/** Perbarui lastSeen peer (heartbeat / sinyal apa pun). False bila peer tak ada. */
export function heartbeatPeer(meetingId: string, peerId: string): boolean {
  const peer = rooms.get(meetingId)?.get(peerId);
  if (!peer) return false;
  peer.lastSeen = Date.now();
  return true;
}

// ---------------------------------------------------------------------------
// SSE attach / detach
// ---------------------------------------------------------------------------

/**
 * Pasang sink SSE ke peer yang sudah join (atau ke peer yang baru dibuat
 * oleh route events — lihat catatan di route). Mengembalikan fungsi
 * unsubscribe: sink dilepas, lastSeen disentuh (peer diberi masa tenggang
 * ~75 detik untuk reconnect sebelum sapu menganggapnya pergi — EventSource
 * reconnect otomatis tidak memicu `peer-left` palsu).
 */
export function attachPeer(
  meetingId: string,
  peerId: string,
  enqueue: (chunk: string) => void
): () => void {
  const peer = rooms.get(meetingId)?.get(peerId);
  if (!peer) return () => {};
  peer.enqueue = enqueue;
  peer.lastSeen = Date.now();
  return () => {
    if (peer.enqueue === enqueue) peer.enqueue = null;
    peer.lastSeen = Date.now();
  };
}

// ---------------------------------------------------------------------------
// Sapu peer basi (~75 detik tanpa heartbeat/sinyal -> `peer-left`)
// ---------------------------------------------------------------------------

function sweepStalePeers(): void {
  const now = Date.now();
  for (const [meetingId, room] of rooms) {
    for (const peer of [...room.values()]) {
      if (now - peer.lastSeen > PEER_STALE_AFTER_MS) {
        leaveRoom(meetingId, peer.peerId);
      }
    }
  }
}

// Satu interval per proses (guard global agar HMR / reload modul tidak
// menggandakan timer). `unref` supaya tidak menahan proses tetap hidup.
const SWEEP_KEY = '__woorkMeetSignalingSweeper';
if (!(globalThis as Record<string, unknown>)[SWEEP_KEY]) {
  const timer = setInterval(sweepStalePeers, SWEEP_INTERVAL_MS);
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref(): void }).unref();
  }
  (globalThis as Record<string, unknown>)[SWEEP_KEY] = timer;
}

// ---------------------------------------------------------------------------
// Identitas + otorisasi pemanggil (dipakai route signal & events)
// ---------------------------------------------------------------------------

export interface SignalIdentity {
  peerId: string;
  displayName: string;
  role: 'HOST' | 'CO_HOST' | 'PARTICIPANT';
  isHost: boolean;
  isGuest: boolean;
  /** Host atau pemegang MEET_MANAGE (boleh mute-request/remove/admit/end). */
  canManage: boolean;
  participantId: string | null;
  userId: string | null;
  /** Context sesi login; null untuk tamu. */
  ctx: AuthContext | null;
}

/**
 * Resolusi identitas pemanggil signaling — sesi NextAuth ATAU guestToken.
 * Pola guard sama seperti join/chat Fase 2:
 * - Tamu: `verifyGuestToken` (token ada, tidak kedaluwarsa/TTL 7 hari,
 *   tidak dicabut, milik meeting ini); gagal -> 404 generik / 410.
 * - Login: sesi + `requireAuth({ organizationId })`; harus host/peserta
 *   atau MEET_MANAGE; bila bukan -> 403.
 * Melempar Response apiErr (401/403/404/410) seperti route Fase 2.
 */
export async function resolveSignalIdentity(
  meeting: MeetingRow,
  guestToken: string | null | undefined
): Promise<SignalIdentity> {
  if (meeting.status === 'CANCELLED') {
    throw apiErr('Meeting ini telah dibatalkan.', 410);
  }
  if (meeting.status === 'COMPLETED') {
    throw apiErr('Meeting ini sudah selesai.', 410);
  }

  if (guestToken) {
    const verified = await verifyGuestToken(guestToken, meeting.id);
    const p = verified.participant;
    const role =
      p.role === 'HOST' || p.role === 'CO_HOST' ? (p.role as 'HOST' | 'CO_HOST') : 'PARTICIPANT';
    return {
      peerId: `guest:${p.id}`,
      displayName: participantDisplayName(p),
      role,
      isHost: false,
      isGuest: true,
      canManage: false,
      participantId: p.id,
      userId: null,
      ctx: null,
    };
  }

  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId) {
    throw apiErr('Belum login. Silakan masuk kembali.', 401);
  }
  const ctx = await requireAuth({ organizationId: meeting.organizationId });
  const canManagePerm = await userCanManageMeet(ctx);
  const mine = findMyParticipant(meeting, ctx.userId);
  const isHost = meeting.hostId === ctx.userId;
  if (!mine && !isHost && !canManagePerm) {
    throw apiErr('Anda tidak diundang ke meeting ini.', 403);
  }
  const role: 'HOST' | 'CO_HOST' | 'PARTICIPANT' =
    isHost || mine?.role === 'HOST'
      ? 'HOST'
      : mine?.role === 'CO_HOST'
        ? 'CO_HOST'
        : 'PARTICIPANT';
  return {
    peerId: ctx.userId,
    displayName: ctx.name,
    role,
    isHost,
    isGuest: false,
    canManage: canManageMeeting(meeting, ctx, canManagePerm),
    participantId: mine?.id ?? null,
    userId: ctx.userId,
    ctx,
  };
}

/** Apakah peer ini harus menunggu di waiting room? (host/co-host bebas.) */
export function isWaitingPeer(meeting: MeetingRow, identity: SignalIdentity): boolean {
  return !!meeting.waitingRoom && !identity.isHost && identity.role !== 'CO_HOST';
}

/** Daftar permission MEET milik user (dipakai route untuk cek MEET_MANAGE). */
export async function getSignalPermissions(ctx: AuthContext): Promise<Set<string>> {
  return getUserPermissions(ctx);
}
