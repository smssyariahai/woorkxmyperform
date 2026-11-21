'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const j = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    message?: string;
  } | null;
  if (!res.ok || !j?.success) {
    const err = new Error(j?.message ?? 'Gagal memuat data.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return j.data as T;
}

interface AgentListItem {
  id: string;
  name: string;
  role: string;
  avatarColor: string | null;
  currentStatus: string;
  isEnabled: boolean;
  description: string | null;
  isBuiltin: boolean;
}

interface AgentDetail extends AgentListItem {
  skills: string[];
  tools: string[];
  systemInstructions: string;
}

/** 7 tool nyata (lib/agents/tools.ts) — API memvalidasi kunci ini di server. */
const TOOL_OPTIONS: Array<{ key: string; name: string; description: string }> = [
  { key: 'laporan_kinerja', name: 'Laporan kinerja', description: 'Metrik operasional nyata: percakapan, pesan, pelanggan, kampanye.' },
  { key: 'rekap_keuangan', name: 'Rekap Tagihan WOORK', description: 'Rekap invoice langganan modul per bulan (bukan laporan kas).' },
  { key: 'rekap_pelanggan', name: 'Rekap pelanggan', description: 'Komposisi pelanggan per tahap dan skor dari CRM.' },
  { key: 'status_kampanye', name: 'Status kampanye', description: 'Kampanye broadcast dan progres pengirimannya.' },
  { key: 'daftar_tugas', name: 'Daftar tugas agent', description: 'Lihat tugas-tugas agent virtual berdasar status.' },
  { key: 'delegasi_tugas', name: 'Delegasi tugas', description: 'Buatkan subtask untuk agent lain (maksimal kedalaman 2).' },
  { key: 'status_sistem', name: 'Status sistem', description: 'Kesehatan nyata: database, sesi WhatsApp, uptime, memori.' },
];

const COLOR_OPTIONS = ['#007AFD', '#15803D', '#B45309', '#B03A2E', '#6D4AC2', '#0E7490', '#BE185D', '#4D7C0F'];

function instructionTemplate(name: string, role: string): string {
  const who = name || '[Nama agent]';
  const what = role || '[peran agent]';
  return (
    `Kamu ${who}, ${what} Woork.id.\n` +
    `MANDAT: [tulis tanggung jawab utama agent ini — apa yang ia kerjakan dan untuk siapa].\n` +
    `CARA KERJA (ikuti berurutan):\n` +
    `1) Pahami perintah — apa hasil akhir yang diharapkan pengguna.\n` +
    `2) Tentukan data yang dibutuhkan dan tool yang paling cocok.\n` +
    `3) Jalankan tool dan periksa hasilnya — bila ada data yang hilang atau bertentangan, sebutkan terus terang.\n` +
    `4) Susun laporan sesuai standar di bawah.\n` +
    `STANDAR LAPORAN:\n` +
    `- Ringkasan eksekutif singkat di awal.\n` +
    `- Angka kunci dalam tabel, lengkap dengan konteksnya.\n` +
    `- Analisis: apa yang berjalan baik, apa yang bermasalah, penyebabnya.\n` +
    `- Rekomendasi dengan pemilik dan langkah berikutnya yang konkret.\n` +
    `ATURAN KERAS: Jangan mengarang angka, nama, atau tanggal — angka hanya dari data tool. ` +
    `Bila data kosong, katakan terus terang. Bila perintah di luar kewenanganmu, jelaskan dan eskalasikan.`
  );
}

interface FormState {
  name: string;
  role: string;
  description: string;
  avatarColor: string;
  skillsText: string;
  tools: string[];
  systemInstructions: string;
  isEnabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  role: '',
  description: '',
  avatarColor: '#007AFD',
  skillsText: '',
  tools: [],
  systemInstructions: '',
  isEnabled: true,
};

function detailToForm(a: AgentDetail): FormState {
  return {
    name: a.name,
    role: a.role,
    description: a.description ?? '',
    avatarColor: a.avatarColor ?? '#007AFD',
    skillsText: a.skills.join(', '),
    tools: a.tools,
    systemInstructions: a.systemInstructions,
    isEnabled: a.isEnabled,
  };
}

export function AgentManager() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AgentDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchJson<{ agents: AgentListItem[] }>('/api/kantor/agents');
      setAgents(d.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar agent.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNotice(null);
    setFormOpen(true);
  };

  const openEdit = async (item: AgentListItem) => {
    setNotice(null);
    try {
      const d = await fetchJson<{ agent: AgentDetail }>(`/api/kantor/agents/${item.id}`);
      setEditing(d.agent);
      setForm(detailToForm(d.agent));
      setFormOpen(true);
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : 'Gagal memuat agent.' });
    }
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const toggleTool = (key: string) => {
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(key) ? f.tools.filter((t) => t !== key) : [...f.tools, key],
    }));
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim(),
        description: form.description.trim(),
        avatarColor: form.avatarColor,
        skills: form.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
        tools: form.tools,
        systemInstructions: form.systemInstructions,
        isEnabled: form.isEnabled,
      };
      if (editing) {
        await fetchJson(`/api/kantor/agents/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'ok', text: `Agent "${payload.name}" berhasil diubah.` });
      } else {
        await fetchJson('/api/kantor/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setNotice({ type: 'ok', text: `Agent "${payload.name}" berhasil ditambahkan.` });
      }
      closeForm();
      await load();
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : 'Gagal menyimpan agent.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (item: AgentListItem) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      await fetchJson(`/api/kantor/agents/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !item.isEnabled }),
      });
      setNotice({
        type: 'ok',
        text: item.isEnabled
          ? `Agent "${item.name}" dinonaktifkan — tidak muncul lagi di dropdown dan scene 3D.`
          : `Agent "${item.name}" diaktifkan kembali.`,
      });
      await load();
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : 'Gagal mengubah status agent.' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: AgentListItem) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      await fetchJson(`/api/kantor/agents/${item.id}`, { method: 'DELETE' });
      setNotice({ type: 'ok', text: `Agent "${item.name}" dihapus.` });
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : 'Gagal menghapus agent.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/kantor"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Kantor Virtual
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-ink">Kelola Agent</h1>
          <p className="truncate text-sm text-muted">
            Tambah agent baru, atur peran dan tugasnya, dan ubah konfigurasinya. Agent baru langsung muncul di dropdown perintah dan scene 3D.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tambah Agent
        </button>
      </div>

      {notice && (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-sm',
            notice.type === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          )}
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Memuat daftar agent…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border bg-white dark:bg-slate-900 p-6 text-center">
          <Bot className="mx-auto mb-2 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Belum ada agent di kantor ini.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((a) => (
            <article
              key={a.id}
              className={cn(
                'rounded-lg border bg-white dark:bg-slate-900 p-4',
                !a.isEnabled && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ backgroundColor: a.avatarColor ?? '#007AFD' }}
                >
                  {a.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink">{a.name}</h2>
                    {a.isBuiltin && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted dark:bg-slate-800">
                        Bawaan
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        a.isEnabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                          : 'bg-slate-100 text-muted dark:bg-slate-800'
                      )}
                    >
                      {a.isEnabled ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-brand">{a.role}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{a.description || '—'}</p>
                  <p className="mt-1 text-xs text-muted">
                    Status: {a.currentStatus === 'IDLE' ? 'Menganggur' : a.currentStatus}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openEdit(a)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Ubah
                </button>
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => void toggleEnabled(a)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  <Power className="h-3.5 w-3.5" />
                  {a.isEnabled ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                {!a.isBuiltin && (
                  <>
                    {confirmDeleteId === a.id ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId === a.id}
                          onClick={() => void remove(a)}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Ya, hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-ink"
                        >
                          Batal
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(a.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        Agent bawaan (Aria, Bima, Citra, Dian, Eko) tidak bisa dihapus — hanya bisa dinonaktifkan.
        Agent yang sudah punya riwayat tugas juga tidak bisa dihapus, nonaktifkan saja.
        Perubahan konfigurasi langsung berlaku untuk perintah berikutnya.
      </p>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                {editing ? `Ubah Agent — ${editing.name}` : 'Tambah Agent Baru'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Tutup"
                className="rounded-lg p-1 text-muted transition-colors hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">
                    Nama agent <span className="text-red-600">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.name}
                    disabled={!!editing?.isBuiltin}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="mis. Rani"
                    className="rounded-lg border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:opacity-60 dark:bg-slate-900"
                  />
                  {editing?.isBuiltin && (
                    <span className="text-xs text-muted">Nama agent bawaan tidak bisa diubah.</span>
                  )}
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">
                    Peran / tugasnya sebagai apa <span className="text-red-600">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="mis. Manajer Pemasaran virtual"
                    className="rounded-lg border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand dark:bg-slate-900"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Deskripsi singkat (tampil di dropdown)</span>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="mis. Strategi pemasaran, konten, dan analisis kampanye."
                  className="rounded-lg border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand dark:bg-slate-900"
                />
              </label>

              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Warna avatar</span>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Warna ${c}`}
                      onClick={() => setForm((f) => ({ ...f, avatarColor: c }))}
                      className={cn(
                        'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                        form.avatarColor === c ? 'border-ink' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.avatarColor}
                    onChange={(e) => setForm((f) => ({ ...f, avatarColor: e.target.value }))}
                    className="h-8 w-10 cursor-pointer rounded border bg-white dark:bg-slate-900"
                    aria-label="Warna custom"
                  />
                </div>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Skills (pisahkan dengan koma)</span>
                <input
                  type="text"
                  value={form.skillsText}
                  onChange={(e) => setForm((f) => ({ ...f, skillsText: e.target.value }))}
                  placeholder="mis. Strategi konten, Analisis kampanye, Copywriting"
                  className="rounded-lg border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand dark:bg-slate-900"
                />
              </label>

              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="font-medium text-ink">Tool yang boleh dipakai</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TOOL_OPTIONS.map((t) => (
                    <label
                      key={t.key}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5',
                        form.tools.includes(t.key) ? 'border-brand bg-brand/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={form.tools.includes(t.key)}
                        onChange={() => toggleTool(t.key)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-medium text-ink">{t.name}</span>
                        <span className="block text-xs text-muted">{t.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">Instruksi sistem (konfigurasi detail agent)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        systemInstructions: instructionTemplate(f.name, f.role),
                      }))
                    }
                    className="rounded-lg border px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Isi template
                  </button>
                </div>
                <textarea
                  value={form.systemInstructions}
                  onChange={(e) => setForm((f) => ({ ...f, systemInstructions: e.target.value }))}
                  rows={12}
                  placeholder="Tulis mandat, cara kerja langkah-demi-langkah, standar laporan, dan aturan keras agent ini — atau klik 'Isi template'."
                  className="rounded-lg border bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink outline-none focus:border-brand dark:bg-slate-900"
                />
                <span className="text-xs text-muted">
                  Instruksi ini dipakai AI saat memilih tool dan saat menyusun laporan. Kosongkan bila agent hanya perlu mengikuti perilaku standar.
                </span>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                />
                Agent aktif (muncul di dropdown perintah dan scene 3D)
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !form.name.trim() || !form.role.trim()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Tambah Agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
