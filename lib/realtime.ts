/**
 * Pub/sub real-time in-process untuk SSE (Server-Sent Events).
 * Satu proses `next start` = satu broker; cukup untuk deployment saat ini.
 */

export interface RealtimeMessage {
  id: string;
  conversationId: string;
  senderType: string;
  sender: { name: string } | null;
  body: string;
  createdAt: string;
}

type Subscriber = {
  orgId: string;
  enqueue: (chunk: string) => void;
  closed: boolean;
};

const subscribers = new Set<Subscriber>();

export function subscribe(orgId: string, enqueue: (chunk: string) => void): () => void {
  const sub: Subscriber = { orgId, enqueue, closed: false };
  subscribers.add(sub);
  return () => {
    sub.closed = true;
    subscribers.delete(sub);
  };
}

function broadcast(orgId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const s of subscribers) {
    if (s.closed || s.orgId !== orgId) continue;
    try {
      s.enqueue(payload);
    } catch {
      s.closed = true;
      subscribers.delete(s);
    }
  }
}

/** Pesan baru di sebuah percakapan (dari agen, Woo, maupun pelanggan). */
export function publishMessage(orgId: string, message: RealtimeMessage) {
  broadcast(orgId, 'message:new', { conversationId: message.conversationId, message });
}

/** Percakapan berubah (baru dibuat / assignment / dsb) — client refresh daftar. */
export function publishConversation(orgId: string, conversationId: string) {
  broadcast(orgId, 'conversation:update', { conversationId });
}

/** Event Kantor Virtual (agent:* / task:*) — client mendengarkan via /api/realtime. */
export function publishAgent(orgId: string, event: string, data: unknown) {
  broadcast(orgId, event, data);
}

/**
 * Hak akses modul berubah — sidebar pengguna yang bersangkutan refresh
 * otomatis tanpa reload manual (AppShell mendengarkan event ini).
 * userId null = berlaku untuk semua pengguna di kantor itu (modul tingkat
 * kantor / role berubah); userId terisi = hanya pengguna itu.
 */
export function publishModuleAccess(orgId: string, userId: string | null) {
  broadcast(orgId, 'module:access', { userId });
}
