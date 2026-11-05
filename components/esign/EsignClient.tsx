'use client';

import { useEffect, useRef } from 'react';

/**
 * EsignClient (Fase 8) — subscribe SSE `/api/realtime` dan teruskan event
 * `esign:*` ke parent (daftar/detail me-refetch data secara senyap, tanpa
 * reload halaman penuh). Mengikuti pola `components/inbox/InboxClient.tsx`.
 * EventSource otomatis reconnect bila koneksi putus.
 */
export const ESIGN_REALTIME_EVENTS = [
  'esign:document:created',
  'esign:document:sent',
  'esign:document:viewed',
  'esign:approval:completed',
  'esign:signature:completed',
  'esign:signature:rejected',
  'esign:document:partially_signed',
  'esign:document:completed',
  'esign:document:cancelled',
  'esign:document:expired',
] as const;

export function EsignClient({ onEvent }: { onEvent: (event: string, data: any) => void }) {
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
    for (const ev of ESIGN_REALTIME_EVENTS) {
      es.addEventListener(ev, handler as EventListener);
    }
    return () => es.close();
  }, []);

  return null;
}
