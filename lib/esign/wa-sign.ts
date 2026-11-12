import { prisma } from '@/lib/db';
import { findUserByPhone } from './qa';
import { isSignerTurn } from './workflow';
import { executeSign, SignError } from './sign-service';
import { requirePermissionForUser } from '@/lib/auth-helpers';
import { ESIGN_APP_URL } from './links';

/**
 * Tanda tangan via WhatsApp AI-Agent.
 *
 * Alur percakapan (state machine, satu sesi aktif per user per org):
 *   user: "ok, saya ttd"
 *   bot : (1 dokumen) minta PIN / (>1 dokumen) daftar bernomor
 *   user: (bila >1) kirim nomor dokumen → bot minta PIN
 *   user: kirim PIN (4–12 digit)
 *   bot : konfirmasi — dokumen tertandatangani (tanda tangan tersimpan)
 *
 * Keamanan:
 * - PIN WAJIB sebelum tanda tangan; verifikasi memakai verifyPin yang
 *   sama dengan web (lockout 5 gagal/15 mnt, hitungan kegagalan bersama).
 * - Otorisasi tanpa sesi via requirePermissionForUser (membership aktif
 *   + ESIGN_SIGN + modul esign + trial, di organisasi pemilik dokumen).
 * - Pesan PIN masuk diredaksi dari ConversationMessage setelah diproses
 *   (lihat redactPinMessage). PIN tidak pernah di-echo di balasan mana pun.
 * - Cabang ini TANPA potong kredit (seperti Q&A E-Sign) — pemanggil di
 *   ai-responder.ts menanganinya sebelum reserveCredit.
 *
 * Batasan yang masih ada: pesan PIN sempat tersimpan + disiarkan realtime
 * ke room inbox SEBELUM redaksi (manager menyimpan + publish dulu, bot
 * jalan sesudahnya). Redaksi hanya mengubah isi di DB; pesan yang sudah
 * tampil di layar tidak bisa ditarik kembali.
 */

export interface EsignWaSignIncoming {
  conversationId: string;
  phone: string | null;
  waLid: string | null;
  text: string;
  /** Id baris ConversationMessage pesan masuk (untuk redaksi PIN). */
  messageId?: string;
}

/** Masa berlaku sesi percakapan tanda tangan. */
export const WA_SIGN_SESSION_TTL_MS = 15 * 60 * 1000;

/** Isi pengganti pesan PIN setelah diproses. */
export const PIN_REDACTED_BODY = '[PIN — dihapus otomatis demi keamanan]';

const SIGNABLE = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

const SIGN_KEYWORDS = ['ttd', 'tanda tangan', 'tandatangan', 'menandatangani'];
const ACTION_MARKERS = ['saya', 'aku', 'mau', 'ok', 'oke', 'ya', 'baik', 'siap', 'setuju', 'tolong', 'bisa'];
const QUESTION_MARKERS = ['?', 'apakah', 'bagaimana', 'status', 'kapan', 'cek'];
const DONE_CLAIM_RE = /sudah\s+(saya\s+|aku\s+)?(selesai|menandatangani|tanda tangan|tandatangan|ttd)/;
const CANCEL_RE = /\b(batal|cancel|gak jadi|tidak jadi|nggak jadi)\b/;
const PIN_RE = /^\d{4,12}$/;

/**
 * Klasifikasi intent tanda tangan dari satu pesan.
 * SIGN  = user menyatakan mau menandatangani ("ok, saya ttd").
 * CANCEL = user membatalkan ("batal", "gak jadi").
 * null  = bukan intent ini — klaim selesai ("sudah ttd"), pertanyaan
 *         ("apakah dokumen saya sudah ditandatangani?"), atau pesan lain.
 *         null diserahkan ke cabang berikutnya (Q&A / AI biasa).
 */
export function detectSignIntent(text: string): 'SIGN' | 'CANCEL' | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  if (CANCEL_RE.test(t)) return 'CANCEL';
  if (DONE_CLAIM_RE.test(t)) return null; // klaim selesai → urusan Q&A (cek DB)
  if (QUESTION_MARKERS.some((k) => t.includes(k))) return null;
  if (!SIGN_KEYWORDS.some((k) => t.includes(k))) return null;
  // Pesan pendek yang hanya berisi kata kunci, mis. "ttd".
  if (/^(ttd|tanda tangan|tandatangan|menandatangani)[!.]?$/.test(t)) return 'SIGN';
  // Kata kunci + penanda aksi ("saya ttd", "ok, saya ttd", "mau tanda tangan").
  if (ACTION_MARKERS.some((k) => new RegExp(`\\b${k}\\b`).test(t))) return 'SIGN';
  return null;
}

