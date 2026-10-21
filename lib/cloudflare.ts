/**
 * Helper Cloudflare (SERVER ONLY — jangan diimpor di client component).
 * Mengelola DNS subdomain kantor. Token dibaca dari ~/.cloudflared/cert.pem
 * (format "ARGO TUNNEL TOKEN" berisi zoneID + apiToken).
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TUNNEL_ID = 'fb39b2ec-0817-4ed2-b2e2-34908fc4ac72';
const DOMAIN = 'xsramazys.dev';

interface CfCreds {
  zoneID: string;
  apiToken: string;
}

let credsCache: CfCreds | null = null;

function getCreds(): CfCreds | null {
  if (credsCache) return credsCache;
  try {
    const p = join(homedir(), '.cloudflared', 'cert.pem');
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, 'utf8');
    const b64 = raw
      .split('\n')
      .filter((l) => l && !l.includes('BEGIN') && !l.includes('END'))
      .join('');
    const d = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!d.zoneID || !d.apiToken) return null;
    credsCache = { zoneID: d.zoneID, apiToken: d.apiToken };
    return credsCache;
  } catch {
    return null;
  }
}

async function cf(path: string, method: string, body?: any) {
  const creds = getCreds();
  if (!creds) throw new Error('Kredensial Cloudflare tidak tersedia.');
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json();
  return { ok: j.success === true, data: j };
}

/**
 * Pastikan CNAME <subdomain>.xsramazys.dev -> tunnel woork-saas ada.
 * Mengembalikan { ok, alreadyExisted }.
 */
export async function ensureOfficeDns(
  subdomain: string
): Promise<{ ok: boolean; alreadyExisted: boolean; error?: string }> {
  const name = `${subdomain}.${DOMAIN}`;
  try {
    const list = await cf(
      `/zones/${getCreds()!.zoneID}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
      'GET'
    );
    const existing = (list.data?.result ?? []).find((r: any) => r.name === name);
    if (existing) return { ok: true, alreadyExisted: true };
    const created = await cf(`/zones/${getCreds()!.zoneID}/dns_records`, 'POST', {
      type: 'CNAME',
      name,
      content: `${TUNNEL_ID}.cfargotunnel.com`,
      proxied: true,
      ttl: 1,
      comment: `Subdomain kantor WOORK SaaS (${subdomain})`,
    });
    if (!created.ok) {
      const msg =
        created.data?.errors?.[0]?.message ?? 'Gagal membuat DNS record.';
      return { ok: false, alreadyExisted: false, error: msg };
    }
    return { ok: true, alreadyExisted: false };
  } catch (e: any) {
    return { ok: false, alreadyExisted: false, error: e.message ?? 'Koneksi Cloudflare gagal.' };
  }
}

/** Hapus DNS record subdomain (dipakai saat subdomain diganti/dihapus). */
export async function deleteOfficeDns(subdomain: string): Promise<boolean> {
  const name = `${subdomain}.${DOMAIN}`;
  try {
    const creds = getCreds();
    if (!creds) return false;
    const list = await cf(
      `/zones/${creds.zoneID}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
      'GET'
    );
    for (const r of list.data?.result ?? []) {
      if (r.name === name) {
        await cf(`/zones/${creds.zoneID}/dns_records/${r.id}`, 'DELETE');
      }
    }
    return true;
  } catch {
    return false;
  }
}
