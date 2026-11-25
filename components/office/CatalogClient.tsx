'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import {
  Bot,
  Download,
  Search,
  X,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Layers,
  Wrench,
} from 'lucide-react';

const FLOOR_LABEL: Record<string, string> = {
  '1': 'Lantai 1',
  '2': 'Lantai 2',
  '3': 'Lantai 3',
};

/** 7 tool nyata WOORK (lib/agents/tools.ts) — sama seperti AgentManager.
 *  Server memvalidasi kunci ini saat install; tool repo tidak punya
 *  padanan langsung, jadi dipilih manual di sini. */
const TOOL_OPTIONS: Array<{ key: string; name: string; description: string }> = [
  { key: 'laporan_kinerja', name: 'Laporan kinerja', description: 'Metrik operasional nyata: percakapan, pesan, pelanggan, kampanye.' },
  { key: 'rekap_keuangan', name: 'Rekap Tagihan WOORK', description: 'Rekap invoice langganan modul per bulan (bukan laporan kas).' },
  { key: 'rekap_pelanggan', name: 'Rekap pelanggan', description: 'Komposisi pelanggan per tahap dan skor dari CRM.' },
  { key: 'status_kampanye', name: 'Status kampanye', description: 'Kampanye broadcast dan progres pengirimannya.' },
  { key: 'daftar_tugas', name: 'Daftar tugas agent', description: 'Lihat tugas-tugas agent virtual berdasar status.' },
  { key: 'delegasi_tugas', name: 'Delegasi tugas', description: 'Buatkan subtask untuk agent lain (maksimal kedalaman 2).' },
  { key: 'status_sistem', name: 'Status sistem', description: 'Kesehatan nyata: database, sesi WhatsApp, uptime, memori.' },
];

interface TemplateSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  personality: string;
  suggestedDepartment: string | null;
  suggestedFloor: number | null;
  templateVersion: string;
}

interface TemplateDetail extends TemplateSummary {
  expertise: string;
  systemInstructions: string;
  deliverables: string[];
  workflows: string[];
  requiredTools: string[] | null;
  isActive: boolean;
  isInstallable: boolean;
  attribution: { license: string; holder: string; year: number; source: string };
}

interface Department {
  id: string;
  name: string;
  floor: number | null;
  zone: string | null;
}

interface InstalledAgent {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
  templateSlug: string;
  templateVersion: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const j = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    message?: string;
  } | null;
  if (!res.ok || !j?.success) throw new Error(j?.message ?? 'Gagal memuat data.');
  return j.data as T;
}

