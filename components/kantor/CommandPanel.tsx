// AI Workspace — Pusat Perintah Kantor Virtual (redesain Wave 5, 2026-11-20).
// Tampilan ala AI Workspace: pemilih agent di kiri, hero sapaan di tengah
// (avatar besar + kartu saran 2x2), kolom ketik besar di bawah.
// Logika pengiriman, polling adaptif, persetujuan, dan render hasil TIDAK
// diubah dari Wave 3/4: perintah dikirim ke POST /api/agent-tasks
// { command } dan dipahami AI (9Router, lib/agents/ai.ts) atau router kata
// kunci (lib/agents/intent.ts); riwayat dari AgentTask (20 terakhir) via
// GET /api/kantor/tasks (fallback /api/agent-tasks); persetujuan dari
// GET /api/approvals; bubble agent merender laporan AI via AgentMarkdown.
// Contoh perintah (kartu saran + dropdown Tools) DIVERIFIKASI terhadap
// tool tiap agent (Agent.tools di DB, kantor WOORK.ID) + routing
// lib/agents/intent.ts — scheduler menolak tool di luar daftar agent,
// jadi perintah yang tidak bisa dijalankan tidak pernah ditawarkan.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Coins,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquarePlus,
  PanelRightClose,
  RotateCcw,
  Send,
  Wrench,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { AgentMarkdown } from './AgentMarkdown';
import { useKantorRealtime } from './useKantorRealtime';
import { reportFormatLabelForFile } from '@/lib/agents/format';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Antre',
  RUNNING: 'Berjalan',
  WAITING_APPROVAL: 'Menunggu persetujuan',
  COMPLETED: 'Selesai',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
};

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'];
const FINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'];

/** Urutan kanonik agent — dipakai untuk default + pemilik tool. */
const AGENT_ORDER = ['Aria', 'Bima', 'Citra', 'Dian', 'Eko'] as const;

/** Tool yang boleh dipakai tiap agent — dari kolom Agent.tools di DB
 *  (terverifikasi 2026-11-20, kantor WOORK.ID). */
const AGENT_TOOLS: Record<string, string[]> = {
  Aria: ['laporan_kinerja', 'rekap_pelanggan', 'status_kampanye', 'delegasi_tugas', 'daftar_tugas'],
  Bima: ['laporan_kinerja', 'daftar_tugas', 'rekap_pelanggan', 'delegasi_tugas'],
  Citra: ['status_sistem', 'daftar_tugas', 'delegasi_tugas', 'laporan_kinerja'],
  Dian: ['rekap_keuangan', 'laporan_kinerja', 'status_kampanye', 'daftar_tugas', 'delegasi_tugas'],
  Eko: ['status_sistem', 'rekap_pelanggan', 'daftar_tugas', 'delegasi_tugas'],
};

/** Agent pertama (urut kanonik) yang boleh memakai sebuah tool. */
function toolOwner(toolKey: string): string {
  for (const name of AGENT_ORDER) {
    if ((AGENT_TOOLS[name] ?? []).includes(toolKey)) return name;
  }
  return 'Aria';
}

/** 7 tool nyata (lib/agents/tools.ts) + contoh perintah yang benar-benar
 *  dijalankan tool itu lewat routing intent.ts. */
const TOOL_CATALOG: { key: string; name: string; description: string; example: (agentName: string) => string }[] = [
  {
    key: 'laporan_kinerja',
    name: 'Laporan kinerja',
    description: 'Metrik operasional nyata: percakapan, pesan, pelanggan, kampanye.',
    example: (a) => `${a}, buatkan laporan kinerja minggu ini`,
  },
  {
    key: 'rekap_pelanggan',
    name: 'Rekap pelanggan',
    description: 'Komposisi pelanggan per tahap dan skor dari CRM.',
    example: (a) => `${a}, rekap pelanggan per tahap`,
  },
  {
    key: 'status_kampanye',
    name: 'Status kampanye',
    description: 'Kampanye broadcast dan progres pengirimannya.',
    example: (a) => `${a}, periksa status kampanye broadcast terbaru`,
  },
  {
    key: 'daftar_tugas',
    name: 'Daftar tugas agent',
    description: 'Tugas-tugas agent virtual berdasar status.',
    example: (a) => `${a}, tampilkan pekerjaan yang sedang berlangsung`,
  },
  {
    key: 'delegasi_tugas',
    name: 'Delegasi tugas',
    description: 'Buatkan subtask untuk agent lain (maksimal kedalaman delegasi 2).',
    example: (a) =>
      a === 'Aria'
        ? `${a}, koordinasi dengan Bima untuk agenda rapat`
        : `${a}, koordinasi dengan Aria untuk agenda rapat`,
  },
  {
    key: 'status_sistem',
    name: 'Status sistem',
    description: 'Kesehatan nyata: database, sesi WhatsApp, uptime aplikasi, dan memori.',
    example: (a) => `${a}, periksa status sistem dan koneksi database`,
  },
  {
    key: 'rekap_keuangan',
    name: 'Rekap Tagihan WOORK',
    description: 'Rekap tagihan langganan modul per bulan — bukan laporan kas.',
    example: (a) => `${a}, rekap keuangan bulan September`,
  },
];

/** 4 contoh perintah per agent (kartu saran hero). Tiap perintah menyebut
 *  nama agent-nya sendiri dan hanya memakai tool yang dimiliki agent itu
 *  + pola kata kunci yang dikenali intent.ts. */
