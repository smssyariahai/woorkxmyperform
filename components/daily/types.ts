// WOORK DAILY WORKSPACE — tipe response API (dipakai semua komponen daily).

export interface OverviewCard {
  key: string;
  label: string;
  value: number;
  href: string;
}

export interface OverviewResponse {
  date: string;
  timezone: string;
  cards: OverviewCard[];
}

export interface ScheduleItem {
  kind: 'event' | 'meeting';
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  location: string | null;
  meetingLink: string | null;
  joinActive: boolean;
  status: string;
  timeStatus: 'now' | 'upcoming' | 'completed' | 'cancelled';
  sourceModule: string | null;
  sourceModuleLabel: string | null;
  sourceUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  attendeeNames: string[];
}

export interface DailyTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  category: string;
  priority: string;
  priorityLabel: string;
  status: string;
  statusLabel: string;
  taskDate: string | null;
  taskTime: string | null;
  parentTitle: string | null;
  projectLabel: string;
  isBlocked: boolean;
  blockerCategory: string | null;
  blockerDescription: string | null;
  isOverdue: boolean;
  daysLeft: number | null;
  severity: 'normal' | 'approaching' | 'critical' | 'overdue';
  userId: string;
  userName: string | null;
  sourceUrl: string;
}

export interface DeadlineItem {
  kind: 'task' | 'invoice';
  id: string;
  name: string;
  deadline: string;
  daysLeft: number;
  timeLeftLabel: string;
  assigneeName: string | null;
  status: string;
  statusLabel: string;
  priorityLabel: string;
  severity: 'normal' | 'approaching' | 'critical' | 'overdue';
  sourceUrl: string | null;
}

export interface DailyMeeting {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  location: string | null;
  locationType: string;
  joinUrl: string | null;
  roomName: string | null;
  joinActive: boolean;
  status: string;
  organizer: { id: string; name: string | null; email: string | null };
  attendees: Array<{
    userId: string | null;
    name: string | null;
    email: string | null;
    role: string;
    status: string;
  }>;
  sourceUrl: string;
}

export interface ReminderNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface CalendarReminderItem {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: string | null;
  minutesBefore: number;
  remindAt: string;
  deliveryStatus: string;
  sourceUrl: string;
}

export interface PriorityGroup {
  key: string;
  label: string;
  reason: string;
  tasks: DailyTask[];
}

export interface ProgressResponse {
  range: string;
  from: string;
  to: string;
  timezone: string;
  task: { total: number; completed: number; inProgress: number; todo: number; overdue: number; percent: number };
  calendar: { total: number; completed: number; scheduled: number; percent: number };
}

export interface DaySummaryResponse {
  date: string;
  timezone: string;
  tasksCompleted: DailyTask[];
  tasksPending: DailyTask[];
  meetingsAttended: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    status: string;
    sourceUrl: string;
  }>;
  agendaDone: number;
  agendaTotal: number;
  missedDeadlines: number;
}

export interface DailyNote {
  id: string;
  userId: string;
  date: string;
  title: string | null;
  content: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamResponse {
  available: boolean;
  reason?: string;
  departmentId?: string;
  departmentName?: string;
  today?: string;
  timezone?: string;
  overview?: {
    totalMembers: number;
    activeTasks: number;
    completedTasks: number;
    overdueTasks: number;
    scheduledMeetings: number;
    pendingApprovals: number;
  };
  members?: Array<{ userId: string; name: string | null; email: string | null; jobTitle: string | null }>;
  schedule?: ScheduleItem[];
  taskProgress?: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    jobTitle: string | null;
    active: number;
    completed: number;
    overdue: number;
    percent: number;
  }>;
  availability?: Array<{ userId: string; name: string | null; status: string }>;
}

export interface DailyPreferences {
  layoutConfiguration: Record<string, unknown>;
  visibleWidgets: string[];
  widgetOrder: string[];
  quickActions: string[];
}

export const WIDGET_KEYS = [
  'schedule',
  'tasks',
  'deadlines',
  'meetings',
  'reminders',
  'priorities',
  'progress',
  'summary',
  'team',
  'quickActions',
] as const;

export const WIDGET_LABELS: Record<string, string> = {
  schedule: 'Jadwal Hari Ini',
  tasks: 'Tugas Saya Hari Ini',
  deadlines: 'Deadline Mendekat',
  meetings: 'Meeting Berikutnya',
  reminders: 'Pengingat Saya',
  priorities: 'Prioritas Saya',
  progress: 'Progres Harian',
  summary: 'Ringkasan Akhir Hari',
  team: 'Team Workspace',
  quickActions: 'Aksi Cepat',
};
