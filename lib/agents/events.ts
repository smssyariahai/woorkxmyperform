import { publishAgent } from '@/lib/realtime';

/** Kirim event Kantor Virtual ke semua client SSE organisasi ini. */
export async function publishAgentEvent(
  organizationId: string,
  event: string,
  data: Record<string, any>
) {
  try {
    publishAgent(organizationId, event, { ...data, at: new Date().toISOString() });
  } catch (e) {
    console.error('[agents] publish gagal:', (e as Error).message);
  }
}
