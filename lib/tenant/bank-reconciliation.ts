// Rekonsiliasi pembayaran §9.5 (Fase 6 — Bab 9.5).
//
// JALUR UTAMA: Master mengunggah CSV rekening koran (cadangan b) -> parser
// toleran -> pencocokan otomatis berdasarkan total persis + value date di
// dalam jendela berlaku invoice [issuedAt, validUntil] -> MATCHED (Lunas via
// applyPayment) / UNDERPAID / OVERPAID / DUPLICATE / UNKNOWN -> antrean
// Rekonsiliasi Manual. Cadangan c = konfirmasi manual Master (settleManually,
// memperluas mark-paid Fase 5).
//
// YANG SENGAJA TIDAK ADA (desain §1 — kejujuran cakupan): penarikan otomatis
// iBanking TIDAK dibangun (tidak ada API/kredensial bank ke VM ini, OTP
// tidak boleh diotomasi, syarat bank melarang scraping). Tidak ada kredensial
// bank yang disimpan di mana pun, tidak ada jadwal penarikan otomatis,
// tidak ada payment gateway (tahap berikutnya, bukan v1).
//
// Aturan pencocokan (desain §3 keputusan #2): total persis; UNDERPAID/
// OVERPAID hanya bila TEPAT SATU invoice Belum Dibayar di seluruh sistem
// (bila 0 atau >=2 -> UNKNOWN, Master menautkan manual); DUPLICATE = total
// sama persis dengan invoice yang SUDAH Lunas dengan valueDate setelah
// paidAt -> kredit penuh. Value date adalah kebenaran: mutasi yang
// valueDate-nya di dalam jendela tetap dicocokkan walau CSV diunggah setelah
// invoice kedaluwarsa — TETAPI hanya bila invoice masih Belum Dibayar saat
// pencocokan berjalan (bila sudah Kedaluwarsa -> antrean manual, §9.5).

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
  BankMutation,
  PrismaClient,
  Subscription,
  SubscriptionInvoice,
  TenantPaymentReport,
} from '@prisma/master-client';
import { masterPrisma } from './master';
import { getBillingSettings } from '@/lib/pricing-catalog';
import {
  LifecycleError,
  addBillingCycle,
  applyPayment,
} from './subscription-lifecycle';
import {
  generateUniqueCode,
  invoiceTransferTotal,
  logAutoAction,
  nextInvoiceNumber,
} from './subscription-automation';
import { validateRegistrationFile } from './tenant-registration';
import { sendInvoiceIssuedEmail } from './invoice-email';

/* ------------------------------------------------------------------ */
/* Konstanta                                                           */
/* ------------------------------------------------------------------ */

export const BANK_CODES = [
  'MANDIRI',
  'BRI',
  'BNI',
  'BCA',
  'PERMATA',
  'BSI',
] as const;
export type BankCode = (typeof BANK_CODES)[number];

export const BANK_NAMES: Record<BankCode, string> = {
  MANDIRI: 'Bank Mandiri',
  BRI: 'Bank BRI',
  BNI: 'Bank BNI',
  BCA: 'Bank BCA',
  PERMATA: 'Bank Permata',
  BSI: 'Bank Syariah Indonesia',
};

export const INVOICE_PURPOSES = [
  'RENEWAL',
  'NEW',
  'MODULE_ADD',
  'UPGRADE_DIFF',
  'TOPUP_AI',
  'OTHER',
] as const;
export type InvoicePurpose = (typeof INVOICE_PURPOSES)[number];

export const MUTATION_STATUSES = [
  'MATCHED',
  'UNDERPAID',
  'OVERPAID',
  'DUPLICATE',
  'UNKNOWN',
  'RESOLVED_MANUAL',
] as const;

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB

export const STATEMENT_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  'statements',
);
export const PAYMENT_PROOF_DIR = join(
  process.cwd(),
  'uploads',
  'payment-proofs',
);

export interface InvoiceItem {
  label: string;
  amount: number;
}

function isBankCode(v: unknown): v is BankCode {
  return typeof v === 'string' && (BANK_CODES as readonly string[]).includes(v);
}

function assertReason(reason: unknown): string {
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < 10) {
    throw new LifecycleError('Alasan wajib diisi minimal 10 karakter.', 400);
  }
  return r;
}

/* ------------------------------------------------------------------ */
/* Rekening penampung                                                  */
/* ------------------------------------------------------------------ */

export function shapeBankAccount(a: {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: Date;
}) {
  return {
    bankCode: a.bankCode,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
    accountHolderName: a.accountHolderName,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    filled: a.accountNumber.trim().length > 0,
    updatedAt: a.updatedAt,
  };
}

export async function getBankAccounts(opts: { onlyFilled?: boolean } = {}) {
  const all = await masterPrisma.bankReceivingAccount.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  const list = opts.onlyFilled
    ? all.filter((a) => a.accountNumber.trim().length > 0)
    : all;
  return list.map(shapeBankAccount);
}

export async function upsertBankAccount(
  input: {
    bankCode: string;
    accountNumber?: string;
    accountHolderName?: string;
    isActive?: boolean;
  },
  actorId: string,
) {
  if (!isBankCode(input.bankCode)) {
    throw new LifecycleError(
      `Kode bank tidak dikenal: ${String(input.bankCode)}.`,
      400,
    );
  }
  const accountNumber =
    input.accountNumber !== undefined ? String(input.accountNumber).trim() : '';
  if (accountNumber && !/^[0-9A-Za-z][0-9A-Za-z \-]{3,29}$/.test(accountNumber)) {
    throw new LifecycleError(
      'Nomor rekening harus 4-30 karakter (angka/huruf, spasi, -).',
      400,
    );
  }
  const accountHolderName =
    input.accountHolderName !== undefined
      ? String(input.accountHolderName).trim()
      : '';
  if (accountHolderName.length > 100) {
    throw new LifecycleError('Nama pemilik rekening maksimal 100 karakter.', 400);
  }
  const data: {
    accountNumber?: string;
    accountHolderName?: string;
    isActive?: boolean;
  } = {};
  if (input.accountNumber !== undefined) data.accountNumber = accountNumber;
  if (input.accountHolderName !== undefined)
    data.accountHolderName = accountHolderName;
  if (input.isActive !== undefined) data.isActive = !!input.isActive;
  if (Object.keys(data).length === 0) {
    throw new LifecycleError('Tidak ada perubahan rekening.', 400);
  }
  const updated = await masterPrisma.bankReceivingAccount.upsert({
    where: { bankCode: input.bankCode },
    update: data,
    create: {
      bankCode: input.bankCode,
      bankName: BANK_NAMES[input.bankCode],
      accountNumber: data.accountNumber ?? '',
      accountHolderName: data.accountHolderName ?? '',
      isActive: data.isActive ?? true,
      sortOrder: BANK_CODES.indexOf(input.bankCode) + 1,
    },
  });
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: actorId,
      action: 'BANK_ACCOUNT_UPDATED',
      tenantId: null,
      metadata: JSON.stringify({
        bankCode: input.bankCode,
        ...data,
        accountNumber: data.accountNumber ? '(diisi)' : undefined,
      }),
    },
  });
  return shapeBankAccount(updated);
}

