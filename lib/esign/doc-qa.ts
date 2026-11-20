import { prisma } from '@/lib/db';
import { findUserByPhone } from './qa';
import { extractAndStoreDocumentText } from './extract-text';
import { ESIGN_APP_URL } from './links';

/**
 * Jawab isi dokumen E-Sign via WhatsApp AI-Agent (ringkasan / tanya isi).
 *
 * Alur: user bertanya ("ringkas dokumen PKWT Andi Wijaya", "apa isi
 * dokumen ini?", "itu dokumen apa ya?") → cabang ini menyelesaikan dokumen
 * yang dimaksud (hanya yang user adalah signer ATAU creator-nya, di org
 * nomor WA ini) → pastikan teks dokumen terekstrak (on-demand bila masih
 * NULL) → kembalikan outcome untuk diproses pemanggil (ai-responder.ts):
 *   - { kind: 'reply', text }  : jawaban deterministik, TANPA LLM,
 *     tanpa potong kredit (tidak ditemukan / daftar pilihan / tanpa teks /
 *     deskripsi dokumen — "itu dokumen apa ya?").
 *   - { kind: 'llm', ... }     : butuh LLM (grounding teks dokumen) —
 *     pemanggil WAJIB reserveCredit DULU, baru panggil model, lalu
 *     finalizeCharge setelah kirim sukses / refundCredit bila gagal.
 *   - null                     : bukan intent ini — lanjut ke cabang
 *     berikutnya (Q&A status / AI biasa).
 *
 * Keamanan/privasi:
 * - Jangan pernah menjawab isi dokumen yang user bukan signer/creator-nya;
 *   nomor dokumen yang disebut tapi bukan milik user dijawab "tidak
 *   ditemukan" (tanpa membocorkan keberadaannya).
 * - Daftar pilihan hanya berisi dokumen milik user itu sendiri.
 * - Teks dokumen utuh TIDAK PERNAH dikirim ke WA — hanya ringkasan/
 *   jawaban model (maks. ~8000 karakter konteks).
 */

export interface EsignDocQaIncoming {
  phone: string | null;
  waLid: string | null;
  text: string;
}

export type DocQaOutcome =
  | null
  | { kind: 'reply'; text: string }
  | {
      kind: 'llm';
      docTitle: string;
      documentNumber: string;
      question: string;
      /** Teks dokumen untuk konteks model (dipotong 8000 karakter). */
      text: string;
      truncated: boolean;
    };

/** Potongan teks dokumen yang dikirim sebagai konteks ke model. */
export const DOC_QA_CONTEXT_CHARS = 8000;
/** Batas dokumen yang ditampilkan saat daftar pilihan. */
const LIST_LIMIT = 5;

const CONTENT_KEYWORDS = [
  'ringkas',
  'ringkasan',
  'rangkum',
  'jelaskan',
  'apa isi',
  'isi dokumen',
  'isi surat',
  'isi kontrak',
  'poin penting',
  'pasal',
  'sebutkan',
];

const DOC_ANCHORS = ['dokumen', 'esign', 'e-sign', 'e sign', 'kontrak', 'surat'];

/**
 * Intent "dokumen ini apa": user bertanya dulu sebelum memutuskan
 * menandatangani ("itu dokumen apa ya?", "dokumen ini buat apa?").
 * Butuh frasa tanya-deskripsi + penanda dokumen ("itu"/"ini" saja cukup
 * bila frasanya sudah menyebut dokumen). Dijawab deterministik dari
 * deskripsi + cuplikan isi PDF (describeDoc) — TANPA LLM, tanpa kredit.
 */
const DESCRIBE_PHRASES = [
  'dokumen apa',
  'apa itu',
  'deskripsi',
  'tentang',
  'buat apa',
  'untuk apa',
  'isinya',
  'isi dokumen',
  'maksud dokumen',
  'maksudnya',
];

