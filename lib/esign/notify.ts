import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { prisma } from '@/lib/db';
import { isSignerTurn } from './workflow';
import { esignSignLink } from './links';
// lib/wa/manager dimuat MALAS (dynamic import di fungsi yang mengirim)
// agar modul E-Sign bisa diuji/diimpor tanpa memuat Baileys:
// whatsapp-rust-bridge hanya mengekspor kondisi "import", sehingga
// static import dari tsx/CJS gagal resolve. Perilaku di Next.js sama
// (modul yang sama, di-cache setelah pemuatan pertama).

/**
 * Notifikasi E-Sign via WhatsApp + in-app (Fase 7).
 *
 * Prinsip:
 * - Best-effort: kegagalan kirim TIDAK PERNAH menggagalkan/mengembalikan
 *   transaksi dokumen (tanda tangan / status). Pemanggil memakai
 *   `void notifyEsignEvent(...).catch(...)` setelah transaksi sukses.
 * - Idempotency: satu baris EsignNotification per (documentId, signerId,
 *   eventType) — bila sudah SENT, jangan kirim ulang; bila FAILED, boleh
 *   retry (cron Fase 8) dengan retryCount naik. Klaim PENDING yang macet
 *   >10 menit dianggap basi dan boleh dicoba lagi.
 * - Signer tanpa nomor HP: WA dilewati (FAILED + error jelas), notifikasi
 *   in-app tetap dibuat.
 * - Notifikasi WA outbound via sendText langsung TIDAK memotong kredit
 *   (kredit Rp500 hanya dipakai jalur maybeAiReply).
 */

export type EsignEventType =
  | 'sent'
  | 'signed'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'approval_completed'
  | 'reminder'
  | 'reminder_1'
  | 'reminder_2';

/** Klaim PENDING yang macet lebih lama dari ini boleh dicoba lagi. */
const STALE_PENDING_MS = 10 * 60 * 1000;

type DocWithRelations = Awaited<
  ReturnType<typeof prisma.esignDocument.findUnique>
> & {
  signers: Array<{
    id: string;
    userId: string;
    signerName: string;
    signerPhone: string | null;
    signerPosition: string | null;
    signingOrder: number;
    signingStatus: string;
    accessToken: string | null;
    user: { id: string; name: string; phone: string | null };
  }>;
  createdBy: { id: string; name: string; phone: string | null };
};

interface Recipient {
  userId: string;
  /** Kunci klaim idempotency: id signer penerima, atau id signer pemicu (untuk event ke pembuat). */
  signerId: string | null;
  phone: string | null;
  name: string;
  /** Token akses penerima (untuk tautan sign); null bila bukan signer / token dicabut. */
  token: string | null;
}

function toRecipient(s: DocWithRelations['signers'][number]): Recipient {
  return {
    userId: s.userId,
    signerId: s.id,
    phone: s.signerPhone ?? s.user.phone ?? null,
    name: s.signerName,
    token: s.accessToken,
  };
}

function toCreator(doc: DocWithRelations, claimSignerId: string | null): Recipient {
  return {
    userId: doc.createdBy.id,
    signerId: claimSignerId,
    phone: doc.createdBy.phone ?? null,
    name: doc.createdBy.name,
    token: null,
  };
}

/** Tentukan penerima tiap event. */
function resolveRecipients(
  doc: DocWithRelations,
  input: NotifyInput
): Recipient[] {
  const signers = doc.signers;
  switch (input.eventType) {
    case 'sent':
      // Sequential: hanya yang gilirannya tiba. Parallel: semua yang PENDING.
      return signers
        .filter((s) => isSignerTurn(doc.workflowType, s, signers))
        .map(toRecipient);
    case 'signed':
    case 'rejected':
    case 'approval_completed':
      return [toCreator(doc, input.actorSignerId ?? null)];
    case 'completed': {
      const list = signers.map(toRecipient);
      const creator = toCreator(doc, null);
      // Pembuat yang juga penandatangan cukup dapat satu (sebagai signer).
      if (!list.some((r) => r.userId === creator.userId)) list.push(creator);
      return list;
    }
    case 'cancelled':
      return signers
        .filter((s) => s.signingStatus === 'PENDING')
        .map(toRecipient);
    case 'expired': {
      // Signer yang belum sign + pembuat dokumen (Fase 8: process-due).
      const list = signers
        .filter((s) => s.signingStatus === 'PENDING')
        .map(toRecipient);
      const creator = toCreator(doc, null);
      if (!list.some((r) => r.userId === creator.userId)) list.push(creator);
      return list;
    }
    case 'reminder':
    case 'reminder_1':
    case 'reminder_2': {
      const list = input.onlySignerId
        ? signers.filter((s) => s.id === input.onlySignerId)
        : signers;
      return list
        .filter((s) => s.signingStatus === 'PENDING')
        .map(toRecipient);
    }
  }
}

