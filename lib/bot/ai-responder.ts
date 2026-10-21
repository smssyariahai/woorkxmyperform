import { prisma } from '@/lib/db';
import { getNineRouterConfig, chatCompletion } from './ninerouter';
import { getOrCreateBotConfig, reserveCredit, finalizeCharge, refundCredit, markFailed } from './credits';

/**
 * Bot AI — dipanggil setelah BotFlow tidak menangani pesan.
 * Gerbang (semua harus lolos sebelum pemrosesan berbayar):
 *  1. Integrasi 9Router global AKTIF
 *  2. Bot owner ON
 *  3. Kredensial tersedia
 *  4. Saldo >= tarif
 *  5. Pesan memenuhi syarat (teks non-kosong)
 *
 * Alur: reservasi atomik → panggil AI → kirim WA → finalisasi.
 * Gagal di langkah mana pun setelah reservasi → refund otomatis.
 */

export interface AiIncoming {
  conversationId: string;
  customerName: string | null;
  phone: string | null;
  waLid: string | null;
  text: string;
  waMessageId: string; // id unik pesan (idempotency)
}

export type AiResult =
  | { handled: true; reply: string }
  | { handled: false; reason: string };

export async function maybeAiReply(
  orgId: string,
  msg: AiIncoming,
  deps?: { sendText?: (orgId: string, target: { phone: string | null; waLid: string | null }, text: string) => Promise<{ ok: boolean; error?: string }> }
): Promise<AiResult> {
  const text = msg.text.trim();
  if (!text) return { handled: false, reason: 'empty' };
  if (!msg.waMessageId) return { handled: false, reason: 'no-id' };

  // 0. Bot per-percakapan aktif? (toggle di inbox)
  const conv = await prisma.conversation.findUnique({
    where: { id: msg.conversationId },
    select: { botEnabled: true },
  });
  if (conv && !conv.botEnabled) return { handled: false, reason: 'conv-off' };

  // 1. Global aktif?
  const cfg = await getNineRouterConfig();
  if (!cfg.enabled) return { handled: false, reason: 'global-off' };

  // 2. Bot owner ON?
  const botCfg = await getOrCreateBotConfig(orgId);
  if (!botCfg.isEnabled) return { handled: false, reason: 'owner-off' };

  // 3. Kredensial tersedia?
  if (!cfg.baseUrl) return { handled: false, reason: 'no-config' };

  const price = cfg.pricePerReply;

  // 4+6+7. Reservasi atomik (cek saldo + cegah duplikat di dalam)
  let usageId: string;
  try {
    const r = await reserveCredit({
      organizationId: orgId,
      messageId: msg.waMessageId,
      conversationId: msg.conversationId,
      amount: price,
      model: cfg.model,
    });
    usageId = r.usageId;
  } catch (e: any) {
    if (e.message === 'DUPLICATE_MESSAGE') return { handled: false, reason: 'duplicate' };
    if (e.message === 'INSUFFICIENT_BALANCE') {
      await markFailed(msg.waMessageId, orgId, 'Saldo tidak cukup').catch(() => {});
      return { handled: false, reason: 'insufficient' };
    }
    if (e.message === 'INSUFFICIENT_MASTER_BALANCE' || e.message === 'MASTER_MIN_BALANCE_BLOCKED') {
      await markFailed(msg.waMessageId, orgId, 'Saldo Master tidak cukup').catch(() => {});
      return { handled: false, reason: 'insufficient-master' };
    }
    await markFailed(msg.waMessageId, orgId, e.message).catch(() => {});
    return { handled: false, reason: 'reserve-error' };
  }

  // 8+9. Panggil 9Router
  const systemPrompt = botCfg.systemPrompt || cfg.systemPrompt;
  const ai = await chatCompletion(cfg, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  if (!ai.ok || !ai.text) {
    await refundCredit(usageId, ai.error ?? 'AI gagal').catch(() => {});
    return { handled: false, reason: 'ai-failed' };
  }

  // 10. Kirim balasan via WA
  const send = deps?.sendText ?? (await import('@/lib/wa/manager')).sendText;
  const sent = await send(orgId, { phone: msg.phone, waLid: msg.waLid }, ai.text);
  if (!sent.ok) {
    await refundCredit(usageId, sent.error ?? 'Kirim WA gagal').catch(() => {});
    return { handled: false, reason: 'send-failed' };
  }

  // 11. Finalisasi tagihan
  await finalizeCharge(usageId).catch(() => {});

  // 13. Simpan pesan bot ke DB (riwayat percakapan)
  try {
    const saved = await prisma.conversationMessage.create({
      data: {
        conversationId: msg.conversationId,
        senderType: 'WOO',
        body: ai.text,
        metadata: JSON.stringify({ sentVia: 'whatsapp', aiBot: true, model: cfg.model }),
      },
    });
    await prisma.conversation.update({
      where: { id: msg.conversationId },
      data: { lastMessageAt: new Date() },
    });
  } catch {}

  return { handled: true, reply: ai.text };
}
