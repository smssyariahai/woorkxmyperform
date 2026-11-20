// Komponen utama ruang meeting WOORK MEET (Fase 3) — UI gelap ala Zoom +
// WebRTC mesh buatan sendiri (lihat components/meet/rtc/useMeshRoom.ts).
//
// Bisa dipakai ulang oleh room tamu: identitas (termasuk guestToken)
// diterima lewat props, bukan dibaca dari sesi di sini. Signaling mengikuti
// kontrak Fase 3: POST /api/meet/[id]/signal + SSE /api/meet/[id]/events.
// Chat tetap dipersistensikan lewat POST /api/meet/[id]/chat yang sudah ada,
// lalu di-broadcast lewat signal { type: 'chat' }.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Copy,
  Hand,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RefreshCw,
  Settings,
  Smile,
  User,
  Users,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MEETING_STATUS_LABEL,
  PARTICIPANT_ROLE_LABEL,
  formatDurasi,
  getIceServers,
  getMeeting,
  joinMeeting,
  leaveMeeting,
  listChatMessages,
  removeParticipant,
  sendChatMessage,
  shortMeetingId,
  updateParticipantRole,
  type MeetingChatMessageItem,
  type MeetingItem,
  type MeetingParticipantItem,
} from '@/components/meet/client';
import { MEET_STUN_SERVERS, useMeshRoom } from './rtc/useMeshRoom';

export interface MeetIdentity {
  kind: 'user' | 'guest';
  /** User login → userId; tamu → 'guest:' + participantId. */
  peerId: string;
  displayName: string;
  guestToken?: string;
  isHost: boolean;
}

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '🙏'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function connColor(state: string): string {
  if (state === 'connected') return 'bg-emerald-400';
  if (state === 'failed' || state === 'disconnected') return 'bg-red-400';
  return 'bg-amber-400';
}

function connLabel(state: string): string {
  if (state === 'connected') return 'Terhubung';
  if (state === 'connecting' || state === 'checking') return 'Menghubungkan…';
  if (state === 'failed') return 'Gagal terhubung';
  if (state === 'disconnected') return 'Terputus';
  return state;
}

function mediaStateLabel(state: string): string {
  if (state === 'ready') return 'siap';
  if (state === 'starting') return 'memulai';
  if (state === 'audio-only') return 'audio saja';
  if (state === 'failed') return 'gagal';
  if (state === 'off') return 'tanpa media';
  return 'belum dimulai';
}