function buildMessage(
  eventType: EsignEventType,
  doc: DocWithRelations,
  rec: Recipient,
  input: NotifyInput
): string {
  const title = `"${doc.title}" (${doc.documentNumber})`;
  const link = esignSignLink(rec.token);
  const linkBlock = link
    ? `Tautan akses pribadi Anda:\n${link}`
    : 'Tautan akses tidak tersedia — silakan hubungi HRD atau pembuat dokumen.';
  const actorName =
    input.actorName ??
    (input.actorSignerId
      ? doc.signers.find((s) => s.id === input.actorSignerId)?.signerName ?? null
      : null);
  const actorPosition =
    input.actorSignerId
      ? doc.signers.find((s) => s.id === input.actorSignerId)?.signerPosition ?? null
      : null;
  const actorLabel = actorName
    ? `${actorName}${actorPosition ? ` (${actorPosition})` : ''}`
    : 'penandatangan';

  switch (eventType) {
    case 'sent':
      return (
        `Assalamu'alaikum Wr. Wb.\n\n` +
        `Yth. Bapak/Ibu ${rec.name},\n\n` +
        `Terdapat dokumen baru yang membutuhkan tanda tangan Anda.\n\n` +
        `Nama Dokumen: ${doc.title}\n` +
        `Nomor Dokumen: ${doc.documentNumber}\n` +
        `Pengirim: ${doc.createdBy.name}\n\n` +
        `Silakan periksa dokumen melalui tautan akses pribadi berikut:\n${link ?? '-'}\n\n` +
        `Mohon periksa isi dokumen sebelum melakukan tanda tangan.\n\n` +
        `Terima kasih.`
      );
    case 'reminder':
    case 'reminder_1':
    case 'reminder_2':
      return (
        `Selamat pagi, Bapak/Ibu ${rec.name}.\n\n` +
        `Kami ingin mengingatkan bahwa dokumen ${title} masih menunggu tanda tangan Anda.\n\n` +
        `${linkBlock}\n\n` +
        `Terima kasih.`
      );
    case 'signed':
      return (
        `Dokumen ${title} telah ditandatangani oleh ${actorLabel}. ` +
        `Status: ${input.partial ? 'sebagian penandatangan sudah selesai' : 'seluruh pihak selesai'}.`
      );
    case 'rejected':
      return (
        `Dokumen ${title} ditolak oleh ${actorLabel}.` +
        (input.reason ? ` Alasan: ${input.reason}` : '')
      );
    case 'approval_completed':
      return (
        `Dokumen ${title} telah disetujui oleh ${actorName ?? 'pemberi persetujuan'} ` +
        `dan lanjut ke tahap tanda tangan.`
      );
    case 'completed':
      return (
        `Seluruh pihak telah menyelesaikan tanda tangan dokumen ${title}. ` +
        `Dokumen final dapat diunduh melalui website HRD.`
      );
    case 'cancelled':
      return (
        `Dokumen ${title} telah dibatalkan oleh ${doc.createdBy.name}. ` +
        `Anda tidak perlu menandatanganinya.`
      );
    case 'expired':
      return (
        `Dokumen ${title} telah melewati tanggal kedaluwarsa ` +
        `dan tidak dapat ditandatangani lagi.`
      );
  }
}

