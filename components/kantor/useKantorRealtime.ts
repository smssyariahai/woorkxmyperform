'use client';

import { useEffect, useRef } from 'react';

/**
 * useKantorRealtime — subscribe SSE `/api/realtime` untuk event Kantor
 * Virtual (Wave 10 — sinkronisasi realtime; Wave 11 menambah
 * `kantor.sleep_changed`).
 *
 * Mengikuti pola `components/esign/EsignClient.tsx` (dan InboxClient):
 * satu EventSource ke `/api/realtime` (org-scoped, heartbeat 25 dtk,
 * auto-reconnect oleh browser), satu listener per nama event. Event
 * dipublish scheduler lewat `publishAgentEvent` (lib/agents/events.ts →
 * lib/realtime.ts `publishAgent`); hook ini HANYA mendengarkan — scheduler
 * tetap satu-satunya penulis status tugas/agent.
 *
 * Callback dipanggil untuk tiap event; pemanggil yang memutuskan apa yang
 * di-refresh (biasanya `load()` dengan debounce ringan ~250 ms, karena
 * `task.progress` bisa datang beruntun). Polling yang sudah ada di tiap
 * komponen TETAP dipertahankan sebagai fallback bila SSE putus.
 *
 * Catatan: `task.created` juga didengarkan — dipublish
 * `app/api/agent-tasks/route.ts` saat perintah baru dibuat, supaya user
 * lain melihat tugas antre tanpa menunggu poll berikutnya.
 * `kantor.sleep_changed` didengarkan juga — dipublish
 * `app/api/kantor/sleep/route.ts` saat status Tidur bersama berubah.
 * `kantor.theme_changed` didengarkan juga (Wave 15) — dipublish
 * `app/api/kantor/theme/route.ts` saat tema scene bersama berubah.
 */
export const KANTOR_REALTIME_EVENTS = [
  'agent.status_changed',
  'agent.activity_updated',
  'agent.connected',
  'task.created',
  'task.queued',
  'task.started',
  'task.progress',
  'task.waiting_approval',
  'task.completed',
  'task.failed',
  'task.cancelled',
  'notification.created',
  'kantor.sleep_changed',
  'kantor.theme_changed',
  'kantor.prayer_changed',
  'kantor.briefing_changed',
] as const;

export type KantorRealtimeEvent = (typeof KANTOR_REALTIME_EVENTS)[number];

export function useKantorRealtime(
  onEvent: (event: string, data: unknown) => void,
): void {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/api/realtime');
    const handler = (e: MessageEvent) => {
      try {
        cbRef.current(e.type, JSON.parse(e.data));
      } catch {
        /* abaikan payload yang bukan JSON */
      }
    };
    for (const ev of KANTOR_REALTIME_EVENTS) {
      es.addEventListener(ev, handler as EventListener);
    }
    return () => es.close();
  }, []);
}