export function detectDescribeIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (!DESCRIBE_PHRASES.some((k) => t.includes(k))) return false;
  return DOC_ANCHORS.some((k) => t.includes(k)) || t.includes('itu') || t.includes('ini');
}

const DOC_NUMBER_RE = /ESIGN\/\d{4}\/\d+/i;

/** Kata yang diabaikan saat mengambil kata kunci judul dari pesan. */
const STOPWORDS = new Set([
  'ringkas', 'ringkasan', 'rangkum', 'jelaskan', 'sebutkan', 'apa', 'isi',
  'dokumen', 'esign', 'surat', 'kontrak', 'poin', 'penting', 'pasal',
  'saya', 'tolong', 'mohon', 'yang', 'dan', 'ini', 'itu', 'dari', 'untuk',
  'dengan', 'tentang', 'bagaimana', 'berapa', 'kapan', 'nya', 'di', 'ke',
  'punya', 'atau', 'adalah', 'ada', 'tidak', 'bisa', 'dong', 'ya', 'kak',
  'pak', 'bu', 'mas', 'mbak', 'nomor', 'judul', 'file', 'pdf', 'milik',
  'saya', 'aku', 'gue', 'tersebut', 'nya',
]);

/**
 * Intent ringkasan/isi: ada kata tanya-isi DAN (penanda dokumen ATAU
 * nomor dokumen ESIGN/…). BUKAN intent status ("apakah sudah
 * ditandatangani?" tidak mengandung kata isi) dan BUKAN intent tanda
 * tangan ("saya ttd" tidak mengandung kata isi) — keduanya ditangani
 * cabang lain (3a/3b).
 */
export function detectDocQaIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (!CONTENT_KEYWORDS.some((k) => t.includes(k))) return false;
  if (DOC_NUMBER_RE.test(t)) return true;
  return DOC_ANCHORS.some((k) => t.includes(k));
}

interface AccessibleDoc {
  id: string;
  title: string;
  category: string;
  description: string | null;
  documentNumber: string;
  status: string;
  originalFilePath: string | null;
  extractedText: string | null;
  createdAt: Date;
}

