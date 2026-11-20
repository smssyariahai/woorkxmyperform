// Konfigurasi ICE server WOORK MEET (STUN + TURN opsional).
//
// Video WOORK MEET adalah WebRTC mesh P2P: dua peserta di jaringan berbeda
// hanya bisa tersambung bila ICE menemukan jalur. STUN saja TIDAK cukup
// untuk NAT simetris / CGNAT (mis. data seluler) — pasangan kandidat
// host/srflx gagal semua dan koneksi `failed`. Satu-satunya jalan untuk
// kasus itu adalah relay TURN (media diteruskan lewat server TURN).
//
// TIDAK ADA relay TURN bawaan di sini — tidak ada URL/kredensial TURN
// hardcode, tidak ada layanan gratis yang dipakai diam-diam. TURN hanya
// aktif bila admin mengonfigurasinya lewat environment (lihat di bawah);
// bila kosong, perilaku persis seperti sekarang (STUN Google saja).
//
// Variabel environment (diatur di `.env` server, lalu restart):
//   MEET_TURN_URLS        Daftar URL TURN dipisah koma, contoh:
//                         turn:turn.contoh.id:3478?transport=udp,turn:turn.contoh.id:3478?transport=tcp,turns:turn.contoh.id:5349
//   MEET_TURN_USERNAME    Username akun TURN.
//   MEET_TURN_CREDENTIAL  Password/kredensial akun TURN (rahasia — jangan
//                         pernah menulis nilainya di kode, chat, atau laporan).
// Ketiganya WAJIB terisi agar TURN dipakai. Bila salah satu kosong, TURN
// diabaikan dan hanya STUN yang dikembalikan (fail-safe, bukan error).
//
// Server TURN yang umum dipakai sendiri: coturn (open-source, bisa jalan
// di VPS dengan IP publik + port UDP 3478/5349). Server ini TIDAK bisa
// jalan di VM Muse (tidak ada IP publik/inbound + UDP diblokir) — pasang
// di VPS/PC server yang punya IP publik.

export const MEET_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface MeetIceConfig {
  iceServers: RTCIceServer[];
  /** true bila ada server TURN yang terkonfigurasi (relay tersedia). */
  turnConfigured: boolean;
}

/**
 * Susun daftar ICE server dari environment.
 * Selalu sertakan STUN Google (perilaku lama), lalu tambahkan SATU entri
 * TURN berisi semua URL bila MEET_TURN_URLS + USERNAME + CREDENTIAL terisi.
 */
export function getMeetIceServers(): MeetIceConfig {
  const iceServers: RTCIceServer[] = [...MEET_STUN_SERVERS];

  const urls = (process.env.MEET_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  const username = (process.env.MEET_TURN_USERNAME ?? '').trim();
  const credential = (process.env.MEET_TURN_CREDENTIAL ?? '').trim();

  if (urls.length > 0 && username && credential) {
    iceServers.push({ urls, username, credential });
    return { iceServers, turnConfigured: true };
  }
  return { iceServers, turnConfigured: false };
}
