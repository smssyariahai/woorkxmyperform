// EventDetailModal — detail event + aksi (edit, hapus, duplikat, RSVP,
// tambah peserta, buka modul sumber).

'use client';

import { useState } from 'react';
import { X, MapPin, Link2, Copy, Check, ExternalLink, Users, Bell, CalendarDays, Clock, Trash2, Pencil, CopyPlus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatTimeId,
  formatDateLongId,
  formatDateShortId,
  formatDuration,
  recurrenceSummary,
  type CalendarEvent,
} from '@/lib/calendar/client';

interface EventDetailModalProps {
  open: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (ev: CalendarEvent) => void;
  onDeleted: () => void;
  onDuplicated: () => void;
  onRsvpDone: () => void;
  canEdit: boolean;
  canDelete: boolean;
  myUserId: string | null;
}

const RSVP_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  ACCEPTED: 'Hadir',
  DECLINED: 'Tidak hadir',
  TENTATIVE: 'Tentatif',
};

const RSVP_STYLE: Record<string, string> = {
  ACCEPTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  DECLINED: 'bg-danger/10 text-danger',
  TENTATIVE: 'bg-warn/15 text-warn',
  PENDING: 'bg-slate-100 text-muted dark:bg-slate-800',
};

export function EventDetailModal({ open, event, onClose, onEdit, onDeleted, onDuplicated, onRsvpDone, canEdit, canDelete, myUserId }: EventDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<'series' | 'instance' | 'following'>('series');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open || !event) return null;

  const isSource = !!event.sourceModule;
  const myAttendee = event.attendees.find((a) => a.userId === myUserId);
  const canRsvp = !!myAttendee || event.visibility === 'COMPANY' || event.visibility === 'TEAM' || event.visibility === 'DEPARTMENT';

  const doRsvp = async (status: string) => {
    setBusy(true);
    try {
      await apiJson(`/api/calendar/events/${encodeURIComponent(event.id.split('@')[0])}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseStatus: status }),
      });
      toast.success(`RSVP: ${RSVP_LABEL[status] ?? status}.`);
      onRsvpDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan RSVP.');
    } finally {
      setBusy(false);
    }
  };

  const doDuplicate = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/calendar/events/${encodeURIComponent(event.id.split('@')[0])}/duplicate`, { method: 'POST' });
      toast.success('Event diduplikat.');
      onDuplicated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menduplikat event.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      // instanceStart dikirim sebagai query param (bukan body) — sesuai kontrak backend.
      let qs = '';
      if (event.isRecurring && deleteScope !== 'series') {
        const instanceStart = event.originalStartAt ?? event.startAt;
        qs = `?scope=${deleteScope}&instanceStart=${encodeURIComponent(instanceStart)}`;
      } else if (event.isRecurring) {
        qs = '?scope=series';
      }
      const id = event.isRecurrenceInstance ? (event.recurrenceParentId ?? event.id.split('@')[0]) : event.id.split('@')[0];
      const url = `/api/calendar/events/${encodeURIComponent(id)}${qs}`;
      await apiJson(url, { method: 'DELETE' });
      toast.success('Event dihapus.');
      onDeleted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus event.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const copyLink = async () => {
    if (!event.meetingLink) return;
    try {
      await navigator.clipboard.writeText(event.meetingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Gagal menyalin link.');
    }
  };

  const whenLabel = event.isAllDay
    ? `${formatDateLongId(event.startAt)}${new Date(event.endAt).getTime() - new Date(event.startAt).getTime() > 24 * 3600 * 1000 ? ` – ${formatDateLongId(new Date(new Date(event.endAt).getTime() - 1))}` : ''} · Sepanjang hari`
    : `${formatDateLongId(event.startAt)} · ${formatTimeId(event.startAt)} – ${formatTimeId(event.endAt)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detail event"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: event.categoryColor }}
          >
            <CalendarDays className="h-3.5 w-3.5" /> {event.categoryLabel}
          </span>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="text-lg font-bold leading-snug text-ink">{event.title}</h2>

        <div className="mt-3 space-y-2.5 text-[13px] text-ink/85">
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>{whenLabel} <span className="text-muted">({formatDuration(event.startAt, event.endAt, event.isAllDay)})</span></span>
          </p>
          {event.isRecurring && (
            <p className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <span>Berulang: {recurrenceSummary(event.recurrenceRule) || 'ya'}</span>
            </p>
          )}
          {event.location && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <span>{event.location}</span>
            </p>
          )}
          {event.meetingLink && (
            <p className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-muted" />
              <a href={event.meetingLink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-brand-600 hover:underline dark:text-brand-400">
                {event.meetingLink}
              </a>
              <button type="button" onClick={copyLink} aria-label="Salin link meeting" className="shrink-0 rounded-btn p-1 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </p>
          )}
          <p className="flex items-start gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>Dibuat oleh <strong>{event.createdByName ?? event.createdByEmail ?? '—'}</strong> · Visibilitas: {event.visibility} · Status: {event.status}</span>
          </p>
          {event.sourceModule && (
            <p className="flex items-center gap-2 rounded-btn border border-line bg-canvas px-3 py-2 dark:bg-slate-800/50">
              <span className="text-muted">Sumber: <strong className="text-ink">{event.sourceModuleLabel ?? event.sourceModule}</strong></span>
              {event.sourceUrl && (
                <a href={event.sourceUrl} className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  <ExternalLink className="h-3.5 w-3.5" /> Buka di modul sumber
                </a>
              )}
            </p>
          )}
        </div>

        {event.description && (
          <div className="mt-4">
            <p className="mb-1 text-[12px] font-semibold text-ink/80">Deskripsi</p>
            <p className="whitespace-pre-wrap rounded-btn border border-line bg-canvas p-3 text-[13px] text-ink/85 dark:bg-slate-800/50">{event.description}</p>
          </div>
        )}

        {/* Peserta */}
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-semibold text-ink/80">
            Peserta ({event.attendees.length})
          </p>
          {event.attendees.length === 0 ? (
            <p className="text-[13px] text-muted">Tidak ada peserta.</p>
          ) : (
            <ul className="space-y-1.5">
              {event.attendees.map((a) => (
                <li key={a.userId} className="flex items-center gap-2 text-[13px]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-100">
                    {(a.name ?? a.email ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink/85">{a.name ?? a.email ?? '—'}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', RSVP_STYLE[a.responseStatus] ?? RSVP_STYLE.PENDING)}>
                    {RSVP_LABEL[a.responseStatus] ?? a.responseStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pengingat */}
        {event.reminders && event.reminders.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink/80">
              <Bell className="h-3.5 w-3.5" /> Pengingat
            </p>
            <ul className="space-y-1 text-[13px] text-ink/85">
              {event.reminders.map((r) => (
                <li key={r.id}>
                  {r.minutesBefore === 0 ? 'Saat event dimulai' : r.minutesBefore >= 60 ? `${Math.floor(r.minutesBefore / 60)} jam sebelumnya` : `${r.minutesBefore} menit sebelumnya`}
                  {' '}· {r.deliveryStatus === 'SENT' ? 'terkirim' : r.deliveryStatus === 'FAILED' ? 'gagal' : 'menunggu'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* RSVP saya */}
        {canRsvp && (
          <div className="mt-5 rounded-btn border border-line p-3">
            <p className="mb-2 text-[12px] font-semibold text-ink/80">
              RSVP saya: {myAttendee ? RSVP_LABEL[myAttendee.responseStatus] ?? myAttendee.responseStatus : 'belum merespons'}
            </p>
            <div className="flex flex-wrap gap-2">
              {(['ACCEPTED', 'TENTATIVE', 'DECLINED'] as const).map((s) => (
                <button
                  key={s} type="button" disabled={busy}
                  onClick={() => void doRsvp(s)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
                    myAttendee?.responseStatus === s
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-ink/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                  )}
                >
                  {s === 'ACCEPTED' ? 'Hadir' : s === 'TENTATIVE' ? 'Tentatif' : 'Tidak hadir'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Aksi */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {canEdit && !isSource && (
            <button type="button" onClick={() => onEdit(event)} className="inline-flex items-center gap-1.5 rounded-btn bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {canEdit && !isSource && (
            <button type="button" onClick={() => onEdit(event)} className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3.5 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
              <UserPlus className="h-4 w-4" /> Tambah Peserta
            </button>
          )}
          {!isSource && (
            <button type="button" disabled={busy} onClick={() => void doDuplicate()} className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3.5 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800">
              <CopyPlus className="h-4 w-4" /> Duplikat
            </button>
          )}
          {canDelete && !isSource && (
            <button
              type="button" disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-btn border border-danger/40 px-3.5 py-2 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Hapus
            </button>
          )}
        </div>

        {confirmDelete && (
          <div className="mt-3 rounded-btn border border-danger/40 bg-danger/10 p-3">
            <p className="text-[13px] font-semibold text-danger">Hapus event ini?</p>
            {event.isRecurring && (
              <div className="mt-2 flex flex-col gap-1.5">
                {([
                  ['series', 'Seluruh rangkaian'],
                  ['instance', 'Hanya event ini'],
                  ['following', 'Event ini dan berikutnya'],
                ] as const).map(([v, label]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/85">
                    <input type="radio" name="del-scope" checked={deleteScope === v} onChange={() => setDeleteScope(v)} className="h-4 w-4 accent-danger" />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void doDelete()} className="rounded-btn bg-danger px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                {busy ? 'Menghapus...' : 'Ya, hapus'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-btn border border-line px-3.5 py-2 text-[13px] font-semibold text-ink/80">
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
