/**
 * Tautan publik E-Sign (tanpa dependensi WA — supaya modul Q&A bisa
 * diuji tanpa memuat lib/wa/manager).
 */
export const ESIGN_APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'https://woork-saas.xsramazys.dev'
).replace(/\/$/, '');

/** Tautan akses pribadi penandatangan (token acak, tanpa info sensitif). */
export function esignSignLink(token: string | null | undefined): string | null {
  return token ? `${ESIGN_APP_URL}/esign/sign/${token}` : null;
}
