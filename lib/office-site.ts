import { headers } from 'next/headers';

const DOMAIN = 'xsramazys.dev';

/**
 * Base path untuk link di situs publik kantor.
 * - Diakses via <sub>.xsramazys.dev  -> ''  (link bersih: /lowongan/xxx)
 * - Diakses via domain utama           -> '/o/<sub>' (link: /o/<sub>/lowongan/xxx)
 */
export function officeBase(subdomain: string): string {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  if (host === `${subdomain.toLowerCase()}.${DOMAIN}`) return '';
  return `/o/${subdomain}`;
}

/** Link ke beranda situs kantor (menangani base kosong). */
export function officeHome(subdomain: string): string {
  return officeBase(subdomain) || '/';
}