const SUGGESTIONS_BY_AGENT: Record<string, string[]> = {
  Aria: [
    'Aria, buatkan laporan kinerja minggu ini',
    'Aria, rekap pelanggan per tahap hari ini',
    'Aria, bagaimana status kampanye broadcast terbaru?',
    'Aria, tampilkan pekerjaan yang sedang berlangsung',
  ],
  Bima: [
    'Bima, tampilkan pekerjaan yang sedang berlangsung',
    'Bima, buatkan laporan kinerja hari ini',
    'Bima, rekap pelanggan per tahap',
    'Bima, koordinasi dengan Aria untuk agenda rapat',
  ],
  Citra: [
    'Citra, periksa status sistem dan koneksi database',
    'Citra, ada error apa di aplikasi hari ini?',
    'Citra, buatkan laporan kinerja minggu ini',
    'Citra, tampilkan pekerjaan yang sedang berlangsung',
  ],
  Dian: [
    'Dian, rekap keuangan bulan September',
    'Dian, buatkan rekap tagihan bulan ini',
    'Dian, buatkan laporan kinerja minggu ini',
    'Dian, periksa status kampanye broadcast terbaru',
  ],
  Eko: [
    'Eko, periksa status sistem dan koneksi database',
    'Eko, rekap pelanggan per tahap',
    'Eko, tampilkan pekerjaan yang sedang berlangsung',
    'Eko, koordinasi dengan Citra soal error aplikasi',
  ],
};

const HONESTY_NOTE =
  'Agent terhubung ke AI (9Router) — memahami perintah, menjalankan tool, dan menulis laporan; bila AI tidak tersedia, dipakai router kata kunci.';

interface WorkspaceAgent {
  id: string;
  name: string;
  role: string;
  avatarColor: string | null;
  currentStatus?: string;
  isEnabled: boolean;
  description: string | null;
}

/** GET /api/kantor/workspace — bila endpoint belum ada / gagal muat,
 *  workspace tetap null dan chip saldo + penanda model disembunyikan
 *  (tidak ada angka karangan). */
interface WorkspaceInfo {
  creditBalance: number | null;
  aiModel: string;
  aiEnabled: boolean;
}

interface CommandTask {
  id: string;
  title: string;
  agentName: string | null;
  status: string;
  progress: number;
  createdAt: string;
  /** Teks perintah asli (optimistic); diganti inputPayload.command bila ada. */
  commandText?: string;
}

interface ReportFile {
  path: string;
  name: string;
  mime?: string;
  size?: number;
}

interface TaskDetail {
  command?: string;
  summary?: string;
  data?: unknown;
  reportFile?: ReportFile | null;
  errorMessage?: string | null;
  agentColor?: string | null;
  /** true bila summary adalah laporan AI (render Markdown); false bila
   *  fallback ringkasan tool — UI menampilkan pesan jujur "AI tidak
   *  tersedia". undefined = tugas lama (sebelum Wave 4), tanpa pesan. */
  aiReport?: boolean;
}

