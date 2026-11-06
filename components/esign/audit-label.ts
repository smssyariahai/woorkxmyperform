import { ESIGN_STATUS_META } from './status';

/**
 * Label pendek berbahasa Indonesia untuk kode aksi audit E-Sign,
 * plus ringkasan singkat dari metadata JSON.
 * Dipakai di halaman detail dokumen & halaman Riwayat Aktivitas.
 * Aturan: hanya info yang dimengerti manusia — tanpa ID, hash, atau nama file internal.
 */
export const ESIGN_ACTION_LABELS: Record<string, string> = {
  CREATE_ESIGN_DOCUMENT: 'Dokumen dibuat',
  UPDATE_ESIGN_DOCUMENT: 'Dokumen diperbarui',
  DELETE_ESIGN_DOCUMENT: 'Dokumen dihapus',
  UPLOAD_ESIGN_DOCUMENT: 'PDF diunggah',
  ADD_ESIGN_SIGNER: 'Penandatangan ditambahkan',
  UPDATE_ESIGN_SIGNER: 'Penandatangan diperbarui',
  REMOVE_ESIGN_SIGNER: 'Penandatangan dihapus',
  SEND_ESIGN_DOCUMENT: 'Dokumen dikirim',
  APPROVE_ESIGN_DOCUMENT: 'Persetujuan diberikan',
  REJECT_ESIGN_APPROVAL: 'Persetujuan ditolak',
  SIGN_ESIGN_DOCUMENT: 'Dokumen ditandatangani',
  REJECT_ESIGN_DOCUMENT: 'Dokumen ditolak',
  CANCEL_ESIGN_DOCUMENT: 'Dokumen dibatalkan',
  FINALIZE_ESIGN_DOCUMENT: 'PDF final dibuat',
  VIEW_ESIGN_DOCUMENT: 'Dokumen dilihat',
  EXPIRE_ESIGN_DOCUMENT: 'Dokumen kedaluwarsa',
  SET_ESIGN_PIN: 'PIN diatur',
  UPDATE_ESIGN_PIN: 'PIN diubah',
  UPDATE_ESIGN_SIGNATURE: 'Tanda tangan diperbarui',
};

const FIELD_LABELS: Record<string, string> = {
  showSignerName: 'nama',
  showSignerPosition: 'jabatan',
  showSignedDate: 'tanggal',
  showDocRef: 'no. referensi',
};

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

const statusLabel = (code?: string | null) =>
  code ? ESIGN_STATUS_META[code]?.label ?? null : null;

/** Keterangan singkat dari metadata JSON audit log — string kosong bila tak ada info berguna. */
export function auditSummary(raw?: string | null): string {
  if (!raw || raw === '{}') return '';
  let m: any = {};
  try {
    m = JSON.parse(raw);
  } catch {
    return '';
  }
  const parts: string[] = [];
  if (typeof m.signerName === 'string' && m.signerName) parts.push(m.signerName);
  if (typeof m.signingOrder === 'number') parts.push(`urutan ${m.signingOrder}`);
  if (typeof m.reason === 'string' && m.reason) parts.push(`alasan: ${short(m.reason)}`);
  if (typeof m.signerCount === 'number') parts.push(`${m.signerCount} penandatangan`);
  const st = statusLabel(m.status) ?? statusLabel(m.documentStatus);
  if (st) parts.push(`status: ${st}`);
  const from = statusLabel(m.fromStatus);
  if (from) parts.push(`dari ${from}`);
  if (typeof m.fileSize === 'number') parts.push(`${Math.max(1, Math.round(m.fileSize / 1024))} KB`);
  if (typeof m.documentNumber === 'string' && m.documentNumber) parts.push(m.documentNumber);
  if (m.regenerated) parts.push('dibuat ulang');
  if (Array.isArray(m.changedFields) && m.changedFields.length) {
    const names = m.changedFields.map((f: string) => FIELD_LABELS[f] ?? f).slice(0, 3);
    parts.push(`diubah: ${names.join(', ')}${m.changedFields.length > 3 ? '…' : ''}`);
  }
  return parts.join(' · ');
}
