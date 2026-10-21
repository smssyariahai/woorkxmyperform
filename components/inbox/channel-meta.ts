// Metadata channel — modul mandiri (tanpa circular import).
export const CHANNEL_META: Record<string, { label: string; color: string; short: string }> = {
  WHATSAPP: { label: 'WhatsApp', color: '#22C55E', short: 'WA' },
  INSTAGRAM: { label: 'Instagram', color: '#C13584', short: 'IG' },
  FACEBOOK: { label: 'Facebook', color: '#1877F2', short: 'FB' },
  WEBSITE: { label: 'Website', color: '#64748B', short: 'WEB' },
};

export function channelMeta(type: string) {
  return CHANNEL_META[type] ?? { label: type, color: '#64748B', short: type.slice(0, 2) };
}
