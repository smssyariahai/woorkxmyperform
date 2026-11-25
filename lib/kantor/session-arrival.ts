// Penanda kedatangan peserta sesi kantor (Fase 8 program 3.0).
//
// Gap yang diperbaiki: engine salat/briefing tidak pernah menulis
// `arrivedAt` maupun menaikkan status peserta (INVITED → WALKING/PRAYING
// atau INVITED → MOVING/SEATED) — peserta langsung INVITED → COMPLETED
// saat sesi berakhir. Kolom `arrivedAt` ada di schema sejak awal, tapi
// tidak ada penulisnya.
//
// Perbaikan (jujur): saat snapshot `/api/kantor/office` pertama kali
// menempatkan agent di musala / ruang meeting, helper ini dipanggil dan
// mengisi `arrivedAt` + menaikkan status untuk peserta yang
// `arrivedAt`-nya masih NULL. Yang dicatat adalah saat server pertama
// kali menempatkan agent di ruangan sesi — bukan klaim animasi jalan 3D
// sudah selesai. Idempotent (hanya baris NULL yang disentuh) dan aman
// dipanggil tiap snapshot selama sesi berjalan.
//
// Pemicu kedua (keputusan user 2026-11-24): `startPrayerSession` dan
// `startBriefingSession` memanggil helper ini SAAT SESI DIMULAI
// (arrivedAt = waktu mulai sesi), supaya kedatangan tercatat meski tidak
// ada browser yang membuka /kantor selama sesi. Karena idempotent,
// pemanggilan snapshot sesudahnya menghasilkan 0 baris.
//
// Dipakai oleh: app/api/kantor/office/route.ts, lib/kantor/prayer-session.ts,
// lib/kantor/briefing-session.ts.
// Diuji oleh: scripts/verify-fase8-arrived.ts.
//
// Tipe client dibuat struktural (hanya `updateMany` yang dipakai) karena
// route kantor memakai Proxy `prisma` dari lib/db.ts yang bertipe
// legacy PrismaClient, sementara skrip uji memakai tenant client asli —
// keduanya punya delegate yang sama secara runtime.
type ArrivalDelegate = {
  updateMany(args: {
    where: { sessionId: string; status: { not: string }; arrivedAt: null };
    data: { arrivedAt: Date; status: string };
  }): Promise<{ count: number }>;
};

type TenantClient = {
  prayerSessionParticipant: ArrivalDelegate;
  briefingParticipant: ArrivalDelegate;
};

/**
 * Tandai kedatangan peserta salat yang baru ditempatkan di musala.
 * Mengembalikan jumlah baris yang diubah.
 */
export async function markPrayerArrivals(
  prisma: TenantClient,
  sessionId: string,
  now = new Date(),
): Promise<number> {
  const r = await prisma.prayerSessionParticipant.updateMany({
    where: { sessionId, status: { not: 'SKIPPED' }, arrivedAt: null },
    data: { arrivedAt: now, status: 'PRAYING' },
  });
  return r.count;
}

/**
 * Tandai kedatangan peserta briefing yang baru ditempatkan di ruang meeting.
 * Mengembalikan jumlah baris yang diubah.
 */
export async function markBriefingArrivals(
  prisma: TenantClient,
  sessionId: string,
  now = new Date(),
): Promise<number> {
  const r = await prisma.briefingParticipant.updateMany({
    where: { sessionId, status: { not: 'SKIPPED' }, arrivedAt: null },
    data: { arrivedAt: now, status: 'SEATED' },
  });
  return r.count;
}
