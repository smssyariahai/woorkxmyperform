// Minimal .env loader for tenant code (master DB / crypto).
// Reads .env from the process working directory (the repo root when scripts
// and the Next.js server run) only for variables missing from process.env.
// Values may be wrapped in single or double quotes — quotes are stripped,
// mirroring the loadEnv() pattern in scripts/calendar-sync.ts.
import * as fs from 'fs';
import * as path from 'path';

let loaded = false;

export function loadTenantEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(process.cwd(), '.env');
  try {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Unreadable .env — environment variables may already be set.
  }
}

export function requireEnv(key: string): string {
  loadTenantEnv();
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable ${key}`);
  return v;
}
