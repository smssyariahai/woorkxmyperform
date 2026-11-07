// Manajer sesi WhatsApp (Baileys) per organisasi.
// Satu sesi per organizationId; state auth tersimpan di .wa-sessions/<orgId>/.

// Paksa ws memakai implementasi buffer JS murni — versi native 'bufferutil'
// tidak terbawa benar saat di-bundle Next.js (e.mask is not a function).
if (!process.env.WS_NO_BUFFER_UTIL) process.env.WS_NO_BUFFER_UTIL = '1';

import path from 'path';
import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { prisma } from '@/lib/db';
import { normalizePhone, jidToPhone, phoneToJid } from './phone';
import { refreshCustomerPhoto, refreshOrgPhotos } from './profile-photo';

export type WaStatus = 'idle' | 'qr' | 'connecting' | 'open' | 'closed';

interface Session {
  orgId: string;
  sock: any | null;
  status: WaStatus;
  qr: string | null; // data URL
  qrRaw: string | null;
  phone: string | null; // nomor WA yang terhubung
  starting: boolean;
}

const sessions = new Map<string, Session>();

function sessionDir(orgId: string) {
  return path.join(process.cwd(), '.wa-sessions', orgId);
}

function credsExist(orgId: string): boolean {
  try {
    return fs.existsSync(path.join(sessionDir(orgId), 'creds.json'));
  } catch {
    return false;
  }
}

function getSession(orgId: string): Session {
  let s = sessions.get(orgId);
  if (!s) {
    s = { orgId, sock: null, status: 'idle', qr: null, qrRaw: null, phone: null, starting: false };
    sessions.set(orgId, s);
  }
  return s;
}

async function markChannel(orgId: string, connected: boolean, phone: string | null) {
  try {
    const channel = await prisma.channel.findFirst({
      where: { organizationId: orgId, type: 'WHATSAPP' },
    });
    if (!channel) return;
    await prisma.channel.update({
      where: { id: channel.id },
      data: { status: connected ? 'CONNECTED' : 'DISCONNECTED' },
    });
    const account = await prisma.channelAccount.findFirst({
      where: { channelId: channel.id, organizationId: orgId },
      orderBy: { connectedAt: 'desc' },
    });
    if (connected) {
      const displayName = phone ? `WhatsApp ${phone}` : 'WhatsApp';
      if (account) {
        await prisma.channelAccount.update({
          where: { id: account.id },
          data: {
            status: 'CONNECTED', displayName,
            externalId: phone, connectedAt: new Date(), lastTestAt: new Date(), lastTestOk: true,
          },
        });
      } else {
        await prisma.channelAccount.create({
          data: {
            organizationId: orgId, channelId: channel.id,
            displayName, externalId: phone,
            status: 'CONNECTED', connectedAt: new Date(), lastTestAt: new Date(), lastTestOk: true,
          },
        });
      }
    } else if (account) {
      await prisma.channelAccount.update({ where: { id: account.id }, data: { status: 'DISCONNECTED' } });
    }
  } catch (e) {
    console.error('[wa] markChannel gagal:', (e as Error).message);
  }
}

