/**
 * Kantor Virtual — AI Agent Engine
 * State machine, status tugas, event, dan prioritas.
 * Catatan: scheduler berjalan in-process (satu proses `next start`).
 * Untuk multi-instance / skala besar, ganti scheduler.ts dengan worker + Redis.
 */

/** Status visual/perilaku agent (state machine). */
export const AGENT_STATES = [
  'IDLE',
  'WORKING',
  'TYPING',
  'THINKING',
  'READING',
  'COMMUNICATING',
  'EXECUTING_TASK',
  'WAITING_APPROVAL',
  'COMPLETED',
  'ERROR',
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  IDLE: 'Siaga',
  WORKING: 'Bekerja',
  TYPING: 'Mengetik',
  THINKING: 'Berpikir',
  READING: 'Membaca',
  COMMUNICATING: 'Berkomunikasi',
  EXECUTING_TASK: 'Menjalankan tugas',
  WAITING_APPROVAL: 'Menunggu persetujuan',
  COMPLETED: 'Selesai',
  ERROR: 'Kendala',
};

/** Status lifecycle tugas. */
export const TASK_STATUSES = [
  'QUEUED',
  'RUNNING',
  'WAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  QUEUED: 'Antre',
  RUNNING: 'Berjalan',
  WAITING_APPROVAL: 'Butuh persetujuan',
  COMPLETED: 'Selesai',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
};

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Event real-time (SSE) untuk Kantor Virtual. */
export const AGENT_EVENTS = [
  'agent.connected',
  'agent.status_changed',
  'agent.activity_updated',
  'task.created',
  'task.queued',
  'task.started',
  'task.progress',
  'task.waiting_approval',
  'task.completed',
  'task.failed',
  'task.cancelled',
  'agent.message_received',
  'notification.created',
] as const;
export type AgentEventType = (typeof AGENT_EVENTS)[number];

export interface AgentDefinition {
  name: string;
  role: string;
  description: string;
  avatarColor: string;
  skills: string[];
  systemInstructions: string;
  tools: string[];
}
