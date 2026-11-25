// lib/mailer.ts — pengirim email WOORK (SMTP, nodemailer).
// Prinsip (mengikuti mailer.ts backup + lib/esign/notify.ts):
// - Bila SMTP belum dikonfigurasi, fungsi-fungsi ini TIDAK melempar —
//   mengembalikan { ok: false, reason: 'not_configured' }.
// - Kegagalan kirim tidak pernah menggagalkan alur pemanggil (publish
//   pengumuman tetap sukses; status email dicatat di Announcement).
// Konfigurasi SMTP dibaca dari Pengaturan Sistem (DB) didahulukan, lalu env
// SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM sebagai cadangan.
// TIDAK ada kredensial di file ini — user mengisi nilai sebenarnya di
// /admin/pengaturan (Pengaturan Sistem).

import nodemailer from 'nodemailer';
import { getSystemSettings } from './system-settings';

export type MailSendResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'send_failed'; error?: string };

/** Batas penerima email per publish (dipertahankan dari backup send-email). */
export const MAX_EMAIL_RECIPIENTS = 100;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Baca konfigurasi SMTP: Pengaturan Sistem (DB) didahulukan, lalu env. */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  let s: Record<string, string> = {};
  try {
    s = await getSystemSettings();
  } catch {
    /* DB tidak terjangkau — pakai env saja */
  }
  const host = s['smtp.host'] || process.env.SMTP_HOST || '';
  const user = s['smtp.user'] || process.env.SMTP_USER || '';
  const pass = s['smtp.pass'] || process.env.SMTP_PASS || '';
  if (!host || !user || !pass) return null;
  const port = Number(s['smtp.port'] || process.env.SMTP_PORT || 587) || 587;
  return {
    host,
    port,
    user,
    pass,
    from: s['smtp.from'] || process.env.SMTP_FROM || user,
  };
}

/** true bila SMTP terkonfigurasi (Pengaturan Sistem atau env). */
export async function isSmtpConfigured(): Promise<boolean> {
  return (await getSmtpConfig()) !== null;
}

/** true bila SMTP_HOST + SMTP_USER + SMTP_PASS terisi di env (kompat lama). */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

let transporter: nodemailer.Transporter | null = null;
let transporterFingerprint = '';

async function getSmtpTransporter(): Promise<nodemailer.Transporter | null> {
  const cfg = await getSmtpConfig();
  if (!cfg) return null;
  const fingerprint = JSON.stringify(cfg);
  if (transporter && transporterFingerprint === fingerprint) return transporter;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // true hanya untuk port 465 (SMTPS)
    auth: { user: cfg.user, pass: cfg.pass },
  });
  transporterFingerprint = fingerprint;
  return transporter;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Bangun subjek + html + text dari template pengumuman (murni, bisa diuji tanpa SMTP). */
export function buildAnnouncementEmail(opts: {
  name?: string;
  title: string;
  summary: string;
  link: string;
}): { subject: string; html: string; text: string } {
  const subject = `[WOORK] ${opts.title}`;
  const greeting = opts.name ? `Halo ${escapeHtml(opts.name)},` : 'Halo,';
  const summaryHtml = escapeHtml(opts.summary || '').replace(/\n/g, '<br>');
  const summaryText = opts.summary || '';
  const link = escapeHtml(opts.link);
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(
    subject
  )}</title></head><body style="margin:0;padding:24px 0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px;">
<p style="margin:0 0 12px;font-size:15px;">${greeting}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#111827;">${escapeHtml(
    opts.title
  )}</h1>