/** Dokumen yang boleh ditanya user ini: ia signer (status apa pun) atau creator. */
async function findAccessibleDocs(userId: string, orgId: string): Promise<AccessibleDoc[]> {
  return prisma.esignDocument.findMany({
    where: {
      organizationId: orgId,
      OR: [{ signers: { some: { userId } } }, { createdById: userId }],
    },
    select: {
      id: true,
      title: true,
      category: true,
      description: true,
      documentNumber: true,
      status: true,
      originalFilePath: true,
      extractedText: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

function extractTitleKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

function formatDocList(docs: AccessibleDoc[]): string {
  return docs
    .map((d, i) => `${i + 1}. ${d.title} (${d.documentNumber})`)
    .join('\n');
}

function notFoundMessage(query: string): string {
  return (
    `Saya tidak menemukan dokumen ${query ? `"${query}" ` : ''}yang terkait dengan Anda. ` +
    `Pastikan nomor atau judul dokumennya benar, dan dokumen itu memang ditujukan kepada Anda atau dibuat oleh Anda.`
  );
}

function pickListMessage(docs: AccessibleDoc[], describe = false): string {
  return (
    `Saya menemukan beberapa dokumen yang cocok:\n${formatDocList(docs)}\n\n` +
    (describe
      ? `Balas dengan menyebutkan nomor dokumennya, misalnya: "dokumen apa ${docs[0].documentNumber}?"`
      : `Balas dengan menyebutkan nomor dokumennya, misalnya: "ringkas ${docs[0].documentNumber}".`)
  );
}

/**
 * Pastikan teks dokumen tersedia: pakai yang tersimpan, atau ekstrak
 * on-demand bila masih NULL. Kembalikan null bila dokumen tidak punya
 * file / file tidak ditemukan.
 */
async function ensureText(doc: AccessibleDoc): Promise<string | null> {
  if (doc.extractedText !== null) return doc.extractedText;
  const res = await extractAndStoreDocumentText(doc.id).catch(() => null);
  return res ? res.text : null;
}

export function buildDocQaMessages(o: Extract<DocQaOutcome, { kind: 'llm' }>): Array<{
  role: string;
  content: string;
}> {
  return [
    {
      role: 'system',
      content:
        'Kamu adalah asisten yang menjawab pertanyaan tentang isi sebuah dokumen. ' +
        'Jawab HANYA berdasarkan teks dokumen yang diberikan. Bila jawaban tidak ada di dalam teks, ' +
        'katakan dengan jujur bahwa informasi itu tidak ada di dalam dokumen. ' +
        'Jangan menambah fakta di luar teks, jangan mengarang. ' +
        'Jawab dalam Bahasa Indonesia, ringkas dan jelas.',
    },
    {
      role: 'user',
      content:
        `TEKS DOKUMEN "${o.docTitle}" (${o.documentNumber}):\n---\n${o.text}\n---\n\n` +
        `PERTANYAAN: ${o.question}\n\n` +
        `Jawab hanya berdasarkan teks di atas. Bila tidak ada di teks, katakan tidak ada.`,
    },
  ];
}

/**
 * Selesaikan pertanyaan isi dokumen menjadi outcome (lihat header file).
 * Mengembalikan null bila pesan bukan intent ini.
 */
export async function getEsignDocQaReply(
  orgId: string,
  msg: EsignDocQaIncoming
): Promise<DocQaOutcome> {
  const question = msg.text.trim();
  if (!question) return null;
  const isDescribe = detectDescribeIntent(question);
  if (!detectDocQaIntent(question) && !isDescribe) return null;

  const user = await findUserByPhone(orgId, msg.phone).catch(() => null);
  if (!user) {
    return {
      kind: 'reply',
      text:
        'Nomor WhatsApp ini belum terdaftar sebagai pengguna di sistem kami, ' +
        'jadi saya tidak bisa memeriksa isi dokumen atas nama Anda. ' +
        'Silakan hubungi HRD untuk memastikan nomor Anda terdaftar.',
    };
  }

  const docs = await findAccessibleDocs(user.id, orgId);
  const lower = question.toLowerCase();

  // 1. Nomor dokumen disebut persis (ESIGN/2026/…).
  const numMatch = question.match(DOC_NUMBER_RE);
  if (numMatch) {
    const num = numMatch[0].toUpperCase();
    const doc = docs.find((d) => d.documentNumber.toUpperCase() === num);
    if (!doc) return { kind: 'reply', text: notFoundMessage(num) };
    return answerForDoc(doc, question, isDescribe);
  }

  // 2. Cocokkan kata kunci judul (+ kategori) dengan dokumen milik user.
  const keywords = extractTitleKeywords(question);
  if (keywords.length > 0 && docs.length > 0) {
    const scored = docs
      .map((d) => {
        const hay = `${d.title} ${d.category}`.toLowerCase();
        const score = keywords.filter((k) => hay.includes(k)).length;
        return { doc: d, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.doc.createdAt.getTime() - a.doc.createdAt.getTime());
    if (scored.length === 1) return answerForDoc(scored[0].doc, question, isDescribe);
    if (scored.length > 1 && scored[0].score > scored[1].score) {
      return answerForDoc(scored[0].doc, question, isDescribe);
    }
    if (scored.length > 1) {
      return { kind: 'reply', text: pickListMessage(scored.map((s) => s.doc).slice(0, LIST_LIMIT), isDescribe) };
    }
  }

  // 3. Tanpa penanda ("apa isi dokumen ini?"): satu-satunya dokumen user.
  if (docs.length === 1) return answerForDoc(docs[0], question, isDescribe);
  if (docs.length > 1) {
    return {
      kind: 'reply',
      text:
        `Anda memiliki ${docs.length} dokumen. Dokumen yang mana yang ingin Anda tanyakan?\n` +
        `${formatDocList(docs.slice(0, LIST_LIMIT))}\n\n` +
        (isDescribe
          ? `Balas dengan menyebutkan judul atau nomor dokumennya, misalnya: "dokumen apa ${docs[0].documentNumber}?"`
          : `Balas dengan menyebutkan judul atau nomor dokumennya, misalnya: "ringkas ${docs[0].documentNumber}".`),
    };
  }
  return { kind: 'reply', text: notFoundMessage('') };
}

/**
 * Deskripsi deterministik sebuah dokumen: judul + nomor + kategori + status
 * + deskripsi (bila ada) + cuplikan awal isi PDF. TANPA LLM, tanpa potong
 * kredit — untuk user yang bertanya dulu ("itu dokumen apa ya?") sebelum
 * memutuskan menandatangani.
 */
async function describeDoc(doc: AccessibleDoc): Promise<DocQaOutcome> {
  const statusLabel: Record<string, string> = {
    DRAFT: 'draf (belum dikirim)',
    PENDING_APPROVAL: 'menunggu persetujuan',
    PENDING_SIGNATURE: 'menunggu tanda tangan',
    PARTIALLY_SIGNED: 'sebagian sudah ditandatangani',
    SIGNED: 'sudah ditandatangani semua pihak',
    COMPLETED: 'selesai',
    REJECTED: 'ditolak',
    CANCELLED: 'dibatalkan',
    EXPIRED: 'kedaluwarsa',
  };
  const lines = [
    `Dokumen "${doc.title}" (${doc.documentNumber})`,
    `Kategori: ${doc.category} — Status: ${statusLabel[doc.status] ?? doc.status}`,
  ];
  if (doc.description?.trim()) lines.push(`\nDeskripsi: ${doc.description.trim()}`);
  const text = await ensureText(doc);
  if (text === null) {
    lines.push('\nIsi PDF belum bisa saya baca saat ini. Silakan buka dokumennya di halaman E-Sign untuk membaca lengkap.');
  } else if (text === '') {
    lines.push('\nIsi PDF tidak memiliki teks yang bisa saya baca (kemungkinan hasil scan atau gambar). Silakan buka PDF-nya di halaman E-Sign.');
  } else {
    const clean = text.replace(/\s+/g, ' ').trim();
    const excerpt = clean.length > 600 ? clean.slice(0, 600) + '…' : clean;
    lines.push(`\nIsi dokumen:\n${excerpt}`);
  }
  lines.push(`\nBaca PDF lengkapnya di halaman E-Sign (${ESIGN_APP_URL}/esign).`);
  lines.push(`\nBila sudah jelas dan Anda setuju, kirim "saya ttd" untuk menandatanganinya.`);
  return { kind: 'reply', text: lines.join('\n') };
}

async function answerForDoc(doc: AccessibleDoc, question: string, describe = false): Promise<DocQaOutcome> {
  if (describe) return describeDoc(doc);
  const text = await ensureText(doc);
  if (text === null) {
    return {
      kind: 'reply',
      text:
        `Dokumen "${doc.title}" (${doc.documentNumber}) belum memiliki file PDF yang bisa saya baca. ` +
        `Silakan periksa dokumennya di halaman E-Sign.`,
    };
  }
  if (text === '') {
    return {
      kind: 'reply',
      text:
        `Dokumen "${doc.title}" (${doc.documentNumber}) tidak memiliki teks yang bisa saya baca ` +
        `(kemungkinan hasil scan atau gambar). Silakan buka PDF-nya di halaman E-Sign.`,
    };
  }
  const truncated = text.length > DOC_QA_CONTEXT_CHARS;
  return {
    kind: 'llm',
    docTitle: doc.title,
    documentNumber: doc.documentNumber,
    question,
    text: truncated ? text.slice(0, DOC_QA_CONTEXT_CHARS) : text,
    truncated,
  };
}