/* ------------------------------------------------------------------ */
/* Parser CSV rekening koran (toleran)                                 */
/* ------------------------------------------------------------------ */

export interface ParsedMutationRow {
  valueDate: Date;
  amount: number;
  description: string | null;
  reference: string | null;
}

const ID_MONTHS: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agustus: 7, august: 7,
  sep: 8, september: 8,
  okt: 9, oktober: 9, october: 9,
  nov: 10, november: 10,
  des: 11, desember: 11, december: 11,
};

/** Parse tanggal: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY,
 *  DD MMM YYYY (bulan Indonesia/Inggris). Kembalikan UTC tengah malam. */
export function parseBankDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return null;
    return d;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const month = ID_MONTHS[m[2].toLowerCase()];
    if (month === undefined) return null;
    const d = new Date(Date.UTC(+m[3], month, +m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Parse nominal rupiah. Terima 1.234.567,89 / 1,234,567.89 / 1234567 /
 *  Rp1.234.567 / dengan akhiran DB/CR/D/K. Kembalikan {value, dir} atau null. */
export function parseBankAmount(raw: string): {
  value: number;
  dir: 'in' | 'out' | null;
} | null {
  let s = raw.replace(/rp/gi, '').replace(/[ \s]/g, '').trim();
  if (!s) return null;
  let dir: 'in' | 'out' | null = null;
  const suffix = s.match(/(DB|CR|DEBET|KREDIT|D|K)$/i);
  if (suffix) {
    const t = suffix[1].toUpperCase();
    dir = t === 'DB' || t === 'DEBET' || t === 'D' ? 'out' : 'in';
    s = s.slice(0, -suffix[1].length);
  }
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    normalized =
      parts.length === 2 && parts[1].length <= 2
        ? s.replace(',', '.')
        : s.replace(/,/g, '');
  } else if (hasDot) {
    const parts = s.split('.');
    normalized =
      parts.length === 2 && parts[1].length === 2 ? s : s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (negative) dir = 'out';
  return { value: Math.round(n), dir };
}

/** Pecah satu baris CSV dengan hormat pada tanda kutip ganda. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parse CSV rekening koran. Header terdeteksi (baris yang menyebut tanggal
 * + nominal/keterangan); bila tidak ada header, posisi fallback
 * [tanggal, keterangan, debet, kredit] (format Mandiri/BRI) atau
 * [tanggal, keterangan, nominal]. Baris rusak / mutasi keluar dilewati dan
 * dihitung di `skipped` — unggahan TIDAK pernah gagal total karena 1 baris.
 */
export function parseBankCsv(
  text: string,
  _bankCode: string,
): { rows: ParsedMutationRow[]; skipped: number; errors: string[] } {
  const rows: ParsedMutationRow[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows, skipped, errors: ['File kosong.'] };

  // Deteksi delimiter dari baris pertama yang punya pemisah.
  let delim = ',';
  for (const line of lines.slice(0, 5)) {
    const semi = (line.match(/;/g) || []).length;
    const comma = (line.match(/,/g) || []).length;
    const tab = (line.match(/\t/g) || []).length;
    if (semi >= 2 && semi >= comma && semi >= tab) { delim = ';'; break; }
    if (tab >= 2 && tab >= comma) { delim = '\t'; break; }
    if (comma >= 2) { delim = ','; break; }
  }
  const cells = lines.map((l) => splitCsvLine(l, delim));

  // Cari baris header (maks 6 baris pertama).
  let headerIdx = -1;
  let col: {
    date: number; desc: number; ref: number; debit: number; credit: number;
    amount: number; dir: number;
  } = { date: -1, desc: -1, ref: -1, debit: -1, credit: -1, amount: -1, dir: -1 };
  for (let i = 0; i < Math.min(6, cells.length); i++) {
    const row = cells[i];
    const hasDate = row.some((c) => /tanggal|date|tgl|value/i.test(c));
    const hasAmount = row.some((c) =>
      /jumlah|nominal|amount|nilai|mutasi|debet|debit|kredit|credit/i.test(c),
    );
    if (hasDate && hasAmount) {
      headerIdx = i;
      row.forEach((c, idx) => {
        if (/tanggal|date|tgl|value/i.test(c) && col.date < 0) col.date = idx;
        else if (/keterangan|description|desc|uraian|berita/i.test(c) && col.desc < 0) col.desc = idx;
        else if (/referensi|reference|\bref\b|no\.?\s*ref/i.test(c) && col.ref < 0) col.ref = idx;
        else if (/debet|debit/i.test(c) && col.debit < 0) col.debit = idx;
        else if (/kredit|credit/i.test(c) && col.credit < 0) col.credit = idx;
        else if (/jumlah|nominal|amount|nilai|mutasi/i.test(c) && col.amount < 0) col.amount = idx;
        else if (/d\/k|jenis|type|\bdc\b|tanda/i.test(c) && col.dir < 0) col.dir = idx;
      });
      break;
    }
  }
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  if (headerIdx < 0) {
    // Fallback posisi: [tanggal, keterangan, debet, kredit] atau
    // [tanggal, keterangan, nominal].
    const width = Math.max(...cells.map((r) => r.length));
    col = {
      date: 0,
      desc: width > 1 ? 1 : -1,
      ref: -1,
      debit: width >= 4 ? 2 : -1,
      credit: width >= 4 ? 3 : -1,
      amount: width === 3 ? 2 : -1,
      dir: -1,
    };
  }

  for (let i = start; i < cells.length; i++) {
    const row = cells[i];
    const dateCell = col.date >= 0 ? (row[col.date] ?? '') : '';
    const valueDate = parseBankDate(dateCell);
    if (!valueDate) {
      skipped++;
      if (errors.length < 10) errors.push(`Baris ${i + 1}: tanggal tidak valid.`);
      continue;
    }
    let amount: number | null = null;
    if (col.debit >= 0 || col.credit >= 0) {
      const creditRaw = col.credit >= 0 ? (row[col.credit] ?? '') : '';
      const debitRaw = col.debit >= 0 ? (row[col.debit] ?? '') : '';
      const creditParsed = creditRaw ? parseBankAmount(creditRaw) : null;
      const debitParsed = debitRaw ? parseBankAmount(debitRaw) : null;
      if (creditParsed && creditParsed.value > 0) {
        amount = creditParsed.value;
      } else if (debitParsed && debitParsed.value > 0) {
        skipped++; // mutasi keluar — hanya masuk yang dicocokkan
        continue;
      }
    } else if (col.amount >= 0) {
      const parsed = parseBankAmount(row[col.amount] ?? '');
      if (parsed) {
        if (parsed.dir === 'out') {
          skipped++; // mutasi keluar
          continue;
        }
        amount = parsed.value;
      }
      // Arah dari kolom terpisah (D/K) bila ada.
      if (amount !== null && col.dir >= 0) {
        const d = (row[col.dir] ?? '').trim().toUpperCase();
        if (d === 'D' || d === 'DB' || d === 'DEBET' || d === 'DEBIT') {
          skipped++;
          continue;
        }
      }
    }
    if (amount === null || amount <= 0) {
      skipped++;
      if (errors.length < 10) errors.push(`Baris ${i + 1}: nominal tidak valid.`);
      continue;
    }
    rows.push({
      valueDate,
      amount,
      description:
        col.desc >= 0 && row[col.desc] ? row[col.desc].slice(0, 500) : null,
      reference:
        col.ref >= 0 && row[col.ref] ? row[col.ref].slice(0, 200) : null,
    });
  }
  return { rows, skipped, errors };
}

/** Simpan berkas CSV statement. Validasi .csv + <=5 MB. */
export async function saveStatementFile(
  bankCode: string,
  file: File,
): Promise<{ storedPath: string; fileName: string; text: string }> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new LifecycleError('Berkas harus CSV (.csv).', 400);
  }
  if (file.size > MAX_STATEMENT_BYTES) {
    throw new LifecycleError('Ukuran CSV maksimal 5 MB.', 400);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = buffer.toString('utf-8');
  if (!text.trim()) {
    throw new LifecycleError('Berkas CSV kosong.', 400);
  }
  const id = randomUUID();
  const dir = join(STATEMENT_UPLOAD_DIR, bankCode);
  await mkdir(dir, { recursive: true });
  const storedPath = join('uploads', 'statements', bankCode, `${id}.csv`);
  await writeFile(join(dir, `${id}.csv`), buffer);
  return { storedPath, fileName: file.name, text };
}

/* ------------------------------------------------------------------ */
/* Saldo kredit                                                        */
/* ------------------------------------------------------------------ */

export async function getCreditBalance(tenantId: string): Promise<number> {
  const row = await masterPrisma.subscriptionCredit.findUnique({
    where: { tenantId },
  });
  return row?.balance ?? 0;
}

/** Tambah saldo kredit + log CREDIT_ADDED (desain §5.1). */
export async function addCredit(
  tenantId: string,
  amount: number,
  opts: {
    source: string;
    actorType?: 'SYSTEM' | 'MASTER';
    actorUserId?: string | null;
  },
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new LifecycleError('Jumlah kredit harus bilangan bulat > 0.', 400);
  }
  const row = await masterPrisma.subscriptionCredit.upsert({
    where: { tenantId },
    update: { balance: { increment: amount } },
    create: { tenantId, balance: amount },
  });
  const sub = await masterPrisma.subscription.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (sub) {
    await logAutoAction(masterPrisma, {
      tenantId,
      subscriptionId: sub.id,
      action: 'CREDIT_ADDED',
      reason: `Saldo kredit bertambah Rp${amount.toLocaleString('id-ID')} (${opts.source}).`,
      detail: `Kredit +Rp${amount.toLocaleString('id-ID')}, saldo kini Rp${row.balance.toLocaleString('id-ID')}`,
      actorType: opts.actorType ?? 'SYSTEM',
      actorUserId: opts.actorUserId ?? null,
      metadata: { amount, source: opts.source, balance: row.balance },
    });
  }
  return row.balance;
}

