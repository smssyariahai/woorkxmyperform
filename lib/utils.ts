export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function maskPhone(phone?: string | null): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (d.length < 8) return d || '-';
  return d.slice(0, 4) + '*****' + d.slice(-3);
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'kemarin';
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export function apiOk<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function apiErr(message: string, status = 400, errors: unknown = []) {
  return Response.json({ success: false, message, errors }, { status });
}