async function handleIncoming(orgId: string, sock: any) {
  // Lacak receipt pesan keluar (broadcast): READ / PLAYED
  // Catatan: Baileys mengirim status sebagai ANGKA (WAMessageStatus): 4=READ, 5=PLAYED
  const READ_STATUSES = [4, 5, 'READ', 'PLAYED'];
  sock.ev.on('messages.update', async (updates: any[]) => {
    for (const u of updates || []) {
      try {
        const msgId = u?.key?.id;
        const status = u?.update?.status;
        if (!msgId || status == null) continue;
        if (!READ_STATUSES.includes(status)) continue;
        const { prisma } = await import('@/lib/db');
        const rec = await prisma.campaignRecipient.findFirst({
          where: { waMessageId: msgId, readAt: null },
          select: { id: true, campaignId: true },
        });
        if (!rec) continue;
        const now = new Date();
        await prisma.campaignRecipient.update({
          where: { id: rec.id },
          data: { readAt: now },
        });
        await prisma.campaign.update({
          where: { id: rec.campaignId },
          data: { readCount: { increment: 1 } },
        });
      } catch {}
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const jid: string = m.key.remoteJid || '';
        if (jid.endsWith('@g.us')) continue; // abaikan grup dulu
        if (jid === 'status@broadcast') continue; // abaikan story/status WA — jangan masuk inbox
        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.imageMessage?.caption ||
          '';
        if (!text.trim()) continue;

        // WhatsApp kini memakai LID (@lid) untuk sebagian pengirim.
        // Kumpulkan LID & nomor asli (PN) dari remoteJid / remoteJidAlt / mapping.
        const jidAlt: string = (m.key as any).remoteJidAlt || '';
        let lid: string | null = null;
        let phone: string | null = null;
        for (const j of [jid, jidAlt]) {
          if (j.endsWith('@lid') && !lid) lid = j.split('@')[0];
          if (j.endsWith('@s.whatsapp.net') && !phone) phone = jidToPhone(j);
        }
        if (!phone && lid) {
          try {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID(lid);
            if (pn) phone = normalizePhone(pn);
          } catch {}
        }
        if (!phone) continue;
        const pushName = m.pushName || null;

        // cari pelanggan berdasarkan nomor di organisasi ini
        const customers = await prisma.customer.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, phone: true, waLid: true },
        });
        let customer = customers.find((c) => normalizePhone(c.phone) === phone) ?? null;
        if (!customer && lid) {
          customer = customers.find((c) => c.waLid === lid) ?? null;
        }
        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              organizationId: orgId,
              name: pushName || phone,
              phone,
              waLid: lid,
              source: 'WHATSAPP',
              stage: 'Baru',
            },
            select: { id: true, name: true, phone: true, waLid: true },
          });
        } else if (lid && !customer.waLid) {
          // lengkapi LID pelanggan lama agar balasan terkirim ke JID yang benar
          await prisma.customer.update({ where: { id: customer.id }, data: { waLid: lid } });
          customer.waLid = lid;
        }

        // cari percakapan WhatsApp terakhir; bila sudah Selesai akan dibuka kembali
        let conv = await prisma.conversation.findFirst({
          where: { organizationId: orgId, customerId: customer.id, channelType: 'WHATSAPP' },
          orderBy: { lastMessageAt: 'desc' },
        });
        if (!conv) {
          const channel = await prisma.channel.findFirst({
            where: { organizationId: orgId, type: 'WHATSAPP' },
          });
          conv = await prisma.conversation.create({
            data: {
              organizationId: orgId,
              customerId: customer.id,
              channelId: channel?.id ?? null,
              channelType: 'WHATSAPP',
              status: 'NEW',
              assignedTo: 'WOO',
            },
          });
        }

        const created = await prisma.conversationMessage.create({
          data: {
            conversationId: conv.id,
            senderType: 'CUSTOMER',
            body: text.trim().slice(0, 4000),
          },
        });
        const now = new Date();
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: now,
            // pesan baru membuka kembali percakapan yang sudah Selesai
            ...(conv.status === 'RESOLVED' ? { status: 'NEW' } : {}),
          },
        });
        await prisma.customer.update({
          where: { id: customer.id },
          data: { lastMessageAt: now, unreadCount: { increment: 1 } },
        });
        // Foto profil WA: ambil sekali, simpan lokal, refresh tiap 7 hari.
        // Fire-and-forget — jangan menahan pemrosesan pesan.
        refreshCustomerPhoto(orgId, customer.id, sock).catch(() => {});
        // siarkan real-time agar room chat langsung menampilkan pesan ini
        try {
          const { publishMessage, publishConversation } = await import('@/lib/realtime');
          publishMessage(orgId, {
            id: created.id,
            conversationId: conv.id,
            senderType: 'CUSTOMER',
            sender: pushName ? { name: pushName } : null,
            body: created.body,
            createdAt: now.toISOString(),
          });
          publishConversation(orgId, conv.id);
        } catch {}

        // Jalankan automation bot (BotFlow aktif) untuk pesan masuk ini
        try {
          const { runBotFlows } = await import('@/lib/bot/engine');
          const flowHandled = await runBotFlows(orgId, {
            conversationId: conv.id,
            customerId: customer.id,
            customerName: (customer as any).name ?? pushName,
            phone: customer.phone,
            waLid: customer.waLid,
            text,
          });
          // Bila tidak ada flow yang menangani, coba Bot AI (berbayar, gated)
          if (!flowHandled) {
            const { maybeAiReply } = await import('@/lib/bot/ai-responder');
            const aiRes = await maybeAiReply(orgId, {
              conversationId: conv.id,
              customerName: (customer as any).name ?? pushName,
              phone: customer.phone,
              waLid: customer.waLid,
              text,
              waMessageId: String(m.key.id || ''),
              // Id baris pesan masuk — dipakai cabang tanda tangan E-Sign
              // untuk meredaksi PIN dari riwayat chat setelah diproses.
              messageId: created.id,
            });
            if (aiRes.handled) {
              const { publishMessage } = await import('@/lib/realtime');
              publishMessage(orgId, {
                id: `ai-${Date.now()}`,
                conversationId: conv.id,
                senderType: 'WOO',
                sender: { name: 'Bot AI' },
                body: aiRes.reply,
                createdAt: new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          console.error('[bot] eksekusi flow gagal:', (e as Error).message);
        }
      } catch (e) {
        console.error('[wa] incoming gagal:', (e as Error).message);
      }
    }
  });
}

