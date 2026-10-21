'use client';

export const AGENT_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  IDLE: { label: 'Siaga', cls: 'badge', dot: 'bg-slate-400' },
  WORKING: { label: 'Bekerja', cls: 'badge-blue', dot: 'bg-blue-500' },
  TYPING: { label: 'Mengetik', cls: 'badge-blue', dot: 'bg-blue-500' },
  THINKING: { label: 'Berpikir', cls: 'badge-blue', dot: 'bg-purple-500' },
  READING: { label: 'Membaca', cls: 'badge-amber', dot: 'bg-amber-500' },
  COMMUNICATING: { label: 'Berkomunikasi', cls: 'badge-green', dot: 'bg-teal-500' },
  EXECUTING_TASK: { label: 'Menjalankan tugas', cls: 'badge-blue', dot: 'bg-blue-500 animate-pulse' },
  WAITING_APPROVAL: { label: 'Menunggu persetujuan', cls: 'badge-amber', dot: 'bg-amber-500 animate-pulse' },
  COMPLETED: { label: 'Selesai', cls: 'badge-green', dot: 'bg-green-500' },
  ERROR: { label: 'Kendala', cls: 'badge-red', dot: 'bg-red-500' },
};

export const TASK_STATUS_META: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: 'Antre', cls: 'badge' },
  RUNNING: { label: 'Berjalan', cls: 'badge-blue' },
  WAITING_APPROVAL: { label: 'Butuh persetujuan', cls: 'badge-amber' },
  COMPLETED: { label: 'Selesai', cls: 'badge-green' },
  FAILED: { label: 'Gagal', cls: 'badge-red' },
  CANCELLED: { label: 'Dibatalkan', cls: 'badge' },
};

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/** Ubah error fetch teknis menjadi pesan yang bisa ditindaklanjuti user. */
export function friendlyFetchError(e: any, fallback: string) {
  const msg = String(e?.message || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Koneksi ke server terputus sesaat. Periksa koneksi internet Anda, tunggu beberapa detik, lalu coba lagi.';
  }
  return msg || fallback;
}
