// EventFormModal — buat / edit event kalender.
// Validasi end > start, recurrence (RRULE), attendees, reminders, dan
// peringatan konflik (cek sisi klien sebelum simpan; backend juga
// mengembalikan konflik tapi tidak memblokir).

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, ExternalLink, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  apiJson,
  EVENT_CATEGORIES,
  VISIBILITY_LABELS,
  REMINDER_OPTIONS,
  WEEKDAYS_RRULE,
  buildRRuleString,
  parseRRuleString,
  jakartaParts,
  jakartaDayStart,
  toJakartaDateKey,
  dateKeyToJakartaDate,
  addDays,
  formatTimeId,
  formatDateShortId,
  type CalendarEvent,
  type OrgMember,
  type RecurrenceFormValue,
} from '@/lib/calendar/client';

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: { startAt: Date; endAt: Date; isAllDay: boolean } | null;
  event?: CalendarEvent | null;
  existingEvents: CalendarEvent[];
  myUserId: string | null;
}

const RECURRENCE_PRESETS: Array<{ key: string; label: string }> = [
  { key: 'none', label: 'Tidak berulang' },
  { key: 'DAILY', label: 'Setiap hari' },
  { key: 'WEEKLY', label: 'Setiap minggu' },
  { key: 'MONTHLY', label: 'Setiap bulan' },
  { key: 'YEARLY', label: 'Setiap tahun' },
  { key: 'custom', label: 'Kustom' },
];

const WEEKDAY_LABELS: Record<string, string> = {
  MO: 'Sen', TU: 'Sel', WE: 'Rab', TH: 'Kam', FR: 'Jum', SA: 'Sab', SU: 'Min',
};

interface ConflictHit {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  severity: 'hard' | 'info';
}

