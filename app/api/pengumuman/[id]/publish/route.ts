import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  announcementLink,
  mapAnnouncement,
  parseChannels,
  resolveRecipients,
} from '@/lib/pengumuman/server';
import {
  isAppAllowed,
  isEmailAllowed,
  mergePrefs,
} from '@/lib/pengumuman/preferences';
import {
  MAX_EMAIL_RECIPIENTS,
  isMailConfigured,
  sendAnnouncementEmail,
} from '@/lib/mailer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pengumuman/[id]/publish — kirim sekarang (inti Gelombang 3).
 * Draft → terkirim, dan jadwal (status='scheduled') → "Kirim sekarang"
 * (pengganti cron). Idempotent: publish kedua → 409, tanpa Notification duplikat.
 * Email best-effort: gagal / SMTP belum ada TIDAK menggagalkan publish.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.announcement.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { author: { select: { name: true, email: true } } },
    });
    if (!row) return apiErr('Pengumuman tidak ditemukan.', 404);
    if (row.status === 'published') {
      return apiErr('Pengumuman ini sudah terkirim.', 409);
    }

    const channels = parseChannels(row.channels);
    const recipients = await resolveRecipients(
      ctx.organizationId,
      row.targetMode,
      row.target
    );
    if (recipients.length === 0) {
      return apiErr(
        row.targetMode === 'targeted'
          ? 'Tidak ada penerima yang cocok dengan target tertarget.'
          : 'Tidak ada anggota aktif di organisasi ini.',
        400
      );
    }
    // Snapshot email penerima saat publish (berguna untuk audit + targeted).
    const recipientEmails = recipients.map((m) => m.email);

    // Preferensi per penerima (default bila belum pernah menyimpan).
    const prefRows = await prisma.notificationPreference.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: { in: recipients.map((m) => m.id) },
      },
    });
    const prefByUser = new Map(
      prefRows.map((p) => [p.userId, mergePrefs(p.prefs)])
    );
    const prefsOf = (userId: string) =>
      prefByUser.get(userId) ?? mergePrefs({});

    const appRecipients = channels.app
      ? recipients.filter((m) => isAppAllowed(prefsOf(m.id), row.priority))
      : [];
    const emailCandidates = channels.email
      ? recipients.filter((m) => isEmailAllowed(prefsOf(m.id), row.priority))
      : [];
    const emailTruncated =
      emailCandidates.length > MAX_EMAIL_RECIPIENTS;
    const emailRecipients = emailCandidates.slice(0, MAX_EMAIL_RECIPIENTS);

    // 1) Status + fan-out in-app dalam satu transaksi; email di luar transaksi.
    const [updated] = await prisma.$transaction([
      prisma.announcement.update({
        where: { id: row.id },
        data: {
          status: 'published',
          sentAt: new Date(),
          recipientEmails,
          emailStatus: channels.email ? 'pending' : 'not_requested',
          emailSent: 0,
          emailFailed: 0,
          emailError: null,
        },
        include: { author: { select: { name: true, email: true } } },
      }),
      ...(appRecipients.length > 0
        ? [
            prisma.notification.createMany({
              data: appRecipients.map((m) => ({
                organizationId: ctx.organizationId,
                userId: m.id,
                type: 'PENGUMUMAN',
                title: row.title,
                body: row.summary || row.content.slice(0, 160),
              })),
            }),
          ]
        : []),
    ]);

    // 2) Email (best-effort, di luar transaksi).
    let emailStatus = updated.emailStatus;
    let emailSent = 0;
    let emailFailed = 0;
    let emailError: string | null = null;
    if (channels.email) {
      if (emailRecipients.length === 0) {
        emailStatus = 'skipped';
        emailError = 'Tidak ada penerima email.';
      } else if (!isMailConfigured()) {
        emailStatus = 'not_configured';
        emailError =
          'SMTP belum dikonfigurasi. Isi SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS di .env.';
      } else {
        const link = announcementLink(row.id);
        for (const m of emailRecipients) {
          const res = await sendAnnouncementEmail({
            to: m.email,
            name: m.name,
            title: row.title,
            summary: row.summary || row.content.slice(0, 160),
            link,
          });
          if (res.ok) emailSent += 1;
          else {
            emailFailed += 1;
            if (!emailError) emailError = res.error ?? 'Gagal mengirim email.';
          }
        }
        emailStatus =
          emailFailed === 0
            ? 'sent'
            : emailSent === 0
              ? 'failed'
              : 'partial';
        if (emailTruncated) {
          const note = 'Dibatasi 100 penerima per pengiriman.';
          emailError = emailError ? `${emailError} ${note}` : note;
        }
      }
      await prisma.announcement.update({
        where: { id: row.id },
        data: { emailStatus, emailSent, emailFailed, emailError },
      });
    }

    const fresh = await prisma.announcement.findUnique({
      where: { id: row.id },
      include: { author: { select: { name: true, email: true } } },
    });
    return apiOk({
      announcement: mapAnnouncement(fresh!),
      inAppSent: appRecipients.length,
      email: { status: emailStatus, sent: emailSent, failed: emailFailed },
      recipients: recipients.length,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim pengumuman.', 500);
  }
}
