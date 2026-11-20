// lib/mailer.ts — pengirim email WOORK (SMTP, nodemailer).
// Prinsip (mengikuti mailer.ts backup + lib/esign/notify.ts):
// - Bila SMTP belum dikonfigurasi, fungsi-fungsi ini TIDAK melempar —
//   mengembalikan { ok: false, reason: 'not_configured' }.
// - Kegagalan kirim tidak pernah menggagalkan alur pemanggil (publish
//   pengumuman tetap sukses; status email dicatat di Announcement).
// Env: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM.
// TIDAK ada kredensial di file ini — user mengisi nilai sebenarnya di .env.

import nodemailer from 'nodemailer';

export type MailSendResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'send_failed'; error?: string };

/** Batas penerima email per publish (dipertahankan dari backup send-email). */
export const MAX_EMAIL_RECIPIENTS = 100;

/** true bila SMTP_HOST + SMTP_USER + SMTP_PASS terisi. */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isMailConfigured()) return null;
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // true hanya untuk port 465 (SMTPS)
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
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
  const transport = getTransporter();
  if (!transport) return { ok: false, reason: 'not_configured' };
  const { subject, html, text } = buildAnnouncementEmail(opts);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  try {
    await transport.sendMail({ from, to: opts.to, subject, html, text });
    return { ok: true };
  } catch (e: any) {
    const message = e?.message ? String(e.message) : 'Gagal mengirim email.';
    console.error('[mailer] sendAnnouncementEmail gagal:', message);
    return { ok: false, reason: 'send_failed', error: message };
  }
}