function dateInputValue(d: Date): string {
  return toJakartaDateKey(d);
}
function timeInputValue(d: Date): string {
  const p = jakartaParts(d);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function EventFormModal({ open, onClose, onSaved, initial, event, existingEvents, myUserId }: EventFormModalProps) {
  const isEdit = !!event;
  const isSourceEvent = !!event?.sourceModule;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('meeting');
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [visibility, setVisibility] = useState('COMPANY');
  const [recurrencePreset, setRecurrencePreset] = useState('none');
  const [recurrence, setRecurrence] = useState<RecurrenceFormValue>({
    freq: 'WEEKLY', interval: 1, byweekday: [], bymonthday: [], endMode: 'never', until: '', count: 10,
  });
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<number[]>([]);
  const [scope, setScope] = useState<'series' | 'instance' | 'following'>('series');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersNote, setMembersNote] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [conflicts, setConflicts] = useState<ConflictHit[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Isi form dari event yang diedit / slot yang diklik.
  useEffect(() => {
    if (!open) return;
    setConflicts(null);
    setError('');
    setMemberQuery('');
    if (event) {
      const s = new Date(event.startAt);
      const e = new Date(event.endAt);
      setTitle(event.title);
      setDescription(event.description ?? '');
      setCategory(event.category);
      setIsAllDay(event.isAllDay);
      setStartDate(dateInputValue(s));
      setStartTime(timeInputValue(s));
      // All-day: endAt tersimpan eksklusif (hari berikutnya) — tampilkan hari terakhir.
      const endForDisplay = event.isAllDay ? addDays(e, -1) : e;
      setEndDate(dateInputValue(endForDisplay));
      setEndTime(timeInputValue(e));
      setLocation(event.location ?? '');
      setMeetingLink(event.meetingLink ?? '');
      setVisibility(event.visibility);
      setAttendeeIds(event.attendees.map((a) => a.userId));
      setReminders((event.reminders ?? []).map((r) => r.minutesBefore));
      const parsed = parseRRuleString(event.recurrenceRule);
      if (parsed) {
        setRecurrencePreset(parsed.freq);
        setRecurrence(parsed);
      } else {
        setRecurrencePreset('none');
      }
      setScope('series');
    } else if (initial) {
      setTitle('');
      setDescription('');
      setCategory('meeting');
      setIsAllDay(initial.isAllDay);
      setStartDate(dateInputValue(initial.startAt));
      setStartTime(timeInputValue(initial.startAt));
      const endForDisplay = initial.isAllDay ? addDays(initial.endAt, -1) : initial.endAt;
      setEndDate(dateInputValue(endForDisplay));
      setEndTime(timeInputValue(initial.endAt));
      setLocation('');
      setMeetingLink('');
      setVisibility('COMPANY');
      setRecurrencePreset('none');
      setRecurrence({ freq: 'WEEKLY', interval: 1, byweekday: [], bymonthday: [], endMode: 'never', until: '', count: 10 });
      setAttendeeIds([]);
      setReminders([]);
      setScope('series');
    }
  }, [open, event, initial]);

  // Muat daftar anggota org (untuk pemilih peserta).
  useEffect(() => {
    if (!open || members.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ members: Array<{ user: { id: string; name: string | null; email: string | null }; role?: { name?: string }; department?: { name?: string } }> }>('/api/team');
        if (cancelled) return;
        setMembers(data.members.map((m) => ({
          id: m.user.id, name: m.user.name, email: m.user.email,
          roleName: m.role?.name ?? null, departmentName: m.department?.name ?? null,
        })));
      } catch {
        try {
          const data = await apiJson<{ members: Array<{ user: { id: string; name: string | null; email: string | null }; department?: { name?: string }; employment?: { position?: string } }> }>('/api/meet/search-participants?q=');
          if (cancelled) return;
          setMembers(data.members.map((m) => ({
            id: m.user.id, name: m.user.name, email: m.user.email,
            departmentName: m.department?.name ?? null, position: m.employment?.position ?? null,
          })));
        } catch {
          if (!cancelled) setMembersNote('Daftar anggota tidak tersedia untuk peran Anda — peserta dapat ditambahkan oleh admin.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, members.length]);

  const categoryColor = useMemo(
    () => EVENT_CATEGORIES.find((c) => c.key === category)?.color ?? '#6b7280',
    [category]
  );

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q)
    );
  }, [members, memberQuery]);

  /** Bangun startAt/endAt (ISO) dari input form. null bila tidak valid. */
  const buildTimes = useCallback((): { startAt: string; endAt: string } | null => {
    if (!startDate || !endDate) return null;
    let start: Date;
    let end: Date;
    if (isAllDay) {
      start = dateKeyToJakartaDate(startDate);
      end = new Date(dateKeyToJakartaDate(endDate).getTime() + 24 * 3600 * 1000);
    } else {
      start = new Date(`${startDate}T${startTime || '00:00'}:00+07:00`);
      end = new Date(`${endDate}T${endTime || '00:00'}:00+07:00`);
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end <= start) return null;
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }, [startDate, endDate, startTime, endTime, isAllDay]);

  /** Cek benturan sisi klien terhadap event yang sudah dimuat. */
  const checkConflicts = useCallback((startAt: string, endAt: string): ConflictHit[] => {
    const s = new Date(startAt).getTime();
    const e = new Date(endAt).getTime();
    const involved = new Set<string>([...attendeeIds, myUserId ?? '']);
    const hits: ConflictHit[] = [];
    for (const ev of existingEvents) {
      if (event && (ev.id === event.id || ev.id === event.recurrenceParentId)) continue;
      if (ev.status === 'CANCELLED') continue;
      const es = new Date(ev.startAt).getTime();
      const ee = new Date(ev.endAt).getTime();
      if (!(es < e && ee > s)) continue;
      const evInvolved = ev.createdById && involved.has(ev.createdById)
        || ev.attendees.some((a) => involved.has(a.userId));
      if (!evInvolved) continue;
      hits.push({
        eventId: ev.id, title: ev.title, startAt: ev.startAt, endAt: ev.endAt,
        severity: ev.isAllDay || isAllDay ? 'info' : 'hard',
      });
    }
    return hits.slice(0, 5);
  }, [existingEvents, event, attendeeIds, myUserId, isAllDay]);

  const doSave = useCallback(async () => {
    setError('');
    if (!title.trim()) {
      setError('Judul event wajib diisi.');
      return;
    }
    const times = buildTimes();
    if (!times) {
      setError('Waktu selesai harus lebih lambat dari waktu mulai.');
      return;
    }
    let recurrenceRule: string | undefined;
    if (recurrencePreset !== 'none') {
      const freq = recurrencePreset === 'custom' ? recurrence.freq : (recurrencePreset as RecurrenceFormValue['freq']);
      const value: RecurrenceFormValue = { ...recurrence, freq };
      if (freq === 'WEEKLY' && value.byweekday.length === 0) {
        value.byweekday = [WEEKDAYS_RRULE[(jakartaParts(new Date(times.startAt)).weekday + 6) % 7]];
      }
      if ((freq === 'MONTHLY' || freq === 'YEARLY') && value.bymonthday.length === 0) {
        value.bymonthday = [jakartaParts(new Date(times.startAt)).day];
      }
      recurrenceRule = buildRRuleString(value);
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      startAt: times.startAt,
      endAt: times.endAt,
      isAllDay,
      timezone: 'Asia/Jakarta',
      location: location.trim() || undefined,
      meetingLink: meetingLink.trim() || undefined,
      visibility,
      attendeeIds,
      reminders: reminders.slice(0, 5),
    };
    if (recurrenceRule) payload.recurrenceRule = recurrenceRule;
    if (!isEdit) payload.recurrenceRule = recurrenceRule ?? null;

    setSaving(true);
    try {
      if (isEdit && event) {
        // instanceStart dikirim sebagai query param (bukan body) — sesuai kontrak backend.
        let qs = '';
        if (event.isRecurring && scope !== 'series') {
          const instanceStart = event.isRecurrenceInstance
            ? (event.originalStartAt ?? event.startAt)
            : event.startAt;
          qs = `?scope=${scope}&instanceStart=${encodeURIComponent(instanceStart)}`;
        } else if (event.isRecurring) {
          qs = '?scope=series';
        }
        await apiJson(`/api/calendar/events/${encodeURIComponent(event.id.split('@')[0])}${qs}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Event diperbarui.');
      } else {
        const res = await apiJson<{ event: CalendarEvent; conflicts?: ConflictHit[] }>('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.conflicts && res.conflicts.length > 0) {
          toast.warning(`Event tersimpan, tapi bentrok dengan ${res.conflicts.length} agenda lain.`);
        } else {
          toast.success('Event dibuat.');
        }
      }
      onSaved();
      onClose();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan event.');
    } finally {
      setSaving(false);
    }
  }, [title, description, category, isAllDay, location, meetingLink, visibility, attendeeIds, reminders, recurrencePreset, recurrence, buildTimes, isEdit, event, scope, onSaved, onClose]);

  const handleSubmit = useCallback(() => {
    if (conflicts) {
      // Sudah diperingatkan — pengguna memilih "Tetap simpan".
      setConflicts(null);
      void doSave();
      return;
    }
    if (!title.trim()) {
      setError('Judul event wajib diisi.');
      return;
    }
    const times = buildTimes();
    if (!times) {
      setError('Waktu selesai harus lebih lambat dari waktu mulai.');
      return;
    }
    const hits = checkConflicts(times.startAt, times.endAt);
    if (hits.length > 0) {
      setConflicts(hits);
      return;
    }
    void doSave();
  }, [conflicts, title, buildTimes, checkConflicts, doSave]);

  if (!open) return null;

  const inputCls = 'w-full rounded-btn border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:bg-slate-900';
  const labelCls = 'mb-1 block text-[12px] font-semibold text-ink/80';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit event' : 'Buat event'}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{isEdit ? 'Edit Event' : 'Buat Event'}</h2>
            {isSourceEvent && event && (
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                <Lock className="h-3.5 w-3.5" />
                Event dari {event.sourceModuleLabel ?? event.sourceModule} — ubah lewat modul sumbernya.
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSourceEvent && event ? (
          <div className="space-y-3">
            <div className="rounded-btn border border-line bg-canvas p-4 dark:bg-slate-800/50">
              <p className="text-[15px] font-semibold text-ink">{event.title}</p>
              <p className="mt-1 text-[13px] text-muted">
                {event.isAllDay
                  ? formatDateShortId(event.startAt)
                  : `${formatDateShortId(event.startAt)} · ${formatTimeId(event.startAt)} – ${formatTimeId(event.endAt)}`}
              </p>
              {event.description && <p className="mt-2 whitespace-pre-wrap text-[13px] text-ink/80">{event.description}</p>}
            </div>
            {event.sourceUrl && (
              <a
                href={event.sourceUrl}
                className="inline-flex items-center gap-1.5 rounded-btn bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <ExternalLink className="h-4 w-4" /> Buka di modul sumber
              </a>
            )}
            <p className="text-[12px] text-muted">
              Data event ini dimiliki oleh modul {event.sourceModuleLabel ?? event.sourceModule}. Perubahan jadwal dilakukan di sana, lalu kalender tersinkron otomatis.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="space-y-4"
          >
            {error && (
              <div className="rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>
            )}

            <div>
              <label htmlFor="ev-title" className={labelCls}>Judul *</label>
              <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="cth. Meeting Divisi" maxLength={200} />
            </div>

            <div>
              <label htmlFor="ev-desc" className={labelCls}>Deskripsi</label>
              <textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={cn(inputCls, 'min-h-[72px] resize-y')} placeholder="Catatan atau agenda..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-cat" className={labelCls}>Kategori *</label>
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor }} />
                  <select id="ev-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                    {EVENT_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="ev-vis" className={labelCls}>Visibilitas</label>
                <select id="ev-vis" value={visibility} onChange={(e) => setVisibility(e.target.value)} className={inputCls}>
                  {Object.entries(VISIBILITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink/80">
                <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                Sepanjang hari
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-start-date" className={labelCls}>Tanggal mulai *</label>
                <input id="ev-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ev-end-date" className={labelCls}>Tanggal selesai *</label>
                <input id="ev-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
              </div>
              {!isAllDay && (
                <>
                  <div>
                    <label htmlFor="ev-start-time" className={labelCls}>Jam mulai *</label>
                    <input id="ev-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="ev-end-time" className={labelCls}>Jam selesai *</label>
                    <input id="ev-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-loc" className={labelCls}>Lokasi</label>
                <input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="cth. Ruang Meeting 1" />
              </div>
              <div>
                <label htmlFor="ev-link" className={labelCls}>Link meeting</label>
                <input id="ev-link" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className={inputCls} placeholder="https://..." />
              </div>
            </div>

            {/* Recurrence */}
            <div>
              <label htmlFor="ev-rec" className={labelCls}>Pengulangan</label>
              <select id="ev-rec" value={recurrencePreset} onChange={(e) => setRecurrencePreset(e.target.value)} className={inputCls}>
                {RECURRENCE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
              {recurrencePreset !== 'none' && (
                <div className="mt-2 space-y-2 rounded-btn border border-line bg-canvas p-3 dark:bg-slate-800/50">
                  {recurrencePreset === 'custom' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="ev-rec-freq" className={labelCls}>Frekuensi</label>
                        <select id="ev-rec-freq" value={recurrence.freq} onChange={(e) => setRecurrence({ ...recurrence, freq: e.target.value as RecurrenceFormValue['freq'] })} className={inputCls}>
                          <option value="DAILY">Harian</option>
                          <option value="WEEKLY">Mingguan</option>
                          <option value="MONTHLY">Bulanan</option>
                          <option value="YEARLY">Tahunan</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ev-rec-interval" className={labelCls}>Tiap (interval)</label>
                        <input id="ev-rec-interval" type="number" min={1} max={30} value={recurrence.interval} onChange={(e) => setRecurrence({ ...recurrence, interval: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={inputCls} />
                      </div>
                    </div>
                  )}
                  {(recurrencePreset === 'WEEKLY' || (recurrencePreset === 'custom' && recurrence.freq === 'WEEKLY')) && (
                    <div>
                      <span className={labelCls}>Hari dalam seminggu</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {WEEKDAYS_RRULE.map((d) => {
                          const active = recurrence.byweekday.includes(d);
                          return (
                            <button
                              key={d} type="button"
                              onClick={() => setRecurrence({
                                ...recurrence,
                                byweekday: active ? recurrence.byweekday.filter((x) => x !== d) : [...recurrence.byweekday, d],
                              })}
                              className={cn(
                                'rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors',
                                active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                              )}
                            >
                              {WEEKDAY_LABELS[d]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="ev-rec-end" className={labelCls}>Berakhir</label>
                      <select id="ev-rec-end" value={recurrence.endMode} onChange={(e) => setRecurrence({ ...recurrence, endMode: e.target.value as RecurrenceFormValue['endMode'] })} className={inputCls}>
                        <option value="never">Tidak pernah</option>
                        <option value="until">Sampai tanggal</option>
                        <option value="count">Setelah beberapa kali</option>
                      </select>
                    </div>
                    {recurrence.endMode === 'until' && (
                      <div>
                        <label htmlFor="ev-rec-until" className={labelCls}>Tanggal akhir</label>
                        <input id="ev-rec-until" type="date" value={recurrence.until} onChange={(e) => setRecurrence({ ...recurrence, until: e.target.value })} className={inputCls} />
                      </div>
                    )}
                    {recurrence.endMode === 'count' && (
                      <div>
                        <label htmlFor="ev-rec-count" className={labelCls}>Jumlah pengulangan</label>
                        <input id="ev-rec-count" type="number" min={1} max={366} value={recurrence.count} onChange={(e) => setRecurrence({ ...recurrence, count: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={inputCls} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Scope edit untuk event berulang */}
            {isEdit && event?.isRecurring && (
              <div>
                <span className={labelCls}>Perubahan ini berlaku untuk</span>
                <div className="flex flex-col gap-1.5">
                  {([
                    ['series', 'Seluruh rangkaian'],
                    ['instance', 'Hanya event ini'],
                    ['following', 'Event ini dan berikutnya'],
                  ] as const).map(([v, label]) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/85">
                      <input type="radio" name="ev-scope" checked={scope === v} onChange={() => setScope(v)} className="h-4 w-4 accent-brand-600" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Attendees */}
            <div>
              <span className={labelCls}>Peserta</span>
              {membersNote ? (
                <p className="text-[12px] text-muted">{membersNote}</p>
              ) : (
                <>
                  <input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    className={inputCls}
                    placeholder="Cari karyawan (nama / email)..."
                  />
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-btn border border-line p-2">
                    {filteredMembers.length === 0 && (
                      <p className="px-1 py-1 text-[12px] text-muted">Tidak ada karyawan yang cocok.</p>
                    )}
                    {filteredMembers.slice(0, 30).map((m) => {
                      const checked = attendeeIds.includes(m.id);
                      return (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-btn px-1.5 py-1 text-[13px] text-ink/85 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <input
                            type="checkbox" checked={checked}
                            onChange={() => setAttendeeIds(checked ? attendeeIds.filter((x) => x !== m.id) : [...attendeeIds, m.id])}
                            className="h-4 w-4 accent-brand-600"
                          />
                          <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}</span>
                          <span className="shrink-0 text-[11px] text-muted">{m.departmentName ?? m.roleName ?? ''}</span>
                        </label>
                      );
                    })}
                  </div>
                  {attendeeIds.length > 0 && (
                    <p className="mt-1 text-[12px] text-muted">{attendeeIds.length} peserta dipilih.</p>
                  )}
                </>
              )}
            </div>

            {/* Reminders */}
            <div>
              <span className={labelCls}>Pengingat</span>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_OPTIONS.map((opt) => {
                  const active = reminders.includes(opt.minutes);
                  return (
                    <button
                      key={opt.minutes} type="button"
                      onClick={() => setReminders(active ? reminders.filter((x) => x !== opt.minutes) : [...reminders, opt.minutes].slice(0, 5))}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors',
                        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {reminders.length >= 5 && <p className="mt-1 text-[12px] text-muted">Maksimal 5 pengingat.</p>}
            </div>

            {/* Peringatan konflik */}
            {conflicts && conflicts.length > 0 && (
              <div className="rounded-btn border border-warn/50 bg-warn/10 p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warn">
                  <AlertTriangle className="h-4 w-4" /> Jadwal bentrok dengan {conflicts.length} agenda:
                </p>
                <ul className="mt-2 space-y-1">
                  {conflicts.map((c) => (
                    <li key={c.eventId} className="text-[12px] text-ink/80">
                      <span className={cn('mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold', c.severity === 'hard' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn')}>
                        {c.severity === 'hard' ? 'Bentrok' : 'Info'}
                      </span>
                      {c.title} — {formatDateShortId(c.startAt)} {formatTimeId(c.startAt)}–{formatTimeId(c.endAt)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">Event tetap bisa disimpan meski bentrok. Lanjutkan?</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-btn border border-line px-4 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                Batal
              </button>
              {conflicts && conflicts.length > 0 && (
                <button type="button" onClick={() => setConflicts(null)} className="rounded-btn border border-line px-4 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                  Ubah jadwal
                </button>
              )}
              <button
                type="submit" disabled={saving}
                className="rounded-btn bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : conflicts ? 'Tetap simpan' : isEdit ? 'Simpan perubahan' : 'Buat event'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