${summaryHtml ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">${summaryHtml}</p>` : ''}
<p style="margin:0 0 8px;"><a href="${link}" style="display:inline-block;background:#007AFD;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Baca selengkapnya</a></p>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Atau buka tautan ini: <a href="${link}" style="color:#007AFD;">${link}</a></p>
</div>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#9ca3af;text-align:center;">Email ini dikirim otomatis oleh WOORK. Alamat ini hanya untuk mengirim dan tidak menerima balasan.</p>
</body></html>`;
  const text = `${opts.name ? `Halo ${opts.name},` : 'Halo,'}\n\n${opts.title}\n\n${summaryText}\n\nBaca selengkapnya: ${opts.link}\n\n—\nEmail ini dikirim otomatis oleh WOORK. Alamat ini hanya untuk mengirim dan tidak menerima balasan.`;
  return { subject, html, text };
}

/** Kirim satu email pengumuman. TIDAK PERNAH melempar. */
export async function sendAnnouncementEmail(opts: {
  to: string;
  name?: string;
  title: string;
  summary: string;
  link: string;
}): Promise<MailSendResult> {
  const cfg = await getSmtpConfig();
  const transport = cfg ? await getSmtpTransporter() : null;
  if (!transport || !cfg) return { ok: false, reason: 'not_configured' };
  const { subject, html, text } = buildAnnouncementEmail(opts);
  const from = cfg.from;
  try {
    await transport.sendMail({ from, to: opts.to, subject, html, text });
    return { ok: true };
  } catch (e: any) {
    const message = e?.message ? String(e.message) : 'Gagal mengirim email.';
    console.error('[mailer] sendAnnouncementEmail gagal:', message);
    return { ok: false, reason: 'send_failed', error: message };
  }
}

/* ------------------------------------------------------------------ */
/* Email invoice (§9.5)                                                */
/* ------------------------------------------------------------------ */

export interface InvoiceEmailBank {
  bankName: string;
  accountNumber: string;
  accountHolderName?: string;
}

export interface InvoiceEmailOpts {
  to: string;
  companyName: string;
  invoiceNumber: string;
  periodStart: Date;
  periodEnd: Date;
  billingCycle: string; // MONTHLY | YEARLY
  baseAmount: number; // harga dasar SETELAH kredit dipakai
  creditApplied?: number;
  ppnAmount: number;
  uniqueCode: number;
  validUntil: Date;
  banks: InvoiceEmailBank[];
  link: string; // tautan ke halaman tagihan tenant
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

function formatTanggalWIB(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function formatTanggalJamWIB(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Bangun subjek + html + text email invoice (murni, bisa diuji tanpa SMTP). */
export function buildInvoiceEmail(opts: InvoiceEmailOpts): {
  subject: string;
  html: string;
  text: string;
} {
  const total = opts.baseAmount + opts.ppnAmount + opts.uniqueCode;
  const cycleLabel =
    opts.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan';
  const subject = `[WOORK] Tagihan ${opts.invoiceNumber} — ${opts.companyName} — ${rp(total)}`;
  const banksHtml =
    opts.banks.length > 0
      ? opts.banks
          .map(
            (b) =>
              `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(b.bankName)}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${escapeHtml(b.accountNumber)}${b.accountHolderName ? `<br><span style="font-weight:400;color:#6b7280;font-size:13px;">a.n. ${escapeHtml(b.accountHolderName)}</span>` : ''}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="2" style="padding:8px 0;color:#6b7280;">Rekening tujuan belum diatur oleh Administrator Pusat — silakan hubungi kami untuk nomor rekening pembayaran.</td></tr>`;
  const banksText =
    opts.banks.length > 0
      ? opts.banks
          .map(
            (b) =>
              `- ${b.bankName}: ${b.accountNumber}${b.accountHolderName ? ` (a.n. ${b.accountHolderName})` : ''}`
          )
          .join('\n')
      : '- Rekening tujuan belum diatur oleh Administrator Pusat — silakan hubungi kami.';
  const creditRow =
    opts.creditApplied && opts.creditApplied > 0
      ? `<tr><td style="padding:6px 0;color:#374151;">Saldo kredit dipakai</td><td style="padding:6px 0;text-align:right;color:#059669;">− ${rp(opts.creditApplied)}</td></tr>`
      : '';
  const creditText =
    opts.creditApplied && opts.creditApplied > 0
      ? `\nSaldo kredit dipakai: − ${rp(opts.creditApplied)}`
      : '';
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px 0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px;">
<p style="margin:0 0 12px;font-size:15px;">Halo ${escapeHtml(opts.companyName)},</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">Tagihan langganan WOORK Anda sudah terbit. Mohon lakukan pembayaran sebelum batas waktu di bawah ini agar langganan tetap aktif.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin:12px 0;">
<tr><td style="padding:6px 0;color:#6b7280;">Nomor tagihan</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(opts.invoiceNumber)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;">Periode</td><td style="padding:6px 0;text-align:right;">${formatTanggalWIB(opts.periodStart)} – ${formatTanggalWIB(opts.periodEnd)} (${cycleLabel})</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;">Harga dasar</td><td style="padding:6px 0;text-align:right;">${rp(opts.baseAmount)}</td></tr>${creditRow}
<tr><td style="padding:6px 0;color:#6b7280;">PPN 11%</td><td style="padding:6px 0;text-align:right;">${rp(opts.ppnAmount)}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;">Kode unik</td><td style="padding:6px 0;text-align:right;">${opts.uniqueCode}</td></tr>
<tr><td style="padding:10px 0;border-top:2px solid #111827;font-weight:700;">Total yang harus ditransfer</td><td style="padding:10px 0;border-top:2px solid #111827;text-align:right;font-weight:700;font-size:17px;">${rp(total)}</td></tr>
</table>
<p style="margin:0 0 8px;font-size:15px;"><strong>Batas waktu pembayaran: ${formatTanggalJamWIB(opts.validUntil)} WIB.</strong> Transfer total persis di atas (termasuk kode unik) ke salah satu rekening berikut:</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin:8px 0 16px;">${banksHtml}</table>
<p style="margin:0 0 8px;"><a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#007AFD;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Lihat Tagihan</a></p>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Tidak perlu mengirim bukti transfer — sistem mencocokkan pembayaran Anda secara otomatis berdasarkan total persis. Bila ada kendala, balas email ini atau hubungi Administrator Pusat.</p>
</div>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#9ca3af;text-align:center;">Email ini dikirim otomatis oleh WOORK. Alamat ini hanya untuk mengirim dan tidak menerima balasan.</p>
</body></html>`;
  const text = `Halo ${opts.companyName},\n\nTagihan langganan WOORK Anda sudah terbit. Mohon lakukan pembayaran sebelum batas waktu di bawah ini agar langganan tetap aktif.\n\nNomor tagihan: ${opts.invoiceNumber}\nPeriode: ${formatTanggalWIB(opts.periodStart)} – ${formatTanggalWIB(opts.periodEnd)} (${cycleLabel})\nHarga dasar: ${rp(opts.baseAmount)}${creditText}\nPPN 11%: ${rp(opts.ppnAmount)}\nKode unik: ${opts.uniqueCode}\nTotal yang harus ditransfer: ${rp(total)}\n\nBatas waktu pembayaran: ${formatTanggalJamWIB(opts.validUntil)} WIB.\nTransfer total persis di atas (termasuk kode unik) ke salah satu rekening berikut:\n${banksText}\n\nLihat tagihan: ${opts.link}\n\nTidak perlu mengirim bukti transfer — sistem mencocokkan pembayaran Anda secara otomatis berdasarkan total persis.\n\n—\nEmail ini dikirim otomatis oleh WOORK.`;
  return { subject, html, text };
}