function inAppTitleBody(
  eventType: EsignEventType,
  doc: DocWithRelations,
  input: NotifyInput
): { title: string; body: string } {
  const title = `"${doc.title}" (${doc.documentNumber})`;
  const actorName =
    input.actorName ??
    (input.actorSignerId
      ? doc.signers.find((s) => s.id === input.actorSignerId)?.signerName ?? null
      : null);
  switch (eventType) {
    case 'sent':
      return {
        title: 'Dokumen menunggu tanda tangan Anda',
        body: `${title} — buka tautan dari WhatsApp atau halaman E-Sign.`,
      };
    case 'reminder':
    case 'reminder_1':
    case 'reminder_2':
      return {
        title: 'Pengingat tanda tangan',
        body: `${title} masih menunggu tanda tangan Anda.`,
      };
    case 'signed':
      return {
        title: 'Dokumen ditandatangani',
        body: `${actorName ?? 'Penandatangan'} menandatangani ${title}.`,
      };
    case 'rejected':
      return {
        title: 'Dokumen ditolak',
        body: `${actorName ?? 'Penandatangan'} menolak ${title}.` +
          (input.reason ? ` Alasan: ${input.reason}` : ''),
      };
    case 'approval_completed':
      return {
        title: 'Dokumen disetujui',
        body: `${actorName ?? 'Pemberi persetujuan'} menyetujui ${title} — lanjut ke tahap tanda tangan.`,
      };
    case 'completed':
      return {
        title: 'Dokumen selesai ditandatangani',
        body: `Seluruh pihak menyelesaikan ${title}. Dokumen final dapat diunduh.`,
      };
    case 'cancelled':
      return { title: 'Dokumen dibatalkan', body: `${title} dibatalkan.` };
    case 'expired':
      return { title: 'Dokumen kedaluwarsa', body: `${title} melewati tanggal kedaluwarsa.` };
  }
}

/**
 * Klaim baris EsignNotification untuk (documentId, signerId, eventType).
 * Mengembalikan { row, isRetry } bila pengiriman boleh dilakukan, atau null
 * bila sudah SENT / sedang dikirim proses lain (PENDING segar).
 * isRetry=true bila baris sudah ada dari percobaan gagal sebelumnya — pemanggil
 * memakai ini agar tidak membuat notifikasi in-app duplikat saat retry.
 */
async function claimNotification(
  documentId: string,
  signerId: string | null,
  recipientId: string,
  eventType: EsignEventType
) {
  const where = { documentId, signerId, eventType };
  const existing = await prisma.esignNotification.findFirst({ where });
  if (existing) {
    if (existing.deliveryStatus === 'SENT') return null;
    if (
      existing.deliveryStatus === 'PENDING' &&
      Date.now() - existing.createdAt.getTime() < STALE_PENDING_MS
    ) {
      return null; // sedang dikirim proses lain — jangan ganda
    }
    return { row: existing, isRetry: true }; // FAILED atau PENDING macet -> boleh retry
  }
  try {
    const created = await prisma.esignNotification.create({
      data: {
        documentId,
        signerId,
        recipientId,
        channel: 'WHATSAPP',
        eventType,
        deliveryStatus: 'PENDING',
      },
    });
    return { row: created, isRetry: false };
  } catch (e: any) {
    if (e?.code !== 'P2002') throw e;
    // Balapan dengan proses lain: baca ulang dan terapkan aturan yang sama.
    const raced = await prisma.esignNotification.findFirst({ where });
    if (!raced || raced.deliveryStatus === 'SENT') return null;
    if (
      raced.deliveryStatus === 'PENDING' &&
      Date.now() - raced.createdAt.getTime() < STALE_PENDING_MS
    ) {
      return null;
    }
    return { row: raced, isRetry: true };
  }
}

async function createInAppNotification(
  doc: DocWithRelations,
  rec: Recipient,
  eventType: EsignEventType,
  input: NotifyInput
): Promise<void> {
  const { title, body } = inAppTitleBody(eventType, doc, input);
  await prisma.notification.create({
    data: {
      organizationId: doc.organizationId,
      userId: rec.userId,
      type: 'ESIGN',
      title,
      body,
    },
  });
}

/** Kirim PDF final ke pembuat (opsional, best-effort, hanya event completed). */
async function sendFinalPdfToCreator(doc: DocWithRelations): Promise<void> {
  if (!doc.finalFilePath) return;
  const phone = doc.createdBy.phone ?? null;
  if (!phone) return;
  const safe = doc.finalFilePath.split('/').pop()!.split('\\').pop()!;
  const full = join(process.cwd(), 'uploads', 'esign', 'final', safe);
  if (!existsSync(full)) return;
  const buf = await readFile(full);
  const fileName = `${doc.documentNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}-final.pdf`;
  const { sendDocument } = await import('@/lib/wa/manager');
  const res = await sendDocument(
    doc.organizationId,
    phone,
    buf,
    fileName,
    `Dokumen final "${doc.title}" (${doc.documentNumber}) — seluruh pihak telah menandatangani.`
  );
  if (!res.ok) {
    console.error('[esign-notify] kirim PDF final gagal:', res.error);
  }
}

