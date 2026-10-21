import { prisma } from '@/lib/db';
import { sendText } from '@/lib/wa/manager';

/**
 * Eksekutor BotFlow — dijalankan setiap ada pesan pelanggan masuk via WhatsApp.
 *
 * Model node (sesuai BotClient):
 * - TRIGGER "Pelanggan mengirim pesan"  → titik masuk
 * - CONDITION "Berisi kata X"          → config { keyword }
 * - ACTION "Kirim ..."                 → config { reply }  (balas via WA + simpan ke DB)
 * - ACTION "Teruskan ke tim"           → config { fallback: true } (eskalasi)
 *
 * Flow pertama yang semua CONDITION-nya cocok akan dieksekusi, lalu berhenti.
 */

type BotNode = { type: string; name: string; config: string };

function parseConfig(n: BotNode): any {
  try {
    return JSON.parse(n.config || '{}');
  } catch {
    return {};
  }
}

function personalize(template: string, customerName: string | null): string {
  const nama = (customerName || 'Bapak/Ibu').trim().split(' ')[0] || 'Bapak/Ibu';
  return template.replace(/\{\{\s*nama\s*\}\}/gi, nama);
}

// Cooldown per percakapan agar bot tidak spam bila pelanggan kirim beruntun.
const lastBotReply = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export type IncomingCtx = {
  conversationId: string;
  customerId: string;
  customerName: string | null;
  phone: string | null;
  waLid: string | null;
  text: string;
};

/** Kembalikan true bila ada flow yang dieksekusi. */
export async function runBotFlows(orgId: string, msg: IncomingCtx): Promise<boolean> {
  const text = msg.text.trim();
  if (!text) return false;

  // Cooldown anti-spam
  const last = lastBotReply.get(msg.conversationId) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return false;

  const flows = await prisma.botFlow.findMany({
    where: { organizationId: orgId, isActive: true },
    include: { nodes: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  if (flows.length === 0) return false;

  for (const flow of flows) {
    const nodes = flow.nodes as BotNode[];
    const hasTrigger = nodes.some((n) => n.type === 'TRIGGER');
    if (!hasTrigger) continue;

    // Semua CONDITION harus cocok
    const conditions = nodes.filter((n) => n.type === 'CONDITION');
    const matched = conditions.every((n) => {
      const cfg = parseConfig(n);
      const keyword = String(cfg.keyword || '').trim().toLowerCase();
      if (!keyword) return true;
      return text.toLowerCase().includes(keyword);
    });
    if (!matched) continue;

    // Eksekusi ACTION berurutan
    const actions = nodes.filter((n) => n.type === 'ACTION');
    let replied = false;
    for (const action of actions) {
      const cfg = parseConfig(action);
      if (cfg.fallback) {
        // Eskalasi ke tim manusia
        await prisma.conversation.update({
          where: { id: msg.conversationId },
          data: { assignedTo: 'TEAM', status: 'OPEN' },
        });
        await prisma.conversationMessage.create({
          data: {
            conversationId: msg.conversationId,
            senderType: 'SYSTEM',
            body: `Bot: tidak ada automation yang cocok — diteruskan ke tim.`,
          },
        });
        continue;
      }
      const replyTpl = String(cfg.reply || '').trim();
      if (!replyTpl) continue;
      const reply = personalize(replyTpl, msg.customerName);

      // Simpan ke DB dulu (sumber kebenaran), lalu kirim via WA
      const saved = await prisma.conversationMessage.create({
        data: { conversationId: msg.conversationId, senderType: 'WOO', body: reply },
      });
      await prisma.conversation.update({
        where: { id: msg.conversationId },
        data: { lastMessageAt: new Date() },
      });
      try {
        const res = await sendText(orgId, { phone: msg.phone, waLid: msg.waLid }, reply);
        if (res.ok) {
          await prisma.conversationMessage.update({
            where: { id: saved.id },
            data: { metadata: JSON.stringify({ sentVia: 'whatsapp', botFlowId: flow.id }) },
          });
        }
      } catch (e: any) {
        console.error('[bot] kirim balasan gagal:', e?.message || e);
      }
      try {
        const { publishMessage, publishConversation } = await import('@/lib/realtime');
        publishMessage(orgId, {
          id: saved.id,
          conversationId: msg.conversationId,
          senderType: 'WOO',
          sender: null,
          body: reply,
          createdAt: new Date().toISOString(),
        });
        publishConversation(orgId, msg.conversationId);
      } catch {}
      replied = true;
      lastBotReply.set(msg.conversationId, Date.now());
    }

    await prisma.botFlow.update({
      where: { id: flow.id },
      data: { updatedAt: new Date() },
    });
    return replied || actions.length > 0;
  }

  return false;
}