/** Kirim satu email invoice. TIDAK PERNAH melempar. */
export async function sendInvoiceEmail(
  opts: InvoiceEmailOpts
): Promise<MailSendResult & { messageId?: string; response?: string }> {
  const cfg = await getSmtpConfig();
  const transport = cfg ? await getSmtpTransporter() : null;
  if (!transport || !cfg) return { ok: false, reason: 'not_configured' };
  const { subject, html, text } = buildInvoiceEmail(opts);
  try {
    const info = await transport.sendMail({
      from: cfg.from,
      to: opts.to,
      subject,
      html,
      text,
    });
    return {
      ok: true,
      messageId: (info as any)?.messageId,
      // Respons mentah server SMTP (mis. Ethereal: "250 Accepted ... MSGID=...")
      // — dipakai untuk tautan pratinjau / debugging pengiriman.
      response: (info as any)?.response,
    };
  } catch (e: any) {
    const message = e?.message ? String(e.message) : 'Gagal mengirim email.';
    console.error('[mailer] sendInvoiceEmail gagal:', message);
    return { ok: false, reason: 'send_failed', error: message };
  }
}

/** Kirim email uji ke alamat admin (untuk memeriksa pengaturan SMTP). TIDAK PERNAH melempar. */
export async function sendTestEmail(to: string): Promise<MailSendResult> {
  const cfg = await getSmtpConfig();
  const transport = cfg ? await getSmtpTransporter() : null;
  if (!transport || !cfg) return { ok: false, reason: 'not_configured' };
  try {
    await transport.sendMail({
      from: cfg.from,
      to,
      subject: '[WOORK] Email uji SMTP',
      html: `<p>Halo,</p><p>Ini email uji dari WOORK. Pengaturan SMTP Anda berfungsi — email invoice dan pengumuman akan dikirim lewat server ini.</p><p>— WOORK</p>`,
      text: 'Halo,\n\nIni email uji dari WOORK. Pengaturan SMTP Anda berfungsi — email invoice dan pengumuman akan dikirim lewat server ini.\n\n— WOORK',
    });
    return { ok: true };
  } catch (e: any) {
    const message = e?.message ? String(e.message) : 'Gagal mengirim email.';
    console.error('[mailer] sendTestEmail gagal:', message);
    return { ok: false, reason: 'send_failed', error: message };
  }
}