/** Mulai (atau sambung ulang) sesi WhatsApp organisasi. */
export async function startSession(orgId: string): Promise<Session> {
  const s = getSession(orgId);
  if (s.sock || s.starting) return s;
  s.starting = true;
  s.status = 'connecting';
  try {
    const dir = sessionDir(orgId);
    fs.mkdirSync(dir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] as any }));

    const sock = makeWASocket({
      auth: state,
      version: version as any,
      printQRInTerminal: false,
      browser: ['WOORK', 'Chrome', '1.0'],
      syncFullHistory: false,
      // lewati proxy sandbox bila ada (wajib di environment ini)
      agent: process.env.HTTPS_PROXY || process.env.https_proxy
        ? new HttpsProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy || '')
        : undefined,
    });
    s.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u: any) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        s.qrRaw = qr;
        s.qr = await QRCode.toDataURL(qr, { width: 280, margin: 1 }).catch(() => null);
        s.status = 'qr';
      }
      if (connection === 'open') {
        s.status = 'open';
        s.qr = null;
        s.qrRaw = null;
        const rawId: string = sock.user?.id || '';
        s.phone = normalizePhone(rawId.split(':')[0]) || null;
        await markChannel(orgId, true, s.phone);
      }
      if (connection === 'close') {
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.error(`[wa] koneksi terputus (code=${code}) org=${orgId}`);
        s.sock = null;
        s.starting = false;
        if (loggedOut) {
          s.status = 'closed';
          s.phone = null;
          try { fs.rmSync(sessionDir(orgId), { recursive: true, force: true }); } catch {}
          await markChannel(orgId, false, null);
        } else {
          // putus sementara -> coba sambung ulang otomatis
          s.status = 'connecting';
          setTimeout(() => startSession(orgId).catch(() => {}), 10000);
        }
      }
    });

    await handleIncoming(orgId, sock);
  } catch (e) {
    s.starting = false;
    s.status = 'closed';
    console.error('[wa] startSession gagal:', (e as Error).message);
  }
  return s;
}

/** Status + QR sesi (tidak memulai koneksi baru bila belum ada). */
export function getSessionInfo(orgId: string) {
  let s = sessions.get(orgId);
  if (!s) {
    // ada kredensial tersimpan? -> pulihkan otomatis (mis. setelah restart server)
    const hasCreds = fs.existsSync(path.join(sessionDir(orgId), 'creds.json'));
    if (hasCreds) {
      startSession(orgId).catch(() => {});
      s = sessions.get(orgId);
    }
    if (!s) return { status: (hasCreds ? 'closed' : 'idle') as WaStatus, qr: null, phone: null, hasCreds };
  }
  return { status: s.status, qr: s.qr, phone: s.phone, hasCreds: true };
}