export function CatalogClient({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [installName, setInstallName] = useState('');
  const [installDept, setInstallDept] = useState('');
  const [installTools, setInstallTools] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState<InstalledAgent | null>(null);
  const [assignDept, setAssignDept] = useState('');
  const [assignFloor, setAssignFloor] = useState('');
  const [assignWsDept, setAssignWsDept] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (qDebounced) params.set('q', qDebounced);
      if (category) params.set('category', category);
      const data = await fetchJson<{
        templates: TemplateSummary[];
        categories: Array<{ id: string; count: number }>;
        total: number;
      }>(`/api/admin/kantor/catalog?${params.toString()}`);
      setTemplates(data.templates ?? []);
      setCategories(data.categories ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat katalog.');
    } finally {
      setLoading(false);
    }
  }, [qDebounced, category]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchJson<Department[]>('/api/admin/departments')
      .then((d) => setDepartments(Array.isArray(d) ? d : []))
      .catch(() => setDepartments([]));
  }, []);

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const wsDepartments = useMemo(
    () => (assignFloor === '' ? [] : departments.filter((d) => d.floor === Number(assignFloor))),
    [departments, assignFloor],
  );

  async function openDetail(t: TemplateSummary) {
    setDetail(null);
    setInstalled(null);
    setDetailLoading(true);
    try {
      const d = await fetchJson<TemplateDetail>(`/api/admin/kantor/catalog/${t.slug}`);
      setDetail(d);
      setInstallName(d.name);
      setInstallTools([]);
      // Pre-select divisi yang namanya cocok dengan saran template.
      const match = d.suggestedDepartment
        ? departments.find((dep) => dep.name.toLowerCase() === d.suggestedDepartment!.toLowerCase())
        : undefined;
      setInstallDept(match?.id ?? '');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat detail template.');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setInstalled(null);
  }

  async function submitInstall() {
    if (!detail) return;
    if (!installName.trim()) { toast.error('Nama instance wajib diisi.'); return; }
    setInstalling(true);
    try {
      const agent = await fetchJson<{ agent: InstalledAgent }>(
        `/api/admin/kantor/catalog/${detail.slug}/install`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: installName.trim(),
            departmentId: installDept === '' ? null : installDept,
            tools: installTools,
          }),
        },
      );
      setInstalled(agent.agent);
      setAssignDept(agent.agent.departmentId ?? '');
      toast.success(`Agent "${agent.agent.name}" berhasil dipasang.`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memasang agent.');
    } finally {
      setInstalling(false);
    }
  }

  async function assignToDept(deptId: string) {
    if (!installed || !deptId) return;
    setAssigning(true);
    try {
      await fetchJson(`/api/admin/departments/${deptId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: installed.id }),
      });
      setInstalled({ ...installed, departmentId: deptId });
      toast.success(`Agent ditempatkan ke divisi "${deptById.get(deptId)?.name ?? ''}".`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal menempatkan agent.');
    } finally {
      setAssigning(false);
    }
  }

  function suggestedLine(t: TemplateSummary) {
    if (t.suggestedDepartment && t.suggestedFloor != null) {
      return `Disarankan: ${t.suggestedDepartment} — ${FLOOR_LABEL[String(t.suggestedFloor)]}`;
    }
    if (t.suggestedDepartment) return `Disarankan: ${t.suggestedDepartment}`;
    if (t.suggestedFloor != null) return `Disarankan: ${FLOOR_LABEL[String(t.suggestedFloor)]}`;
    return 'Tanpa divisi default';
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Katalog Agent</h1>
        <p className="text-sm text-muted">
          Template agent siap pasang dari repo agency-agents — install ke kantor ini sebagai agent baru.
          Template bersifat global; instance yang dipasang hanya ada di kantor ini.
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Sumber: agency-agents (AgentLand Contributors, 2025) — lisensi MIT.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <Field label="Cari template">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nama atau deskripsi…"
                className="!pl-9"
              />
            </div>
          </Field>
        </div>
        <div className="w-[220px]">
          <Field label="Kategori">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="">Semua kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.id} ({c.count})</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <p className="text-[13px] text-muted">
        {loading ? 'Memuat…' : `${templates.length} template ditampilkan dari ${total} hasil.`}
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <Card key={t.id} className="!p-5 flex flex-col">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-brand/10 text-brand">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-ink leading-tight">{t.name}</p>
                <p className="text-[12px] text-muted mt-0.5">{t.category}</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted flex-1">
              {t.description.length > 180 ? `${t.description.slice(0, 177)}…` : t.description}
            </p>
            <p className="mt-2 text-[12px] text-muted inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {suggestedLine(t)}
            </p>
            <div className="mt-3 border-t border-line pt-3">
              <button onClick={() => openDetail(t)} className="btn-primary !py-2 text-[13px] w-full">
                Lihat &amp; Install
              </button>
            </div>
          </Card>
        ))}
      </div>
      {!loading && templates.length === 0 && (
        <Card><p className="text-sm text-muted text-center py-8">Tidak ada template yang cocok.</p></Card>
      )}

      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/45" onClick={closeDetail} />
          <div className="relative card w-full max-w-2xl p-6 shadow-pop space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>{detail ? detail.name : 'Memuat…'}</CardTitle>
                {detail && (
                  <p className="text-[12.5px] text-muted mt-1">
                    {detail.category} · v{detail.templateVersion || '—'} · {suggestedLine(detail)}
                  </p>
                )}
              </div>
              <button onClick={closeDetail} title="Tutup" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            {detail && (
              <>
                {detail.description && <p className="text-[13.5px] text-ink">{detail.description}</p>}
                {detail.expertise && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Keahlian (Core Mission)</p>
                    <p className="mt-1 text-[13px] text-muted whitespace-pre-wrap">{detail.expertise}</p>
                  </div>
                )}
                {detail.deliverables.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Deliverables</p>
                    <ul className="mt-1 space-y-1 text-[13px] text-ink list-disc pl-5">
                      {detail.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                )}
                {detail.workflows.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Workflows</p>
                    <ul className="mt-1 space-y-1 text-[13px] text-ink list-disc pl-5">
                      {detail.workflows.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted inline-flex items-center gap-1">
                    <Wrench className="h-3.5 w-3.5" /> Tool yang dibutuhkan (repo)
                  </p>
                  {detail.requiredTools && detail.requiredTools.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {detail.requiredTools.map((t, i) => (
                        <li key={i} className="flex items-center gap-2 text-[13px] text-ink">
                          {t} <Badge tone="amber">tidak tersedia di WOORK</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[13px] text-muted">
                      Repo tidak menyediakan daftar tool wajib — pilih tool WOORK secara manual di bawah.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Instruksi sistem template</p>
                  <div className="mt-1 rounded-btn border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Template untuk di-review — isi di bawah akan menjadi instruksi sistem agent setelah install.
                      Periksa isinya sebelum memasang. Instruksi tidak pernah dieksekusi sebagai kode.
                    </span>
                  </div>
                  <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-btn border border-line bg-canvas p-3 text-[12.5px] text-ink">
                    {detail.systemInstructions || '(tidak ada instruksi)'}
                  </pre>
                  <p className="mt-1 text-[12px] text-muted">
                    Atribusi: {detail.attribution.holder}, {detail.attribution.year} — lisensi {detail.attribution.license}.
                  </p>
                </div>

                {!installed && (
                  <div className="border-t border-line pt-4 space-y-3">
                    <p className="text-[13px] font-bold text-ink">Install ke kantor ini</p>
                    {!canManage ? (
                      <p className="text-[13px] text-muted">Hanya OWNER / ADMIN kantor yang bisa memasang agent dari katalog.</p>
                    ) : !detail.isInstallable ? (
                      <p className="text-[13px] text-danger">Template ini sudah tidak aktif dan tidak bisa dipasang.</p>
                    ) : (
                      <>
                        <Field label="Nama instance *">
                          <Input
                            value={installName}
                            onChange={(e) => setInstallName(e.target.value)}
                            placeholder="Nama agent di kantor ini"
                          />
                        </Field>
                        <Field label="Divisi & meja kerja">
                          <select value={installDept} onChange={(e) => setInstallDept(e.target.value)} className="input">
                            <option value="">— Tanpa divisi (meja umum lantai 1) —</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}{d.floor != null ? ` — ${FLOOR_LABEL[String(d.floor)]}` : ''}{d.zone ? ` (${d.zone})` : ''}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[12px] text-muted">Agent duduk di meja divisinya; pilih divisi untuk menempatkan langsung.</p>
                        </Field>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Tool WOORK yang diizinkan</p>
                          <div className="mt-2 grid sm:grid-cols-2 gap-2">
                            {TOOL_OPTIONS.map((t) => (
                              <label
                                key={t.key}
                                className={`flex items-start gap-2 rounded-btn border p-2.5 cursor-pointer text-[12.5px] ${installTools.includes(t.key) ? 'border-brand bg-brand/5' : 'border-line hover:bg-slate-50'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={installTools.includes(t.key)}
                                  onChange={() =>
                                    setInstallTools((s) =>
                                      s.includes(t.key) ? s.filter((x) => x !== t.key) : [...s, t.key],
                                    )
                                  }
                                  className="h-4 w-4 mt-0.5 shrink-0"
                                />
                                <span>
                                  <span className="block font-semibold text-ink">{t.name}</span>
                                  <span className="block text-muted">{t.description}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button onClick={closeDetail} className="btn-ghost !py-2 text-[13px]">Batal</button>
                          <button onClick={submitInstall} disabled={installing} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                            <Download className="h-4 w-4" /> {installing ? 'Memasang…' : 'Install Agent'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {installed && (
                  <div className="border-t border-line pt-4 space-y-4">
                    <div className="rounded-btn border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800 flex gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Agent <strong>{installed.name}</strong> berhasil dipasang
                        {installed.departmentId && deptById.get(installed.departmentId)
                          ? <> di divisi <strong>{deptById.get(installed.departmentId)!.name}</strong></>
                          : ' (tanpa divisi)'}
                        {' '}— template v{installed.templateVersion}. Instance langsung terlihat di daftar agent dan scene 3D.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/kantor" className="btn-primary !py-2 text-[13px]">
                        Lihat di Kantor <ExternalLink className="h-4 w-4" />
                      </Link>
                      <button onClick={closeDetail} className="btn-ghost !py-2 text-[13px]">Install template lain</button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="rounded-btn border border-line p-3 space-y-2">
                        <p className="text-[12px] font-bold text-ink inline-flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" /> Assign Department
                        </p>
                        <select value={assignDept} onChange={(e) => setAssignDept(e.target.value)} className="input !py-1.5 text-[12.5px] w-full">
                          <option value="">— Tanpa divisi —</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}{d.floor != null ? ` — ${FLOOR_LABEL[String(d.floor)]}` : ''}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignToDept(assignDept)}
                          disabled={assigning || !assignDept || assignDept === installed.departmentId}
                          className="btn-primary !py-1.5 text-[12.5px] w-full disabled:opacity-50"
                        >
                          {assigning ? 'Menyimpan…' : 'Tempatkan ke Divisi'}
                        </button>
                      </div>
                      <div className="rounded-btn border border-line p-3 space-y-2">
                        <p className="text-[12px] font-bold text-ink inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> Assign Workstation
                        </p>
                        <select value={assignFloor} onChange={(e) => { setAssignFloor(e.target.value); setAssignWsDept(''); }} className="input !py-1.5 text-[12.5px] w-full">
                          <option value="">Pilih lantai…</option>
                          <option value="1">Lantai 1</option>
                          <option value="2">Lantai 2</option>
                          <option value="3">Lantai 3</option>
                        </select>
                        <select value={assignWsDept} onChange={(e) => setAssignWsDept(e.target.value)} className="input !py-1.5 text-[12.5px] w-full" disabled={assignFloor === ''}>
                          <option value="">Pilih divisi di lantai ini…</option>
                          {wsDepartments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}{d.zone ? ` (${d.zone})` : ''}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignToDept(assignWsDept)}
                          disabled={assigning || !assignWsDept || assignWsDept === installed.departmentId}
                          className="btn-primary !py-1.5 text-[12.5px] w-full disabled:opacity-50"
                        >
                          {assigning ? 'Menyimpan…' : 'Tempatkan di Meja Divisi'}
                        </button>
                        <p className="text-[11.5px] text-muted">Meja mengikuti divisi — agent duduk di meja divisinya di lantai tersebut.</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
