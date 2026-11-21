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
  room: 'Workspace' | 'Lounge';
  roomPosition: 'desk' | 'meeting-area' | 'lounge-seat' | 'pantry' | 'game-room';
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
