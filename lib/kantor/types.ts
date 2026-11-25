/**
 * Tipe snapshot Kantor Virtual — diadaptasi dari Ruang
 * (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha).
 * Sumber data: model Prisma WOORK (Agent / AgentTask / AgentActivity),
 * BUKAN CLI hermes. Ini kontrak data antara API /api/kantor/* dan scene 3D.
 */

export type KantorStationState =
  | 'Idle'
  | 'Working'
  | 'Reviewing'
  | 'Collaborating'
  | 'Praying'
  | 'Briefing'
  | 'Offline'
  | 'Unknown';

export interface KantorStationTask {
  id: string;
  title: string;
  status: string;
  kanbanStatus: KanbanStatus;
}

/**
 * Placement idle otoritatif dari server (Wave 10 — sinkronisasi realtime).
 * Dihitung `GET /api/kantor/office` dari jam server lewat `idlePlan()` yang
 * sama untuk semua client, jadi agent Idle yang sama terlihat di tempat
 * yang sama di semua layar. `stopKey` = kunci stop idle (mis. 'lounge',
 * 'bakso'); `label` = label tampilan (placement.label ?? stop.label).
 * Bila null/absen (snapshot lama / agent tidak Idle), client memakai
 * fallback `placementFor()` seperti sebelumnya.
 */
export interface KantorIdlePlacement {
  stopKey: string;
  label: string;
  position: [number, number, number];
  facing: number;
  seated: boolean;
  pose?: 'lie' | 'floor';
  height?: number;
}

export interface KantorStation {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  /**
   * Ruangan tempat agent berada. Nilai baru Fase 3b (divisi → ruangan):
   * 'Tech Cluster' = klaster divisi lantai 2; 'CEO Office' / 'Strategy & PM' /
   * 'Legal' / 'AI Command Center' = ruangan eksekutif lantai 3. Nilai lama
   * TIDAK berubah; agent tanpa divisi tetap 'Workspace' / 'Lounge'.
   */
  room: 'Workspace' | 'Lounge' | 'Musala' | 'Meeting Room' | 'Tech Cluster' | 'CEO Office' | 'Strategy & PM' | 'Legal' | 'AI Command Center';
  /**
   * Posisi di dalam ruangan. Nilai baru Fase 3b: 'tech-desk' (meja klaster
   * lantai 2) dan 'exec-desk' (meja ruangan eksekutif lantai 3).
   */
  roomPosition: 'desk' | 'meeting-area' | 'lounge-seat' | 'pantry' | 'game-room' | 'musala-saf' | 'tech-desk' | 'exec-desk';
  /** Nomor meja 1-based, urutan agent di kantor (diurutkan berdasarkan nama). */
  seat: number;
  state: KantorStationState;
  currentTask: KantorStationTask | null;
  recentActivity: string | null;
  /** Label singkat untuk bubble di atas karakter 3D. */
  activity: string | null;
  skills: string[];
  tools: string[];
  description: string | null;
  systemInstructions: string | null;
  /**
   * Divisi agent (Fase 3b — dari `Agent.departmentId`, nullable). Bila null,
   * agent berperilaku persis seperti sebelum Fase 3 (meja L1). `floor` =
   * lantai divisi (Department.floor); `zone` = nama ruangan divisi
   * (Department.zone, mis. 'CEO Office' / 'Strategy & PM').
   */
  department?: { id: string; name: string; floor: number | null; zone: string | null } | null;
  /** Placement idle dari server (hanya bila state Idle). */
  idle?: KantorIdlePlacement | null;
}

export interface KantorOfficeSummary {
  total: number;
  active: number;
  idle: number;
  working: number;
  runningTasks: number;
  pendingApprovals: number;
}

export interface KantorOfficeSnapshot {
  stations: KantorStation[];
  summary: KantorOfficeSummary;
  fetchedAt: string;
  /** Status "Tidur" bersama per kantor (Wave 11 — state server, bukan
   *  preferensi per-browser). Bila true, semua agent Idle ada di tempat
   *  tidur (placement-nya sudah ikut di `station.idle`). */
  sleep: boolean;
  /** Tema scene bersama per kantor (Wave 15 — state server, bukan
   *  preferensi per-browser): 'light' = siang, 'dark' = malam. Satu nilai
   *  per org; diubah lewat POST /api/kantor/theme, disiarkan lewat event
   *  SSE `kantor.theme_changed` (pola yang sama dengan Tidur). */
  theme: 'dark' | 'light';
  /** Sesi salat bersama per kantor (Musala — state server in-memory +
   *  persistensi DB PrayerSession). Bila active, agent yang ikut sesi
   *  berjalan ke musala dan menempati saf; disiarkan lewat event SSE
   *  `kantor.prayer_changed` (pola yang sama dengan Tidur/Tema). */
  prayer: KantorPrayerState;
  /** Sesi Morning Briefing bersama per kantor (ruang meeting, 08:00 WIB
   *  — state server in-memory + persistensi DB BriefingSession).
   *  Disiarkan lewat event SSE `kantor.briefing_changed`. */
  briefing: KantorBriefingState;
}

/** State sesi salat yang sedang berjalan (atau terakhir) di kantor ini. */
export interface KantorPrayerState {
  active: boolean;
  prayerName: 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya' | null;
  prayerLabel: string | null;
  startedAt: string | null;
  endsAt: string | null;
  sessionId: string | null;
}

/** State sesi Morning Briefing yang sedang berjalan (atau terakhir). */
export interface KantorBriefingState {
  active: boolean;
  phase: 'SCHEDULED' | 'PREPARING' | 'AGENTS_MOVING' | 'GATHERING' | 'IN_PROGRESS' | 'CLOSING' | 'RETURNING' | 'COMPLETED' | 'FAILED' | null;
  startedAt: string | null;
  endsAt: string | null;
  sessionId: string | null;
  leaderName: string | null;
}

export type KantorTaskStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type KanbanStatus =
  | 'todo'
  | 'running'
  | 'review'
  | 'done'
  | 'blocked'
  | 'archived';

/** Pemetaan status AgentTask WOORK → kolom Kanban ala Ruang. */
export const KANTOR_KANBAN_MAP: Record<KantorTaskStatus, KanbanStatus> = {
  QUEUED: 'todo',
  RUNNING: 'running',
  WAITING_APPROVAL: 'review',
  COMPLETED: 'done',
  FAILED: 'blocked',
  CANCELLED: 'archived',
};