interface PendingApproval {
  id: string;
  description: string;
  approvalType: string;
  createdAt: string;
  task: { id: string; title: string; status: string } | null;
  requestedBy: { id: string; name: string } | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const j = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!res.ok || !j?.success) {
    const err = new Error(j?.message ?? 'Gagal memuat data.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return j.data as T;
}

/** Parse JSON secara defensif — kembalikan null bila bukan objek. */
function parseJsonObject(raw: unknown): Record<string, any> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function formatBytes(size?: number): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Status hidup saat tugas RUNNING — mengikuti progress task. */
function runningLabel(progress: number): string {
  if (progress < 30) return 'memahami perintah…';
  if (progress < 60) return 'bekerja di meja komputer…';
  return 'menyusun laporan detail…';
}

/** Ikon kartu file sesuai format (Wave 6: PDF default, Excel/Word bila diminta). */
function fileIcon(name: string): React.ReactNode {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls')
    return <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  if (ext === 'docx' || ext === 'doc')
    return <FileText className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />;
  if (ext === 'pdf')
    return <FileText className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" aria-hidden />;
  return <FileDown className="h-4 w-4 shrink-0 text-brand" aria-hidden />;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Tanggal ISO -> tampil ringkas; gagal parse -> tampil apa adanya.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('id-ID');
    }
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  }
  if (Array.isArray(value)) return value.map((v) => formatCell(v)).join(', ');
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${formatCell(v)}`);
    return entries.length > 0 ? entries.join(' · ') : '—';
  }
  return String(value);
}

function prettyKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tabel kecil untuk data berbentuk baris (array of object). */
function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const shown = rows.slice(0, 8);
  const columns = Array.from(new Set(shown.flatMap((r) => Object.keys(r)))).slice(0, 5);
  if (columns.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="border-b bg-muted/50 px-2 py-1 text-left font-medium text-muted">
                {prettyKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {columns.map((c) => (
                <td key={c} className="px-2 py-1 align-top">
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="mt-1 text-[11px] text-muted">… dan {rows.length - shown.length} baris lagi.</p>
      )}
    </div>
  );
}

/** Render resultData (summary.data) secara defensif: tabel bila baris,
 *  pasangan kunci-nilai bila skalar, bagian per kunci bila objek. */
function ResultData({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return <p className="text-sm">{formatCell(data)}</p>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    if (data.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
      return <ResultTable rows={data as Record<string, unknown>[]} />;
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-sm">
        {data.slice(0, 8).map((v, i) => (
          <li key={i}>{formatCell(v)}</li>
        ))}
      </ul>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    if (entries.length === 0) return null;
    const scalarEntries = entries.filter(
      ([, v]) => typeof v !== 'object' || v === null,
    );
    const arrayEntries = entries.filter(([, v]) => Array.isArray(v));
    return (
      <div className="space-y-3">
        {scalarEntries.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            {scalarEntries.slice(0, 8).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{prettyKey(k)}</dt>
                <dd className="min-w-0 break-words">{formatCell(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {arrayEntries.slice(0, 3).map(([k, v]) => {
          const arr = v as unknown[];
          if (arr.length === 0) return null;
          return (
            <div key={k}>
              <p className="mb-1 text-xs font-medium text-muted">{prettyKey(k)}</p>
              {arr.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item)) ? (
                <ResultTable rows={arr as Record<string, unknown>[]} />
              ) : (
                <ul className="list-disc space-y-0.5 pl-4 text-sm">
                  {arr.slice(0, 8).map((item, i) => (
                    <li key={i}>{formatCell(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

/** Inisial avatar dari nama agent (bukan foto). */
function agentInitial(name: string): string {
  const ch = (name ?? '?').trim().charAt(0).toUpperCase();
  return ch || '?';
}

/** Apakah teks perintah sudah menyebut salah satu nama agent kantor ini.
 *  Daftar nama dikirim pemanggil (dari /api/kantor/agents) — JANGAN pakai
 *  daftar hardcode 5 bawaan: agent baru (mis. Fathan) harus ikut dikenali,
 *  kalau tidak client mengawali perintah dengan nama agent terpilih
 *  sehingga terkirim "Fathan, Fathan, bangun". */
function mentionsAgent(text: string, names: string[]): boolean {
  return names.some((n) =>
    new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text),
  );
}

export function CommandPanel({
  onCommandSent,
  className,
  onHide,
}: {
  onCommandSent?: () => void;
  /** className tambahan untuk root Card — dipakai parent untuk h-full di panel samping. */
  className?: string;
  /** Bila ada, tampilkan tombol sembunyikan panel di bar atas. */
  onHide?: () => void;
}) {
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState('');
  const [replyKind, setReplyKind] = useState<'ok' | 'error'>('ok');
  const [agents, setAgents] = useState<WorkspaceAgent[]>([]);
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [tasks, setTasks] = useState<CommandTask[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  // Detail per tugas (command + hasil) dari /api/agent-tasks.
  const [details, setDetailsState] = useState<Record<string, TaskDetail>>({});
  const detailsRef = useRef<Record<string, TaskDetail>>({});
  // Tugas final yang hasilnya sudah dicek — jangan fetch ulang tiap poll.
  const resultCheckedRef = useRef<Set<string>>(new Set());
  // Balasan POST per tugas (intent.reply) — tampil sebagai pembuka bubble agent.
  const [ackByTask, setAckByTask] = useState<Record<string, string>>({});
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tampilan panel: "Percakapan baru" hanya mengosongkan TAMPILAN (state
  // lokal) kembali ke hero; riwayat tetap di AgentTask dan muncul lagi
  // saat halaman dimuat ulang atau perintah baru dikirim.
  const [clearedView, setClearedView] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [mention, setMention] = useState<{ query: string } | null>(null);
  const [mentionHi, setMentionHi] = useState(0);

  const setDetails = useCallback((next: Record<string, TaskDetail>) => {
    detailsRef.current = next;
    setDetailsState(next);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadingTasks(true);
    try {
      let loaded: CommandTask[];
      let fallbackDetails: Record<string, TaskDetail> | null = null;
      try {
        // Tugas: endpoint kanban (read-only, auth saja); bila gagal, pakai
        // endpoint lama /api/agent-tasks (butuh INBOX_VIEW).
        // Wave 16 — riwayat chat per-user: `mine=1` hanya memuat tugas yang
        // dibuat user yang sedang login, jadi history tidak tercampur antaruser.
        const taskRes = await fetchJson<{ tasks: CommandTask[] }>('/api/kantor/tasks?mine=1');
        loaded = taskRes.tasks.slice(0, 20);
      } catch {
        const items = await fetchJson<any[]>('/api/agent-tasks?mine=1');
        fallbackDetails = {};
        loaded = items.slice(0, 20).map((t: any) => {
          const detail = detailFromAgentTask(t);
          if (detail) fallbackDetails![t.id] = detail;
          return {
            id: t.id,
            title: t.title,
            agentName: t.agent?.name ?? null,
            status: t.status,
            progress: t.progress ?? 0,
            createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date(t.createdAt).toISOString(),
            commandText: detail?.command,
          };
        });
      }
      setTasks(loaded);
      if (fallbackDetails) {
        setDetails({ ...detailsRef.current, ...fallbackDetails });
        loaded.forEach((t) => {
          if (FINAL_STATUSES.includes(t.status)) resultCheckedRef.current.add(t.id);
        });
      } else {
        // Lengkapi detail (perintah + hasil) yang belum ada. Hanya fetch
        // /api/agent-tasks bila ada tugas yang detailnya belum lengkap —
        // bukan tiap poll, supaya polling 1 detik tetap ringan.
        const needCommand = loaded.filter((t) => !detailsRef.current[t.id]?.command);
        const needResult = loaded.filter(
          (t) => FINAL_STATUSES.includes(t.status) && !resultCheckedRef.current.has(t.id),
        );
        if (needCommand.length > 0 || needResult.length > 0) {
          try {
            const items = await fetchJson<any[]>('/api/agent-tasks?mine=1');
            const next = { ...detailsRef.current };
            items.forEach((item: any) => {
              const detail = detailFromAgentTask(item);
              if (detail) next[item.id] = { ...next[item.id], ...detail };
            });
            setDetails(next);
            needResult.forEach((t) => resultCheckedRef.current.add(t.id));
          } catch {
            // Detail gagal dimuat — thread tetap tampil dari judul + status.
          }
        }
      }
      const ap = await fetchJson<PendingApproval[]>('/api/approvals').catch(() => [] as PendingApproval[]);
      setApprovals(ap);
    } catch {
      // Gagal memuat (mis. peran tanpa INBOX_VIEW) — panel perintah tetap
      // tampil; error detail muncul saat mengirim perintah.
      if (!silent) setTasks([]);
    } finally {
      if (!silent) setLoadingTasks(false);
    }
  }, [setDetails]);

  // Daftar agent (GET /api/kantor/agents) — dipakai pemilih kiri, dropdown
  // bar atas, pemilih @, dan warna avatar bubble. Duplikat nama dibuang.
  useEffect(() => {
    fetchJson<{ agents: WorkspaceAgent[] }>('/api/kantor/agents')
      .then((d) => {
        const seen = new Map<string, WorkspaceAgent>();
        // Wave 13 — agent nonaktif tidak tampil di pemilih (scene 3D dan
        // scheduler sudah menyaring isEnabled di server).
        (d.agents ?? []).forEach((a) => {
          if (a?.name && a.isEnabled !== false && !seen.has(a.name)) seen.set(a.name, a);
        });
        setAgents([...seen.values()]);
      })
      .catch(() => setAgents([]));
  }, []);

  // Saldo kredit + model AI (GET /api/kantor/workspace). Gagal muat
  // (mis. endpoint belum ada) -> chip disembunyikan, bukan angka karangan.
  useEffect(() => {
    fetchJson<WorkspaceInfo>('/api/kantor/workspace')
      .then((d) => setWorkspace(d))
      .catch(() => setWorkspace(null));
  }, []);

  // Polling adaptif: 1 detik selama ada tugas aktif (QUEUED/RUNNING/
  // WAITING_APPROVAL) supaya status + progress terlihat naik; 10 detik
  // bila semua tugas sudah final.
  const hasActiveTask = tasks.some((t) => ACTIVE_STATUSES.includes(t.status));

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, hasActiveTask ? 1000 : 10000);
    return () => clearInterval(timer);
  }, [load, hasActiveTask]);

  // Wave 10 — sinkronisasi realtime: event Kantor (task.* / agent.* /
  // notification.created) dari user lain di kantor yang sama memicu reload
  // tugas + approvals segera (debounce ~250 ms, karena task.progress bisa
  // datang beruntun). Polling di atas tetap sebagai fallback bila SSE putus.
  const sseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSoon = useCallback(() => {
    if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
    sseDebounceRef.current = setTimeout(() => {
      if (!document.hidden) void load(true);
    }, 250);
  }, [load]);
  useKantorRealtime(loadSoon);

  // Auto-scroll ke bawah bila pengguna sedang di ujung bawah thread.
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [tasks, details, approvals]);

  // Tinggi textarea mengikuti isi (maks ~5 baris).
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [command]);

  /** Agent terpilih — default Aria (orkestrator), lalu agent pertama. */
  const selectedAgent = useMemo<WorkspaceAgent | null>(() => {
    if (agents.length === 0) return null;
    return (
      agents.find((a) => a.name === selectedAgentName) ??
      agents.find((a) => a.name === 'Aria') ??
      agents[0]
    );
  }, [agents, selectedAgentName]);

  const agentColorByName = useMemo(() => {
    const map: Record<string, string> = {};
    agents.forEach((a) => {
      if (a.avatarColor) map[a.name] = a.avatarColor;
    });
    return map;
  }, [agents]);

  /** Warna avatar agent (fallback biru WOORK). */
  const avatarColor = (name: string | null | undefined): string =>
    (name ? agentColorByName[name] : undefined) ?? '#007AFD';

  const showReply = (msg: string, kind: 'ok' | 'error' = 'ok') => {
    setReply(msg);
    setReplyKind(kind);
  };

  const sendCommand = async (textOverride?: string) => {
    const raw = (textOverride ?? command).trim();
    if (!raw || sending) return;
    // Bila perintah belum menyebut nama agent, awali dengan agent terpilih
    // supaya parseCommand mengarah ke agent itu.
    const text = mentionsAgent(raw, agents.map((a) => a.name)) || !selectedAgent ? raw : `${selectedAgent.name}, ${raw}`;
    setSending(true);
    try {
      const data = await fetchJson<{ reply?: string; taskId?: string; agent?: { name?: string } | null }>(
        '/api/agent-tasks',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: text }),
        },
      );
      setCommand('');
      setMention(null);
      setClearedView(false);
      // Optimistic: bubble user + tugas "Antre" langsung muncul (judul
      // sementara = teks perintah, diganti judul asli saat load selesai).
      if (data.taskId) {
        const optimistic: CommandTask = {
          id: data.taskId,
          title: text.slice(0, 80),
          agentName: data.agent?.name ?? null,
          status: 'QUEUED',
          progress: 0,
          createdAt: new Date().toISOString(),
          commandText: text,
        };
        setTasks((prev) => [optimistic, ...prev.filter((t) => t.id !== data.taskId)].slice(0, 20));
        if (data.reply) setAckByTask((prev) => ({ ...prev, [data.taskId as string]: data.reply as string }));
      } else if (data.reply) {
        // Perintah kontrol tanpa tugas baru (mis. batal/ulangi) — tampilkan
        // sebagai baris status di bawah input.
        showReply(data.reply);
      }
      stickToBottomRef.current = true;
      // Beri tahu halaman (KantorRoom) supaya snapshot 3D dimuat ulang segera.
      onCommandSent?.();
      void load(true);
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      showReply(
        err.status === 403
          ? 'Peran Anda tidak memiliki izin memerintah agent (butuh INBOX_REPLY).'
          : err.message || 'Gagal mengirim perintah.',
        'error',
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const actTask = async (id: string, action: 'cancel' | 'retry') => {
    setBusyTaskId(id);
    try {
      await fetchJson(`/api/agent-tasks/${id}/${action}`, { method: 'POST' });
      showReply(action === 'cancel' ? 'Tugas dihentikan.' : 'Tugas diulang kembali.');
      void load(true);
    } catch (e: unknown) {
      showReply(e instanceof Error ? e.message : 'Gagal memproses tugas.', 'error');
    } finally {
      setBusyTaskId(null);
    }
  };

  const review = async (id: string, approve: boolean) => {
    setBusyApprovalId(id);
    try {
      await fetchJson(`/api/approvals/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });
      showReply(approve ? 'Pengajuan disetujui — agent melanjutkan.' : 'Pengajuan ditolak — tugas dibatalkan.');
      void load(true);
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      showReply(
        err.status === 403
          ? 'Peran Anda tidak memiliki izin menyetujui (butuh APPROVALS_REVIEW).'
          : err.message || 'Gagal memproses persetujuan.',
        'error',
      );
    } finally {
      setBusyApprovalId(null);
    }
  };

  /** "Percakapan baru" — hanya tampilan kembali ke hero (state lokal);
   *  riwayat tetap tersimpan di AgentTask. */
  const newConversation = () => {
    setClearedView(true);
    setReply('');
    setCommand('');
    setMention(null);
    setShowAgentMenu(false);
    setShowToolsMenu(false);
    inputRef.current?.focus();
  };

  // --- Pemilih agent "@" di input -------------------------------------
  const updateMention = useCallback((value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const m = /@([\w-]*)$/.exec(before);
    setMention(m ? { query: m[1] } : null);
  }, []);

  const mentionList = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.trim().toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 5);
  }, [mention, agents]);

  useEffect(() => {
    setMentionHi(0);
  }, [mention?.query]);

  const mentionHiClamped = mentionList.length === 0 ? 0 : Math.min(mentionHi, mentionList.length - 1);

  /** Pilih agent dari pemilih @: ganti target perintah + sisipkan
   *  "@Nama " di posisi kursor. */
  const insertMention = useCallback(
    (agent: WorkspaceAgent) => {
      const el = inputRef.current;
      const value = command;
      const pos = el?.selectionStart ?? value.length;
      const before = value.slice(0, pos);
      const m = /@([\w-]*)$/.exec(before);
      if (!m) return;
      const start = pos - m[0].length;
      const next = `${value.slice(0, start)}@${agent.name} ${value.slice(pos)}`;
      setCommand(next);
      setSelectedAgentName(agent.name);
      setMention(null);
      requestAnimationFrame(() => {
        const ta = inputRef.current;
        if (!ta) return;
        ta.focus();
        const caret = start + agent.name.length + 2;
        ta.setSelectionRange(caret, caret);
      });
    },
    [command],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentionList.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHi((h) => (h + 1) % mentionList.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHi((h) => (h - 1 + mentionList.length) % mentionList.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionList[mentionHiClamped]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendCommand();
    }
  };

  // --- Dropdown Tools --------------------------------------------------
  /** Klik tool: isi input dengan contoh perintah untuk tool itu memakai
   *  agent terpilih. Bila agent terpilih tidak memiliki tool itu, target
   *  perintah ikut berpindah ke agent pertama yang memilikinya (scheduler
   *  menolak tool di luar daftar agent — perintah yang gagal tidak pernah
   *  ditawarkan). */
  const handleToolClick = (tool: (typeof TOOL_CATALOG)[number]) => {
    const agent = selectedAgent;
    const hasTool = agent ? (AGENT_TOOLS[agent.name] ?? []).includes(tool.key) : true;
    const targetName = hasTool ? (agent?.name ?? 'Aria') : toolOwner(tool.key);
    if (!hasTool) setSelectedAgentName(targetName);
    setCommand(tool.example(targetName));
    setShowToolsMenu(false);
    inputRef.current?.focus();
  };

  // Riwayat kronologis seperti chat (terlama dulu, terbaru di bawah).
  const thread = [...tasks].reverse();
  const approvalsByTask = new Map<string, PendingApproval[]>();
  const orphanApprovals: PendingApproval[] = [];
  approvals.forEach((ap) => {
    const taskId = ap.task?.id;
    if (taskId && tasks.some((t) => t.id === taskId)) {
      const list = approvalsByTask.get(taskId) ?? [];
      list.push(ap);
      approvalsByTask.set(taskId, list);
    } else {
      orphanApprovals.push(ap);
    }
  });

  const onThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  };

  /** Hero tampil saat thread kosong atau setelah "Percakapan baru". */
  const showHero = !loadingTasks && (clearedView || thread.length === 0);
  // Agent baru belum punya daftar saran sendiri — pakai contoh Aria
  // dengan namanya diganti, supaya chip tidak menyebut agent lain.
  const suggestions = selectedAgent
    ? (SUGGESTIONS_BY_AGENT[selectedAgent.name] ??
        SUGGESTIONS_BY_AGENT.Aria.map((s) => s.replace(/^Aria, /, `${selectedAgent.name}, `)))
    : SUGGESTIONS_BY_AGENT.Aria;
  const selectedColor = selectedAgent?.avatarColor ?? '#007AFD';

  const approvalCard = (ap: PendingApproval) => (
    <div key={ap.id} className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
      <p className="text-sm font-medium">Menunggu persetujuan</p>
      <p className="mt-0.5 text-xs text-muted">
        {ap.requestedBy?.name ? `${ap.requestedBy.name} meminta persetujuan` : 'Agent meminta persetujuan'}
        {ap.description ? ` — ${ap.description}` : ''}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busyApprovalId === ap.id}
          onClick={() => void review(ap.id, true)}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Setujui
        </button>
        <button
          type="button"
          disabled={busyApprovalId === ap.id}
          onClick={() => void review(ap.id, false)}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Tolak
        </button>
      </div>
    </div>
  );

  /** Satu baris agent — dipakai pemilih kiri, dropdown bar atas, dan pemilih @. */
  const agentRow = (a: WorkspaceAgent, opts?: { showCheck?: boolean; compact?: boolean }) => {
    const selected = a.name === selectedAgent?.name;
    return (
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
            opts?.compact ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'
          }`}
          style={{ backgroundColor: a.avatarColor ?? '#007AFD' }}
          aria-hidden
        >
          {agentInitial(a.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            <span className="truncate">{a.name}</span>
            {opts?.showCheck && selected && <Check className="h-4 w-4 shrink-0 text-brand" />}
          </p>
          <p className="truncate text-xs font-medium text-brand">{a.role}</p>
          {!opts?.compact && a.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{a.description}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className={cn('flex flex-col overflow-hidden !p-0', className)}>
      {/* Bar atas: agent terpilih + ganti agent | percakapan baru + sembunyikan */}
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b bg-white dark:bg-slate-900 px-3.5 pb-2.5 pt-3">
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => {
              setShowAgentMenu((v) => !v);
              setShowToolsMenu(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={showAgentMenu}
            className="flex items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/60"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: selectedColor }}
              aria-hidden
            >
              {agentInitial(selectedAgent?.name ?? '?')}
            </div>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">
                {selectedAgent?.name ?? 'AI Workspace'}
              </span>
              <span className="block truncate text-xs font-medium text-brand">
                {selectedAgent?.role ?? 'Pilih agent'}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
          </button>
          {showAgentMenu && (
            <>
              <button
                type="button"
                aria-label="Tutup pemilih agent"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setShowAgentMenu(false)}
              />
              <div
                role="listbox"
                className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border bg-white dark:bg-slate-900 shadow-lg"
              >
                {agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="option"
                    aria-selected={a.name === selectedAgent?.name}
                    onClick={() => {
                      setSelectedAgentName(a.name);
                      setShowAgentMenu(false);
                      inputRef.current?.focus();
                    }}
                    className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60 ${
                      a.name === selectedAgent?.name ? 'bg-brand/5' : ''
                    }`}
                  >
                    {agentRow(a, { showCheck: true })}
                  </button>
                ))}
                {agents.length === 0 && (
                  <p className="px-3 py-2.5 text-xs text-muted">Daftar agent belum termuat.</p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={newConversation}
            title="Percakapan baru"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-ink"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span className="hidden sm:inline">Percakapan baru</span>
          </button>
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              title="Sembunyikan panel"
              aria-label="Sembunyikan panel AI"
              className="inline-flex items-center justify-center rounded-lg border p-1.5 text-muted transition-colors hover:border-brand hover:text-ink"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Isi: hero atau thread chat — flex-1 + scroll internal di SEMUA
          breakpoint (Wave 8): panel tingginya dinamis mengikuti viewport,
          jadi thread tidak lagi dibatasi max-h 480px; kolom ketik di footer
          selalu terlihat tanpa scroll halaman penuh. */}
      <div className="flex min-h-0 flex-1 flex-col">
          {showHero ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white shadow-md"
                  style={{ backgroundColor: selectedColor }}
                  aria-hidden
                >
                  {agentInitial(selectedAgent?.name ?? '?')}
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">
                  Halo, ada yang bisa{' '}
                  <span className="text-brand">{selectedAgent?.name ?? 'agent'}</span> bantu hari ini?
                </h3>
                <p className="mt-1.5 max-w-sm text-[13px] text-muted">
                  {selectedAgent?.description ?? selectedAgent?.role ?? 'Perintah agent virtual kantor ini.'}
                </p>
                <div className="mt-5 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={sending}
                      onClick={() => void sendCommand(s)}
                      className="rounded-xl border bg-white dark:bg-slate-900 p-2.5 text-left text-[13px] leading-snug transition-colors hover:border-brand hover:bg-brand/5 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={threadRef}
              onScroll={onThreadScroll}
              className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3"
              aria-live="polite"
            >
              {loadingTasks ? (
                <p className="text-sm text-muted">Memuat percakapan…</p>
              ) : (
                thread.map((t) => {
                  const detail = details[t.id];
                  const userText = detail?.command ?? t.commandText ?? t.title;
                  const agentColor = detail?.agentColor ?? (t.agentName ? agentColorByName[t.agentName] : undefined);
                  const agentInitialChar = agentInitial(t.agentName ?? '?');
                  const taskApprovals = approvalsByTask.get(t.id) ?? [];
                  const isActive = ACTIVE_STATUSES.includes(t.status);
                  return (
                    <div key={t.id} className="space-y-2">
                      {/* Bubble user (kanan) */}
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-sm text-white">
                          <p className="whitespace-pre-wrap break-words">{userText}</p>
                          <p className="mt-1 text-right text-[11px] opacity-70">{formatTime(t.createdAt)}</p>
                        </div>
                      </div>

                      {/* Bubble agent (kiri) */}
                      <div className="flex gap-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: agentColor ?? '#007AFD' }}
                          aria-hidden
                        >
                          {agentInitialChar}
                        </div>
                        <div className="min-w-0 max-w-[85%] flex-1">
                          <p className="text-xs text-muted">
                            <span className="font-medium text-ink">{t.agentName ?? 'Agent'}</span>
                            {' · '}
                            {t.title}
                            {' · '}
                            {formatTime(t.createdAt)}
                          </p>
                          <div className="mt-1 min-w-0 break-words rounded-2xl rounded-tl-sm border bg-white dark:bg-slate-900 px-3.5 py-2.5">
                            {t.status === 'QUEUED' && (
                              <p className="flex items-center gap-2 text-sm text-muted">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {ackByTask[t.id] ?? 'Antre — menunggu giliran…'}
                              </p>
                            )}
                            {t.status === 'RUNNING' && (
                              <div>
                                <p className="flex items-center gap-2 text-sm">
                                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                                  {runningLabel(t.progress)}
                                  <span className="text-xs text-muted">{t.progress}%</span>
                                </p>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-brand transition-all duration-500"
                                    style={{ width: `${Math.max(0, Math.min(100, t.progress))}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {t.status === 'WAITING_APPROVAL' && (
                              <div>
                                <p className="text-sm">Hasil parsial siap — menunggu persetujuan untuk lanjut.</p>
                                {detail?.summary && <p className="mt-1 text-sm text-muted">{detail.summary}</p>}
                                {detail && <div className="mt-2"><ResultData data={detail.data} /></div>}
                              </div>
                            )}
                            {t.status === 'COMPLETED' && (
                              <div className="space-y-2">
                                {ackByTask[t.id] && (
                                  <p className="text-sm text-muted">{ackByTask[t.id]}</p>
                                )}
                                {detail?.summary ? (
                                  detail.aiReport ? (
                                    <AgentMarkdown text={detail.summary} />
                                  ) : (
                                    <p className="whitespace-pre-wrap text-sm">{detail.summary}</p>
                                  )
                                ) : (
                                  <p className="text-sm text-muted">Tugas selesai.</p>
                                )}
                                {/* Fallback total: AI tidak tersedia saat tugas ini
                                    diproses — pesan jujur sekali, di bubble hasil. */}
                                {detail?.aiReport === false && (
                                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                                    AI (9Router) tidak tersedia saat perintah ini diproses — hasil di atas disusun dari
                                    router kata kunci dan ringkasan tool.
                                  </p>
                                )}
                                {/* Tabel data mentah hanya untuk hasil non-AI (laporan
                                    AI sudah memuat angka + tabelnya sendiri). */}
                                {detail && !detail.aiReport && <ResultData data={detail.data} />}
                                {detail?.reportFile && (
                                  <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
                                    {fileIcon(detail.reportFile.name)}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium">{detail.reportFile.name}</p>
                                      <p className="text-xs text-muted">
                                        {reportFormatLabelForFile(detail.reportFile.name)}
                                        {detail.reportFile.size ? ` · ${formatBytes(detail.reportFile.size)}` : ''}
                                      </p>
                                    </div>
                                    <a
                                      href={`/api/agent-tasks/${t.id}/file`}
                                      download={detail.reportFile.name}
                                      className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white"
                                    >
                                      Unduh
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}
                            {t.status === 'FAILED' && (
                              <p className="text-sm text-red-700">
                                Tugas gagal{detail?.errorMessage ? `: ${detail.errorMessage}` : '.'}
                              </p>
                            )}
                            {t.status === 'CANCELLED' && <p className="text-sm text-muted">Tugas dibatalkan.</p>}
                            {/* Persetujuan menempel pada pesan agent tugasnya */}
                            {taskApprovals.map(approvalCard)}
                            {/* Aksi tugas */}
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                                {STATUS_LABEL[t.status] ?? t.status}
                              </span>
                              {isActive && (
                                <button
                                  type="button"
                                  disabled={busyTaskId === t.id}
                                  onClick={() => void actTask(t.id, 'cancel')}
                                  className="rounded-md border px-2 py-0.5 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
                                >
                                  Batal
                                </button>
                              )}
                              {(t.status === 'FAILED' || t.status === 'CANCELLED') && (
                                <button
                                  type="button"
                                  disabled={busyTaskId === t.id}
                                  onClick={() => void actTask(t.id, 'retry')}
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Ulangi
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Persetujuan yang tugasnya sudah di luar 20 terakhir */}
          {orphanApprovals.length > 0 && (
            <div className="shrink-0 px-3.5 pb-2 pt-1">
              <h4 className="text-sm font-semibold">Menunggu persetujuan ({orphanApprovals.length})</h4>
              <div className="mt-2 space-y-2">{orphanApprovals.map(approvalCard)}</div>
            </div>
          )}
      </div>

      {/* Footer: kolom ketik + status — menempel di bawah panel.
          pb memakai safe-area bawah (home indicator iOS) supaya kolom
          ketik tidak duduk di bawah garis home. */}
      <div className="relative shrink-0 border-t px-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
          {/* Pemilih @ + dropdown Tools (muncul di atas kolom ketik) */}
            {mention && mentionList.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-xl border bg-white dark:bg-slate-900 shadow-lg">
                <p className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Pilih agent
                </p>
                {mentionList.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(a);
                    }}
                    onMouseEnter={() => setMentionHi(i)}
                    className={`block w-full px-3 py-2 text-left transition-colors ${
                      i === mentionHiClamped ? 'bg-brand/10' : 'hover:bg-muted/60'
                    }`}
                  >
                    {agentRow(a, { compact: true })}
                  </button>
                ))}
              </div>
            )}
            {showToolsMenu && (
              <>
                <button
                  type="button"
                  aria-label="Tutup daftar tools"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setShowToolsMenu(false)}
                />
                <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(92vw,26rem)] overflow-hidden rounded-xl border bg-white dark:bg-slate-900 shadow-lg">
                  <p className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Tools — klik untuk mengisi contoh perintah
                  </p>
                  <div className="max-h-72 overflow-y-auto">
                    {TOOL_CATALOG.map((tool) => {
                      const hasTool = selectedAgent
                        ? (AGENT_TOOLS[selectedAgent.name] ?? []).includes(tool.key)
                        : true;
                      const owner = hasTool ? null : toolOwner(tool.key);
                      return (
                        <button
                          key={tool.key}
                          type="button"
                          onClick={() => handleToolClick(tool)}
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                        >
                          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{tool.name}</span>
                            <span className="block text-xs text-muted">{tool.description}</span>
                            {owner && (
                              <span className="mt-0.5 block text-[11px] text-amber-700">
                                Bukan tool {selectedAgent?.name} — perintah akan dijalankan {owner}.
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendCommand();
              }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={command}
                  onChange={(e) => {
                    setCommand(e.target.value);
                    updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  }}
                  onKeyUp={(e) => {
                    const ta = e.target as HTMLTextAreaElement;
                    updateMention(ta.value, ta.selectionStart ?? ta.value.length);
                  }}
                  onClick={(e) => {
                    const ta = e.target as HTMLTextAreaElement;
                    updateMention(ta.value, ta.selectionStart ?? ta.value.length);
                  }}
                  onKeyDown={onInputKeyDown}
                  rows={1}
                  placeholder="Ketik pesan, @ untuk memilih agent…"
                  aria-label="Perintah untuk agent"
                  // text-base (16px) di HP: iOS Safari memperbesar tampilan
                  // otomatis saat fokus ke input <16px — kolom ketik jadi
                  // 16px di HP supaya tidak zoom, tetap text-sm di desktop.
                  className="min-w-0 flex-1 resize-none rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-2.5 text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={!command.trim() || sending}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Kirim
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu((v) => !v);
                      setShowAgentMenu(false);
                    }}
                    aria-haspopup="true"
                    aria-expanded={showToolsMenu}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-ink"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Tools
                  </button>
                  {workspace && typeof workspace.creditBalance === 'number' && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium"
                      title="Saldo kredit AI kantor"
                    >
                      <Coins className="h-3 w-3 text-brand" />
                      {workspace.creditBalance.toLocaleString('id-ID')} Kredit
                    </span>
                  )}
                  {workspace &&
                    (workspace.aiEnabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
                        Auto · {workspace.aiModel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                        AI nonaktif
                      </span>
                    ))}
                </div>
              </div>
            </form>

          {/* Catatan kejujuran AI (Wave 4) — dipertahankan */}
          <p className="mt-2 text-[11px] leading-snug text-muted">{HONESTY_NOTE}</p>

          {/* Baris status (balasan perintah kontrol / error) */}
          {reply && (
            <p
              role="status"
              className={
                replyKind === 'error'
                  ? 'mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
                  : 'mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700'
              }
            >
              {reply}
            </p>
          )}
      </div>
    </Card>
  );
}

/** Detail satu tugas dari item GET /api/agent-tasks (bentuk lama). */
function detailFromAgentTask(t: any): TaskDetail | null {
  if (!t || typeof t !== 'object') return null;
  const input = parseJsonObject(t.inputPayload);
  const result = parseJsonObject(t.resultPayload);
  const reportFile =
    result && result.reportFile && typeof result.reportFile === 'object'
      ? {
          path: typeof result.reportFile.path === 'string' ? result.reportFile.path : '',
          name: typeof result.reportFile.name === 'string' ? result.reportFile.name : 'laporan',
          mime: typeof result.reportFile.mime === 'string' ? result.reportFile.mime : undefined,
          size: typeof result.reportFile.size === 'number' ? result.reportFile.size : undefined,
        }
      : null;
  return {
    command: typeof input?.command === 'string' ? input.command : undefined,
    summary: typeof result?.summary === 'string' ? result.summary : undefined,
    data: result && 'data' in result ? result.data : undefined,
    reportFile,
    errorMessage: typeof t.errorMessage === 'string' ? t.errorMessage : null,
    agentColor: typeof t.agent?.avatarColor === 'string' ? t.agent.avatarColor : null,
    aiReport: typeof result?.aiReport === 'boolean' ? result.aiReport : undefined,
  };
}
