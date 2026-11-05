/** Label + warna badge untuk status dokumen E-Sign (dipakai di semua halaman E-Sign). */
export const ESIGN_STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draf', cls: 'badge-gray' },
  PENDING_APPROVAL: { label: 'Menunggu Persetujuan', cls: 'badge-amber' },
  PENDING_SIGNATURE: { label: 'Menunggu Tanda Tangan', cls: 'badge-blue' },
  PARTIALLY_SIGNED: { label: 'Sebagian Ditandatangani', cls: 'badge-blue' },
  SIGNED: { label: 'Ditandatangani', cls: 'badge-green' },
  COMPLETED: { label: 'Selesai', cls: 'badge-green' },
  REJECTED: { label: 'Ditolak', cls: 'badge-red' },
  CANCELLED: { label: 'Dibatalkan', cls: 'badge-red' },
  EXPIRED: { label: 'Kedaluwarsa', cls: 'badge-red' },
};

export const ESIGN_STATUS_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Semua' },
  { id: 'DRAFT', label: 'Draf' },
  { id: 'PENDING_SIGNATURE', label: 'Menunggu Tanda Tangan' },
  { id: 'PARTIALLY_SIGNED', label: 'Sebagian' },
  { id: 'SIGNED', label: 'Ditandatangani' },
  { id: 'COMPLETED', label: 'Selesai' },
  { id: 'REJECTED', label: 'Ditolak' },
  { id: 'CANCELLED', label: 'Dibatalkan' },
  { id: 'EXPIRED', label: 'Kedaluwarsa' },
];

/** Kategori dokumen yang umum (dipakai sebagai saran di form). */
export const ESIGN_CATEGORIES = [
  'Offering Letter',
  'Kontrak Kerja',
  'Surat Pengangkatan',
  'Surat Keputusan',
  'Surat Tugas',
  'Surat Perjanjian',
  'Surat Keterangan',
  'Surat Peringatan',
  'Surat Pengunduran Diri',
  'Dokumen Administrasi Lainnya',
];