/** Client transaksi yang cukup untuk pemakaian kredit. */
export type CreditTxClient = Pick<PrismaClient, 'subscriptionCredit'>;

/**
 * Pakai saldo kredit untuk mengurangi dasar invoice — DALAM transaksi yang
 * sama dengan pembuatan invoice (desain §5.1). PPN dihitung dari dasar
 * setelah kredit (keputusan #1). Bila kredit melebihi dasar, sisa tersimpan.
 */
export async function applyCreditToInvoice(
  tx: CreditTxClient,
  tenantId: string,
  baseAmount: number,
): Promise<{ creditApplied: number; newBase: number }> {
  if (baseAmount <= 0) return { creditApplied: 0, newBase: baseAmount };
  const row = await tx.subscriptionCredit.findUnique({
    where: { tenantId },
  });
  const balance = row?.balance ?? 0;
  if (balance <= 0) return { creditApplied: 0, newBase: baseAmount };
  const creditApplied = Math.min(balance, baseAmount);
  await tx.subscriptionCredit.update({
    where: { tenantId },
    data: { balance: { decrement: creditApplied } },
  });
  return { creditApplied, newBase: baseAmount - creditApplied };
}

/* ------------------------------------------------------------------ */
/* Pencocokan mutasi                                                   */
/* ------------------------------------------------------------------ */

/** Apakah tanggal nilai berada pada hari yang bersinggungan dengan
 *  jendela berlaku invoice [issuedAt, validUntil]? Value date hanya
 *  tanggal (tengah malam UTC) — jadi hari yang bersinggungan dengan
 *  jendela dihitung cocok (transfer di hari terbit sebelum jam terbit
 *  tetap sah; transfer di hari kedaluwarsa setelah jam kedaluwarsa
 *  dinilai dari tanggalnya). */
export function valueDateInWindow(
  valueDate: Date,
  issuedAt: Date,
  validUntil: Date,
): boolean {
  const dayStart = valueDate.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return dayStart <= validUntil.getTime() && dayEnd > issuedAt.getTime();
}

type MatchOutcome =
  | 'matched'
  | 'underpaid'
  | 'overpaid'
  | 'duplicate'
  | 'unknown';

