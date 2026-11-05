import { prisma } from '@/lib/db';
import { getNineRouterConfig, chatCompletion } from './ninerouter';
import { getOrCreateBotConfig, reserveCredit, finalizeCharge, refundCredit, markFailed } from './credits';
import { getEsignQaReply } from '@/lib/esign/qa';

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

/** Simpan balasan bot ke riwayat percakapan (best-effort). */
async function saveBotMessage(
  conversationId: string,
  text: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.conversationMessage.create({
      data: {
        conversationId,
        senderType: 'WOO',
        body: text,
        metadata: JSON.stringify(metadata),
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  } catch {}
}

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

  // 3b. Q&A E-Sign (deterministik, tanpa LLM, tanpa potong kredit).
  // Cabang ini hanya aktif bila gerbang bot di atas sudah lolos (bot ON).
  // Jawaban selalu faktual dari DB — AI tidak pernah mengklaim status
  // tanpa cek DB, tidak menandatangani atas nama user. Bila bukan intent
  // E-Sign, getEsignQaReply mengembalikan null dan alur lanjut ke AI
  // berbayar seperti biasa.
  const esignReply = await getEsignQaReply(orgId, msg).catch(() => null);
  if (esignReply) {
    const send = deps?.sendText ?? (await import('@/lib/wa/manager')).sendText;
    const sent = await send(orgId, { phone: msg.phone, waLid: msg.waLid }, esignReply);
    if (!sent.ok) return { handled: false, reason: 'esign-send-failed' };
    await saveBotMessage(msg.conversationId, esignReply, {
      sentVia: 'whatsapp',
      aiBot: true,
      esignQA: true,
      model: cfg.model,
    });
    return { handled: true, reply: esignReply };
  }

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
  await saveBotMessage(msg.conversationId, ai.text, {
    sentVia: 'whatsapp',
    aiBot: true,
    model: cfg.model,
  });

  return { handled: true, reply: ai.text };
}
