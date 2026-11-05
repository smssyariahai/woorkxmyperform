import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent, type EsignEventType, type NotifyInput } from '@/lib/esign/notify';
import {
  ESIGN_REMINDER_DELAY_MS,
  ESIGN_REMINDER_DELAY_2_MS,
  ESIGN_RETRY_MAX,
  ESIGN_PROCESS_DUE_LIMIT,
  ESIGN_RETRY_WINDOW_MS,
  ESIGN_NO_PHONE_ERROR_MARKER,
} from '@/lib/esign/reminders';

export const dynamic = 'force-dynamic';

/**
 * POST /api/esign/process-due — cron tiap 5 menit (Fase 8):
 * (a) pengingat signer PENDING (reminder_1 24 jam setelah dikirim,
 *     reminder_2 24 jam setelah reminder_1 terkirim, maks 2x),
 * (b) expired sweeper (lewat expiresAt → EXPIRED + cabut token + audit +
 *     event + notifikasi ke signer PENDING + pembuat),
 * (c) retry notifikasi FAILED (maks 5x, lewati error permanen tanpa nomor
 *     HP, maks 20 per tick).
 * Diamankan dengan CRON_SECRET (header x-cron-secret), pola sama seperti
 * POST /api/campaigns/process-due. Idempotent — aman dijalankan tiap 5 menit.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return apiErr('CRON_SECRET belum dikonfigurasi di server.', 500);
    if (req.headers.get('x-cron-secret') !== secret) return apiErr('Unauthorized.', 401);

    const now = new Date();
    let reminded = 0;
    let expired = 0;
    let retried = 0;

    // ---- (a) Pengingat ----
    const dueDocs = await prisma.esignDocument.findMany({
      where: { status: { in: ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'] } },
      select: { id: true },
    });
    for (const doc of dueDocs) {
      const signers = await prisma.esignSigner.findMany({
        where: { documentId: doc.id, signingStatus: 'PENDING' },
        select: { id: true },
      });
      for (const s of signers) {
        // Kapan dokumen dikirim ke signer ini? Baris 'sent' hanya ada bila
        // gilirannya sudah tiba (sequential) — tanpa baris itu, jangan ingatkan.
        const sent = await prisma.esignNotification.findFirst({
          where: { documentId: doc.id, signerId: s.id, eventType: 'sent' },
          select: { sentAt: true, createdAt: true },
        });
        if (!sent) continue;
        const sentAt = sent.sentAt ?? sent.createdAt;

        const r1 = await prisma.esignNotification.findFirst({
          where: { documentId: doc.id, signerId: s.id, eventType: 'reminder_1' },
          select: { deliveryStatus: true, sentAt: true },
        });
        if (!r1) {
          if (now.getTime() - sentAt.getTime() >= ESIGN_REMINDER_DELAY_MS) {
            const res = await notifyEsignEvent({
              documentId: doc.id,
              eventType: 'reminder_1',
              onlySignerId: s.id,
            });
            if (res.attempted > 0) reminded++;
          }
          continue;
        }
        // Pengingat ke-2 hanya bila ke-1 sudah SENT (bila FAILED, retry
        // ditangani bagian (c); setelah 5x gagal, pengingat berhenti).
        if (r1.deliveryStatus === 'SENT' && r1.sentAt) {
          const r2 = await prisma.esignNotification.findFirst({
            where: { documentId: doc.id, signerId: s.id, eventType: 'reminder_2' },
            select: { id: true },
          });
          if (!r2 && now.getTime() - r1.sentAt.getTime() >= ESIGN_REMINDER_DELAY_2_MS) {
            const res = await notifyEsignEvent({
              documentId: doc.id,
              eventType: 'reminder_2',
              onlySignerId: s.id,
            });
            if (res.attempted > 0) reminded++;
          }
        }
      }
    }

    // ---- (b) Expired sweeper ----
    const expiring = await prisma.esignDocument.findMany({
      where: {
        status: { in: ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED', 'PENDING_APPROVAL'] },
        expiresAt: { lte: now },
      },
      select: { id: true, organizationId: true, title: true, documentNumber: true },
    });
    for (const doc of expiring) {
      await prisma.$transaction(async (tx) => {
        await tx.esignDocument.update({
          where: { id: doc.id },
          data: { status: 'EXPIRED' },
        });
        await tx.esignSigner.updateMany({
          where: { documentId: doc.id },
          data: { accessToken: null, tokenExpiresAt: null },
        });
      });
      await esignAudit({
        organizationId: doc.organizationId,
        documentId: doc.id,
        userId: null,
        action: 'EXPIRE_ESIGN_DOCUMENT',
        description: `Dokumen "${doc.title}" (${doc.documentNumber}) melewati tanggal kedaluwarsa — status EXPIRED, token akses dicabut.`,
        metadata: {},
      });
      publishEsignEvent(doc.organizationId, 'esign:document:expired', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        status: 'EXPIRED',
      });
      void notifyEsignEvent({ documentId: doc.id, eventType: 'expired' }).catch((e) =>
        console.error('[esign-process-due] expired gagal:', (e as Error).message)
      );
      expired++;
    }

    // ---- (c) Retry notifikasi FAILED ----
    const failed = await prisma.esignNotification.findMany({
      where: {
        deliveryStatus: 'FAILED',
        retryCount: { lt: ESIGN_RETRY_MAX },
        createdAt: { gte: new Date(now.getTime() - ESIGN_RETRY_WINDOW_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: ESIGN_PROCESS_DUE_LIMIT,
      select: { id: true, documentId: true, signerId: true, eventType: true, error: true },
    });
    for (const row of failed) {
      // Error permanen (tanpa nomor HP) tidak akan pernah berhasil — lewati.
      if (row.error?.includes(ESIGN_NO_PHONE_ERROR_MARKER)) continue;
      const eventType = row.eventType as EsignEventType;
      const input: NotifyInput = {
        documentId: row.documentId,
        eventType,
        skipInApp: true,
        skipFinalPdf: true,
      };
      if (
        eventType === 'sent' ||
        eventType === 'reminder' ||
        eventType === 'reminder_1' ||
        eventType === 'reminder_2'
      ) {
        if (!row.signerId) continue; // baris tanpa signer tidak bisa ditargetkan
        input.onlySignerId = row.signerId;
      } else if (
        eventType === 'signed' ||
        eventType === 'rejected' ||
        eventType === 'approval_completed'
      ) {
        input.actorSignerId = row.signerId;
      }
      // 'completed' / 'cancelled' / 'expired': resolve ulang semua penerima;
      // yang sudah SENT dilewati klaim idempotency.
      const res = await notifyEsignEvent(input);
      if (res.attempted > 0) retried++;
    }

    return apiOk({ reminded, expired, retried });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses pengingat E-Sign.', 500);
  }
}