async function matchOneMutation(
  mutation: BankMutation,
  uploadedByUserId: string,
): Promise<MatchOutcome> {
  const amount = mutation.amount;
  const valueDate = mutation.valueDate;
  const unpaid = await masterPrisma.subscriptionInvoice.findMany({
    where: { status: 'Belum Dibayar' },
    orderBy: { issuedAt: 'asc' },
  });

  // 1) Cocok persis: total sama + value date dalam jendela berlaku.
  const exact = unpaid.find(
    (inv) =>
      invoiceTransferTotal(inv) === amount &&
      valueDateInWindow(valueDate, inv.issuedAt, inv.validUntil),
  );
  if (exact) {
    try {
      await applyPayment(exact.subscriptionId, {
        invoiceId: exact.id,
        amount,
        paidAt: valueDate,
        actorId: 'SYSTEM',
        reason: `Pembayaran dicocokkan otomatis dari mutasi ${mutation.bankCode} tanggal nilai ${valueDate.toISOString().slice(0, 10)} sebesar Rp${amount.toLocaleString('id-ID')}.`,
        actorType: 'SYSTEM',
        paidBank: mutation.bankCode,
        paidMutationId: mutation.id,
      });
    } catch {
      // Invoice keburu lunas/dibatalkan di antara baca dan tulis — jatuh
      // ke aturan berikutnya, jangan gagalkan seluruh unggahan.
      return matchOneMutationFallback(mutation, unpaid);
    }
    await masterPrisma.bankMutation.update({
      where: { id: mutation.id },
      data: {
        status: 'MATCHED',
        matchedInvoiceId: exact.id,
        tenantId: exact.tenantId,
      },
    });
    return 'matched';
  }
  return matchOneMutationFallback(mutation, unpaid);
}

async function matchOneMutationFallback(
  mutation: BankMutation,
  unpaid: SubscriptionInvoice[],
): Promise<MatchOutcome> {
  const amount = mutation.amount;
  const valueDate = mutation.valueDate;

  // 2) Tepat SATU invoice Belum Dibayar di seluruh sistem -> kandidat.
  if (unpaid.length === 1) {
    const candidate = unpaid[0];
    const total = invoiceTransferTotal(candidate);
    if (amount < total) {
      await masterPrisma.bankMutation.update({
        where: { id: mutation.id },
        data: {
          status: 'UNDERPAID',
          matchedInvoiceId: candidate.id,
          tenantId: candidate.tenantId,
        },
      });
      return 'underpaid';
    }
    if (amount > total) {
      // Lebih bayar: lunaskan + selisih jadi kredit.
      await applyPayment(candidate.subscriptionId, {
        invoiceId: candidate.id,
        amount,
        paidAt: valueDate,
        actorId: 'SYSTEM',
        reason: `Pembayaran lebih dari total invoice dicocokkan otomatis dari mutasi ${mutation.bankCode} tanggal nilai ${valueDate.toISOString().slice(0, 10)} sebesar Rp${amount.toLocaleString('id-ID')}.`,
        actorType: 'SYSTEM',
        paidBank: mutation.bankCode,
        paidMutationId: mutation.id,
      });
      await addCredit(candidate.tenantId, amount - total, {
        source: 'OVERPAID',
        actorType: 'SYSTEM',
        actorUserId: 'SYSTEM',
      });
      await masterPrisma.bankMutation.update({
        where: { id: mutation.id },
        data: {
          status: 'OVERPAID',
          matchedInvoiceId: candidate.id,
          tenantId: candidate.tenantId,
        },
      });
      return 'overpaid';
    }
  }

  // 3) DUPLICATE: total sama persis dengan invoice yang SUDAH Lunas dan
  // valueDate pada hari yang sama atau setelah hari paidAt invoice itu ->
  // kredit penuh. PERBAIKAN live 2026-11-24 (verifikasi Fase 6): pembanding
  // lama `valueDate > paidAt` (timestamp lawan timestamp) selalu gagal untuk
  // duplikat di hari yang sama — valueDate disimpan tengah malam UTC,
  // sedangkan paidAt adalah jam pembayaran di hari itu — sehingga duplikat
  // di hari yang sama jatuh ke UNKNOWN dan tidak menjadi kredit. Kini
  // dibandingkan per hari kalender (UTC).
  const paid = await masterPrisma.subscriptionInvoice.findMany({
    where: { status: 'Lunas' },
    orderBy: { paidAt: 'desc' },
    take: 200,
  });
  const dup = paid.find((inv) => {
    if (invoiceTransferTotal(inv) !== amount || !inv.paidAt) return false;
    const paidDay = new Date(inv.paidAt);
    paidDay.setUTCHours(0, 0, 0, 0);
    return valueDate.getTime() >= paidDay.getTime();
  });
  if (dup) {
    await addCredit(dup.tenantId, amount, {
      source: 'DUPLICATE',
      actorType: 'SYSTEM',
      actorUserId: 'SYSTEM',
    });
    await masterPrisma.bankMutation.update({
      where: { id: mutation.id },
      data: {
        status: 'DUPLICATE',
        matchedInvoiceId: dup.id,
        tenantId: dup.tenantId,
      },
    });
    return 'duplicate';
  }

  // 4) Tidak dikenal — Master menautkan manual.
  await masterPrisma.bankMutation.update({
    where: { id: mutation.id },
    data: { status: 'UNKNOWN' },
  });
  return 'unknown';
}

/**
 * Cocokkan semua baris hasil parse CSV. Per mutasi: buat baris mutasi,
 * lalu cocokkan (applyPayment punya transaksi sendiri — tidak bisa
 * disarangkan di transaksi luar, jadi tiap mutasi diproses berurutan).
 * Kembalikan ringkasan; statement diperbarui matched/queued.
 */
export async function matchMutations(input: {
  statementId: string;
  bankCode: string;
  rows: ParsedMutationRow[];
  uploadedByUserId: string;
}): Promise<{
  matched: number;
  underpaid: number;
  overpaid: number;
  duplicate: number;
  unknown: number;
}> {
  const summary = {
    matched: 0,
    underpaid: 0,
    overpaid: 0,
    duplicate: 0,
    unknown: 0,
  };
  for (const row of input.rows) {
    const mutation = await masterPrisma.bankMutation.create({
      data: {
        statementId: input.statementId,
        bankCode: input.bankCode,
        valueDate: row.valueDate,
        amount: row.amount,
        description: row.description,
        reference: row.reference,
        status: 'UNKNOWN',
      },
    });
    const outcome = await matchOneMutation(mutation, input.uploadedByUserId);
    summary[outcome]++;
  }
  await masterPrisma.bankStatement.update({
    where: { id: input.statementId },
    data: {
      matchedCount: summary.matched + summary.overpaid + summary.duplicate,
      queuedCount: summary.underpaid + summary.unknown,
    },
  });
  return summary;
}

/* ------------------------------------------------------------------ */
/* Invoice manual nego + penerbitan ulang                              */
/* ------------------------------------------------------------------ */

function validateItems(items: unknown): InvoiceItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new LifecycleError('Invoice manual wajib punya minimal 1 item.', 400);
  }
  return items.map((it: any, i: number) => {
    const label = typeof it?.label === 'string' ? it.label.trim() : '';
    const amount = Number(it?.amount);
    if (!label || label.length > 120) {
      throw new LifecycleError(`Item ke-${i + 1}: label wajib 1-120 karakter.`, 400);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new LifecycleError(`Item "${label}": nominal harus bilangan bulat > 0.`, 400);
    }
    return { label, amount };
  });
}