/**
 * Perbarui foto profil WA pelanggan yang belum ada / sudah lewat 7 hari.
 * Dipakai tombol "Perbarui foto" di Inbox (POST /api/conversations/refresh-photos).
 * Gagal bila sesi WA kantor tidak sedang open.
 */
export async function refreshOrgCustomerPhotos(orgId: string, limit = 25) {
  const s = sessions.get(orgId);
  if (!s?.sock || s.status !== 'open') {
    return { ok: false as const, error: 'WhatsApp kantor belum terhubung.' };
  }
  const r = await refreshOrgPhotos(orgId, s.sock, limit);
  return { ok: true as const, ...r };
}

export interface WaSendResult { ok: boolean; error?: string; messageId?: string }

/** Tunggu sesi menjadi open (maks timeoutMs). False bila sesi mati/tak ada. */
async function waitForOpen(orgId: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = sessions.get(orgId);
    if (s?.sock && s.status === 'open') return true;
    if (!s || s.status === 'closed' || s.status === 'idle') return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  const s = sessions.get(orgId);
  return !!(s?.sock && s.status === 'open');
}

/**
 * Kirim pesan teks — tahan banting:
 * - menunggu koneksi hingga open (menangani jeda reconnect),
 * - retry bila gagal/putus di tengah jalan,
 * - mengembalikan hasil jujur { ok, error } agar UI tidak menampilkan "terkirim" palsu.
 * Prioritaskan JID @lid bila diketahui.
 */
export async function sendText(
  orgId: string,
  to: { phone?: string | null; waLid?: string | null } | string,
  text: string,
  opts?: { timeoutMs?: number; retries?: number }
): Promise<WaSendResult> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const maxRetries = opts?.retries ?? 2;

  let s = sessions.get(orgId);
  if (!s && credsExist(orgId)) {
    // sesi hilang (mis. server baru restart) — coba pulihkan dulu
    try { s = await startSession(orgId); } catch (e) {
      return { ok: false, error: 'Gagal memulai sesi WhatsApp: ' + (e as Error).message };
    }
  }
  if (!s) return { ok: false, error: 'WhatsApp belum terhubung. Hubungkan di menu Saluran.' };

  const open = await waitForOpen(orgId, timeoutMs);
  if (!open) {
    const st = sessions.get(orgId)?.status ?? 'unknown';
    return { ok: false, error: `Koneksi WhatsApp tidak siap (status: ${st}). Tunggu beberapa saat lalu coba lagi.` };
  }

  let jid: string | null = null;
  if (typeof to === 'string') {
    jid = phoneToJid(to);
  } else {
    if (to.waLid) jid = `${to.waLid}@lid`;
    else jid = phoneToJid(to.phone);
  }
  if (!jid) return { ok: false, error: 'Nomor tujuan tidak valid.' };

  let lastErr = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const cur = sessions.get(orgId);
    if (!cur?.sock || cur.status !== 'open') {
      const reopened = await waitForOpen(orgId, 8000);
      if (!reopened) { lastErr = 'Koneksi WhatsApp terputus saat mengirim.'; continue; }
    }
    try {
      const sent = await sessions.get(orgId)!.sock!.sendMessage(jid, { text });
      return { ok: true, messageId: (sent?.key as any)?.id ?? undefined };
    } catch (e) {
      lastErr = (e as Error).message;
      console.error(`[wa] kirim gagal (percobaan ${attempt + 1}/${maxRetries + 1}):`, lastErr);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { ok: false, error: `Gagal mengirim via WhatsApp: ${lastErr}` };
}

