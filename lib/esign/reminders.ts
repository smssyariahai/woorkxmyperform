/**
 * Aturan pengingat + retry notifikasi E-Sign (Fase 8).
 * Dipakai `POST /api/esign/process-due` (cron tiap 5 menit) dan ditampilkan
 * read-only di halaman Pengaturan E-Sign.
 */

/** Jeda pengingat pertama setelah dokumen dikirim ke penandatangan. */
export const ESIGN_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000; // 24 jam

/** Jeda pengingat kedua setelah pengingat pertama berhasil terkirim. */
export const ESIGN_REMINDER_DELAY_2_MS = 24 * 60 * 60 * 1000; // 24 jam

/** Maksimal pengingat per penandatangan (reminder_1 + reminder_2). */
export const ESIGN_REMINDER_MAX = 2;

/** Nama event pengingat — dibedakan agar unique [documentId, signerId, eventType] tidak memblokir pengingat ke-2. */
export const ESIGN_REMINDER_EVENT_TYPES = ['reminder_1', 'reminder_2'] as const;

/** Maksimal percobaan ulang notifikasi berstatus FAILED. */
export const ESIGN_RETRY_MAX = 5;

/** Maksimal notifikasi FAILED yang dicoba ulang dalam satu tick cron. */
export const ESIGN_PROCESS_DUE_LIMIT = 20;

/** Hanya retry notifikasi FAILED yang dibuat dalam jendela ini (hindari retry abadi untuk data lama). */
export const ESIGN_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

/** Penanda error permanen: penerima tidak punya nomor HP — retry WA tidak akan pernah berhasil. */
export const ESIGN_NO_PHONE_ERROR_MARKER = 'tidak memiliki nomor HP';