async function loadSubscriptionForTenant(
  tenantId: string,
): Promise<Subscription> {
  const sub = await masterPrisma.subscription.findFirst({
    where: { tenantId },
  });
  if (!sub) {
    throw new LifecycleError('Langganan tenant tidak ditemukan.', 404);
  }
  return sub;
}

/**
 * Terbitkan invoice manual (nego): item bebas, dasar isi sendiri, PPN
 * dihitung sistem, kode unik auto, berlaku default 24 jam (atau
 * validityHours). Bila replacesInvoiceId -> invoice lama Dibatalkan/Diganti.
 */
export async function createManualInvoice(input: {
  tenantId: string;
  purpose: string;
  items: unknown;
  baseAmount?: number | null;
  periodStart: Date;
  periodEnd: Date;
  billingCycle: string;
  reason: string;
  actorId: string;
  replacesInvoiceId?: string | null;
  packageSnapshot?: unknown;
  validityHours?: number | null;
  catalogBaseAmount?: number | null;
}): Promise<SubscriptionInvoice> {
  const reason = assertReason(input.reason);
  if (!INVOICE_PURPOSES.includes(input.purpose as InvoicePurpose)) {
    throw new LifecycleError(`Tujuan invoice tidak dikenal: ${input.purpose}.`, 400);
  }
  const items = validateItems(input.items);
  const itemsTotal = items.reduce((a, it) => a + it.amount, 0);
  const base =
    input.baseAmount !== undefined && input.baseAmount !== null
      ? Math.floor(Number(input.baseAmount))
      : itemsTotal;
  if (!Number.isInteger(base) || base <= 0) {
    throw new LifecycleError('Harga dasar invoice harus bilangan bulat > 0.', 400);
  }
  if (
    !input.periodStart ||
    !input.periodEnd ||
    Number.isNaN(input.periodStart.getTime()) ||
    Number.isNaN(input.periodEnd.getTime()) ||
    input.periodEnd <= input.periodStart
  ) {
    throw new LifecycleError('Periode invoice tidak valid.', 400);
  }
  const cycle = input.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const settings = await getBillingSettings();
  const validityHours =
    input.validityHours !== undefined && input.validityHours !== null
      ? Math.floor(Number(input.validityHours))
      : settings.invoiceValidityHours;
  if (!Number.isInteger(validityHours) || validityHours < 1 || validityHours > 168) {
    throw new LifecycleError('Masa berlaku invoice harus 1-168 jam.', 400);
  }
  const subscription = await loadSubscriptionForTenant(input.tenantId);
  let replaces: SubscriptionInvoice | null = null;
  if (input.replacesInvoiceId) {
    replaces = await masterPrisma.subscriptionInvoice.findUnique({
      where: { id: input.replacesInvoiceId },
    });
    if (!replaces || replaces.subscriptionId !== subscription.id) {
      throw new LifecycleError('Invoice yang diganti tidak ditemukan.', 404);
    }
    if (replaces.status !== 'Belum Dibayar') {
      throw new LifecycleError(
        `Invoice yang diganti sudah berstatus ${replaces.status}.`,
        409,
      );
    }
  }

  const now = new Date();
  const created = await masterPrisma.$transaction(async (tx) => {
    const { creditApplied, newBase } = await applyCreditToInvoice(
      tx,
      input.tenantId,
      base,
    );
    const ppnAmount = Math.round((newBase * settings.ppnRateBps) / 10000);
    const uniqueCode = await generateUniqueCode(tx);
    const number = await nextInvoiceNumber(tx);
    const validUntil = new Date(now.getTime() + validityHours * 60 * 60 * 1000);
    const invoice = await tx.subscriptionInvoice.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        number,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        billingCycle: cycle,
        baseAmount: newBase,
        ppnAmount,
        uniqueCode,
        status: 'Belum Dibayar',
        validUntil,
        purpose: input.purpose,
        itemsJson: JSON.stringify(items),
        isManual: true,
        manualReason: reason,
        manualByUserId: input.actorId,
        catalogBaseAmount:
          input.catalogBaseAmount !== undefined &&
          input.catalogBaseAmount !== null
            ? Math.floor(Number(input.catalogBaseAmount))
            : null,
        packageSnapshotJson: input.packageSnapshot
          ? JSON.stringify(input.packageSnapshot)
          : null,
        creditApplied,
      },
    });
    if (replaces) {
      await tx.subscriptionInvoice.update({
        where: { id: replaces.id },
        data: {
          status: 'Dibatalkan/Diganti',
          replacedByInvoiceId: invoice.id,
        },
      });
    }
    return invoice;
  });

  if (replaces) {
    await masterPrisma.platformAuditLog.create({
      data: {
        actorUserId: input.actorId,
        action: 'INVOICE_REPLACED',
        tenantId: input.tenantId,
        metadata: JSON.stringify({
          oldInvoiceId: replaces.id,
          oldNumber: replaces.number,
          newInvoiceId: created.id,
          newNumber: created.number,
          reason,
        }),
      },
    });
  }
  await logAutoAction(masterPrisma, {
    tenantId: input.tenantId,
    subscriptionId: subscription.id,
    action: 'MANUAL_INVOICE_ISSUED',
    reason: `Invoice manual ${created.number} diterbitkan (${input.purpose}): ${reason}`,
    detail: `Invoice ${created.number}, total Rp${invoiceTransferTotal(created).toLocaleString('id-ID')}`,
    actorType: 'MASTER',
    actorUserId: input.actorId,
    metadata: {
      invoiceId: created.id,
      number: created.number,
      purpose: input.purpose,
      baseAmount: created.baseAmount,
      catalogBaseAmount: created.catalogBaseAmount,
      replacesInvoiceId: replaces?.id ?? null,
    },
  });
  // Email invoice (best-effort, di luar transaksi).
  try {
    await sendInvoiceIssuedEmail(created.id);
  } catch {
    /* abaikan */
  }
  return created;
}

/**
 * Terbitkan ulang invoice Kedaluwarsa (tenant OWNER atau Master). Dasar +
 * PPN + item + tujuan disalin dari invoice lama (termasuk creditApplied
 * yang sudah dipakai di invoice lama — tidak dihitung ulang); kode +
 * nomor + masa berlaku baru. Invoice lama TETAP Kedaluwarsa.
 */
