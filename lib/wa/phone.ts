// Normalisasi nomor HP Indonesia -> format internasional tanpa '+'.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  // nomor tanpa kode negara yang panjangnya wajar -> anggap Indonesia
  if (d.length >= 9 && d.length <= 13) return '62' + d;
  return d;
}

/** JID WhatsApp untuk nomor individu. */
export function phoneToJid(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? `${n}@s.whatsapp.net` : null;
}

/** Ambil nomor dari JID (s.whatsapp.net / lid). */
export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const user = jid.split('@')[0].split(':')[0];
  return normalizePhone(user);
}

/** Samakan dua nomor untuk pencocokan (bandingkan digit inti). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return !!na && !!nb && na === nb;
}
