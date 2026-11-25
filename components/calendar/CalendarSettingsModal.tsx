// CalendarSettingsModal — preferensi kalender per pengguna
// (default view, hari pertama minggu, zona waktu, jam kerja, reminder
// default, preferensi notifikasi). Disimpan via PUT /api/calendar/preferences.

'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { apiJson, REMINDER_OPTIONS, type CalendarPreferences, type CalendarView } from '@/lib/calendar/client';
import { cn } from '@/lib/utils';

interface CalendarSettingsModalProps {
  open: boolean;
  preferences: CalendarPreferences | null;
  onClose: () => void;
  onSaved: (prefs: CalendarPreferences) => void;
}

const VIEWS: Array<{ key: CalendarView; label: string }> = [
  { key: 'day', label: 'Harian' },
  { key: 'week', label: 'Mingguan' },
  { key: 'month', label: 'Bulanan' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'year', label: 'Tahunan' },
  { key: 'timeline', label: 'Timeline' },
];

const WORKDAYS = [
  { key: 'mon', label: 'Sen' },
  { key: 'tue', label: 'Sel' },
  { key: 'wed', label: 'Rab' },
  { key: 'thu', label: 'Kam' },
  { key: 'fri', label: 'Jum' },
  { key: 'sat', label: 'Sab' },
  { key: 'sun', label: 'Min' },
];

export function CalendarSettingsModal({ open, preferences, onClose, onSaved }: CalendarSettingsModalProps) {
  const [defaultView, setDefaultView] = useState<CalendarView>('month');
  const [firstDayOfWeek, setFirstDayOfWeek] = useState(1);
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [workDays, setWorkDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [defaultReminder, setDefaultReminder] = useState(15);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !preferences) return;
    setDefaultView(preferences.defaultView);
    setFirstDayOfWeek(preferences.firstDayOfWeek);
    setTimezone(preferences.timezone || 'Asia/Jakarta');
    const wh = (preferences.workingHours ?? {}) as Record<string, unknown>;
    if (typeof wh.start === 'string') setWorkStart(wh.start);
    if (typeof wh.end === 'string') setWorkEnd(wh.end);
    if (Array.isArray(wh.days)) setWorkDays(wh.days.filter((d): d is string => typeof d === 'string'));
    const np = (preferences.notificationPreferences ?? {}) as Record<string, unknown>;
    if (typeof np.defaultReminderMinutes === 'number') setDefaultReminder(np.defaultReminderMinutes);
    if (typeof np.remindersEnabled === 'boolean') setRemindersEnabled(np.remindersEnabled);
    setError('');
  }, [open, preferences]);

  if (!open) return null;

  const inputCls = 'w-full rounded-btn border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:bg-slate-900';
  const labelCls = 'mb-1 block text-[12px] font-semibold text-ink/80';

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await apiJson<CalendarPreferences>('/api/calendar/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultView,
          timezone,
          firstDayOfWeek,
          workingHours: { start: workStart, end: workEnd, days: workDays },
          notificationPreferences: { defaultReminderMinutes: defaultReminder, remindersEnabled },
        }),
      });
      toast.success('Pengaturan kalender disimpan.');
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pengaturan kalender"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Pengaturan Kalender</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Tampilan default</label>
            <div className="flex flex-wrap gap-1.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key} type="button"
                  onClick={() => setDefaultView(v.key)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    defaultView === v.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cal-first-day" className={labelCls}>Hari pertama minggu</label>
              <select id="cal-first-day" value={firstDayOfWeek} onChange={(e) => setFirstDayOfWeek(parseInt(e.target.value, 10))} className={inputCls}>
                <option value={1}>Senin</option>
                <option value={0}>Minggu</option>
              </select>
            </div>
            <div>
              <label htmlFor="cal-tz" className={labelCls}>Zona waktu</label>
              <select id="cal-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Jam kerja</label>
            <div className="flex items-center gap-2">
              <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className={inputCls} aria-label="Jam kerja mulai" />
              <span className="text-muted">–</span>
              <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className={inputCls} aria-label="Jam kerja selesai" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WORKDAYS.map((d) => {
                const active = workDays.includes(d.key);
                return (
                  <button
                    key={d.key} type="button"
                    onClick={() => setWorkDays(active ? workDays.filter((x) => x !== d.key) : [...workDays, d.key])}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors',
                      active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="cal-reminder" className={labelCls}>Pengingat default</label>
            <select id="cal-reminder" value={defaultReminder} onChange={(e) => setDefaultReminder(parseInt(e.target.value, 10))} className={inputCls}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.minutes} value={o.minutes}>{o.label}</option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink/80">
            <input type="checkbox" checked={remindersEnabled} onChange={(e) => setRemindersEnabled(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Aktifkan pengingat event
          </label>
          {!remindersEnabled && (
            <p className="text-[12px] text-muted">Pengingat dimatikan — event baru tidak akan membuat pengingat otomatis.</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="rounded-btn border border-line px-4 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
            Batal
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-btn bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Simpan pengaturan'}
          </button>
        </div>
      </div>
    </div>
  );
}
