// Hook mesh WebRTC WOORK MEET (Fase 3) — video buatan sendiri, TANPA
// LiveKit/Jitsi/layanan media eksternal. Satu RTCPeerConnection per
// pasangan (mesh penuh), signaling lewat callback `sendSignal` (pemanggil
// yang mengirim ke POST /api/meet/[id]/signal). ICE server diterima lewat
// opsi `iceServers` (diambil pemanggil dari GET /api/meet/[id]/ice);
// default-nya STUN publik gratis saja, TANPA TURN — sebagian jaringan
// ketat (NAT simetris / firewall UDP ketat, mis. data seluler/CGNAT)
// bisa gagal terhubung, dan itu dilaporkan jujur ke pengguna.
//
// Kandidat ICE yang tiba sebelum remote description diset TIDAK dibuang:
// disimpan dalam antrean per-peer lalu di-flush setelah
// setRemoteDescription berhasil (offer/answer) — urutan POST offer/answer
// vs kandidat yang tidak berurutan tidak boleh menghilangkan kandidat.
//
// Aturan initiator (menghindari glare offer/answer ganda): peer dengan
// peerId yang lebih kecil secara leksikografis yang memulai offer untuk
// pasangan itu. Bila offer masuk saat kita sedang punya local offer
// (glare), sisi "sopan" (peerId lebih besar) melakukan rollback lalu
// menerima offer lawan.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MEET_STUN_SERVERS } from '@/lib/meet/ice';

export { MEET_STUN_SERVERS };

export type MeshMediaState = 'idle' | 'starting' | 'ready' | 'audio-only' | 'failed' | 'off';

export interface IceCandidateCounts {
  host: number;
  srflx: number;
  relay: number;
}

export interface RemotePeerState {
  peerId: string;
  displayName: string;
  role?: string;
  /** Stream kamera + audio lawan bicara (null bila belum ada track). */
  stream: MediaStream | null;
  /** Stream layar yang dibagikan lawan bicara (null bila tidak berbagi). */
  screenStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  /** Round-trip time (ms) dari getStats, null bila belum tersedia. */
  rttMs: number | null;
  speaking: boolean;
  micOn: boolean;
  camOn: boolean;
  handRaised: boolean;
  /** true bila P2P gagal total setelah ICE restart. */
  failed: boolean;
  /** Reaksi terakhir (emoji) + waktu tampil — pemanggil yang membersihkan. */
  lastReaction?: { emoji: string; at: number } | null;
  /** Jumlah kandidat ICE yang berhasil dikumpulkan, per tipe. */
  candidates: IceCandidateCounts;
  /** Status koneksi ICE (checking/connected/completed/failed/dll). */
  iceConnectionState: RTCIceConnectionState;
  /** Status pengumpulan kandidat ICE (new/gathering/complete). */
  iceGatheringState: RTCIceGatheringState;
}

export interface MeshSignalSender {
  (type: 'offer' | 'answer' | 'ice', to: string, data: unknown): void | Promise<void>;
}

interface PeerInternals {
  pc: RTCPeerConnection;
  cameraTrackIds: Set<string>;
  screenTrackIds: Set<string>;
  audioTrackId: string | null;
  iceRestarted: boolean;
  /** Waktu (ms epoch) saat koneksi masuk `disconnected`; null bila tidak. */
  disconnectedSince: number | null;
  /** Jumlah kandidat ICE yang terkumpul, per tipe (sumber state `candidates`). */
  candidateCounts: IceCandidateCounts;
  /**
   * true bila koneksi ini sudah pernah dibuat ulang otomatis 1x karena
   * gagal (satu episode gagal = max 1 ICE restart + 1 buat-ulang).
   * Di-nol-kan lagi bila koneksi berhasil `connected`.
   */
  reconnectedOnce: boolean;
}

/** `disconnected` dianggap gagal bila bertahan selama ini (jaringan putus). */
const DISCONNECTED_FAIL_AFTER_MS = 15_000;

const SPEAKING_THRESHOLD = 0.02;

function mediaErrorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return 'Akses kamera/mik ditolak. Izinkan akses kamera & mikrofon di browser Anda, lalu tekan "Coba lagi". Anda tetap bisa bergabung tanpa media lewat tombol di bawah.';
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
    return 'Tidak ditemukan kamera atau mikrofon di perangkat ini. Periksa perangkat Anda, atau gabung tanpa media.';
  }
  if (e?.name === 'NotReadableError') {
    return 'Kamera/mik sedang dipakai aplikasi lain. Tutup aplikasi lain itu, lalu tekan "Coba lagi".';
  }
  return 'Gagal mengakses kamera/mik. Periksa izin browser, lalu tekan "Coba lagi".';
}

/**
 * Tipe kandidat ICE: `host` (alamat lokal), `srflx` (alamat publik lewat
 * STUN), `relay` (alamat relay lewat TURN). `prflx` (peer-reflexive)
 * digolongkan ke `srflx` karena sama-sama menandakan jalur langsung,
 * bukan relay. Dipakai panel diagnostik untuk membuktikan apakah browser
 * benar-benar memakai TURN atau tidak.
 */
function candidateTypeOf(candidate: RTCIceCandidate): 'host' | 'srflx' | 'relay' | null {
  const direct = (candidate as { type?: string }).type;
  if (direct === 'host' || direct === 'srflx' || direct === 'relay') return direct;
  if (direct === 'prflx') return 'srflx';
  const sdp = typeof candidate.candidate === 'string' ? candidate.candidate : '';
  const m = /\btyp\s+(host|srflx|prflx|relay)\b/.exec(sdp);
  if (!m) return null;
  if (m[1] === 'host') return 'host';
  if (m[1] === 'relay') return 'relay';
  return 'srflx';
}