export async function reissueInvoice(input: {
  invoiceId: string;
  actorId: string;
  actorType: 'SYSTEM' | 'MASTER' | 'TENANT';
}): Promise<SubscriptionInvoice> {
  const old = await masterPrisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
  });
  if (!old) {
    throw new LifecycleError('Invoice tidak ditemukan.', 404);
  }
  if (old.status !== 'Kedaluwarsa') {
    throw new LifecycleError(
      `Hanya invoice Kedaluwarsa yang bisa diterbitkan ulang (status saat ini: ${old.status}).`,
      409,
    );
  }
  const settings = await getBillingSettings();
  const now = new Date();
  const created = await masterPrisma.$transaction(async (tx) => {
    const uniqueCode = await generateUniqueCode(tx);
    const number = await nextInvoiceNumber(tx);
    const validUntil = new Date(
      now.getTime() + settings.invoiceValidityHours * 60 * 60 * 1000,
    );
    return tx.subscriptionInvoice.create({
      data: {
        tenantId: old.tenantId,
        subscriptionId: old.subscriptionId,
        number,
        periodStart: old.periodStart,
        periodEnd: old.periodEnd,
        billingCycle: old.billingCycle,
        baseAmount: old.baseAmount,
        ppnAmount: old.ppnAmount,
        uniqueCode,
        status: 'Belum Dibayar',
        validUntil,
        purpose: old.purpose,
        itemsJson: old.itemsJson,
        isManual: old.isManual,
        manualReason: old.manualReason,
        manualByUserId: old.manualByUserId,
        catalogBaseAmount: old.catalogBaseAmount,
        packageSnapshotJson: old.packageSnapshotJson,
        creditApplied: old.creditApplied,
      },
    });
  });
  await logAutoAction(masterPrisma, {
    tenantId: old.tenantId,
    subscriptionId: old.subscriptionId,
    action: 'INVOICE_REISSUED',
    reason: `Invoice ${old.number} (kedaluwarsa) diterbitkan ulang menjadi ${created.number}.`,
    detail: `Invoice baru ${created.number}, total Rp${invoiceTransferTotal(created).toLocaleString('id-ID')}`,
    actorType: input.actorType,
    actorUserId: input.actorId,
    metadata: {
      oldInvoiceId: old.id,
      oldNumber: old.number,
      invoiceId: created.id,
      number: created.number,
    },
  });
  // Email invoice baru (best-effort, di luar transaksi).
  try {
    await sendInvoiceIssuedEmail(created.id);
  } catch {
    /* abaikan */
  }
  return created;
}

/* ------------------------------------------------------------------ */
/* Pelunasan manual (memperluas mark-paid Fase 5)                      */
/* ------------------------------------------------------------------ */

/**
 * Lunaskan invoice secara manual dengan pencatatan selisih (§9.5 §2):
 * - selisih == kode unik -> FORGIVEN_CODE (kasus umum: transfer tanpa kode);
 * - selisih lebih besar -> WAJIB FOLLOW_UP_INVOICE (invoice susulan untuk
 *   sisanya) atau FORGIVEN_REASON (alasan jelas >=10 karakter);
 * - lebih bayar -> CREDIT (kelebihan jadi saldo kredit);
 * - selisih 0 -> FORGIVEN_CODE dengan difference 0 (bayar persis).
 * Efek sama dengan pencocokan otomatis: invoice Lunas + perpanjangan via
 * applyPayment. Bukti (mutasi/laporan) dicatat di ManualSettlement.
 */
export async function settleManually(input: {
  invoiceId: string;
  amountReceived: number;
  handling?: string | null;
  reason: string;
  actorId: string;
  proofMutationId?: string | null;
  proofNote?: string | null;
  followUpBase?: number | null;
}): Promise<{
  invoice: SubscriptionInvoice;
  settlement: {
    id: string;
    handling: string;
    difference: number;
    followUpInvoiceId: string | null;
  };
  followUpInvoice: SubscriptionInvoice | null;
}> {
  const reason = assertReason(input.reason);
  const amountReceived = Math.floor(Number(input.amountReceived));
  if (!Number.isInteger(amountReceived) || amountReceived <= 0) {
    throw new LifecycleError(
      'Nominal yang benar-benar diterima harus bilangan bulat > 0.',
      400,
    );
  }
  const invoice = await masterPrisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
  });
  if (!invoice) {
    throw new LifecycleError('Invoice tidak ditemukan.', 404);
  }
  if (invoice.status !== 'Belum Dibayar') {
    throw new LifecycleError(
      `Invoice sudah berstatus ${invoice.status}.`,
      409,
    );
  }
  const total = invoiceTransferTotal(invoice);
  const difference = amountReceived - total;

  let handling: string;
  if (difference === 0) {
    if (input.handling && input.handling !== 'FORGIVEN_CODE') {
      throw new LifecycleError(
        'Pembayaran sudah persis — handling yang sah hanya FORGIVEN_CODE.',
        400,
      );
    }
    handling = 'FORGIVEN_CODE';
  } else if (difference < 0) {
    const shortfall = -difference;
    if (shortfall === invoice.uniqueCode) {
      if (input.handling && input.handling !== 'FORGIVEN_CODE') {
        throw new LifecycleError(
          'Selisih hanya sebesar kode unik — handling yang sah hanya FORGIVEN_CODE.',
          400,
        );
      }
      handling = 'FORGIVEN_CODE';
    } else {
      if (
        input.handling !== 'FOLLOW_UP_INVOICE' &&
        input.handling !== 'FORGIVEN_REASON'
      ) {
        throw new LifecycleError(
          `Kekurangan Rp${shortfall.toLocaleString('id-ID')} lebih besar dari kode unik (Rp${invoice.uniqueCode.toLocaleString('id-ID')}) — wajib FOLLOW_UP_INVOICE (invoice susulan untuk sisanya) atau FORGIVEN_REASON dengan alasan jelas.`,
          400,
        );
      }
      handling = input.handling;
    }
  } else {
    if (input.handling && input.handling !== 'CREDIT') {
      throw new LifecycleError(
        'Kelebihan bayar selalu menjadi saldo kredit (handling CREDIT).',
        400,
      );
    }
    handling = 'CREDIT';
  }

  // Invoice susulan dibuat DULU (bila gagal, pembayaran belum diterapkan —
  // Master bisa mencoba lagi; invoice susulan yang terlanjur terbit bisa
  // dibatalkan manual bila pembayaran ternyata gagal).
  let followUpInvoice: SubscriptionInvoice | null = null;
  if (handling === 'FOLLOW_UP_INVOICE') {
    const followUpBase =
      input.followUpBase !== undefined && input.followUpBase !== null
        ? Math.floor(Number(input.followUpBase))
        : -difference;
    if (!Number.isInteger(followUpBase) || followUpBase <= 0) {
      throw new LifecycleError(
        'Nominal invoice susulan harus bilangan bulat > 0.',
        400,
      );
    }
    followUpInvoice = await createManualInvoice({
      tenantId: invoice.tenantId,
      purpose: 'OTHER',
      items: [
        {
          label: `Sisa tagihan ${invoice.number}`,
          amount: followUpBase,
        },
      ],
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      billingCycle: invoice.billingCycle,
      reason: `Invoice susulan selisih pelunasan ${invoice.number}. ${reason}`,
      actorId: input.actorId,
    });
  }

  const result = await applyPayment(invoice.subscriptionId, {
    invoiceId: invoice.id,
    amount: amountReceived,
    actorId: input.actorId,
    reason,
    actorType: 'MASTER',
    paidMutationId: input.proofMutationId ?? null,
  });

  if (difference > 0) {
    await addCredit(invoice.tenantId, difference, {
      source: 'OVERPAID_MANUAL',
      actorType: 'MASTER',
      actorUserId: input.actorId,
    });
  }

  const settlement = await masterPrisma.manualSettlement.create({
    data: {
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      actorUserId: input.actorId,
      amountReceived,
      invoiceTotal: total,
      difference,
      handling,
      followUpInvoiceId: followUpInvoice?.id ?? null,
      proofMutationId: input.proofMutationId ?? null,
      proofNote: input.proofNote ?? null,
      reason,
    },
  });
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: input.actorId,
      action: 'MANUAL_SETTLEMENT',
      tenantId: invoice.tenantId,
      metadata: JSON.stringify({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        amountReceived,
        invoiceTotal: total,
        difference,
        handling,
        followUpInvoiceId: followUpInvoice?.id ?? null,
        proofMutationId: input.proofMutationId ?? null,
        proofNote: input.proofNote ?? null,
      }),
    },
  });
  await logAutoAction(masterPrisma, {
    tenantId: invoice.tenantId,
    subscriptionId: invoice.subscriptionId,
    action: 'MANUAL_PAYMENT_CONFIRMED',
    reason,
    detail: `Pelunasan manual invoice ${invoice.number}: diterima Rp${amountReceived.toLocaleString('id-ID')}, selisih Rp${difference.toLocaleString('id-ID')} (${handling})`,
    actorType: 'MASTER',
    actorUserId: input.actorId,
    metadata: {
      invoiceId: invoice.id,
      settlementId: settlement.id,
      amountReceived,
      difference,
      handling,
      followUpInvoiceId: followUpInvoice?.id ?? null,
      proofMutationId: input.proofMutationId ?? null,
    },
  });
  if (input.proofMutationId) {
    await masterPrisma.bankMutation
      .update({
        where: { id: input.proofMutationId },
        data: {
          status: 'RESOLVED_MANUAL',
          matchedInvoiceId: invoice.id,
          tenantId: invoice.tenantId,
          resolutionNote:
            input.proofNote ?? `Dilunaskan manual (${handling}).`,
          resolvedByUserId: input.actorId,
          resolvedAt: new Date(),
        },
      })
      .catch(() => {
        // Mutasi bukti boleh tidak ada (mis. laporan tanpa mutasi) — jangan
        // gagalkan pelunasan yang sudah terjadi.
      });
  }
  const fresh = await masterPrisma.subscriptionInvoice.findUnique({
    where: { id: invoice.id },
  });
  const finalInvoice = fresh ?? result.invoice;
  if (!finalInvoice) {
    throw new LifecycleError('Invoice tidak ditemukan setelah pelunasan.', 500);
  }
  return {
    invoice: finalInvoice,
    settlement: {
      id: settlement.id,
      handling: settlement.handling,
      difference: settlement.difference,
      followUpInvoiceId: settlement.followUpInvoiceId,
    },
    followUpInvoice,
  };
}