interface PendingDoc {
  signerId: string;
  documentId: string;
  title: string;
  documentNumber: string;
}

/**
 * Dokumen yang sedang menunggu tanda tangan user di org ini: signer
 * PENDING + dokumen SIGNABLE + token masih berlaku + dokumen belum
 * kedaluwarsa + gilirannya sudah tiba (SEQUENTIAL: grup PENDING
 * terkecil; PARALLEL: semua PENDING).
 */
async function findPendingSignableDocs(userId: string, orgId: string): Promise<PendingDoc[]> {
  const now = new Date();
  const signers = await prisma.esignSigner.findMany({
    where: {
      userId,
      signingStatus: 'PENDING',
      accessToken: { not: null },
      tokenExpiresAt: { gt: now },
      document: {
        organizationId: orgId,
        status: { in: SIGNABLE },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    },
    select: {
      id: true,
      signingOrder: true,
      signingGroup: true,
      signingStatus: true,
      document: {
        select: {
          id: true,
          title: true,
          documentNumber: true,
          workflowType: true,
          signers: { select: { signingOrder: true, signingGroup: true, signingStatus: true } },
        },
      },
    },
    orderBy: { document: { createdAt: 'asc' } },
  });
  return signers
    .filter((s) => isSignerTurn(s.document.workflowType, s, s.document.signers))
    .map((s) => ({
      signerId: s.id,
      documentId: s.document.id,
      title: s.document.title,
      documentNumber: s.document.documentNumber,
    }));
}

/** Prasyarat tanda tangan via WA: PIN sudah diatur + tanda tangan tersimpan. */
async function checkSignPrereqs(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await prisma.esignProfile.findUnique({
    where: { userId },
    select: { pinHash: true, signaturePath: true },
  });
  if (!profile?.pinHash) {
    return {
      ok: false,
      message:
        `Anda belum mengatur PIN tanda tangan. Silakan atur PIN terlebih dahulu di Pengaturan E-Sign ` +
        `(${ESIGN_APP_URL}/esign/settings), lalu kirim "saya ttd" lagi.`,
    };
  }
  if (!profile?.signaturePath) {
    return {
      ok: false,
      message:
        `Anda belum memiliki tanda tangan tersimpan. Silakan simpan tanda tangan Anda terlebih dahulu di ` +
        `Pengaturan E-Sign (${ESIGN_APP_URL}/esign/settings), lalu kirim "saya ttd" lagi.`,
    };
  }
  return { ok: true };
}

async function upsertSession(input: {
  userId: string;
  organizationId: string;
  conversationId: string;
  documentId: string | null;
  signerId: string | null;
  state: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + WA_SIGN_SESSION_TTL_MS);
  await prisma.esignWaSignSession.upsert({
    where: { userId_organizationId: { userId: input.userId, organizationId: input.organizationId } },
    update: {
      conversationId: input.conversationId,
      documentId: input.documentId,
      signerId: input.signerId,
      state: input.state,
      expiresAt,
    },
    create: {
      userId: input.userId,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      documentId: input.documentId,
      signerId: input.signerId,
      state: input.state,
      expiresAt,
    },
  });
}

async function deleteSession(userId: string, organizationId: string): Promise<void> {
  await prisma.esignWaSignSession
    .deleteMany({ where: { userId, organizationId } })
    .catch(() => {});
}

/**
 * Redaksi pesan PIN: ganti isi baris ConversationMessage dengan penanda,
 * HANYA bila isinya persis PIN yang baru diproses. Dipanggil setelah PIN
 * diproses (berhasil maupun gagal) agar PIN tidak menetap di riwayat chat.
 */
async function redactPinMessage(messageId: string | undefined, pin: string): Promise<void> {
  if (!messageId) return;
  try {
    const m = await prisma.conversationMessage.findUnique({
      where: { id: messageId },
      select: { body: true },
    });
    if (m && m.body.trim() === pin) {
      await prisma.conversationMessage.update({
        where: { id: messageId },
        data: { body: PIN_REDACTED_BODY },
      });
    }
  } catch {}
}

function askPinMessage(doc: PendingDoc): string {
  return (
    `Dokumen: "${doc.title}" (${doc.documentNumber})\n\n` +
    `Silakan kirim PIN tanda tangan Anda (4–12 digit). PIN tidak akan saya tampilkan kembali, ` +
    `dan sebaiknya hapus pesan PIN Anda di WhatsApp setelah ini.`
  );
}

function listDocsMessage(docs: PendingDoc[]): string {
  const lines = docs.map((d, i) => `${i + 1}. ${d.title} (${d.documentNumber})`).join('\n');
  return (
    `Anda memiliki ${docs.length} dokumen yang menunggu tanda tangan:\n${lines}\n\n` +
    `Balas dengan nomor dokumen yang ingin Anda tanda tangani, atau 'batal'.`
  );
}

function signedMessage(doc: PendingDoc, documentStatus: string): string {
  const title = `"${doc.title}" (${doc.documentNumber})`;
  if (documentStatus === 'COMPLETED') {
    return (
      `Dokumen ${title} berhasil ditandatangani. Status: selesai — seluruh pihak sudah menandatangani.\n\n` +
      `PDF final sudah tersedia di halaman E-Sign.`
    );
  }
  if (documentStatus === 'PARTIALLY_SIGNED') {
    return (
      `Dokumen ${title} berhasil ditandatangani. Status: sebagian penandatangan sudah selesai — ` +
      `masih ada penandatangan lain yang belum selesai.\n\n` +
      `PDF final akan tersedia di halaman E-Sign setelah seluruh pihak menandatangani.`
    );
  }
  return (
    `Dokumen ${title} berhasil ditandatangani. Status: seluruh penandatangan selesai.\n\n` +
    `PDF final sudah tersedia di halaman E-Sign.`
  );
}

/** Ambil pesan dari Response apiErr yang dilempar (throw apiErr(...)). */
async function responseMessage(e: unknown): Promise<string | null> {
  try {
    const j = await (e as Response).json();
    return typeof j?.message === 'string' ? j.message : null;
  } catch {
    return null;
  }
}

/**
 * Tangani satu pesan masuk WA untuk alur tanda tangan E-Sign.
 * Mengembalikan teks balasan, atau null bila pesan bukan bagian alur ini
 * (pemanggil melanjutkan ke cabang berikutnya: Q&A / AI biasa).
 */
export async function handleEsignWaSign(orgId: string, msg: EsignWaSignIncoming): Promise<string | null> {
  const text = msg.text.trim();
  if (!text) return null;
  const intent = detectSignIntent(text);
  const user = await findUserByPhone(orgId, msg.phone).catch(() => null);

  // Muat sesi aktif (bila user dikenal). Sesi kedaluwarsa dihapus malas.
  let session: Awaited<ReturnType<typeof prisma.esignWaSignSession.findFirst>> = null;
  let expiredSession = false;
  if (user) {
    session = await prisma.esignWaSignSession
      .findFirst({ where: { userId: user.id, organizationId: orgId } })
      .catch(() => null);
    if (session && session.expiresAt.getTime() <= Date.now()) {
      await deleteSession(user.id, orgId);
      session = null;
      expiredSession = true;
    }
  }

  // Pembatalan berlaku kapan saja selama ada sesi aktif.
  if (intent === 'CANCEL') {
    if (!session || !user) return null;
    await deleteSession(user.id, orgId);
    return 'Baik, proses tanda tangan dibatalkan. Kirim "saya ttd" lagi bila Anda ingin memulai kembali.';
  }

  if (session && user) {
    if (session.state === 'AWAITING_DOC') {
      const n = /^\d+$/.test(text) ? parseInt(text, 10) : null;
      const docs = await findPendingSignableDocs(user.id, orgId);
      if (docs.length === 0) {
        await deleteSession(user.id, orgId);
        return 'Tidak ada dokumen yang menunggu tanda tangan Anda saat ini.';
      }
      if (n == null || n < 1 || n > docs.length) {
        const lines = docs.map((d, i) => `${i + 1}. ${d.title} (${d.documentNumber})`).join('\n');
        return (
          `Nomor yang Anda kirim tidak ada dalam daftar. Silakan balas dengan nomor 1–${docs.length}:\n${lines}\n\n` +
          `Atau kirim 'batal' untuk membatalkan.`
        );
      }
      const chosen = docs[n - 1];
      const gate = await checkSignPrereqs(user.id);
      if (!gate.ok) {
        await deleteSession(user.id, orgId);
        return gate.message;
      }
      await upsertSession({
        userId: user.id,
        organizationId: orgId,
        conversationId: msg.conversationId,
        documentId: chosen.documentId,
        signerId: chosen.signerId,
        state: 'AWAITING_PIN',
      });
      return askPinMessage(chosen);
    }

    if (session.state === 'AWAITING_PIN') {
      if (!PIN_RE.test(text)) {
        return 'PIN harus 4–12 digit angka, silakan kirim ulang PIN Anda.';
      }
      const pin = text;
      const docRow = await prisma.esignDocument
        .findUnique({
          where: { id: session.documentId ?? '' },
          select: { title: true, documentNumber: true },
        })
        .catch(() => null);
      const docLabel: PendingDoc = {
        signerId: session.signerId ?? '',
        documentId: session.documentId ?? '',
        title: docRow?.title ?? 'Dokumen',
        documentNumber: docRow?.documentNumber ?? '',
      };
      try {
        await requirePermissionForUser(user.id, 'ESIGN_SIGN', orgId);
        const result = await executeSign({
          documentId: session.documentId ?? '',
          signerId: session.signerId ?? '',
          userId: user.id,
          organizationId: orgId,
          pin,
          deviceInfo: 'WhatsApp AI-Agent',
        });
        await redactPinMessage(msg.messageId, pin);
        await deleteSession(user.id, orgId);
        return signedMessage(docLabel, result.documentStatus);
      } catch (e: any) {
        await redactPinMessage(msg.messageId, pin);
        if (e instanceof Response) {
          return (
            (await responseMessage(e)) ??
            'Anda tidak memiliki akses untuk menandatangani dokumen ini.'
          );
        }
        if (e instanceof SignError) {
          if (e.status === 401 || e.status === 429) {
            // PIN salah / terkunci / terlalu banyak percobaan — sesi tetap,
            // user boleh mencoba lagi (lockout PIN dari verifyPin berlaku).
            return e.message;
          }
          await deleteSession(user.id, orgId);
          return e.message;
        }
        console.error('[esign-wa-sign] gagal:', e?.message ?? e);
        return 'Terjadi kesalahan saat memproses tanda tangan. Silakan coba lagi dengan mengirim "saya ttd".';
      }
    }

    // State tak dikenal — hapus sesi agar tidak macet.
    await deleteSession(user.id, orgId);
  }

  // Tanpa sesi aktif: hanya intent SIGN yang ditangani di sini.
  if (intent !== 'SIGN') {
    if (expiredSession && /^\d+$/.test(text)) {
      return 'Sesi tanda tangan Anda sudah berakhir (15 menit). Silakan kirim "saya ttd" lagi untuk memulai.';
    }
    return null;
  }
  if (!user) {
    return (
      'Nomor WhatsApp ini belum terdaftar sebagai pengguna di sistem kami, ' +
      'jadi saya tidak bisa memproses tanda tangan atas nama Anda. ' +
      'Silakan hubungi HRD untuk memastikan nomor Anda terdaftar.'
    );
  }
  const docs = await findPendingSignableDocs(user.id, orgId);
  if (docs.length === 0) {
    return 'Tidak ada dokumen yang menunggu tanda tangan Anda saat ini.';
  }
  if (docs.length === 1) {
    const gate = await checkSignPrereqs(user.id);
    if (!gate.ok) return gate.message;
    await upsertSession({
      userId: user.id,
      organizationId: orgId,
      conversationId: msg.conversationId,
      documentId: docs[0].documentId,
      signerId: docs[0].signerId,
      state: 'AWAITING_PIN',
    });
    return askPinMessage(docs[0]);
  }
  await upsertSession({
    userId: user.id,
    organizationId: orgId,
    conversationId: msg.conversationId,
    documentId: null,
    signerId: null,
    state: 'AWAITING_DOC',
  });
  return listDocsMessage(docs);
}