/** Kirim gambar (mis. poster promosi) — tunggu koneksi + retry, hasil jujur. */
export async function sendImage(
  orgId: string,
  to: { phone?: string | null; waLid?: string | null } | string,
  image: Buffer,
  caption?: string
): Promise<WaSendResult> {
  let s = sessions.get(orgId);
  if (!s && credsExist(orgId)) {
    try { s = await startSession(orgId); } catch (e) {
      return { ok: false, error: 'Gagal memulai sesi WhatsApp: ' + (e as Error).message };
    }
  }
  if (!s) return { ok: false, error: 'WhatsApp belum terhubung. Hubungkan di menu Saluran.' };

  const open = await waitForOpen(orgId, 20000);
  if (!open) {
    const st = sessions.get(orgId)?.status ?? 'unknown';
    return { ok: false, error: `Koneksi WhatsApp tidak siap (status: ${st}). Tunggu beberapa saat lalu coba lagi.` };
  }

  let jid: string | null = null;
  if (typeof to === 'string') jid = phoneToJid(to);
  else if (to.waLid) jid = `${to.waLid}@lid`;
  else jid = phoneToJid(to.phone);
  if (!jid) return { ok: false, error: 'Nomor tujuan tidak valid.' };

  let lastErr = '';
  for (let attempt = 0; attempt <= 2; attempt++) {
    const cur = sessions.get(orgId);
    if (!cur?.sock || cur.status !== 'open') {
      const reopened = await waitForOpen(orgId, 8000);
      if (!reopened) { lastErr = 'Koneksi WhatsApp terputus saat mengirim.'; continue; }
    }
    try {
      const sent = await sessions.get(orgId)!.sock!.sendMessage(jid, { image, caption: caption || undefined });
      return { ok: true, messageId: (sent?.key as any)?.id ?? undefined };
    } catch (e) {
      lastErr = (e as Error).message;
      console.error(`[wa] kirim gambar gagal (percobaan ${attempt + 1}/3):`, lastErr);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { ok: false, error: `Gagal mengirim gambar via WhatsApp: ${lastErr}` };
}

/** Kirim dokumen (mis. PDF) via sesi aktif. */
export async function sendDocument(
  orgId: string,
  to: string,
  doc: Buffer,
  fileName: string,
  caption?: string
): Promise<{ ok: boolean; error?: string }> {
  let s = sessions.get(orgId);
  if (!s && credsExist(orgId)) {
    try { s = await startSession(orgId); } catch {}
  }
  if (!s?.sock || s.status !== 'open') return { ok: false, error: 'Sesi WhatsApp tidak aktif (status: ' + (s?.status || 'tidak ada') + ')' };
  const jid = phoneToJid(to);
  if (!jid) return { ok: false, error: 'Nomor tujuan tidak valid' };
  try {
    await s.sock.sendMessage(jid, {
      document: doc,
      mimetype: 'application/pdf',
      fileName,
      caption: caption || undefined,
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[wa] kirim dokumen gagal:', msg);
    return { ok: false, error: msg };
  }
}

/** Pulihkan semua sesi tersimpan saat server boot (tanpa scan ulang). */
export async function restoreSessions(): Promise<void> {
  let orgs: string[] = [];
  try {
    orgs = fs.readdirSync(path.join(process.cwd(), '.wa-sessions')).filter((d) => credsExist(d));
  } catch { return; }
  for (const orgId of orgs) {
    try {
      await startSession(orgId);
    } catch (e) {
      console.error('[wa] restore gagal untuk', orgId, (e as Error).message);
    }
    // jeda kecil antar sesi agar tidak membanjiri koneksi
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Resolve LID -> nomor HP asli via mapping Baileys. */
export async function resolveLid(orgId: string, lid: string): Promise<string | null> {
  const s = sessions.get(orgId);
  if (!s?.sock || s.status !== 'open') return null;
  try {
    const pn = await s.sock.signalRepository?.lidMapping?.getPNForLID(lid);
    return normalizePhone(pn);
  } catch (e) {
    console.error('[wa] resolve LID gagal:', (e as Error).message);
    return null;
  }
}

/** Putuskan sesi (logout) + hapus kredensial. */
export async function disconnectSession(orgId: string): Promise<void> {
  const s = sessions.get(orgId);
  try {
    await s?.sock?.logout().catch(() => {});
  } catch {}
  try { s?.sock?.end?.(); } catch {}
  sessions.delete(orgId);
  try { fs.rmSync(sessionDir(orgId), { recursive: true, force: true }); } catch {}
  await markChannel(orgId, false, null);
}