/* ------------------------------------------------------------------ */
/* Laporan tenant "saya sudah transfer"                                */
/* ------------------------------------------------------------------ */

/** Simpan bukti laporan tenant (PDF/JPG/PNG <=10 MB + magic bytes —
 *  validator yang sama dengan pendaftaran Fase 2). */
async function savePaymentProof(
  tenantId: string,
  reportId: string,
  file: File,
): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const checked = validateRegistrationFile(file, buffer);
  if (checked.error || !checked.ext) {
    throw new LifecycleError(
      checked.error ?? 'Bukti transfer tidak valid.',
      400,
    );
  }
  const dir = join(PAYMENT_PROOF_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  const storedPath = join(
    'uploads',
    'payment-proofs',
    tenantId,
    `${reportId}${checked.ext}`,
  );
  await writeFile(join(dir, `${reportId}${checked.ext}`), buffer);
  return storedPath;
}

export async function reportTenantPayment(input: {
  tenantId: string;
  invoiceId?: string | null;
  bankCode: string;
  transferDate: Date;
  amount: number;
  proofFile?: File | null;
}): Promise<TenantPaymentReport> {
  if (!isBankCode(input.bankCode)) {
    throw new LifecycleError(
      `Kode bank tidak dikenal: ${String(input.bankCode)}.`,
      400,
    );
  }
  const amount = Math.floor(Number(input.amount));
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new LifecycleError('Nominal transfer harus bilangan bulat > 0.', 400);
  }
  if (
    !input.transferDate ||
    Number.isNaN(input.transferDate.getTime()) ||
    input.transferDate.getTime() > Date.now()
  ) {
    throw new LifecycleError(
      'Tanggal transfer tidak valid (tidak boleh di masa depan).',
      400,
    );
  }
  if (input.invoiceId) {
    const inv = await masterPrisma.subscriptionInvoice.findUnique({
      where: { id: input.invoiceId },
    });
    if (!inv || inv.tenantId !== input.tenantId) {
      throw new LifecycleError('Invoice tidak ditemukan untuk tenant ini.', 404);
    }
  }
  const id = randomUUID();
  let proofPath: string | null = null;
  if (input.proofFile) {
    proofPath = await savePaymentProof(input.tenantId, id, input.proofFile);
  }
  return masterPrisma.tenantPaymentReport.create({
    data: {
      id,
      tenantId: input.tenantId,
      invoiceId: input.invoiceId ?? null,
      bankCode: input.bankCode,
      transferDate: input.transferDate,
      amount,
      proofPath,
      status: 'PENDING',
    },
  });
}

/**
 * Selesaikan laporan tenant: 'settle' -> settleManually (invoice dari
 * laporan atau yang diberikan; bukti dicatat di proofNote) + RESOLVED;
 * 'reject' -> REJECTED + resolveNote wajib >=10 karakter.
 */
