import { requireAuth } from '@/lib/auth-helpers';
import { subscribe } from '@/lib/realtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/realtime — Server-Sent Events untuk update inbox real-time.
 * Client: new EventSource('/api/realtime')
 * Events: `message:new`, `conversation:update`
 */
export async function GET() {
  let orgId: string;
  try {
    const ctx = await requireAuth();
    orgId = ctx.organizationId;
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          /* koneksi sudah tutup */
        }
      };
      unsubscribe = subscribe(orgId, enqueue);
      // sapaan awal agar client tahu koneksi hidup
      enqueue(`event: connected\ndata: {"ok":true}\n\n`);
      // heartbeat tiap 25 dtk agar proxy/tunnel tidak menutup koneksi idle
      heartbeat = setInterval(() => enqueue(`: ping\n\n`), 25000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
