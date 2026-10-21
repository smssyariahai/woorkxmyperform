'use client';

import { useEffect, useState } from 'react';

export interface AuthConfig {
  googleEnabled: boolean;
  turnstileSiteKey: string | null;
}

/** Konfigurasi auth publik (tombol Google, Turnstile) — dimuat saat halaman dibuka. */
export function useAuthConfig(): AuthConfig | null {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  useEffect(() => {
    fetch('/api/public/auth-config')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setCfg(j.data);
      })
      .catch(() => {});
  }, []);
  return cfg;
}
