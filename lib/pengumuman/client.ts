// Client helper Modul Pengumuman — pengganti panggilan backup ke
// /api/pg/islami/announcements*, /api/pg/islami/announcement-drafts,
// /api/pg/islami/scheduled-announcements, dan notification-preferences.
// Di WOORK semua lewat API /api/pengumuman/* (NextAuth, session dibaca
// server dari cookie — user TIDAK perlu dioper ke API). Respons dibungkus
// { success, data: {...} }.

import type { AnnouncementPrefs } from './preferences';

export type Priority = 'normal' | 'penting' | 'mendesak';
export type TargetMode = 'all' | 'targeted';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published';

export interface Announcement {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  category: string;
  priority: Priority;
  route: string;
  customRoute: string;
  targetMode: TargetMode;
  target: { userEmails?: string[] };
  filters: Record<string, unknown>;
  channels: { app: boolean; email: boolean };
  recipientEmails: string[];
  status: AnnouncementStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  emailStatus: string;
  emailSent: number;
  emailFailed: number;
  emailError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  summary?: string;
  content?: string;
  imageUrl?: string | null;
  category?: string;
  priority?: Priority;
  targetMode?: TargetMode;
  target?: { userEmails?: string[] };
  channels?: { app: boolean; email: boolean };
  scheduledAt?: string | null;
}

export interface PublishResult {
  announcement: Announcement;
  inAppSent: number;
  email: { status: string; sent: number; failed: number };
  recipients: number;
}

export interface RecipientUser {
  id: string;
  name: string;
  email: string;
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data;
}

export async function listAnnouncements(
  status?: AnnouncementStatus | '',
  q?: string
): Promise<Announcement[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const qs = params.toString();
  const data = await apiJson(`/api/pengumuman${qs ? `?${qs}` : ''}`);
  return (data.announcements ?? []) as Announcement[];
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  const data = await apiJson(`/api/pengumuman/${id}`);
  return data.announcement as Announcement;
}

export async function createAnnouncement(
  input: AnnouncementInput
): Promise<Announcement> {
  const data = await apiJson('/api/pengumuman', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as Announcement;
}

export async function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput>
): Promise<Announcement> {
  const data = await apiJson(`/api/pengumuman/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.announcement as Announcement;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await apiJson(`/api/pengumuman/${id}`, { method: 'DELETE' });
}

export async function publishAnnouncement(
  id: string
): Promise<PublishResult> {
  const data = await apiJson(`/api/pengumuman/${id}/publish`, {
    method: 'POST',
  });
  return data as PublishResult;
}

export async function markAnnouncementRead(id: string): Promise<void> {
  await apiJson(`/api/pengumuman/${id}/baca`, { method: 'POST' });
}

export async function getRecipients(
  mode: TargetMode,
  emails?: string[]
): Promise<{ total: number; users: RecipientUser[] }> {
  const params = new URLSearchParams({ mode });
  if (emails && emails.length > 0) params.set('emails', emails.join(','));
  return (await apiJson(
    `/api/pengumuman/penerima?${params.toString()}`
  )) as { total: number; users: RecipientUser[] };
}

export async function getPreferences(): Promise<{
  preferences: AnnouncementPrefs;
  saved: boolean;
}> {
  return (await apiJson('/api/pengumuman/preferences')) as {
    preferences: AnnouncementPrefs;
    saved: boolean;
  };
}

export async function savePreferences(
  preferences: AnnouncementPrefs
): Promise<AnnouncementPrefs> {
  const data = await apiJson('/api/pengumuman/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
  return data.preferences as AnnouncementPrefs;
}

export function formatTanggal(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTanggalJam(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  normal: 'Normal',
  penting: 'Penting',
  mendesak: 'Mendesak',
};

export const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  published: 'Terkirim',
};
