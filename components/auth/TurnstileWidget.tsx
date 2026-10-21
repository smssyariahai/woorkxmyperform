'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, any>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

/**
 * Widget Cloudflare Turnstile. Memuat script resmi Cloudflare sekali,
 * me-render checkbox, dan mengembalikan token via onVerify.
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
}: {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef({ onVerify, onExpire });
  cb.current = { onVerify, onExpire };

  useEffect(() => {
    let cancelled = false;
    function render() {
      if (cancelled || !ref.current || !window.turnstile) return;
      if (widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => cb.current.onVerify(token),
        'expired-callback': () => cb.current.onExpire?.(),
        'error-callback': () => cb.current.onExpire?.(),
        theme: 'auto',
      });
    }
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener('load', render, { once: true });
    } else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-turnstile', '1');
      s.addEventListener('load', render, { once: true });
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {}
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={ref} className="flex justify-center" />;
}