export interface NotifyInput {
  documentId: string;
  eventType: EsignEventType;
  /** Signer pemicu event (yang baru sign/reject) — dipakai sebagai kunci klaim + nama di pesan. */
  actorSignerId?: string | null;
  /** Nama pemicu bila bukan signer (mis. approver). */
  actorName?: string | null;
  /** Alasan penolakan (event rejected). */
  reason?: string | null;
  /** Untuk reminder: hanya kirim ke signer ini (dipakai cron Fase 8). */
  onlySignerId?: string | null;
  /** Untuk event signed: true bila masih ada signer PENDING. */
  partial?: boolean;
  /** Retry cron (Fase 8): jangan buat notifikasi in-app baru (sudah dibuat saat percobaan pertama). */
  skipInApp?: boolean;
  /** Retry cron (Fase 8): jangan kirim ulang PDF final (sudah dikirim saat event completed pertama). */
  skipFinalPdf?: boolean;
}

export interface NotifyResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Kirim notifikasi satu event E-Sign (WA + in-app). Best-effort: fungsi ini
 * tidak pernah melempar — semua kegagalan dicatat di EsignNotification /
 * log dan dihitung di hasil. Status dokumen tidak disentuh di sini.
 */
export async function notifyEsignEvent(input: NotifyInput): Promise<NotifyResult> {
  const counts: NotifyResult = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    const doc = (await prisma.esignDocument.findUnique({
      where: { id: input.documentId },
      include: {
        signers: {
          include: { user: { select: { id: true, name: true, phone: true } } },
          orderBy: { signingOrder: 'asc' },
        },
        createdBy: { select: { id: true, name: true, phone: true } },
      },
    })) as DocWithRelations | null;
    if (!doc) {
      console.error('[esign-notify] dokumen tidak ditemukan:', input.documentId);
      return counts;
    }

    const recipients = resolveRecipients(doc, input);
    const { sendText } = await import('@/lib/wa/manager');
    for (const rec of recipients) {
      counts.attempted++;
      const claim = await claimNotification(
        doc.id,
        rec.signerId,
        rec.userId,
        input.eventType
      ).catch((e) => {
        console.error('[esign-notify] klaim gagal:', (e as Error).message);
        return null;
      });
      if (!claim) {
        counts.skipped++;
        continue;
      }

      // Notifikasi in-app untuk pihak relevan (dibuat bila klaim lolos
      // dan ini BUKAN retry — retry tidak membuat duplikat). Retry cron
      // (skipInApp) tidak membuat yang baru — sudah ada dari percobaan pertama.
      if (!input.skipInApp && !claim.isRetry) {
        await createInAppNotification(doc, rec, input.eventType, input).catch((e) =>
          console.error('[esign-notify] notifikasi in-app gagal:', (e as Error).message)
        );
      }

      const text = buildMessage(input.eventType, doc, rec, input);
      if (!rec.phone) {
        await prisma.esignNotification
          .update({
            where: { id: claim.row.id },
            data: {
              deliveryStatus: 'FAILED',
              error:
                'Penerima tidak memiliki nomor HP — notifikasi WhatsApp dilewati (hanya notifikasi in-app).',
              retryCount: claim.row.retryCount + 1,
            },
          })
          .catch(() => {});
        counts.failed++;
        continue;
      }

      const res = await sendText(
        doc.organizationId,
        { phone: rec.phone, waLid: null },
        text
      );
      if (res.ok) {
        await prisma.esignNotification
          .update({
            where: { id: claim.row.id },
            data: {
              deliveryStatus: 'SENT',
              sentAt: new Date(),
              waMessageId: res.messageId ?? null,
              error: null,
            },
          })
          .catch(() => {});
        counts.sent++;
      } else {
        await prisma.esignNotification
          .update({
            where: { id: claim.row.id },
            data: {
              deliveryStatus: 'FAILED',
              error: res.error ?? 'Gagal mengirim via WhatsApp.',
              retryCount: claim.row.retryCount + 1,
            },
          })
          .catch(() => {});
        counts.failed++;
      }
    }

    if (input.eventType === 'completed' && !input.skipFinalPdf) {
      await sendFinalPdfToCreator(doc).catch((e) =>
        console.error('[esign-notify] kirim PDF final gagal:', (e as Error).message)
      );
    }

    return counts;
  } catch (e) {
    console.error('[esign-notify] gagal total:', (e as Error).message);
    return counts;
  }
}
