// Ringkasan Akhir Hari + Catatan Harian (editor + visibilitas).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Video, Save } from 'lucide-react';
import type { DaySummaryResponse, DailyNote } from './types';

export function DaySummary({
  summary,
  loading,
  note,
  noteLoading,
  onSaveNote,
  savingNote,
}: {
  summary: DaySummaryResponse | null;
  loading: boolean;
  note: DailyNote | null;
  noteLoading: boolean;
  onSaveNote: (title: string, content: string, visibility: string) => void;
  savingNote: boolean;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('PRIVATE');
  const [initialized, setInitialized] = useState(false);

  // Isi editor dari catatan yang dimuat (sekali per catatan).
  if (note && !initialized) {
    setTitle(note.title ?? '');
    setContent(note.content ?? '');
    setVisibility(note.visibility);
    setInitialized(true);
  }
  if (!note && initialized) {
    setTitle('');
    setContent('');
    setVisibility('PRIVATE');
    setInitialized(false);
  }

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="text-[15px] font-semibold text-ink">Ringkasan Akhir Hari</h2>
      {loading || !summary ? (
        <div className="mt-4 h-24 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-btn bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <p className="text-[20px] font-bold text-ink">{summary.tasksCompleted.length}</p>
            <p className="text-[11px] text-muted">Tugas Selesai</p>
          </div>
          <div className="rounded-btn bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <p className="text-[20px] font-bold text-ink">{summary.tasksPending.length}</p>
            <p className="text-[11px] text-muted">Belum Selesai</p>
          </div>
          <div className="rounded-btn bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <p className="text-[20px] font-bold text-ink">{summary.agendaDone}/{summary.agendaTotal}</p>
            <p className="text-[11px] text-muted">Agenda Terlaksana</p>
          </div>
          <div className="rounded-btn bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <p className="text-[20px] font-bold text-red-600 dark:text-red-400">{summary.missedDeadlines}</p>
            <p className="text-[11px] text-muted">Deadline Terlewat</p>
          </div>
        </div>
      )}

      {summary && summary.meetingsAttended.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {summary.meetingsAttended.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-[13px] text-ink">
              <Video className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="shrink-0 text-[12px] text-muted">{m.status}</span>
              <Link href={m.sourceUrl} className="shrink-0 text-[12px] font-semibold text-brand hover:underline">
                Buka
              </Link>
            </li>
          ))}
        </ul>
      )}
      {summary && summary.tasksCompleted.length > 0 && (
        <ul className="mt-3 space-y-1">
          {summary.tasksCompleted.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-[13px] text-ink">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="truncate">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
      {summary && summary.tasksPending.length > 0 && (
        <ul className="mt-2 space-y-1">
          {summary.tasksPending.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-[13px] text-muted">
              <Circle className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.title}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-[14px] font-semibold text-ink">Catatan Harian</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          Catatan bersifat pribadi secara default — tidak menjadi laporan perusahaan tanpa persetujuan Anda.
        </p>
        {noteLoading ? (
          <div className="mt-3 h-24 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="mt-3 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul catatan (opsional)"
              className="w-full rounded-btn border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Apa yang sudah dikerjakan hari ini? Kendala apa yang dihadapi? Prioritas besok?"
              rows={4}
              className="w-full resize-y rounded-btn border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                aria-label="Visibilitas catatan"
                className="rounded-btn border border-line bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
              >
                <option value="PRIVATE">Pribadi</option>
                <option value="TEAM">Bagikan ke Tim</option>
                <option value="MANAGER">Bagikan ke Manager</option>
              </select>
              <button
                type="button"
                disabled={savingNote || (!title.trim() && !content.trim())}
                onClick={() => onSaveNote(title.trim(), content.trim(), visibility)}
                className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingNote ? 'Menyimpan…' : 'Simpan Catatan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
