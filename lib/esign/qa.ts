import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/wa/phone';
import { esignSignLink } from './links';

/**
 * Q&A E-Sign deterministik untuk WhatsApp AI-Agent (Fase 7).
 *
 * Dipanggil dari maybeAiReply SEBELUM reserveCredit / panggil 9Router:
 * jawaban faktual dari DB, tanpa LLM, TANPA potong kredit.
 *
 * LARANGAN KERAS (brief §12):
 * - Jangan pernah mengklaim dokumen sudah ditandatangani tanpa cek DB.
 * - Jangan menandatangani atas nama user, jangan memakai tanda tangan
 *   tersimpan, jangan mengonfirmasi tanda tangan atas nama user.
 * - Semua status di bawah ini dibaca langsung dari database.
 *
 * Perlindungan percakapan pelanggan: kata 'dokumen' saja (tanpa kata
 * kunci E-Sign yang kuat) hanya dijawab bila nomor pengirim cocok dengan
 * User (staf). Bila tidak cocok, kembalikan null agar pesan jatuh kembali
 * ke alur AI biasa — pelanggan yang bertanya soal dokumen layanan tidak
 * boleh dibajak oleh cabang ini.
 */

export interface EsignQaIncoming {
  phone: string | null;
  waLid: string | null;
  text: string;
}

const STRONG_KEYWORDS = [
  'esign',
  'e-sign',
  'e sign',
  'tanda tangan',
  'tandatangan',
  'ttd',
  'menandatangani',
  'ditandatangani',
];

/** "sudah selesai / sudah tanda tangan / sudah ttd" — klaim selesai. */
const DONE_CLAIM_RE = /sudah\s+(selesai|menandatangani|tanda tangan|tandatangan|ttd)/;

type Intent = 'strong' | 'weak' | 'done' | null;

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (DONE_CLAIM_RE.test(t)) return 'done';
  if (STRONG_KEYWORDS.some((k) => t.includes(k))) return 'strong';
  if (t.includes('dokumen')) return 'weak';
  return null;
}

async function findUserByPhone(
  orgId: string,
  phone: string | null
): Promise<{ id: string; name: string; phone: string | null } | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  const users = await prisma.user.findMany({
    where: { memberships: { some: { organizationId: orgId, status: 'ACTIVE' } } },
    select: { id: true, name: true, phone: true },
  });
  return users.find((u) => normalizePhone(u.phone) === target) ?? null;
}

const SIGNABLE_STATUS = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

/**
 * Mengembalikan balasan E-Sign, atau null bila pesan bukan intent E-Sign
 * (pemanggil melanjutkan ke alur AI berbayar seperti biasa).
 */
export async function getEsignQaReply(
  orgId: string,
  msg: EsignQaIncoming
): Promise<string | null> {
  const intent = detectIntent(msg.text);
  if (!intent) return null;

  const user = await findUserByPhone(orgId, msg.phone);
  if (!user) {
    // Kata kunci lemah ('dokumen' saja) dari non-pengguna: bukan urusan
    // E-Sign — serahkan ke AI biasa.
    if (intent === 'weak') return null;
    return (
      'Nomor WhatsApp ini belum terdaftar sebagai pengguna di sistem kami, ' +
      'jadi saya tidak bisa memeriksa dokumen atas nama Anda. ' +
      'Silakan hubungi HRD untuk memastikan nomor Anda terdaftar.'
    );
  }

  const pending = await prisma.esignSigner.findMany({
    where: {
      userId: user.id,
      signingStatus: 'PENDING',
      document: { organizationId: orgId, status: { in: SIGNABLE_STATUS } },
    },
    select: {
      id: true,
      accessToken: true,
      document: {
        select: { title: true, documentNumber: true, status: true, createdAt: true },
      },
    },
    orderBy: { document: { createdAt: 'asc' } },
    take: 5,
  });

  const recentSigned = await prisma.esignSigner.findMany({
    where: {
      userId: user.id,
      signingStatus: 'SIGNED',
      document: { organizationId: orgId },
    },
    select: {
      signedAt: true,
      document: { select: { title: true, documentNumber: true, status: true } },
    },
    orderBy: { signedAt: 'desc' },
    take: 3,
  });

  const formatPending = (): string =>
    pending
      .map((s, i) => {
        const link = esignSignLink(s.accessToken);
        return (
          `${i + 1}. ${s.document.title} (${s.document.documentNumber})` +
          (link ? `\n   ${link}` : '\n   (tautan tidak tersedia — hubungi HRD)')
        );
      })
      .join('\n');

  const formatRecent = (): string =>
    recentSigned
      .map(
        (s) =>
          `• ${s.document.title} (${s.document.documentNumber}) — sudah ditandatangani` +
          (s.signedAt
            ? ` pada ${s.signedAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
            : '')
      )
      .join('\n');

  // Klaim "sudah selesai" — JANGAN percaya pengakuan user, cek DB.
  if (intent === 'done') {
    if (pending.length > 0) {
      return (
        'Dokumen masih menunggu proses tanda tangan melalui halaman E-Sign. ' +
        'Silakan selesaikan proses tersebut terlebih dahulu:\n' +
        formatPending()
      );
    }
    if (recentSigned.length > 0) {
      return (
        'Terima kasih, dokumen sudah berhasil ditandatangani dan tersimpan di sistem:\n' +
        formatRecent()
      );
    }
    return 'Tidak ada dokumen yang menunggu tanda tangan Anda saat ini.';
  }

  if (pending.length > 0) {
    return (
      `Saat ini ada ${pending.length} dokumen yang menunggu tanda tangan Anda:\n` +
      formatPending() +
      '\n\nSilakan buka tautan di atas untuk memeriksa isi dokumen sebelum menandatanganinya.'
    );
  }

  let reply = 'Tidak ada dokumen yang menunggu tanda tangan Anda saat ini.';
  if (recentSigned.length > 0) {
    reply += '\n\nTerakhir Anda menandatangani:\n' + formatRecent();
  }
  return reply;
}
