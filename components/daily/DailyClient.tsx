// Daily Workspace — klien utama: header, ringkasan, jadwal, tugas, deadline,
// meeting, pengingat, prioritas, progres, ringkasan akhir hari + catatan,
// Team Workspace, aksi cepat. Setiap section dimuat independen: bila satu
// gagal, section lain tetap tampil.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, CalendarDays, Settings, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  apiJson,
  jakartaParts,
  formatDateLongId,
  toJakartaDateKey,
} from '@/lib/calendar/client';
import { OverviewCards } from './OverviewCards';
import { TodaySchedule } from './TodaySchedule';
import { TaskList } from './TaskList';
import { Deadlines } from './Deadlines';
import { Meetings } from './Meetings';
import { Reminders } from './Reminders';
import { Priorities } from './Priorities';
import { Progress } from './Progress';
import { DaySummary } from './DaySummary';
import { TeamSection } from './TeamSection';
import { QuickActions } from './QuickActions';
import type {
  OverviewResponse,
  ScheduleItem,
  DailyTask,
  DeadlineItem,
  DailyMeeting,
  ReminderNotification,
  CalendarReminderItem,
  PriorityGroup,
  ProgressResponse,
  DaySummaryResponse,
  DailyNote,
  TeamResponse,
  DailyPreferences,
} from './types';
import { WIDGET_KEYS, WIDGET_LABELS } from './types';

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function DailyClient({
  canManage,
  userName,
  organizationName,
}: {
  canManage: boolean;
  userName: string;
  organizationName: string;
}) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateKey = toJakartaDateKey(selectedDate);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState('today');
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [changingTaskId, setChangingTaskId] = useState<string | null>(null);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);
  const [meetings, setMeetings] = useState<DailyMeeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [notifications, setNotifications] = useState<ReminderNotification[]>([]);
  const [calendarReminders, setCalendarReminders] = useState<CalendarReminderItem[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<PriorityGroup[]>([]);
  const [prioritiesLoading, setPrioritiesLoading] = useState(true);
  const [progressRange, setProgressRange] = useState('today');
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [summary, setSummary] = useState<DaySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [note, setNote] = useState<DailyNote | null>(null);
  const [noteLoading, setNoteLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [prefs, setPrefs] = useState<DailyPreferences | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftVisible, setDraftVisible] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const visibleWidgets = useMemo(() => {
    if (!prefs) return new Set<string>(WIDGET_KEYS);
    if (!prefs.visibleWidgets || prefs.visibleWidgets.length === 0) {
      return new Set<string>(WIDGET_KEYS);
    }
    return new Set<string>(prefs.visibleWidgets);
  }, [prefs]);
  const show = (key: string) => visibleWidgets.has(key);

  const loadOverview = useCallback(async () => {
    try {
      const data = await apiJson<OverviewResponse>('/api/daily/overview');
      setOverview(data);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat ringkasan.');
    }
  }, []);

  const loadSchedule = useCallback(async (key: string) => {
    setScheduleLoading(true);
    try {
      const data = await apiJson<{ items: ScheduleItem[] }>(`/api/daily/schedule?date=${key}`);
      setSchedule(data.items);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat jadwal.');
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async (filter: string) => {
    setTasksLoading(true);
    try {
      const data = await apiJson<{ tasks: DailyTask[] }>(`/api/daily/tasks?filter=${filter}&limit=100`);
      setTasks(data.tasks);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat tugas.');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadDeadlines = useCallback(async (days: number) => {
    setDeadlinesLoading(true);
    try {
      const data = await apiJson<{ items: DeadlineItem[] }>(`/api/daily/deadlines?days=${days}`);
      setDeadlines(data.items);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat deadline.');
    } finally {
      setDeadlinesLoading(false);
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    setMeetingsLoading(true);
    try {
      const data = await apiJson<{ meetings: DailyMeeting[] }>('/api/daily/meetings');
      setMeetings(data.meetings);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat meeting.');
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  const loadReminders = useCallback(async () => {
    setRemindersLoading(true);
    try {
      const data = await apiJson<{
        notifications: ReminderNotification[];
        calendarReminders: CalendarReminderItem[];
      }>('/api/daily/reminders');
      setNotifications(data.notifications);
      setCalendarReminders(data.calendarReminders);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat pengingat.');
    } finally {
      setRemindersLoading(false);
    }
  }, []);

  const loadPriorities = useCallback(async () => {
    setPrioritiesLoading(true);
    try {
      const data = await apiJson<{ groups: PriorityGroup[] }>('/api/daily/priorities');
      setPriorities(data.groups);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat prioritas.');
    } finally {
      setPrioritiesLoading(false);
    }
  }, []);

  const loadProgress = useCallback(async (range: string) => {
    setProgressLoading(true);
    try {
      const data = await apiJson<ProgressResponse>(`/api/daily/progress?range=${range}`);
      setProgress(data);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat progres.');
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (key: string) => {
    setSummaryLoading(true);
    try {
      const data = await apiJson<DaySummaryResponse>(`/api/daily/summary?date=${key}`);
      setSummary(data);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat ringkasan akhir hari.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadNote = useCallback(async (key: string) => {
    setNoteLoading(true);
    try {
      const data = await apiJson<{ note: DailyNote | null }>(`/api/daily/notes?date=${key}`);
      setNote(data.note);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat catatan.');
    } finally {
      setNoteLoading(false);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    if (!canManage) {
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    try {
      const data = await apiJson<TeamResponse>('/api/daily/team');
      setTeam(data);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal memuat Team Workspace.');
    } finally {
      setTeamLoading(false);
    }
  }, [canManage]);

  const loadPrefs = useCallback(async () => {
    try {
      const data = await apiJson<DailyPreferences>('/api/daily/preferences');
      setPrefs(data);
    } catch {
      // Preferensi opsional — abaikan bila gagal.
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadMeetings();
    loadReminders();
    loadPriorities();
    loadPrefs();
    loadTeam();
  }, [loadOverview, loadMeetings, loadReminders, loadPriorities, loadPrefs, loadTeam]);

  useEffect(() => {
    loadSchedule(dateKey);
    loadSummary(dateKey);
    loadNote(dateKey);
  }, [dateKey, loadSchedule, loadSummary, loadNote]);

  useEffect(() => {
    loadTasks(taskFilter);
  }, [taskFilter, loadTasks]);

  useEffect(() => {
    loadDeadlines(deadlineDays);
  }, [deadlineDays, loadDeadlines]);

  useEffect(() => {
    loadProgress(progressRange);
  }, [progressRange, loadProgress]);

  const handleTaskStatus = async (task: DailyTask, status: string, blockerCategory?: string) => {
    setChangingTaskId(task.id);
    try {
      const data = await apiJson<{ task: DailyTask }>(`/api/daily/tasks?id=${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          status === 'pending'
            ? { status, blockerCategory }
            : { status }
        ),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
      toast.success(`Status tugas "${task.title}" diubah menjadi ${data.task.statusLabel}.`);
      loadOverview();
      loadPriorities();
      loadSummary(dateKey);
      loadProgress(progressRange);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal mengubah status tugas.');
    } finally {
      setChangingTaskId(null);
    }
  };

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      await apiJson(`/api/daily/reminders?notificationId=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read' }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      toast.error((e as Error).message || 'Gagal menandai pengingat.');
    } finally {
      setMarkingId(null);
    }
  };

  const handleSaveNote = async (title: string, content: string, visibility: string) => {
    setSavingNote(true);
    try {
      const data = await apiJson<{ note: DailyNote }>('/api/daily/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateKey, title, content, visibility }),
      });
      setNote(data.note);
      toast.success('Catatan harian disimpan.');
    } catch (e) {
      toast.error((e as Error).message || 'Gagal menyimpan catatan.');
    } finally {
      setSavingNote(false);
    }
  };

  const openSettings = () => {
    setDraftVisible(prefs?.visibleWidgets?.length ? [...prefs.visibleWidgets] : [...WIDGET_KEYS]);
    setSettingsOpen(true);
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const data = await apiJson<DailyPreferences>('/api/daily/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibleWidgets: draftVisible,
          widgetOrder: [],
          quickActions: [],
          layoutConfiguration: {},
        }),
      });
      setPrefs(data);
      setSettingsOpen(false);
      toast.success('Preferensi tampilan disimpan.');
    } catch (e) {
      toast.error((e as Error).message || 'Gagal menyimpan preferensi.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleResetPrefs = async () => {
    setSavingPrefs(true);
    try {
      const data = await apiJson<DailyPreferences>('/api/daily/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibleWidgets: [],
          widgetOrder: [],
          quickActions: [],
          layoutConfiguration: {},
        }),
      });
      setPrefs(data);
      setDraftVisible([...WIDGET_KEYS]);
      toast.success('Tampilan direset ke awal.');
    } catch (e) {
      toast.error((e as Error).message || 'Gagal mereset tampilan.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const parts = jakartaParts(new Date());
  const greeting = greetingFor(parts.hour);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">
            {greeting}, {userName}!
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {formatDateLongId(new Date())} · {organizationName} · Berikut ringkasan pekerjaan Anda hari ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tal/tasks"
            className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Buat Tugas
          </Link>
          <Link
            href="/kalender"
            className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <CalendarDays className="h-4 w-4" /> Buat Event
          </Link>
          <button
            type="button"
            onClick={openSettings}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" /> Atur Tampilan
          </button>
        </div>
      </div>

      {/* Kartu ringkasan */}
      {overview && <OverviewCards cards={overview.cards} />}

      {/* Grid utama */}
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {show('schedule') && (
            <TodaySchedule
              items={schedule}
              date={selectedDate}
              loading={scheduleLoading}
              onDateChange={setSelectedDate}
            />
          )}
          {show('tasks') && (
            <TaskList
              tasks={tasks}
              loading={tasksLoading}
              filter={taskFilter}
              onFilterChange={setTaskFilter}
              onStatusChange={handleTaskStatus}
              changingId={changingTaskId}
            />
          )}
          {show('priorities') && <Priorities groups={priorities} loading={prioritiesLoading} />}
          {show('progress') && (
            <Progress
              data={progress}
              loading={progressLoading}
              range={progressRange}
              onRangeChange={setProgressRange}
            />
          )}
          {show('summary') && (
            <DaySummary
              summary={summary}
              loading={summaryLoading}
              note={note}
              noteLoading={noteLoading}
              onSaveNote={handleSaveNote}
              savingNote={savingNote}
            />
          )}
        </div>
        <div className="space-y-4">
          {show('deadlines') && (
            <Deadlines
              items={deadlines}
              loading={deadlinesLoading}
              days={deadlineDays}
              onDaysChange={setDeadlineDays}
            />
          )}
          {show('meetings') && <Meetings meetings={meetings} loading={meetingsLoading} />}
          {show('reminders') && (
            <Reminders
              notifications={notifications}
              calendarReminders={calendarReminders}
              loading={remindersLoading}
              onMarkRead={handleMarkRead}
              markingId={markingId}
            />
          )}
        </div>
      </div>

      {/* Team Workspace */}
      {canManage && show('team') && <TeamSection team={team} loading={teamLoading} />}

      {/* Aksi Cepat */}
      {show('quickActions') && <QuickActions />}

      {/* Modal Atur Tampilan */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-btn bg-white p-5 shadow-lg dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-ink">Atur Tampilan</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Tutup"
                className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              Pilih widget yang ingin ditampilkan di Daily Workspace Anda.
            </p>
            <div className="mt-4 space-y-2">
              {WIDGET_KEYS.map((key) => {
                if (key === 'team' && !canManage) return null;
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-btn border border-line px-3 py-2 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={draftVisible.includes(key)}
                      onChange={(e) =>
                        setDraftVisible((prev) =>
                          e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)
                        )
                      }
                      className="h-4 w-4 accent-brand"
                    />
                    {WIDGET_LABELS[key]}
                  </label>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingPrefs}
                onClick={handleSavePrefs}
                className="rounded-btn bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {savingPrefs ? 'Menyimpan…' : 'Simpan'}
              </button>
              <button
                type="button"
                disabled={savingPrefs}
                onClick={handleResetPrefs}
                className={cn(
                  'rounded-btn border border-line px-4 py-2 text-[13px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50'
                )}
              >
                Reset ke Awal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