export function useMeshRoom(opts: {
  myPeerId: string;
  displayName: string;
  sendSignal: MeshSignalSender;
  /**
   * Daftar ICE server untuk semua RTCPeerConnection (STUN + TURN bila
   * dikonfigurasi). Default: STUN Google saja. Diambil pemanggil dari
   * GET /api/meet/[id]/ice saat join; bila belum sempat dimuat, koneksi
   * yang dibuat memakai default — tidak ada koneksi yang diblokir
   * menunggu konfigurasi.
   */
  iceServers?: RTCIceServer[];
}) {
  const { myPeerId, sendSignal } = opts;
  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;
  const myPeerIdRef = useRef(myPeerId);
  myPeerIdRef.current = myPeerId;
  const iceServersRef = useRef<RTCIceServer[]>(opts.iceServers ?? MEET_STUN_SERVERS);
  iceServersRef.current = opts.iceServers ?? MEET_STUN_SERVERS;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [mediaState, setMediaState] = useState<MeshMediaState>('idle');
  const [mediaError, setMediaError] = useState('');
  const [peers, setPeers] = useState<Record<string, RemotePeerState>>({});
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  /** Sender khusus screen-share per peer (dipakai untuk removeTrack saat berhenti). */
  const screenSendersRef = useRef<Array<{ peerId: string; sender: RTCRtpSender }>>([]);
  const pcsRef = useRef<Map<string, PeerInternals>>(new Map());
  const peersMetaRef = useRef<Map<string, { displayName: string; role?: string }>>(new Map());
  /**
   * Antrean kandidat ICE per peer — kandidat yang tiba SEBELUM remote
   * description diset (atau sebelum koneksi dibuat) disimpan di sini dan
   * di-flush setelah setRemoteDescription berhasil. Tanpa antrean ini,
   * kandidat yang datang lebih dulu dari offer/answer hilang diam-diam
   * (addIceCandidate melempar karena belum ada remote description) dan
   * pasangan ICE yang dibutuhkannya tidak pernah terbentuk.
   */
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  /**
   * Guard agar `reconnectPeer` tidak berjalan ganda untuk peer yang sama
   * (klik tombol dua kali / retry otomatis + manual bersamaan).
   */
  const reconnectingRef = useRef<Set<string>>(new Set());
  /**
   * Ref ke `reconnectPeer` — dipakai handler `onconnectionstatechange`
   * di dalam `createPeerConnection` (didefinisikan sebelum `reconnectPeer`
   * itu sendiri). Diisi ulang setiap render, pola yang sama seperti
   * `sendSignalRef`.
   */
  const reconnectPeerRef = useRef<(peerId: string, opts?: { auto?: boolean }) => void>(() => {});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }>>(new Map());
  const statsTimerRef = useRef<number | null>(null);
  const speakTimerRef = useRef<number | null>(null);

  /**
   * Tempelkan track lokal ke sebuah koneksi: ganti track lama sejenis
   * (retry / ganti device) alih-alih menambah sender baru, dan jangan
   * menyentuh sender screen-share.
   */
  const attachStreamToPc = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    const screenTracks = localScreenRef.current?.getTracks() ?? [];
    for (const track of stream.getTracks()) {
      const existing = pc
        .getSenders()
        .find((s) => s.track && s.track.kind === track.kind && !screenTracks.includes(s.track));
      if (existing) {
        void existing.replaceTrack(track).catch(() => {});
      } else {
        try {
          pc.addTrack(track, stream);
        } catch {
          /* abaikan */
        }
      }
    }
  }, []);

  const patchPeer = useCallback((peerId: string, patch: Partial<RemotePeerState>) => {
    setPeers((prev) => {
      const cur = prev[peerId];
      if (!cur) return prev;
      return { ...prev, [peerId]: { ...cur, ...patch } };
    });
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const attachAnalyser = useCallback(
    (key: string, stream: MediaStream) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analysersRef.current.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      } catch {
        // Analyser bersifat best-effort; kegagalan tidak boleh mematikan call.
      }
    },
    [ensureAudioContext]
  );

  // --- Polling: deteksi pembicara aktif + kualitas koneksi (getStats) ---
  useEffect(() => {
    speakTimerRef.current = window.setInterval(() => {
      const nextSpeaking: Record<string, boolean> = {};
      let changed = false;
      for (const [key, { analyser, data }] of analysersRef.current) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const speaking = rms > SPEAKING_THRESHOLD;
        if (key === 'local') {
          setLocalSpeaking((prev) => (prev === speaking ? prev : speaking));
        } else {
          nextSpeaking[key] = speaking;
        }
      }
      setPeers((prev) => {
        let out: Record<string, RemotePeerState> | null = null;
        for (const [peerId, speaking] of Object.entries(nextSpeaking)) {
          if (prev[peerId] && prev[peerId].speaking !== speaking) {
            out = out ?? { ...prev };
            out[peerId] = { ...prev[peerId], speaking };
          }
        }
        if (out) changed = true;
        return out ?? prev;
      });
      void changed;
    }, 500);
    statsTimerRef.current = window.setInterval(() => {
      for (const [peerId, internals] of pcsRef.current) {
        // `disconnected` berkepanjangan = jaringan putus dan tidak pulih
        // sendiri: tandai gagal agar UI menampilkan pesan yang jelas
        // (bukan avatar diam). Bila nanti tersambung lagi, handler
        // onconnectionstatechange mengembalikan failed=false.
        if (
          internals.disconnectedSince !== null &&
          internals.pc.connectionState === 'disconnected' &&
          Date.now() - internals.disconnectedSince > DISCONNECTED_FAIL_AFTER_MS
        ) {
          patchPeer(peerId, { failed: true });
        }
        internals.pc
          .getStats()
          .then((stats) => {
            let rtt: number | null = null;
            stats.forEach((report) => {
              if (
                report.type === 'candidate-pair' &&
                (report as RTCIceCandidatePairStats).state === 'succeeded' &&
                typeof (report as RTCIceCandidatePairStats).currentRoundTripTime === 'number'
              ) {
                rtt = Math.round(((report as RTCIceCandidatePairStats).currentRoundTripTime ?? 0) * 1000);
              }
            });
            if (rtt !== null) patchPeer(peerId, { rttMs: rtt });
          })
          .catch(() => {});
      }
    }, 5000);
    return () => {
      if (speakTimerRef.current) window.clearInterval(speakTimerRef.current);
      if (statsTimerRef.current) window.clearInterval(statsTimerRef.current);
    };
  }, [patchPeer]);

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const internals: PeerInternals = {
        pc,
        cameraTrackIds: new Set(),
        screenTrackIds: new Set(),
        audioTrackId: null,
        iceRestarted: false,
        disconnectedSince: null,
        candidateCounts: { host: 0, srflx: 0, relay: 0 },
        reconnectedOnce: false,
      };
      pcsRef.current.set(peerId, internals);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          // Lacak tipe kandidat — inilah bukti apakah browser memakai
          // TURN (relay > 0) atau hanya STUN/lokal (relay = 0).
          const t = candidateTypeOf(e.candidate);
          if (t) {
            internals.candidateCounts[t] += 1;
            patchPeer(peerId, { candidates: { ...internals.candidateCounts } });
          }
          void sendSignalRef.current('ice', peerId, e.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        // Abaikan event dari koneksi lama yang sudah diganti (mis. saat
        // `reconnectPeer` menutup PC ini) — hanya PC aktif yang boleh
        // mengubah state peer.
        if (pcsRef.current.get(peerId)?.pc !== pc) return;
        patchPeer(peerId, { iceConnectionState: pc.iceConnectionState });
      };

      pc.onicegatheringstatechange = () => {
        if (pcsRef.current.get(peerId)?.pc !== pc) return;
        patchPeer(peerId, { iceGatheringState: pc.iceGatheringState });
      };

      pc.ontrack = (e) => {
        const track = e.track;
        const stream = e.streams[0] ?? new MediaStream([track]);
        if (track.kind === 'audio') {
          internals.audioTrackId = track.id;
          attachAnalyser(peerId, new MediaStream([track]));
          setPeers((prev) => {
            const cur = prev[peerId];
            if (!cur) return prev;
            const base = cur.stream ?? new MediaStream();
            if (!base.getAudioTracks().some((t) => t.id === track.id)) base.addTrack(track);
            return { ...prev, [peerId]: { ...cur, stream: base } };
          });
          return;
        }
        // Video: bedakan kamera vs layar. Track layar biasanya berlabel
        // screen/monitor/window, atau tiba setelah track kamera sudah ada.
        const looksScreen = /screen|monitor|window|display|layar/i.test(track.label || '');
        setPeers((prev) => {
          const cur = prev[peerId];
          if (!cur) return prev;
          const hasCameraVideo = (cur.stream?.getVideoTracks().length ?? 0) > 0;
          const isScreen = looksScreen || (hasCameraVideo && !internals.cameraTrackIds.has(track.id));
          if (isScreen) {
            internals.screenTrackIds.add(track.id);
            const screen = cur.screenStream ?? new MediaStream();
            if (!screen.getVideoTracks().some((t) => t.id === track.id)) screen.addTrack(track);
            return { ...prev, [peerId]: { ...cur, screenStream: screen } };
          }
          internals.cameraTrackIds.add(track.id);
          const base = cur.stream ?? new MediaStream();
          if (!base.getVideoTracks().some((t) => t.id === track.id)) base.addTrack(track);
          return { ...prev, [peerId]: { ...cur, stream: base, camOn: track.enabled } };
        });
        track.addEventListener('ended', () => {
          setPeers((prev) => {
            const cur = prev[peerId];
            if (!cur) return prev;
            if (internals.screenTrackIds.has(track.id)) {
              return { ...prev, [peerId]: { ...cur, screenStream: null } };
            }
            return { ...prev, [peerId]: { ...cur, stream: null, camOn: false } };
          });
        });
      };

      pc.onconnectionstatechange = () => {
        // Abaikan event dari koneksi lama yang sudah diganti (lihat
        // oniceconnectionstatechange) — mis. event 'closed' dari PC lama
        // tidak boleh menimpa state koneksi baru hasil `reconnectPeer`.
        if (pcsRef.current.get(peerId)?.pc !== pc) return;
        const state = pc.connectionState;
        patchPeer(peerId, { connectionState: state });
        if (state === 'disconnected') {
          // Catat awal putus — bila bertahan >15 detik, interval stats
          // menandai peer `failed` agar UI menjelaskan (bukan diam).
          if (internals.disconnectedSince === null) internals.disconnectedSince = Date.now();
          return;
        }
        if (state === 'failed') {
          internals.disconnectedSince = null;
          if (!internals.iceRestarted) {
            // Satu kali ICE restart + offer ulang (bila kita initiator).
            internals.iceRestarted = true;
            try {
              pc.restartIce();
            } catch {
              /* abaikan */
            }
            if (myPeerIdRef.current < peerId) {
              pc.createOffer({ iceRestart: true })
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => {
                  if (pc.localDescription) void sendSignalRef.current('offer', peerId, pc.localDescription.toJSON());
                })
                .catch(() => {});
            }
          } else if (!internals.reconnectedOnce) {
            // ICE restart sudah dicoba dan tetap gagal: buat ulang
            // koneksi dari nol SATU kali (ICE server terkini + offer baru).
            // Bila percobaan ini pun gagal, tandai `failed` dan berhenti
            // — tidak ada loop retry tanpa henti.
            internals.reconnectedOnce = true;
            reconnectPeerRef.current(peerId, { auto: true });
          } else {
            patchPeer(peerId, { failed: true });
          }
        }
        if (state === 'connected') {
          internals.disconnectedSince = null;
          internals.iceRestarted = false;
          // Episode gagal selesai — jatah retry otomatis pulih untuk
          // episode gagal berikutnya.
          internals.reconnectedOnce = false;
          patchPeer(peerId, { failed: false });
        }
        if (state === 'connecting') {
          internals.disconnectedSince = null;
        }
      };
      return pc;
    },
    [attachAnalyser, patchPeer]
  );

  /**
   * Kirim kandidat ICE yang tertahan dalam antrean ke koneksi peer.
   * Dipanggil segera setelah setRemoteDescription berhasil (offer/answer).
   */
  const flushPendingCandidates = useCallback(async (peerId: string) => {
    const internals = pcsRef.current.get(peerId);
    const queue = pendingCandidatesRef.current.get(peerId);
    if (!internals || !queue || queue.length === 0) return;
    pendingCandidatesRef.current.delete(peerId);
    for (const cand of queue) {
      try {
        await internals.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        /* kandidat basi — abaikan */
      }
    }
  }, []);

  const ensurePeer = useCallback(
    (peerId: string, displayName?: string, role?: string) => {
      const meta = peersMetaRef.current.get(peerId) ?? { displayName: displayName ?? peerId, role };
      if (displayName) meta.displayName = displayName;
      if (role) meta.role = role;
      peersMetaRef.current.set(peerId, meta);
      setPeers((prev) => {
        if (prev[peerId]) {
          return { ...prev, [peerId]: { ...prev[peerId], displayName: meta.displayName, role: meta.role } };
        }
        return {
          ...prev,
          [peerId]: {
            peerId,
            displayName: meta.displayName,
            role: meta.role,
            stream: null,
            screenStream: null,
            connectionState: 'new',
            rttMs: null,
            speaking: false,
            micOn: true,
            camOn: true,
            handRaised: false,
            failed: false,
            lastReaction: null,
            candidates: { host: 0, srflx: 0, relay: 0 },
            iceConnectionState: 'new',
            iceGatheringState: 'new',
          },
        };
      });
      let internals = pcsRef.current.get(peerId);
      if (!internals) {
        createPeerConnection(peerId);
        internals = pcsRef.current.get(peerId)!;
        // Tambahkan track lokal yang sudah ada ke koneksi baru.
        const local = localStreamRef.current;
        if (local) attachStreamToPc(internals.pc, local);
        const screen = localScreenRef.current;
        if (screen) {
          for (const track of screen.getTracks()) {
            try {
              const sender = internals.pc.addTrack(track, screen);
              screenSendersRef.current.push({ peerId, sender });
            } catch {
              /* abaikan */
            }
          }
        }
      }
      return internals.pc;
    },
    [attachStreamToPc, createPeerConnection]
  );

  /** Daftarkan peer yang ada di room; initiator (peerId lebih kecil) membuat offer. */
  const addPeer = useCallback(
    (peerId: string, displayName?: string, role?: string) => {
      if (peerId === myPeerIdRef.current) return;
      const pc = ensurePeer(peerId, displayName, role);
      if (myPeerIdRef.current < peerId && pc.signalingState === 'stable') {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) void sendSignalRef.current('offer', peerId, pc.localDescription.toJSON());
          })
          .catch(() => {});
      }
    },
    [ensurePeer]
  );

  /**
   * Putuskan RTCPeerConnection peer ini lalu buat ulang dari nol dengan
   * `iceServers` TERKINI (iceServersRef.current — mis. setelah konfigurasi
   * TURN selesai dimuat), tempelkan ulang track lokal + layar, dan kirim
   * offer baru bila kita initiator (aturan peerId lebih kecil, sama
   * seperti `addPeer`). Dipakai tombol "Hubungkan ulang" (manual) dan
   * retry otomatis 1x saat `connectionState` masuk `failed`.
   *
   * `opts.auto` menandai pemanggilan otomatis: jatah retry otomatis ikut
   * tercatat di koneksi baru agar tidak berulang tanpa henti. Pemanggilan
   * manual TIDAK menghanguskan jatah retry otomatis (bila belum terpakai,
   * koneksi baru tetap boleh retry otomatis 1x saat gagal lagi).
   */
  const reconnectPeer = useCallback(
    (peerId: string, opts?: { auto?: boolean }) => {
      if (peerId === myPeerIdRef.current) return;
      const old = pcsRef.current.get(peerId);
      if (!old || reconnectingRef.current.has(peerId)) return;
      reconnectingRef.current.add(peerId);
      // Jatah retry otomatis: terbawa dari koneksi lama, atau tercatat
      // bila pemanggilan ini memang otomatis.
      const carriedAuto = old.reconnectedOnce || opts?.auto === true;
      try {
        old.pc.close();
      } catch {
        /* abaikan */
      }
      screenSendersRef.current = screenSendersRef.current.filter((s) => s.peerId !== peerId);
      pcsRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
      analysersRef.current.delete(peerId);
      // Koneksi baru — createPeerConnection memakai iceServersRef.current
      // (ICE server terkini) dan me-nol-kan hitungan kandidat.
      const pc = createPeerConnection(peerId);
      const fresh = pcsRef.current.get(peerId);
      if (fresh) fresh.reconnectedOnce = carriedAuto;
      const local = localStreamRef.current;
      if (local) attachStreamToPc(pc, local);
      const screen = localScreenRef.current;
      if (screen) {
        for (const track of screen.getTracks()) {
          try {
            const sender = pc.addTrack(track, screen);
            screenSendersRef.current.push({ peerId, sender });
          } catch {
            /* abaikan */
          }
        }
      }
      // Stream lawan yang lama dibuang; status kembali seperti peer baru.
      setPeers((prev) => {
        const cur = prev[peerId];
        if (!cur) return prev;
        return {
          ...prev,
          [peerId]: {
            ...cur,
            stream: null,
            screenStream: null,
            connectionState: 'new',
            iceConnectionState: 'new',
            iceGatheringState: 'new',
            candidates: { host: 0, srflx: 0, relay: 0 },
            rttMs: null,
            failed: false,
          },
        };
      });
      if (myPeerIdRef.current < peerId) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) void sendSignalRef.current('offer', peerId, pc.localDescription.toJSON());
          })
          .catch(() => {})
          .finally(() => {
            reconnectingRef.current.delete(peerId);
          });
      } else {
        // Bukan initiator — lawan yang akan mengirim offer; lepas guard.
        reconnectingRef.current.delete(peerId);
      }
    },
    [attachStreamToPc, createPeerConnection]
  );
  reconnectPeerRef.current = reconnectPeer;

  const removePeer = useCallback((peerId: string) => {
    const internals = pcsRef.current.get(peerId);
    if (internals) {
      try {
        internals.pc.close();
      } catch {
        /* abaikan */
      }
      pcsRef.current.delete(peerId);
    }
    pendingCandidatesRef.current.delete(peerId);
    analysersRef.current.delete(peerId);
    peersMetaRef.current.delete(peerId);
    setPeers((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const handleSignal = useCallback(
    async (from: string, type: 'offer' | 'answer' | 'ice', data: unknown, fromDisplayName?: string) => {
      if (from === myPeerIdRef.current) return;
      if (type === 'ice') {
        if (!data) return;
        const candidate = data as RTCIceCandidateInit;
        // Kandidat bisa tiba SEBELUM offer/answer (POST tidak berurutan)
        // atau sebelum koneksi dibuat: buat koneksi dulu bila belum ada,
        // lalu ANTRE kandidatnya sampai remote description diset.
        // addIceCandidate tanpa remote description pasti melempar — dulu
        // kandidat seperti ini dibuang diam-diam dan pasangan ICE yang
        // dibutuhkannya tidak pernah terbentuk.
        let internals = pcsRef.current.get(from);
        if (!internals) {
          ensurePeer(from, fromDisplayName);
          internals = pcsRef.current.get(from);
        }
        if (!internals) return;
        if (!internals.pc.remoteDescription) {
          const queue = pendingCandidatesRef.current.get(from) ?? [];
          queue.push(candidate);
          pendingCandidatesRef.current.set(from, queue);
          return;
        }
        try {
          await internals.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* kandidat basi — abaikan */
        }
        return;
      }
      const pc = ensurePeer(from, fromDisplayName);
      if (type === 'offer') {
        const offer = data as RTCSessionDescriptionInit;
        // Glare: bila kita sedang punya local offer dan peerId kita LEBIH
        // BESAR (sisi sopan), rollback lalu terima offer lawan.
        if (pc.signalingState === 'have-local-offer' && myPeerIdRef.current > from) {
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch {
            /* abaikan */
          }
        } else if (pc.signalingState === 'have-local-offer' && myPeerIdRef.current < from) {
          // Kita initiator — abaikan offer ganda, lawan akan rollback.
          return;
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          // Remote description sudah diset — kandidat yang tertahan di
          // antrean kini bisa dipakai.
          await flushPendingCandidates(from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pc.localDescription) void sendSignalRef.current('answer', from, pc.localDescription.toJSON());
        } catch {
          patchPeer(from, { failed: true });
        }
        return;
      }
      if (type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
          await flushPendingCandidates(from);
        } catch {
          /* abaikan */
        }
      }
    },
    [ensurePeer, flushPendingCandidates, patchPeer]
  );

  // --- Media lokal ---
  const startMedia = useCallback(
    async (opts?: { audioDeviceId?: string; videoDeviceId?: string }) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setMediaState('failed');
        setMediaError('Browser ini tidak mendukung kamera/mikrofon. Coba browser modern (Chrome/Edge/Firefox) lewat HTTPS.');
        return null;
      }
      setMediaState('starting');
      setMediaError('');
      const audioConstraint = opts?.audioDeviceId ? { deviceId: { exact: opts.audioDeviceId } } : true;
      const videoConstraint = opts?.videoDeviceId
        ? { deviceId: { exact: opts.videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: videoConstraint });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicOn(stream.getAudioTracks()[0]?.enabled ?? true);
        setCamOn(stream.getVideoTracks()[0]?.enabled ?? true);
        setMediaState('ready');
        attachAnalyser('local', stream);
        // Tempelkan ke semua koneksi yang sudah ada.
        for (const [, internals] of pcsRef.current) {
          attachStreamToPc(internals.pc, stream);
        }
        return stream;
      } catch (err) {
        // Fallback jujur: coba audio saja bila video yang gagal.
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
          localStreamRef.current = audioOnly;
          setLocalStream(audioOnly);
          setMicOn(audioOnly.getAudioTracks()[0]?.enabled ?? true);
          setCamOn(false);
          setMediaState('audio-only');
          setMediaError('Kamera tidak bisa dipakai, jadi Anda bergabung dengan audio saja. Peserta lain tetap bisa mendengar Anda.');
          attachAnalyser('local', audioOnly);
          for (const [, internals] of pcsRef.current) {
            attachStreamToPc(internals.pc, audioOnly);
          }
          return audioOnly;
        } catch (err2) {
          setMediaState('failed');
          setMediaError(mediaErrorMessage(err2));
          return null;
        }
      }
    },
    [attachAnalyser, attachStreamToPc]
  );

  /** Gabung tanpa media sama sekali (hanya dengar/lihat orang lain). */
  const joinWithoutMedia = useCallback(() => {
    setMediaState('off');
    setMediaError('');
  }, []);

  const retryMedia = useCallback(async () => {
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
      setLocalStream(null);
    }
    return startMedia();
  }, [startMedia]);

  /** Ganti perangkat mic/kamera tanpa memutus koneksi (replaceTrack). */
  const switchDevices = useCallback(
    async (opts: { audioDeviceId?: string; videoDeviceId?: string }) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: opts.audioDeviceId ? { deviceId: { exact: opts.audioDeviceId } } : true,
        video: opts.videoDeviceId
          ? { deviceId: { exact: opts.videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const old = localStreamRef.current;
      for (const [, internals] of pcsRef.current) {
        attachStreamToPc(internals.pc, stream);
      }
      if (old) {
        for (const t of old.getTracks()) t.stop();
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(stream.getAudioTracks()[0]?.enabled ?? true);
      setCamOn(stream.getVideoTracks()[0]?.enabled ?? true);
      setMediaState('ready');
      setMediaError('');
      attachAnalyser('local', stream);
      return stream;
    },
    [attachAnalyser, attachStreamToPc]
  );

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return micOn;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    return track.enabled;
  }, [micOn]);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return camOn;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
    return track.enabled;
  }, [camOn]);

  const startScreenShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Browser ini tidak mendukung berbagi layar.');
    }
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    localScreenRef.current = screen;
    setLocalScreenStream(screen);
    setSharing(true);
    for (const [peerId, internals] of pcsRef.current) {
      for (const track of screen.getTracks()) {
        try {
          const sender = internals.pc.addTrack(track, screen);
          screenSendersRef.current.push({ peerId, sender });
        } catch {
          /* abaikan */
        }
      }
    }
    const videoTrack = screen.getVideoTracks()[0];
    videoTrack?.addEventListener('ended', () => {
      void stopScreenShareRef.current();
    });
    return screen;
  }, []);

  const stopScreenShare = useCallback(() => {
    const screen = localScreenRef.current;
    if (screen) {
      for (const t of screen.getTracks()) t.stop();
    }
    for (const { peerId, sender } of screenSendersRef.current) {
      const internals = pcsRef.current.get(peerId);
      if (internals) {
        try {
          internals.pc.removeTrack(sender);
        } catch {
          /* abaikan */
        }
      }
    }
    screenSendersRef.current = [];
    localScreenRef.current = null;
    setLocalScreenStream(null);
    setSharing(false);
  }, []);
  const stopScreenShareRef = useRef(stopScreenShare);
  stopScreenShareRef.current = stopScreenShare;

  const setPeerMediaState = useCallback(
    (peerId: string, state: { micOn?: boolean; camOn?: boolean }) => {
      patchPeer(peerId, state);
    },
    [patchPeer]
  );

  const setPeerHandRaised = useCallback(
    (peerId: string, raised: boolean) => {
      patchPeer(peerId, { handRaised: raised });
    },
    [patchPeer]
  );

  const setPeerReaction = useCallback(
    (peerId: string, emoji: string) => {
      patchPeer(peerId, { lastReaction: { emoji, at: Date.now() } });
      window.setTimeout(() => patchPeer(peerId, { lastReaction: null }), 3500);
    },
    [patchPeer]
  );

  // Bersihkan semuanya saat unmount.
  useEffect(() => {
    return () => {
      for (const [, internals] of pcsRef.current) {
        try {
          internals.pc.close();
        } catch {
          /* abaikan */
        }
      }
      pcsRef.current.clear();
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
      if (localScreenRef.current) {
        for (const t of localScreenRef.current.getTracks()) t.stop();
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    localStream,
    localScreenStream,
    micOn,
    camOn,
    sharing,
    mediaState,
    mediaError,
    peers,
    localSpeaking,
    startMedia,
    retryMedia,
    switchDevices,
    joinWithoutMedia,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    addPeer,
    removePeer,
    reconnectPeer,
    handleSignal,
    setPeerMediaState,
    setPeerHandRaised,
    setPeerReaction,
  };
}