function VideoTile(props: {
  name: string;
  stream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
  isLocal?: boolean;
  isHost?: boolean;
  isCoHost?: boolean;
  handRaised?: boolean;
  connectionState?: string;
  rttMs?: number | null;
  failed?: boolean;
  reaction?: { emoji: string; at: number } | null;
  screenLabel?: string;
  compact?: boolean;
  /** Bila ada (tile lawan yang gagal), tombol hubungkan ulang. */
  onReconnect?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = !!props.stream && props.camOn && (props.stream.getVideoTracks().length > 0);
  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.srcObject = showVideo ? props.stream : null;
      if (showVideo) void el.play().catch(() => {});
    }
  }, [showVideo, props.stream]);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-slate-900 aspect-video ${
        props.speaking ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-slate-800'
      }`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!!props.isLocal}
          className={`h-full w-full object-cover ${props.isLocal ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-600 text-lg font-bold text-white">
            {initials(props.name)}
          </span>
          {!props.camOn && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <VideoOff size={12} /> Kamera mati
            </span>
          )}
        </div>
      )}
      {props.failed && (
        <div className="absolute inset-x-0 top-0 bg-red-600/90 px-2 py-1 text-center text-[11px] font-medium leading-snug text-white">
          Tidak bisa terhubung langsung ke {props.name} — jaringan memblokir koneksi langsung (NAT/firewall).
          Video butuh relay TURN; hubungi admin.
          {props.onReconnect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onReconnect?.();
              }}
              className="mx-auto mt-1 flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-white/30"
            >
              <RefreshCw size={11} /> Hubungkan ulang
            </button>
          )}
        </div>
      )}
      {props.reaction && (
        <span className="absolute right-2 top-2 rounded-full bg-slate-950/70 px-2 py-1 text-xl">
          {props.reaction.emoji}
        </span>
      )}
      {props.handRaised && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-[11px] font-medium text-white">
          <Hand size={12} /> Angkat tangan
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950/90 to-transparent px-2 pb-1.5 pt-4">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-white">
          <span className="truncate">
            {props.name}
            {props.isLocal ? ' (Anda)' : ''}
            {props.screenLabel ? ` • ${props.screenLabel}` : ''}
          </span>
          {props.isHost && <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">HOST</span>}
          {props.isCoHost && <span className="shrink-0 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">CO-HOST</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {props.connectionState && !props.isLocal && (
            <span title={`${connLabel(props.connectionState)}${props.rttMs ? ` • RTT ${props.rttMs} ms` : ''}`} className="flex items-center gap-1 text-[10px] text-slate-300">
              <span className={`h-2 w-2 rounded-full ${connColor(props.connectionState)}`} />
              {props.rttMs ? `${props.rttMs} ms` : ''}
            </span>
          )}
          {props.micOn ? <Mic size={13} className="text-slate-200" /> : <MicOff size={13} className="text-red-400" />}
        </span>
      </div>
    </div>
  );
}

interface LivePeerRow {
  key: string;
  peerId: string;
  participantId?: string;
  name: string;
  role: string;
  live: boolean;
  waiting: boolean;
  isSelf: boolean;
  micOn?: boolean;
  camOn?: boolean;
  /** Diisi dari state mesh untuk baris peserta live (dipakai panel peserta + diagnostik). */
  connectionState?: string;
  rttMs?: number | null;
  relayCandidates?: number;
  failed?: boolean;
}

export default function MeetingRoom({
  meetingId,
  identity,
  initialMeeting,
}: {
  meetingId: string;
  identity: MeetIdentity;
  /** Bila diberikan (mis. room tamu yang datanya dari /api/meet/guest/[token]), dipakai tanpa fetch getMeeting. */
  initialMeeting?: MeetingItem | null;
}) {
  const router = useRouter();
  const id = meetingId;
  const myPeerId = identity.peerId;

  const [meeting, setMeeting] = useState<MeetingItem | null>(initialMeeting ?? null);
  const [participants, setParticipants] = useState<MeetingParticipantItem[]>(initialMeeting?.participants ?? []);
  const [loading, setLoading] = useState(!initialMeeting);
  const [loadError, setLoadError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [waitingPeers, setWaitingPeers] = useState<Array<{ peerId: string; displayName: string }>>([]);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [ended, setEnded] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [chatMessages, setChatMessages] = useState<MeetingChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'speaker'>('grid');
  const [handRaised, setHandRaised] = useState(false);
  const [myReaction, setMyReaction] = useState<{ emoji: string; at: number } | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  /** ICE server dari GET /api/meet/[id]/ice (STUN + TURN bila dikonfigurasi). */
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(MEET_STUN_SERVERS);
  const [turnConfigured, setTurnConfigured] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const joinedAtRef = useRef<number | null>(null);
  const initRef = useRef(false);
  const mediaStartedRef = useRef(false);
  const leavingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  const sendSignal = useCallback(
    async (type: string, to?: string, data?: unknown) => {
      try {
        await fetch(`/api/meet/${id}/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, to, data, guestToken: identity.guestToken ?? undefined }),
        });
      } catch {
        // Signal gagal terkirim — SSE/room-state berikutnya akan menyinkronkan ulang.
      }
    },
    [id, identity.guestToken]
  );

  const mesh = useMeshRoom({
    myPeerId,
    displayName: identity.displayName,
    sendSignal: (type, to, data) => {
      void sendSignal(type, to, data);
    },
    iceServers,
  });
  const meshRef = useRef(mesh);
  meshRef.current = mesh;
  const peersList = useMemo(() => Object.values(mesh.peers), [mesh.peers]);

  const appendChat = useCallback((msg: MeetingChatMessageItem) => {
    setChatMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg].slice(-200);
    });
    if (!chatOpenRef.current && msg.senderId !== myPeerId) {
      setUnreadChat((n) => n + 1);
    }
  }, [myPeerId]);

  // --- Keluar / akhiri ---
  const doLeave = useCallback(
    async (endAll: boolean) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      setLeaving(true);
      try {
        await sendSignal(endAll ? 'end' : 'bye');
      } catch {
        /* abaikan */
      }
      try {
        await leaveMeeting(id, {
          endMeeting: endAll,
          guestToken: identity.guestToken,
          sessionId: sessionIdRef.current ?? undefined,
        });
      } catch {
        // Keluar room tetap dilanjutkan walau pencatatan leave gagal.
      }
      if (endAll) toast.success('Meeting diakhiri untuk semua peserta.');
      // INTEGRASI Fase 3: tamu tidak punya akses /meet (butuh login) —
      // kembalikan ke halaman undangan, bukan ke /login.
      if (identity.kind === 'guest' && identity.guestToken) {
        router.push(`/meet/guest/${identity.guestToken}`);
      } else {
        router.push('/meet');
      }
    },
    [id, router, sendSignal, identity.guestToken, identity.kind]
  );
  const doLeaveRef = useRef(doLeave);
  doLeaveRef.current = doLeave;

  // --- Penanganan event SSE ---
  const handleSseEvent = useCallback(
    (name: string, payload: Record<string, unknown>) => {
      const m = meshRef.current;
      const from = String(payload.from ?? payload.peerId ?? '');
      switch (name) {
        case 'room-state': {
          const list = (payload.peers ?? payload.participants ?? []) as Array<Record<string, unknown>>;
          const seen = new Set<string>();
          for (const p of Array.isArray(list) ? list : []) {
            const peerId = String(p.peerId ?? p.id ?? '');
            if (!peerId || peerId === myPeerId) continue;
            seen.add(peerId);
            m.addPeer(peerId, String(p.displayName ?? p.name ?? peerId), typeof p.role === 'string' ? p.role : undefined);
            m.setPeerMediaState(peerId, {
              micOn: p.micOn !== false,
              camOn: p.camOn !== false,
            });
          }
          // Peer yang hilang dari room-state sudah keluar.
          for (const peerId of Object.keys(meshRef.current.peers)) {
            if (!seen.has(peerId)) m.removePeer(peerId);
          }
          const waitingList = (payload.waiting ?? []) as Array<Record<string, unknown>>;
          setWaitingPeers(
            (Array.isArray(waitingList) ? waitingList : []).map((w) => ({
              peerId: String(w.peerId ?? w.id ?? ''),
              displayName: String(w.displayName ?? w.name ?? 'Peserta'),
            })).filter((w) => w.peerId && w.peerId !== myPeerId)
          );
          setSseStatus('connected');
          break;
        }
        case 'peer-joined': {
          if (from && from !== myPeerId) {
            m.addPeer(from, String(payload.displayName ?? payload.name ?? from), typeof payload.role === 'string' ? payload.role : undefined);
          }
          break;
        }
        case 'peer-left': {
          if (from) m.removePeer(from);
          setWaitingPeers((prev) => prev.filter((w) => w.peerId !== from));
          break;
        }
        case 'signal': {
          const type = String(payload.type ?? '');
          if (type === 'offer' || type === 'answer' || type === 'ice') {
            void m.handleSignal(from, type, payload.data, typeof payload.displayName === 'string' ? payload.displayName : undefined);
          } else if (type === 'chat') {
            const msg = payload.data as MeetingChatMessageItem | undefined;
            if (msg && typeof msg === 'object' && msg.body) appendChat(msg);
          } else if (type === 'raise-hand') {
            const d = payload.data as { raised?: boolean } | undefined;
            if (from) m.setPeerHandRaised(from, d?.raised !== false);
          } else if (type === 'lower-hand') {
            if (from) m.setPeerHandRaised(from, false);
          } else if (type === 'reaction') {
            const d = payload.data as { emoji?: string } | undefined;
            if (from && d?.emoji) m.setPeerReaction(from, d.emoji);
          } else if (type === 'mute-state') {
            const d = payload.data as { micOn?: boolean; camOn?: boolean } | undefined;
            if (from && d) m.setPeerMediaState(from, d);
          }
          break;
        }
        case 'chat': {
          const raw = (payload.message ?? payload) as Record<string, unknown>;
          if (raw && typeof raw.body === 'string') {
            appendChat({
              id: String(raw.id ?? `${Date.now()}-${Math.random()}`),
              senderId: typeof raw.senderId === 'string' ? raw.senderId : null,
              senderName: String(raw.senderName ?? 'Peserta'),
              body: raw.body,
              createdAt: String(raw.createdAt ?? new Date().toISOString()),
            });
          }
          break;
        }
        case 'raise-hand':
          // Server melipat lower-hand ke event raise-hand { raised: false }.
          if (from) m.setPeerHandRaised(from, payload.raised !== false);
          break;
        case 'lower-hand':
          if (from) m.setPeerHandRaised(from, false);
          break;
        case 'reaction': {
          const emoji = String(payload.emoji ?? (payload.data as { emoji?: string } | undefined)?.emoji ?? '');
          if (from && emoji) m.setPeerReaction(from, emoji);
          break;
        }
        case 'mute-state': {
          // Server mengirim event mute-state sendiri ({ micOn?, camOn?, muted? }).
          if (from) {
            const micOn =
              typeof payload.micOn === 'boolean'
                ? payload.micOn
                : typeof payload.muted === 'boolean'
                  ? !payload.muted
                  : undefined;
            const camOn = typeof payload.camOn === 'boolean' ? payload.camOn : undefined;
            if (micOn !== undefined || camOn !== undefined) {
              m.setPeerMediaState(from, {
                ...(micOn !== undefined ? { micOn } : {}),
                ...(camOn !== undefined ? { camOn } : {}),
              });
            }
          }
          break;
        }
        case 'room-control': {
          const kind = String(payload.kind ?? '');
          const to = String(payload.to ?? payload.peerId ?? '');
          const isMine = !to || to === myPeerId;
          if (kind === 'mute-request' && isMine) {
            if (meshRef.current.micOn) {
              const newMic = meshRef.current.toggleMic();
              void sendSignal('mute-state', undefined, { micOn: newMic, camOn: meshRef.current.camOn });
            }
            toast.info('Host meminta Anda mematikan mikrofon.');
          } else if (kind === 'removed' && isMine) {
            setRemoved(true);
          } else if (kind === 'admitted' && isMine) {
            setWaiting(false);
            setWaitingPeers((prev) => prev.filter((w) => w.peerId !== myPeerId));
            toast.success('Host mengizinkan Anda masuk.');
          } else if (kind === 'ended') {
            setEnded(true);
          }
          break;
        }
        case 'ended':
          setEnded(true);
          break;
        default:
          break;
      }
    },
    [appendChat, myPeerId, sendSignal]
  );
  const handleSseEventRef = useRef(handleSseEvent);
  handleSseEventRef.current = handleSseEvent;

  const connectSse = useCallback(() => {
    if (esRef.current) return;
    const url =
      `/api/meet/${id}/events` +
      (identity.guestToken ? `?guestToken=${encodeURIComponent(identity.guestToken)}` : '');
    const es = new EventSource(url);
    esRef.current = es;
    const onPayload = (e: MessageEvent) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(e.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const name = (payload.event as string | undefined) ?? (e.type && e.type !== 'message' ? e.type : 'message');
      handleSseEventRef.current(name, payload);
    };
    for (const name of ['room-state', 'peer-joined', 'peer-left', 'signal', 'chat', 'raise-hand', 'lower-hand', 'reaction', 'room-control', 'ended', 'mute-state']) {
      es.addEventListener(name, onPayload as EventListener);
    }
    es.onmessage = onPayload;
    es.onopen = () => {
      setSseStatus('connected');
      // Kirim hello saat SSE tersambung — dan kirim ulang saat reconnect.
      void sendSignal('hello', undefined, {
        displayName: identity.displayName,
        role: identity.isHost ? 'HOST' : undefined,
      }).then(() => {
        void sendSignal('mute-state', undefined, {
          micOn: meshRef.current.micOn,
          camOn: meshRef.current.camOn,
        });
      });
    };
    es.onerror = () => {
      setSseStatus('reconnecting');
    };
  }, [id, identity.displayName, identity.guestToken, identity.isHost, sendSignal]);

  // --- Init: muat meeting + chat + join + SSE + media ---
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let mtg = initialMeeting ?? null;
        if (!mtg) {
          const r = await getMeeting(id);
          mtg = r.meeting;
          if (!cancelled) setParticipants(r.participants);
        } else if (!cancelled) {
          setParticipants(mtg.participants ?? []);
        }
        if (!cancelled) setMeeting(mtg);
        // Muat konfigurasi ICE (STUN + TURN bila dikonfigurasi admin)
        // dan TUNGGU sampai selesai SEBELUM join + SSE tersambung.
        // RTCPeerConnection tidak bisa diganti ICE server-nya setelah
        // dibuat — bila room-state tiba sebelum fetch ini selesai,
        // koneksi peer akan dibuat STUN-only dan relay TURN tidak akan
        // pernah dipakai sepanjang sesi (itulah yang terjadi pada uji
        // 2-perangkat). Gagal fetch bukan fatal — tetap join dengan
        // STUN default.
        try {
          const cfg = await getIceServers(
            id,
            identity.kind === 'guest' && identity.guestToken
              ? { guestToken: identity.guestToken }
              : {}
          );
          if (!cancelled) {
            if (cfg.iceServers.length > 0) setIceServers(cfg.iceServers);
            setTurnConfigured(cfg.turnConfigured);
            // Beri React satu putaran event loop agar re-render jalan
            // dan iceServersRef di hook ikut terbarui SEBELUM connectSse()
            // (state saja belum cukup: ref hook baru terisi saat render).
            // joinMeeting di bawah (network round-trip) memberi jeda
            // tambahan sebelum room-state bisa tiba.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        } catch {
          /* lanjut dengan STUN default */
        }
        listChatMessages(
          id,
          identity.kind === 'guest' && identity.guestToken
            ? { guestToken: identity.guestToken }
            : {}
        )
          .then((msgs) => {
            if (!cancelled) setChatMessages(msgs);
          })
          .catch(() => {});
        // Catat kehadiran (join). Bila meeting ber-password dan pemanggil
        // bukan host, ini gagal — pengguna diarahkan gabung lewat /meet/join.
        try {
          // INTEGRASI Fase 3: tamu WAJIB mengirim guestToken — tanpanya join
          // 401 dan room menampilkan layar error penuh.
          const jr = await joinMeeting(
            id,
            identity.kind === 'guest' && identity.guestToken
              ? { guestToken: identity.guestToken }
              : {}
          );
          if (jr.sessionId) sessionIdRef.current = jr.sessionId;
          if (!cancelled) setWaiting(!!jr.waiting);
        } catch (e: unknown) {
          if (!cancelled) setJoinError(e instanceof Error ? e.message : 'Gagal gabung meeting.');
        }
        if (!cancelled) {
          joinedAtRef.current = Date.now();
          connectSse();
        }
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Gagal memuat ruang meeting.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Media lokal dimulai setelah join (atau setelah admit dari waiting room).
  useEffect(() => {
    if (loading || joinError || waiting || mediaStartedRef.current) return;
    mediaStartedRef.current = true;
    void meshRef.current.startMedia().then((stream) => {
      if (!stream) return;
      // muteOnEntry: peserta baru masuk dalam keadaan mic mati.
      if (meeting?.muteOnEntry && !identity.isHost && meshRef.current.micOn) {
        const newMic = meshRef.current.toggleMic();
        void sendSignal('mute-state', undefined, { micOn: newMic, camOn: meshRef.current.camOn });
      } else {
        void sendSignal('mute-state', undefined, {
          micOn: meshRef.current.micOn,
          camOn: meshRef.current.camOn,
        });
      }
    });
  }, [loading, joinError, waiting, meeting?.muteOnEntry, identity.isHost, sendSignal]);

  // Heartbeat berkala agar server tahu kita masih di room.
  useEffect(() => {
    const t = window.setInterval(() => {
      void sendSignal('heartbeat');
    }, 25000);
    return () => window.clearInterval(t);
  }, [sendSignal]);

  // Timer durasi meeting.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (joinedAtRef.current) setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Tutup SSE saat unmount.
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const elapsedLabel = useMemo(() => {
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }, [elapsed]);

  // --- Aksi host ---
  const peerToParticipantId = useCallback(
    (peerId: string): string | undefined => {
      if (peerId.startsWith('guest:')) return peerId.slice('guest:'.length);
      return participants.find((p) => p.userId === peerId)?.id;
    },
    [participants]
  );

  const handleMutePeer = useCallback(
    (peerId: string) => {
      void sendSignal('mute-request', peerId, {});
      toast.success('Permintaan bisukan dikirim.');
    },
    [sendSignal]
  );

  const handleMuteAll = useCallback(() => {
    for (const p of peersList) void sendSignal('mute-request', p.peerId, {});
    toast.success('Permintaan bisukan dikirim ke semua peserta.');
  }, [peersList, sendSignal]);

  const handleRemovePeer = useCallback(
    (peerId: string, name: string) => {
      void sendSignal('remove', peerId, {});
      const participantId = peerToParticipantId(peerId);
      if (participantId) {
        removeParticipant(id, participantId).catch(() => {});
      }
      meshRef.current.removePeer(peerId);
      toast.success(`${name} dikeluarkan dari meeting.`);
    },
    [id, peerToParticipantId, sendSignal]
  );

  const handlePromotePeer = useCallback(
    async (peerId: string, name: string, makeCoHost: boolean) => {
      const participantId = peerToParticipantId(peerId);
      if (!participantId) {
        toast.error('Peran hanya bisa diubah untuk peserta terdaftar di meeting ini.');
        return;
      }
      try {
        const updated = await updateParticipantRole(id, participantId, makeCoHost ? 'CO_HOST' : 'PARTICIPANT');
        setParticipants((prev) => prev.map((p) => (p.id === participantId ? { ...p, role: updated.role } : p)));
        toast.success(makeCoHost ? `${name} kini Co-Host.` : `${name} kembali menjadi Peserta.`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Gagal mengubah peran peserta.');
      }
    },
    [id, peerToParticipantId]
  );

  const handleAdmitPeer = useCallback(
    (peerId: string, name: string) => {
      void sendSignal('admit', peerId, {});
      setWaitingPeers((prev) => prev.filter((w) => w.peerId !== peerId));
      toast.success(`${name} diizinkan masuk.`);
    },
    [sendSignal]
  );

  // --- Hubungkan ulang ke satu peer (koneksi P2P ke peer itu dibuat ulang
  // dari nol dengan ICE server terkini; bisa dipakai siapa saja, bukan
  // hanya host, karena ini soal koneksi SAYA ke peer tersebut). ---
  const handleReconnectPeer = useCallback((peerId: string, name: string) => {
    meshRef.current.reconnectPeer(peerId);
    toast.success(`Menghubungkan ulang ke ${name}…`);
  }, []);

  // --- Aksi sendiri ---
  const handleToggleMic = useCallback(() => {
    const next = meshRef.current.toggleMic();
    void sendSignal('mute-state', undefined, { micOn: next, camOn: meshRef.current.camOn });
  }, [sendSignal]);

  const handleToggleCamera = useCallback(() => {
    const next = meshRef.current.toggleCamera();
    void sendSignal('mute-state', undefined, { micOn: meshRef.current.micOn, camOn: next });
  }, [sendSignal]);

  const handleToggleScreen = useCallback(async () => {
    if (mesh.sharing) {
      meshRef.current.stopScreenShare();
      return;
    }
    try {
      await meshRef.current.startScreenShare();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal memulai berbagi layar.');
    }
  }, [mesh.sharing]);

  const handleToggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    void sendSignal(next ? 'raise-hand' : 'lower-hand');
  }, [handRaised, sendSignal]);

  const handleReaction = useCallback(
    (emoji: string) => {
      void sendSignal('reaction', undefined, { emoji });
      setMyReaction({ emoji, at: Date.now() });
      window.setTimeout(() => setMyReaction(null), 3500);
      setReactionsOpen(false);
    },
    [sendSignal]
  );

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    try {
      const saved = await sendChatMessage(id, text, {
        guestToken: identity.guestToken,
        senderName: identity.displayName,
      });
      appendChat(saved);
      await sendSignal('chat', undefined, saved);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengirim pesan.');
      setChatInput(text);
    }
  }, [appendChat, chatInput, id, identity.displayName, identity.guestToken, sendSignal]);

  const openSettings = useCallback(async () => {
    setSettingsOpen((v) => !v);
    if (!settingsOpen && navigator.mediaDevices?.enumerateDevices) {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list);
        const audio = meshRef.current.localStream?.getAudioTracks()[0]?.getSettings().deviceId;
        const video = meshRef.current.localStream?.getVideoTracks()[0]?.getSettings().deviceId;
        if (audio) setAudioDeviceId(audio);
        if (video) setVideoDeviceId(video);
      } catch {
        /* abaikan */
      }
    }
  }, [settingsOpen]);

  const handleDeviceChange = useCallback(
    async (kind: 'audio' | 'video', deviceId: string) => {
      if (kind === 'audio') setAudioDeviceId(deviceId);
      else setVideoDeviceId(deviceId);
      try {
        await meshRef.current.switchDevices({
          audioDeviceId: kind === 'audio' ? deviceId : audioDeviceId || undefined,
          videoDeviceId: kind === 'video' ? deviceId : videoDeviceId || undefined,
        });
        toast.success('Perangkat diganti.');
      } catch {
        toast.error('Gagal mengganti perangkat.');
      }
    },
    [audioDeviceId, videoDeviceId]
  );

  // --- Diagnostik koneksi (panel Pengaturan) ---
  // Hitung server ICE yang dipakai (hanya JUMLAH + jenis — URL dan
  // kredensial TURN TIDAK PERNAH ditampilkan atau disalin).
  const iceServerCounts = useMemo(() => {
    let stun = 0;
    let turn = 0;
    for (const s of iceServers) {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      if (urls.some((u) => u.startsWith('turn'))) turn += 1;
      else if (urls.some((u) => u.startsWith('stun'))) stun += 1;
    }
    return { stun, turn, total: iceServers.length };
  }, [iceServers]);

  /**
   * Ringkasan diagnostik teks polos (Bahasa Indonesia) untuk disalin dan
   * dikirim ke admin bila video tidak muncul. TIDAK memuat URL/kredensial
   * TURN — hanya status "TURN aktif (n server)" / "TURN tidak aktif".
   */
  const diagnosticsText = useCallback(() => {
    const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
    const lines = [
      `Diagnostik WOORK MEET — ${now}`,
      `Meeting: ${meeting?.title ?? 'Meeting'} (${shortMeetingId(id)})`,
      `TURN: ${turnConfigured ? `aktif (${iceServerCounts.turn} server)` : 'tidak aktif'}`,
      `Server ICE: ${iceServerCounts.total} (STUN ${iceServerCounts.stun}, TURN ${iceServerCounts.turn})`,
      `Media saya: ${mediaStateLabel(mesh.mediaState)}, mic ${mesh.micOn ? 'nyala' : 'mati'}, kamera ${mesh.camOn ? 'nyala' : 'mati'}`,
      'Peserta:',
    ];
    if (peersList.length === 0) {
      lines.push('- (belum ada peserta lain)');
    }
    for (const p of peersList) {
      lines.push(
        `- ${p.displayName}: koneksi ${p.connectionState}, ICE ${p.iceConnectionState}, gathering ${p.iceGatheringState}, kandidat host ${p.candidates.host}, srflx ${p.candidates.srflx}, relay ${p.candidates.relay}, RTT ${p.rttMs !== null ? `${p.rttMs} ms` : '-'}`
      );
    }
    lines.push('Kirim teks ini ke admin bila video tidak muncul.');
    return lines.join('\n');
  }, [id, iceServerCounts, meeting?.title, mesh.camOn, mesh.mediaState, mesh.micOn, peersList, turnConfigured]);

  const handleCopyDiagnostics = useCallback(async () => {
    const text = diagnosticsText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Diagnostik disalin. Tempel ke chat admin bila video tidak muncul.');
      return;
    } catch {
      /* lanjut ke fallback */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast.success('Diagnostik disalin. Tempel ke chat admin bila video tidak muncul.');
    } catch {
      toast.error('Gagal menyalin otomatis. Salin manual dari panel diagnostik.');
    }
  }, [diagnosticsText]);

  // --- Daftar peserta gabungan (undangan + live) ---
  const myParticipant = participants.find((p) => p.userId === myPeerId || (myPeerId.startsWith('guest:') && p.id === myPeerId.slice(6)));
  const myRole = identity.isHost ? 'HOST' : (myParticipant?.role ?? 'PARTICIPANT');
  const liveRows: LivePeerRow[] = useMemo(() => {
    const rows: LivePeerRow[] = [];
    const seen = new Set<string>();
    rows.push({
      key: myPeerId,
      peerId: myPeerId,
      participantId: myParticipant?.id,
      name: `${identity.displayName}`,
      role: myRole,
      live: true,
      waiting: false,
      isSelf: true,
      micOn: mesh.micOn,
      camOn: mesh.camOn,
    });
    seen.add(myPeerId);
    for (const p of peersList) {
      const participantId = peerToParticipantId(p.peerId);
      const invited = participants.find((x) => x.id === participantId);
      rows.push({
        key: p.peerId,
        peerId: p.peerId,
        participantId,
        name: p.displayName,
        role: invited?.role ?? p.role ?? 'PARTICIPANT',
        live: true,
        waiting: false,
        isSelf: false,
        micOn: p.micOn,
        camOn: p.camOn,
        connectionState: p.connectionState,
        rttMs: p.rttMs,
        relayCandidates: p.candidates.relay,
        failed: p.failed,
      });
      seen.add(p.peerId);
    }
    for (const w of waitingPeers) {
      if (seen.has(w.peerId)) continue;
      const participantId = peerToParticipantId(w.peerId);
      const invited = participants.find((x) => x.id === participantId);
      rows.push({
        key: w.peerId,
        peerId: w.peerId,
        participantId,
        name: w.displayName,
        role: invited?.role ?? 'PARTICIPANT',
        live: false,
        waiting: true,
        isSelf: false,
      });
      seen.add(w.peerId);
    }
    for (const p of participants) {
      const key = p.userId ?? `guest:${p.id}`;
      if (seen.has(key)) continue;
      rows.push({
        key,
        peerId: key,
        participantId: p.id,
        name: p.name,
        role: p.role,
        live: false,
        waiting: false,
        isSelf: false,
      });
    }
    return rows;
  }, [identity.displayName, mesh.camOn, mesh.micOn, myParticipant?.id, myPeerId, myRole, participants, peerToParticipantId, peersList, waitingPeers]);

  const activeSpeaker = useMemo(() => {
    const speaking = peersList.find((p) => p.speaking);
    if (speaking) return speaking;
    return peersList[0] ?? null;
  }, [peersList]);

  const screenTiles = useMemo(() => {
    const tiles: Array<{ key: string; name: string; stream: MediaStream; isLocal: boolean }> = [];
    if (mesh.sharing && mesh.localScreenStream) {
      tiles.push({ key: 'screen-local', name: identity.displayName, stream: mesh.localScreenStream, isLocal: true });
    }
    for (const p of peersList) {
      if (p.screenStream) tiles.push({ key: `screen-${p.peerId}`, name: p.displayName, stream: p.screenStream, isLocal: false });
    }
    return tiles;
  }, [identity.displayName, mesh.localScreenStream, mesh.sharing, peersList]);

  const mediaFailed = mesh.mediaState === 'failed';
  const canChat = meeting?.allowChat !== false || myRole === 'HOST' || myRole === 'CO_HOST';

  // ============================ RENDER ============================
  if (loading) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] items-center justify-center bg-slate-950 text-sm text-slate-400 sm:-m-6">
        Memuat ruang meeting…
      </div>
    );
  }
  if (loadError || !meeting) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <p className="text-sm text-slate-300">{loadError || 'Meeting tidak ditemukan.'}</p>
        <Link href="/meet" className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-900">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }
  if (ended) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <PhoneOff size={32} className="text-slate-400" />
        <h1 className="text-base font-bold text-white">Meeting telah diakhiri oleh host</h1>
        <p className="max-w-md text-sm text-slate-400">Terima kasih sudah bergabung. Anda dapat kembali ke dashboard WOORK MEET.</p>
        <Link href="/meet" className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-900">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }
  if (removed) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <LogOut size={32} className="text-slate-400" />
        <h1 className="text-base font-bold text-white">Anda dikeluarkan dari meeting oleh host</h1>
        <Link href="/meet" className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-900">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }
  if (waiting) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <Clock size={32} className="animate-pulse text-amber-400" />
        <h1 className="text-base font-bold text-white">Menunggu host mengizinkan Anda masuk</h1>
        <p className="max-w-md text-sm text-slate-400">
          Meeting &ldquo;{meeting.title}&rdquo; memakai waiting room. Tetap di halaman ini — Anda akan masuk otomatis
          begitu host mengizinkan.
        </p>
        <button
          onClick={() => void doLeave(false)}
          className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Batalkan &amp; Kembali ke Dashboard
        </button>
      </div>
    );
  }
  if (joinError) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <p className="text-sm text-slate-300">{joinError}</p>
        <p className="max-w-md text-xs text-slate-500">
          Bila meeting ini ber-password, gabung lewat halaman Gabung Meeting dan masukkan password-nya.
        </p>
        <div className="flex gap-2">
          <Link href="/meet/join" className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-900">
            Buka Halaman Gabung
          </Link>
          <Link href="/meet" className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const rightPanel = participantsOpen ? 'participants' : chatOpen ? 'chat' : settingsOpen ? 'settings' : null;

  return (
    <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col bg-slate-950 text-slate-100 sm:-m-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white">
            <Video size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight sm:text-base">{meeting.title}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
              <span>ID: {shortMeetingId(meeting.id)}</span>
              <span>•</span>
              <span>{MEETING_STATUS_LABEL[meeting.status] ?? meeting.status}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {elapsedLabel}
              </span>
              <span>•</span>
              <span title="Koneksi signaling ke server">
                <span className={`mr-1 inline-block h-2 w-2 rounded-full ${sseStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {sseStatus === 'connected' ? 'Terhubung' : 'Menghubungkan ulang…'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">
            {formatDurasi(meeting.startsAt, meeting.endsAt)}
          </span>
          <div className="flex rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              title="Tampilan grid"
              className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('speaker')}
              title="Tampilan pembicara"
              className={`rounded-md p-1.5 ${viewMode === 'speaker' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
            >
              <User size={15} />
            </button>
          </div>
          <button
            onClick={() => void doLeave(false)}
            disabled={leaving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <PhoneOff size={14} /> {leaving ? 'Keluar…' : 'Keluar'}
          </button>
        </div>
      </header>

      {/* Banner error media */}
      {(mediaFailed || mesh.mediaState === 'audio-only') && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs leading-relaxed text-amber-200">
          <p>{mesh.mediaError || 'Kamera tidak bisa dipakai.'}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button onClick={() => void meshRef.current.retryMedia()} className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white">
              Coba lagi
            </button>
            <button
              onClick={() => meshRef.current.joinWithoutMedia()}
              className="rounded-md border border-amber-500/50 px-2.5 py-1 text-[11px] font-medium text-amber-200"
            >
              Tetap gabung tanpa kamera/mik
            </button>
          </div>
        </div>
      )}
      {mesh.mediaState === 'off' && (
        <div className="border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-400">
          Anda bergabung tanpa kamera/mik — Anda tetap bisa melihat dan mendengar peserta lain.
        </div>
      )}
      {/* Banner koneksi P2P gagal — jangan biarkan tile lawan diam tanpa penjelasan. */}
      {peersList.some((p) => p.failed) && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs leading-relaxed text-red-200">
          <p>
            <span className="font-medium">
              Tidak bisa terhubung langsung ke{' '}
              {peersList
                .filter((p) => p.failed)
                .map((p) => p.displayName)
                .join(', ')}
              .
            </span>{' '}
            Jaringan mereka memblokir koneksi langsung (NAT/firewall) — video dan suara mereka tidak muncul di
            sini.
            {turnConfigured
              ? ' Relay TURN sudah aktif; bila tetap gagal, coba jaringan lain atau hubungi admin.'
              : ' Video lintas jaringan seperti ini butuh relay TURN yang belum diaktifkan; hubungi admin.'}{' '}
            Chat meeting tetap bisa dipakai.
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Area video */}
        <main className="flex flex-1 flex-col p-3 sm:p-4">
          {viewMode === 'speaker' ? (
            <div className="flex flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1">
                {screenTiles[0] ? (
                  <VideoTile
                    name={screenTiles[0].name}
                    stream={screenTiles[0].stream}
                    micOn
                    camOn
                    speaking={false}
                    screenLabel="Layar yang dibagikan"
                  />
                ) : activeSpeaker ? (
                  <VideoTile
                    name={activeSpeaker.displayName}
                    stream={activeSpeaker.stream}
                    micOn={activeSpeaker.micOn}
                    camOn={activeSpeaker.camOn}
                    speaking={activeSpeaker.speaking}
                    isHost={activeSpeaker.role === 'HOST'}
                    isCoHost={activeSpeaker.role === 'CO_HOST'}
                    handRaised={activeSpeaker.handRaised}
                    connectionState={activeSpeaker.connectionState}
                    rttMs={activeSpeaker.rttMs}
                    failed={activeSpeaker.failed}
                    reaction={activeSpeaker.lastReaction}
                    onReconnect={() => handleReconnectPeer(activeSpeaker.peerId, activeSpeaker.displayName)}
                  />
                ) : (
                  <VideoTile
                    name={identity.displayName}
                    stream={mesh.localStream}
                    micOn={mesh.micOn}
                    camOn={mesh.camOn}
                    speaking={mesh.localSpeaking}
                    isLocal
                    isHost={identity.isHost}
                    isCoHost={myRole === 'CO_HOST'}
                    handRaised={handRaised}
                    reaction={myReaction}
                  />
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <div className="w-36 shrink-0 sm:w-44">
                  <VideoTile
                    name={identity.displayName}
                    stream={mesh.localStream}
                    micOn={mesh.micOn}
                    camOn={mesh.camOn}
                    speaking={mesh.localSpeaking}
                    isLocal
                    isHost={identity.isHost}
                    isCoHost={myRole === 'CO_HOST'}
                    handRaised={handRaised}
                    reaction={myReaction}
                    compact
                  />
                </div>
                {peersList
                  .filter((p) => p.peerId !== activeSpeaker?.peerId)
                  .map((p) => (
                    <div key={p.peerId} className="w-36 shrink-0 sm:w-44">
                      <VideoTile
                        name={p.displayName}
                        stream={p.stream}
                        micOn={p.micOn}
                        camOn={p.camOn}
                        speaking={p.speaking}
                        isHost={p.role === 'HOST'}
                        isCoHost={p.role === 'CO_HOST'}
                        handRaised={p.handRaised}
                        connectionState={p.connectionState}
                        rttMs={p.rttMs}
                        failed={p.failed}
                        reaction={p.lastReaction}
                        compact
                        onReconnect={() => handleReconnectPeer(p.peerId, p.displayName)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div
              className={`grid flex-1 content-start gap-3 ${
                peersList.length + 1 + screenTiles.length <= 1
                  ? 'grid-cols-1'
                  : peersList.length + 1 + screenTiles.length === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
              }`}
            >
              {screenTiles.map((t) => (
                <div key={t.key} className="sm:col-span-2">
                  <VideoTile name={t.name} stream={t.stream} micOn camOn speaking={false} screenLabel="Layar yang dibagikan" />
                </div>
              ))}
              <VideoTile
                name={identity.displayName}
                stream={mesh.localStream}
                micOn={mesh.micOn}
                camOn={mesh.camOn}
                speaking={mesh.localSpeaking}
                isLocal
                isHost={identity.isHost}
                isCoHost={myRole === 'CO_HOST'}
                handRaised={handRaised}
                reaction={myReaction}
              />
              {peersList.map((p) => (
                <VideoTile
                  key={p.peerId}
                  name={p.displayName}
                  stream={p.stream}
                  micOn={p.micOn}
                  camOn={p.camOn}
                  speaking={p.speaking}
                  isHost={p.role === 'HOST'}
                  isCoHost={p.role === 'CO_HOST'}
                  handRaised={p.handRaised}
                  connectionState={p.connectionState}
                  rttMs={p.rttMs}
                  failed={p.failed}
                  reaction={p.lastReaction}
                  onReconnect={() => handleReconnectPeer(p.peerId, p.displayName)}
                />
              ))}
              {peersList.length === 0 && (
                <div className="flex aspect-video flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-4 text-center">
                  <Users size={24} className="text-slate-500" />
                  <p className="mt-2 text-xs text-slate-400">
                    Belum ada peserta lain di room. Bagikan tautan meeting agar peserta lain bisa bergabung.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Control bar */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={handleToggleMic}
              title={mesh.micOn ? 'Matikan mic' : 'Nyalakan mic'}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${mesh.micOn ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-red-600 text-white'}`}
            >
              {mesh.micOn ? <Mic size={18} /> : <MicOff size={18} />} Mic
            </button>
            <button
              onClick={handleToggleCamera}
              title={mesh.camOn ? 'Matikan kamera' : 'Nyalakan kamera'}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${mesh.camOn ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-red-600 text-white'}`}
            >
              {mesh.camOn ? <Video size={18} /> : <VideoOff size={18} />} Kamera
            </button>
            <button
              onClick={() => void handleToggleScreen()}
              disabled={meeting.allowScreenShare === false && !identity.isHost}
              title="Bagikan layar"
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${mesh.sharing ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'} disabled:opacity-40`}
            >
              <MonitorUp size={18} /> {mesh.sharing ? 'Berhenti Berbagi' : 'Bagikan Layar'}
            </button>
            <button
              onClick={() => {
                setParticipantsOpen((v) => !v);
                setChatOpen(false);
                setSettingsOpen(false);
              }}
              title="Daftar peserta"
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${participantsOpen ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
            >
              <Users size={18} /> Peserta ({liveRows.filter((r) => r.live).length})
            </button>
            <button
              onClick={() => {
                setChatOpen((v) => !v);
                setParticipantsOpen(false);
                setSettingsOpen(false);
                if (!chatOpen) setUnreadChat(0);
              }}
              title="Chat meeting"
              className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${chatOpen ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
            >
              <MessageSquare size={18} /> Chat
              {unreadChat > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                  {unreadChat}
                </span>
              )}
            </button>
            <button
              onClick={handleToggleHand}
              title={handRaised ? 'Turunkan tangan' : 'Angkat tangan'}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${handRaised ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
            >
              <Hand size={18} /> {handRaised ? 'Tangan Terangkat' : 'Angkat Tangan'}
            </button>
            <div className="relative">
              <button
                onClick={() => setReactionsOpen((v) => !v)}
                title="Kirim reaksi"
                className="flex flex-col items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-[11px] text-slate-100 hover:bg-slate-700"
              >
                <Smile size={18} /> Reaksi
              </button>
              {reactionsOpen && (
                <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className="rounded-lg px-2 py-1 text-xl hover:bg-slate-800"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => void openSettings()}
              title="Pengaturan perangkat"
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${settingsOpen ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
            >
              <Settings size={18} /> Pengaturan
            </button>
            {identity.isHost && (
              <button
                onClick={() => {
                  if (confirmEnd) void doLeave(true);
                  else {
                    setConfirmEnd(true);
                    window.setTimeout(() => setConfirmEnd(false), 4000);
                  }
                }}
                disabled={leaving}
                title="Akhiri meeting untuk semua peserta"
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${confirmEnd ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'} disabled:opacity-50`}
              >
                <LogOut size={18} /> {confirmEnd ? 'Yakin Akhiri?' : 'Akhiri untuk Semua'}
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Video tersambung langsung antar peserta (P2P, tanpa server media).
            {turnConfigured
              ? ' Bila koneksi langsung gagal, video diteruskan lewat relay TURN.'
              : ' Tanpa server TURN, sebagian jaringan yang ketat (mis. data seluler/CGNAT) bisa gagal terhubung — hubungi admin untuk mengaktifkan relay TURN.'}
          </p>
        </main>

        {/* Panel kanan */}
        {rightPanel && (
          <aside className="flex w-full shrink-0 flex-col border-t border-slate-800 bg-slate-900 lg:w-80 lg:border-l lg:border-t-0">
            {rightPanel === 'participants' && (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <Users size={15} /> Peserta ({liveRows.length})
                  </h2>
                  {identity.isHost && peersList.length > 0 && (
                    <button onClick={handleMuteAll} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700">
                      <Volume2 size={12} /> Bisukan Semua
                    </button>
                  )}
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-3">
                  {liveRows.map((row) => (
                    <li key={row.key} className="rounded-xl border border-slate-800 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 text-sm font-medium text-slate-100">
                          <span className="truncate">{row.name}</span>
                          {row.isSelf && <span className="text-slate-400"> (Anda)</span>}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            row.live ? 'bg-emerald-500/15 text-emerald-300' : row.waiting ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {row.live ? 'Di room' : row.waiting ? 'Menunggu' : 'Diundang'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {PARTICIPANT_ROLE_LABEL[row.role] ?? row.role}
                        {row.live && (
                          <>
                            {' • '}
                            {row.micOn ? 'Mic nyala' : 'Mic mati'}
                            {' • '}
                            {row.camOn ? 'Kamera nyala' : 'Kamera mati'}
                          </>
                        )}
                      </p>
                      {row.live && !row.isSelf && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">
                            {row.connectionState ? connLabel(row.connectionState) : 'Menghubungkan…'}
                            {row.rttMs ? ` • ${row.rttMs} ms` : ''}
                            {typeof row.relayCandidates === 'number' ? ` • relay ${row.relayCandidates}` : ''}
                          </span>
                          <button
                            onClick={() => handleReconnectPeer(row.peerId, row.name)}
                            title="Putuskan lalu buat ulang koneksi video ke peserta ini"
                            className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                          >
                            <RefreshCw size={11} /> Hubungkan ulang
                          </button>
                        </div>
                      )}
                      {identity.isHost && !row.isSelf && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {row.waiting ? (
                            <button
                              onClick={() => handleAdmitPeer(row.peerId, row.name)}
                              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white"
                            >
                              Izinkan Masuk
                            </button>
                          ) : (
                            <>
                              {row.live && (
                                <button
                                  onClick={() => handleMutePeer(row.peerId)}
                                  className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                                >
                                  Bisukan
                                </button>
                              )}
                              <button
                                onClick={() => void handlePromotePeer(row.peerId, row.name, row.role !== 'CO_HOST')}
                                disabled={!row.participantId}
                                title={row.participantId ? undefined : 'Hanya untuk peserta terdaftar'}
                                className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                              >
                                {row.role === 'CO_HOST' ? 'Cabut Co-Host' : 'Jadikan Co-Host'}
                              </button>
                              <button
                                onClick={() => handleRemovePeer(row.peerId, row.name)}
                                className="rounded-md bg-red-600/20 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-600/30"
                              >
                                Keluarkan
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {rightPanel === 'chat' && (
              <>
                <div className="border-b border-slate-800 px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <MessageSquare size={15} /> Chat Meeting
                  </h2>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-3">
                  {chatMessages.length === 0 ? (
                    <p className="text-xs text-slate-400">Belum ada pesan. Mulai percakapan di sini.</p>
                  ) : (
                    chatMessages.map((m) => {
                      const mine = m.senderId === myPeerId || m.senderName === identity.displayName;
                      return (
                        <div key={m.id} className={`max-w-[90%] rounded-xl px-3 py-2 ${mine ? 'ml-auto bg-sky-600/30' : 'bg-slate-800'}`}>
                          <p className="text-[11px] font-medium text-slate-300">
                            {m.senderName}
                            <span className="ml-2 font-normal text-slate-500">
                              {new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-100">{m.body}</p>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t border-slate-800 p-3">
                  {canChat ? (
                    <div className="flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSendChat();
                        }}
                        placeholder="Tulis pesan…"
                        maxLength={4000}
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                      />
                      <button
                        onClick={() => void handleSendChat()}
                        disabled={!chatInput.trim()}
                        className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-40"
                      >
                        Kirim
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Chat dimatikan untuk meeting ini (hanya host/co-host yang boleh bicara).</p>
                  )}
                </div>
              </>
            )}
            {rightPanel === 'settings' && (
              <>
                <div className="border-b border-slate-800 px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <Settings size={15} /> Pengaturan
                  </h2>
                </div>
                <div className="space-y-4 p-4 text-sm">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Mikrofon</label>
                    <select
                      value={audioDeviceId}
                      onChange={(e) => void handleDeviceChange('audio', e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
                    >
                      <option value="">Mikrofon bawaan</option>
                      {devices
                        .filter((d) => d.kind === 'audioinput')
                        .map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Mikrofon ${d.deviceId.slice(0, 8)}`}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Kamera</label>
                    <select
                      value={videoDeviceId}
                      onChange={(e) => void handleDeviceChange('video', e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
                    >
                      <option value="">Kamera bawaan</option>
                      {devices
                        .filter((d) => d.kind === 'videoinput')
                        .map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Kamera ${d.deviceId.slice(0, 8)}`}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3 text-xs leading-relaxed text-slate-400">
                    <p className="font-medium text-slate-200">Tentang koneksi video</p>
                    <p className="mt-1">
                      Video tersambung langsung antar peserta (WebRTC mesh) lewat STUN publik Google — tanpa server
                      media eksternal. Cocok untuk meeting kecil (2–4 orang).
                      {turnConfigured
                        ? ' Relay TURN sudah aktif, jadi video lintas jaringan yang ketat diteruskan lewat server TURN.'
                        : ' Relay TURN belum diaktifkan, jadi sebagian jaringan ketat (mis. data seluler/CGNAT) bisa gagal terhubung. Admin dapat mengaktifkannya lewat variabel environment MEET_TURN_URLS, MEET_TURN_USERNAME, dan MEET_TURN_CREDENTIAL di server.'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-3">
                    <p className="font-medium text-slate-200">Diagnostik koneksi</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {turnConfigured
                        ? `Relay TURN aktif (${iceServerCounts.turn} server).`
                        : 'Relay TURN belum diaktifkan.'}{' '}
                      Server ICE: {iceServerCounts.total} (STUN {iceServerCounts.stun}, TURN{' '}
                      {iceServerCounts.turn}).
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {peersList.length === 0 ? (
                        <p className="text-xs text-slate-400">Belum ada peserta lain di room.</p>
                      ) : (
                        peersList.map((p) => (
                          <div key={p.peerId} className="rounded-lg bg-slate-900/70 px-2 py-1.5 text-xs leading-relaxed text-slate-300">
                            <p className="font-medium text-slate-100">{p.displayName}</p>
                            <p>
                              Koneksi: {connLabel(p.connectionState)} • ICE: {p.iceConnectionState} • Gathering:{' '}
                              {p.iceGatheringState}
                            </p>
                            <p>
                              Kandidat: host {p.candidates.host} • srflx {p.candidates.srflx} • relay{' '}
                              {p.candidates.relay}
                              {p.rttMs !== null ? ` • RTT ${p.rttMs} ms` : ''}
                            </p>
                            {p.candidates.relay === 0 && p.iceGatheringState === 'complete' && (
                              <p className="text-amber-300">
                                Tidak ada kandidat relay — browser ini tidak memakai TURN.
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Media saya: {mediaStateLabel(mesh.mediaState)} • mic {mesh.micOn ? 'nyala' : 'mati'} • kamera{' '}
                      {mesh.camOn ? 'nyala' : 'mati'}
                    </p>
                    <button
                      onClick={() => void handleCopyDiagnostics()}
                      className="mt-2 flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                    >
                      <Copy size={13} /> Salin diagnostik
                    </button>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Tempel teks ini ke admin bila video peserta lain tidak muncul. Tidak ada kredensial atau alamat
                      server di dalamnya.
                    </p>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