export async function resolveTenantReport(input: {
  reportId: string;
  decision: 'settle' | 'reject';
  actorId: string;
  invoiceId?: string | null;
  amount?: number | null;
  note?: string | null;
}): Promise<{
  report: TenantPaymentReport;
  settlement: { id: string; handling: string } | null;
}> {
  const report = await masterPrisma.tenantPaymentReport.findUnique({
    where: { id: input.reportId },
  });
  if (!report) {
    throw new LifecycleError('Laporan pembayaran tidak ditemukan.', 404);
  }
  if (report.status !== 'PENDING') {
    throw new LifecycleError(
      `Laporan sudah berstatus ${report.status}.`,
      409,
    );
  }
  if (input.decision === 'reject') {
    const note = assertReason(input.note);
    const updated = await masterPrisma.tenantPaymentReport.update({
      where: { id: report.id },
      data: {
        status: 'REJECTED',
        resolvedByUserId: input.actorId,
        resolveNote: note,
      },
    });
    return { report: updated, settlement: null };
  }
  // settle
  const invoiceId = input.invoiceId ?? report.invoiceId;
  if (!invoiceId) {
    throw new LifecycleError(
      'Laporan ini tidak tertaut ke invoice — pilih invoice yang dilunaskan.',
      400,
    );
  }
  const amount =
    input.amount !== undefined && input.amount !== null
      ? Math.floor(Number(input.amount))
      : report.amount;
  const note =
    input.note && input.note.trim().length >= 10
      ? input.note.trim()
      : `Pelunasan manual dari laporan tenant ${report.id} (bank ${report.bankCode}, transfer ${report.transferDate.toISOString().slice(0, 10)}, bukti ${report.proofPath ? 'terlampir' : 'tanpa bukti'}).`;
  const settled = await settleManually({
    invoiceId,
    amountReceived: amount,
    reason: note,
    actorId: input.actorId,
    proofNote: `Laporan tenant ${report.id} (bank ${report.bankCode}, transfer ${report.transferDate.toISOString().slice(0, 10)}, nominal Rp${report.amount.toLocaleString('id-ID')}${report.proofPath ? ', bukti terlampir' : ''}).`,
  });
  const updated = await masterPrisma.tenantPaymentReport.update({
    where: { id: report.id },
    data: {
      status: 'RESOLVED',
      resolvedByUserId: input.actorId,
      resolveNote: note,
    },
  });
  return {
    report: updated,
    settlement: { id: settled.settlement.id, handling: settled.settlement.handling },
  };
}

/* ------------------------------------------------------------------ */
/* Penyelesaian mutasi dari antrean                                    */
/* ------------------------------------------------------------------ */

/**
 * Selesaikan satu mutasi bermasalah dari antrean:
 * - 'link-invoice': tautkan ke invoice + lunaskan (settleManually,
 *   proofMutationId = mutasi ini -> mutasi jadi RESOLVED_MANUAL);
 * - 'credit': jadikan saldo kredit tenant mutasi itu;
 * - 'dismiss': abaikan (tidak ada uang yang dicatat) + catatan >=10.
 */
export async function resolveMutation(input: {
  mutationId: string;
  action: 'link-invoice' | 'credit' | 'dismiss';
  actorId: string;
  invoiceId?: string | null;
  note?: string | null;
  // PERBAIKAN live 2026-11-24 (verifikasi Fase 6): tanpa handling, menautkan
  // mutasi kurang bayar dengan selisih > kode unik selalu 400 — Master tidak
  // bisa menyelesaikan antrean dari UI. handling diteruskan ke settleManually.
  handling?: string | null;
}): Promise<{ mutation: BankMutation; settlement: { id: string } | null }> {
  const mutation = await masterPrisma.bankMutation.findUnique({
    where: { id: input.mutationId },
  });
  if (!mutation) {
    throw new LifecycleError('Mutasi tidak ditemukan.', 404);
  }
  if (mutation.status === 'MATCHED' || mutation.status === 'RESOLVED_MANUAL') {
    throw new LifecycleError(
      `Mutasi sudah berstatus ${mutation.status}.`,
      409,
    );
  }
  if (input.action === 'link-invoice') {
    if (!input.invoiceId) {
      throw new LifecycleError('Pilih invoice yang dilunaskan mutasi ini.', 400);
    }
    const reason =
      input.note && input.note.trim().length >= 10
        ? input.note.trim()
        : `Pelunasan manual dari mutasi ${mutation.bankCode} tanggal nilai ${mutation.valueDate.toISOString().slice(0, 10)} sebesar Rp${mutation.amount.toLocaleString('id-ID')}.`;
    const settled = await settleManually({
      invoiceId: input.invoiceId,
      amountReceived: mutation.amount,
      handling: input.handling ?? null,
      reason,
      actorId: input.actorId,
      proofMutationId: mutation.id,
      proofNote: input.note?.trim() || null,
    });
    const fresh = await masterPrisma.bankMutation.findUnique({
      where: { id: mutation.id },
    });
    return {
      mutation: fresh ?? mutation,
      settlement: { id: settled.settlement.id },
    };
  }
  if (input.action === 'credit') {
    if (!mutation.tenantId) {
      throw new LifecycleError(
        'Mutasi belum tertaut ke tenant — tautkan ke invoice dulu atau abaikan.',
        400,
      );
    }
    await addCredit(mutation.tenantId, mutation.amount, {
      source: 'MANUAL_CREDIT',
      actorType: 'MASTER',
      actorUserId: input.actorId,
    });
    const updated = await masterPrisma.bankMutation.update({
      where: { id: mutation.id },
      data: {
        status: 'RESOLVED_MANUAL',
        resolutionNote:
          input.note?.trim() ||
          `Dijadikan saldo kredit Rp${mutation.amount.toLocaleString('id-ID')}.`,
        resolvedByUserId: input.actorId,
        resolvedAt: new Date(),
      },
    });
    return { mutation: updated, settlement: null };
  }
  // dismiss
  const note = assertReason(input.note);
  const updated = await masterPrisma.bankMutation.update({
    where: { id: mutation.id },
    data: {
      status: 'RESOLVED_MANUAL',
      resolutionNote: note,
      resolvedByUserId: input.actorId,
      resolvedAt: new Date(),
    },
  });
  return { mutation: updated, settlement: null };
}

/* ------------------------------------------------------------------ */
/* Pembaca (dipakai API)                                               */
/* ------------------------------------------------------------------ */

export function shapeMutation(m: BankMutation) {
  return {
    id: m.id,
    statementId: m.statementId,
    bankCode: m.bankCode,
    valueDate: m.valueDate,
    amount: m.amount,
    description: m.description,
    reference: m.reference,
    status: m.status,
    matchedInvoiceId: m.matchedInvoiceId,
    tenantId: m.tenantId,
    resolutionNote: m.resolutionNote,
    resolvedAt: m.resolvedAt,
    createdAt: m.createdAt,
  };
}

export function shapeReport(r: TenantPaymentReport) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    invoiceId: r.invoiceId,
    bankCode: r.bankCode,
    transferDate: r.transferDate,
    amount: r.amount,
    proofPath: r.proofPath,
    status: r.status,
    resolveNote: r.resolveNote,
    createdAt: r.createdAt,
  };
}
