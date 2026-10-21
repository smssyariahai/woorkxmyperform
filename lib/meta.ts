/**
 * Integrasi Meta (Facebook & Instagram) via OAuth Login.
 * Butuh META_APP_ID & META_APP_SECRET di environment.
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

export function metaConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://woork-saas.xsramazys.dev'
  ).replace(/\/$/, '');
}

export function metaRedirectUri(): string {
  return `${appUrl()}/api/channels/meta/callback`;
}

const SCOPES = {
  facebook: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_messaging',
  ],
  // Instagram Business dihubungkan via Halaman Facebook tertaut, jadi pakai scope pages_* yang sama.
  // (instagram_basic & instagram_manage_messages sudah deprecated/tidak valid di Facebook Login.)
  instagram: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_messaging',
  ],
} as const;

export type MetaProvider = keyof typeof SCOPES;

/** URL otorisasi Meta untuk memulai login. */
export function metaAuthUrl(provider: MetaProvider, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    redirect_uri: metaRedirectUri(),
    scope: SCOPES[provider].join(','),
    state,
    response_type: 'code',
  });
  return `${OAUTH_DIALOG}?${params.toString()}`;
}

/** Tukar authorization code -> short-lived user token. */
export async function exchangeCode(code: string): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    client_secret: process.env.META_APP_SECRET || '',
    redirect_uri: metaRedirectUri(),
    code,
  });
  const r = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || 'Gagal menukar kode otorisasi.');
  return j;
}

/** Perpanjang ke long-lived token (60 hari). */
export async function extendToken(shortToken: string): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID || '',
    client_secret: process.env.META_APP_SECRET || '',
    fb_exchange_token: shortToken,
  });
  const r = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || 'Gagal memperpanjang token.');
  return j;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
  igUsername?: string;
}

/** Daftar Halaman Facebook milik user beserta akun IG yang tertaut. */
export async function getUserPages(userToken: string): Promise<MetaPage[]> {
  const params = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: userToken,
    limit: '50',
  });
  const r = await fetch(`${GRAPH}/me/accounts?${params.toString()}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || 'Gagal mengambil daftar Halaman.');
  return (j.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    access_token: p.access_token,
    instagram_business_account: p.instagram_business_account,
    igUsername: p.instagram_business_account?.username,
  }));
}

/** Verifikasi webhook Meta (GET). */
export function verifyWebhook(mode: string | null, token: string | null, challenge: string | null): string | null {
  const verifyToken = process.env.META_VERIFY_TOKEN || 'woork-meta-webhook';
  if (mode === 'subscribe' && token === verifyToken && challenge) return challenge;
  return null;
}
