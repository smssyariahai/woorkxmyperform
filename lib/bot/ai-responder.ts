import { prisma } from '@/lib/db';
import { getNineRouterConfig, chatCompletion } from './ninerouter';
import { getOrCreateBotConfig, reserveCredit, finalizeCharge, refundCredit, markFailed } from './credits';
import { getEsignQaReply, findUserByPhone } from '@/lib/esign/qa';
import { handleEsignWaSign, extractPinAttempt, redactPinMessage, isEsignPinSender } from '@/lib/esign/wa-sign';
import { getEsignDocQaReply, buildDocQaMessages } from '@/lib/esign/doc-qa';

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
  /** Id baris ConversationMessage pesan masuk (untuk redaksi PIN E-Sign). */
  messageId?: string;
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

  // 3a. Tanda tangan via WhatsApp (deterministik, tanpa LLM, tanpa potong
  // kredit). Intent eksplisit ("ok, saya ttd") + PIN → dokumen langsung
  // tertandatangani memakai tanda tangan tersimpan user. State machine di
  // lib/esign/wa-sign.ts. Bila bukan bagian alur ini, kembalikan null dan
  // lanjut ke Q&A / AI berbayar seperti biasa.
  const esignWaSignReply = await handleEsignWaSign(orgId, msg).catch(() => null);
  if (esignWaSignReply) {
    const send = deps?.sendText ?? (await import('@/lib/wa/manager')).sendText;
    const sent = await send(orgId, { phone: msg.phone, waLid: msg.waLid }, esignWaSignReply);
    if (!sent.ok) return { handled: false, reason: 'esign-send-failed' };
    await saveBotMessage(msg.conversationId, esignWaSignReply, {
      sentVia: 'whatsapp',
      aiBot: true,
      esignWaSign: true,
      model: cfg.model,
    });
    return { handled: true, reply: esignWaSignReply };
  }

  // 3a2. Pengaman PIN: pesan yang tampak seperti percobaan PIN ("011201"
  // atau "itu pin saya 011201") yang TIDAK ditangani cabang signing di
  // atas (mis. sesi tidak ditemukan / sudah berakhir, atau handler
  // melempar error) JANGAN diteruskan ke LLM — model akan mengulang PIN
  // di balasan (bocor) dan seolah "mencatatnya" tanpa verifikasi.
  // Bila pengirim adalah staf E-Sign (punya dokumen menunggu / profil
  // E-Sign), jawab dengan aman TANPA mengulang angka dan arahkan
  // mengulang dari "saya ttd". Bukan staf → biarkan jatuh ke AI biasa
  // (bisa jadi kode pelanggan biasa, mis. kode pesanan).
  const pinAttempt = extractPinAttempt(text);
  if (pinAttempt) {
    const pinUser = await findUserByPhone(orgId, msg.phone).catch(() => null);
    if (pinUser && (await isEsignPinSender(pinUser.id, orgId).catch(() => false))) {
      await redactPinMessage(msg.messageId, pinAttempt);
      const safeReply =
        'Saya menerima pesan berisi PIN, tapi sesi tanda tangan tidak ditemukan atau sudah berakhir, ' +
        'jadi PIN tersebut tidak diproses dan tidak saya simpan.\n\n' +
        'Silakan kirim "saya ttd" untuk memulai lagi, lalu kirim PIN Anda saat diminta.';
      const send = deps?.sendText ?? (await import('@/lib/wa/manager')).sendText;
      const sent = await send(orgId, { phone: msg.phone, waLid: msg.waLid }, safeReply);
      if (!sent.ok) return { handled: false, reason: 'esign-send-failed' };
      await saveBotMessage(msg.conversationId, safeReply, {
        sentVia: 'whatsapp',
        aiBot: true,
        esignPinGuard: true,
        model: cfg.model,
      });
      return { handled: true, reply: safeReply };
    }
  }

  // 3c. Jawab isi dokumen E-Sign (ringkasan / tanya isi, LLM dengan
  // grounding teks PDF hasil ekstraksi).
  // Ditempatkan SEBELUM Q&A 3b (bukan sesudahnya): intent 'lemah' 3b
  // menangkap SEMUA pesan yang mengandung kata 'dokumen', sehingga
  // pertanyaan isi ("ringkas dokumen ...") akan ditelan 3b sebagai
  // pertanyaan status bila 3c berada di bawahnya. Intent 3c ketat
  // (kata ringkasan/isi + penanda dokumen), jadi pertanyaan status 3b
  // tidak terpengaruh — 3b sendiri tidak diubah.
  // Kredit: jawaban LLM mengikuti alur tagihan normal Bot AI (reservasi
  // SEBELUM panggil model, finalisasi setelah kirim sukses, refund bila
  // gagal). Jawaban deterministik (tidak ditemukan / daftar pilihan /
  // tanpa teks) TANPA potong kredit, seperti Q&A.
  const docQa = await getEsignDocQaReply(orgId, msg).catch(() => null);
  if (docQa?.kind === 'reply') {
    const send = deps?.sendText ?? (await import('@/lib/wa/manager')).sendText;
    const sent = await send(orgId, { phone: msg.phone, waLid: msg.waLid }, docQa.text);
    if (!sent.ok) return { handled: false, reason: 'esign-send-failed' };
    await saveBotMessage(msg.conversationId, docQa.text, {
      sentVia: 'whatsapp',
      aiBot: true,
      esignDocQA: true,
      model: cfg.model,
    });
    return { handled: true, reply: docQa.text };
  }
  if (docQa?.kind === 'llm') {
    let usageId: string;
    try {
      const r = await reserveCredit({
        organizationId: orgId,
        messageId: msg.waMessageId,
        conversationId: msg.conversationId,
        amount: cfg.pricePerReply,
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
    const ai = await chatCompletion(cfg, buildDocQaMessages(docQa), { maxTokens: 1000 });
    if (!ai.ok || !ai.text) {
      await refundCredit(usageId, ai.error ?? 'AI gagal').catch(() => {});
      return { handled: false, reason: 'esign-docqa-ai-failed' };
    }
    let replyText = ai.text;
    if (docQa.truncated) {
      replyText +=
        '\n\n_Catatan: dokumen sangat panjang; ringkasan ini berdasarkan bagian awal dokumen._';
    }
    const send = deps?.sendText ?? (await import('@/lib/wa/manager')).sendText;
    const sent = await send(orgId, { phone: msg.phone, waLid: msg.waLid }, replyText);
    if (!sent.ok) {
      await refundCredit(usageId, sent.error ?? 'Kirim WA gagal').catch(() => {});
      return { handled: false, reason: 'send-failed' };
    }
    await finalizeCharge(usageId).catch(() => {});
    await saveBotMessage(msg.conversationId, replyText, {
      sentVia: 'whatsapp',
      aiBot: true,
      esignDocQA: true,
      model: cfg.model,
    });
    return { handled: true, reply: replyText };
  }

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
