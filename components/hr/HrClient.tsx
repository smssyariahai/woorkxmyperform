'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { friendlyFetchError } from '@/lib/fetch-error';
import {
  Plus, Search, Pencil, Trash2, X, Briefcase, Users, UserCheck,
  FileText, ChevronRight, Star, MapPin, Building, FileDown, Send,
} from 'lucide-react';

/* ---------------- meta ---------------- */

const STAGES = [
  { id: 'LAMARAN', label: 'Lamaran', cls: 'badge-blue', dot: 'bg-blue-500' },
  { id: 'SCREENING', label: 'Screening', cls: 'badge', dot: 'bg-slate-400' },
  { id: 'INTERVIEW', label: 'Interview', cls: 'badge-amber', dot: 'bg-amber-500' },
  { id: 'OFFERING', label: 'Offering', cls: 'badge-amber', dot: 'bg-orange-500' },
  { id: 'DITERIMA', label: 'Diterima', cls: 'badge-green', dot: 'bg-emerald-500' },
  { id: 'DITOLAK', label: 'Ditolak', cls: 'badge-red', dot: 'bg-red-500' },
] as const;

const EMP_TYPES: Record<string, string> = { PKWTT: 'PKWTT', PKWT: 'PKWT', FREELANCE: 'Freelance', MAGANG: 'Magang' };
const VAC_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Dibuka', cls: 'badge-green' },
  DRAFT: { label: 'Draf', cls: 'badge' },
  CLOSED: { label: 'Ditutup', cls: 'badge-red' },
};
const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: 'Aktif', cls: 'badge-green' },
  BERAKHIR: { label: 'Berakhir', cls: 'badge' },
  DIPUTUS: { label: 'Diputus', cls: 'badge-red' },
};
const EMP_STATUS: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: 'Aktif', cls: 'badge-green' },
  CUTI: { label: 'Cuti', cls: 'badge-amber' },
  NONAKTIF: { label: 'Nonaktif', cls: 'badge' },
};

const rupiah = (n?: number | null) =>
  n == null ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID');
const tgl = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Empty({ icon: Icon, title, hint, action }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-muted">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[13px] text-muted max-w-xs">{hint}</p>
      {action}
    </div>
  );
}

/* ============================== KOMPONEN UTAMA ============================== */

export function HrClient() {
  const [tab, setTab] = useState<'pipeline' | 'vacancy' | 'candidate' | 'employee' | 'contract'>('pipeline');
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const [showVacancy, setShowVacancy] = useState<any>(null); // null | {} | item
  const [showCandidate, setShowCandidate] = useState<any>(null);
  const [detailCandidate, setDetailCandidate] = useState<any>(null);
  const [showEmployee, setShowEmployee] = useState<any>(null);
  const [showContract, setShowContract] = useState<any>(null);
  const [showHire, setShowHire] = useState<any>(null);
  const [showLetter, setShowLetter] = useState<any>(null);

  async function load() {
    setLoading(true); setErr('');
    try {
      const [v, c, e, k] = await Promise.all([
        api('/api/hr/vacancies'),
        api('/api/hr/candidates'),
        api('/api/hr/employees'),
        api('/api/hr/contracts'),
      ]);
      setVacancies(v.items); setCandidates(c.items); setEmployees(e.items); setContracts(k.items);
    } catch (e: any) {
      setErr(friendlyFetchError(e, 'Gagal memuat data HR.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    openVac: vacancies.filter((v) => v.status === 'OPEN').length,
    activeCand: candidates.filter((c) => !['DITERIMA', 'DITOLAK'].includes(c.stage)).length,
    activeEmp: employees.filter((e) => e.status === 'AKTIF').length,
    pkwtt: contracts.filter((c) => c.type === 'PKWTT' && c.status === 'AKTIF').length,
  }), [vacancies, candidates, employees, contracts]);

  const TABS = [
    { id: 'pipeline', label: 'Pipeline Rekrutmen' },
    { id: 'vacancy', label: 'Lowongan' },
    { id: 'candidate', label: 'Kandidat' },
    { id: 'employee', label: 'Karyawan' },
    { id: 'contract', label: 'Kontrak' },
  ] as const;

  return (
    <div className="pg">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
          <Briefcase className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-ink">HR & Rekrutmen</h1>
          <p className="text-[13px] text-muted">Kelola lowongan, seleksi kandidat, data karyawan, dan kontrak PKWTT/PKWT.</p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-[13px] text-red-700 dark:text-red-300 flex items-center gap-3">
          <p className="flex-1">{err}</p>
          <button onClick={load} className="btn-secondary !py-1.5 !px-3 text-[12px]">Coba lagi</button>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Lowongan dibuka', value: stats.openVac, icon: Briefcase, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
          { label: 'Kandidat diproses', value: stats.activeCand, icon: Users, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
          { label: 'Karyawan aktif', value: stats.activeEmp, icon: UserCheck, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
          { label: 'Kontrak PKWTT aktif', value: stats.pkwtt, icon: FileText, tone: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' },
        ].map((s) => (
          <Card key={s.label} className="!p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[28px] font-bold text-ink leading-none">{loading ? '—' : s.value}</p>
            <p className="mt-1.5 text-[13px] text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <PipelineTab candidates={candidates} onOpen={setDetailCandidate} onAdd={() => setShowCandidate({})} />
      )}
      {tab === 'vacancy' && (
        <VacancyTab items={vacancies} q={q} setQ={setQ} onAdd={() => setShowVacancy({})} onEdit={setShowVacancy} onReload={load} />
      )}
      {tab === 'candidate' && (
        <CandidateTab items={candidates} vacancies={vacancies} q={q} setQ={setQ} onAdd={() => setShowCandidate({})} onOpen={setDetailCandidate} />
      )}
      {tab === 'employee' && (
        <EmployeeTab items={employees} q={q} setQ={setQ} onAdd={() => setShowEmployee({})} onEdit={setShowEmployee} onReload={load} />
      )}
      {tab === 'contract' && (
        <ContractTab items={contracts} q={q} setQ={setQ} onAdd={() => setShowContract({})} onEdit={setShowContract} onReload={load} onLetter={setShowLetter} />
      )}

      <VacancyModal open={showVacancy !== null} initial={showVacancy} onClose={() => setShowVacancy(null)} onSaved={load} />
      <CandidateModal open={showCandidate !== null} initial={showCandidate} vacancies={vacancies} onClose={() => setShowCandidate(null)} onSaved={load} />
      <CandidateDetailModal
        candidate={detailCandidate} vacancies={vacancies}
        onClose={() => setDetailCandidate(null)} onChanged={load}
        onHire={(c: any) => { setDetailCandidate(null); setShowHire(c); }}
      />
      <EmployeeModal open={showEmployee !== null} initial={showEmployee} onClose={() => setShowEmployee(null)} onSaved={load} />
      <ContractModal open={showContract !== null} initial={showContract} employees={employees} presetEmployee={showContract?.__employee} onClose={() => setShowContract(null)} onSaved={load} />
      <HireModal candidate={showHire} onClose={() => setShowHire(null)} onSaved={load} />
      <LetterModal contract={showLetter} onClose={() => setShowLetter(null)} />
    </div>
  );
}

/* ============================== PIPELINE ============================== */

function PipelineTab({ candidates, onOpen, onAdd }: any) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={onAdd} className="btn-primary"><Plus className="h-4 w-4" /> Tambah kandidat</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
        {STAGES.map((s) => {
          const list = candidates.filter((c: any) => c.stage === s.id);
          return (
            <div key={s.id} className="rounded-xl border border-line bg-slate-50/60 dark:bg-slate-800/30 p-2.5 min-h-[160px]">
              <div className="flex items-center gap-2 px-1.5 pb-2">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <span className="text-[13px] font-semibold text-ink">{s.label}</span>
                <span className="ml-auto text-[11px] font-semibold text-muted bg-white dark:bg-slate-800 border border-line rounded-full px-2 py-0.5">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => onOpen(c)}
                    className="w-full text-left rounded-lg border border-line bg-white dark:bg-slate-900 p-3 hover:border-brand/50 hover:shadow-sm transition-all"
                  >
                    <p className="text-[13.5px] font-semibold text-ink truncate">{c.name}</p>
                    <p className="text-[12px] text-muted truncate mt-0.5">{c.vacancy?.title || 'Tanpa lowongan'}</p>
                    {c.rating ? (
                      <p className="flex items-center gap-1 mt-1.5 text-[12px] text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {c.rating}/5
                      </p>
                    ) : null}
                  </button>
                ))}
                {list.length === 0 && <p className="text-[12px] text-muted/70 px-1.5 py-2">Kosong</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== LOWONGAN ============================== */

function VacancyTab({ items, q, setQ, onAdd, onEdit, onReload }: any) {
  const [busy, setBusy] = useState('');
  const filtered = items.filter((v: any) =>
    !q || v.title.toLowerCase().includes(q.toLowerCase()) || (v.department || '').toLowerCase().includes(q.toLowerCase()));

  async function toggleStatus(v: any) {
    setBusy(v.id);
    try {
      await api(`/api/hr/vacancies/${v.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...v, status: v.status === 'OPEN' ? 'CLOSED' : 'OPEN' }),
      });
      onReload();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal mengubah status.')); }
    finally { setBusy(''); }
  }
  async function remove(v: any) {
    if (!confirm(`Hapus lowongan "${v.title}"?`)) return;
    setBusy(v.id);
    try { await api(`/api/hr/vacancies/${v.id}`, { method: 'DELETE' }); onReload(); }
    catch (e: any) { alert(friendlyFetchError(e, 'Gagal menghapus.')); }
    finally { setBusy(''); }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari lowongan…" className="input !pl-9" />
        </div>
        <button onClick={onAdd} className="btn-primary"><Plus className="h-4 w-4" /> Buat lowongan</button>
      </div>
      {filtered.length === 0 ? (
        <Card><Empty icon={Briefcase} title="Belum ada lowongan" hint="Buat lowongan pertama untuk mulai menerima lamaran kandidat." action={<button onClick={onAdd} className="btn-primary mt-4"><Plus className="h-4 w-4" /> Buat lowongan</button>} /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((v: any) => (
            <Card key={v.id} className="!p-5 flex flex-col">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink truncate">{v.title}</p>
                  <p className="text-[12.5px] text-muted flex items-center gap-1 mt-0.5">
                    <Building className="h-3.5 w-3.5" /> {v.department || '—'}
                    {v.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {v.location}</span>}
                  </p>
                </div>
                <span className={VAC_STATUS[v.status]?.cls || 'badge'}>{VAC_STATUS[v.status]?.label || v.status}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 text-[12.5px]">
                <span className="badge-blue">{EMP_TYPES[v.employmentType] || v.employmentType}</span>
                <span className="text-muted">Kuota {v.quota} · {v._count?.candidates ?? 0} pelamar</span>
              </div>
              {(v.salaryMin || v.salaryMax) && (
                <p className="text-[12.5px] text-muted mt-1.5">{rupiah(v.salaryMin)} – {rupiah(v.salaryMax)}</p>
              )}
              <div className="flex gap-2 mt-4 pt-3 border-t border-line/70">
                <button onClick={() => onEdit(v)} className="btn-secondary !py-1.5 !px-3 text-[12.5px] flex-1"><Pencil className="h-3.5 w-3.5" /> Ubah</button>
                <button onClick={() => toggleStatus(v)} disabled={busy === v.id} className="btn-secondary !py-1.5 !px-3 text-[12.5px] flex-1">
                  {v.status === 'OPEN' ? 'Tutup' : 'Buka lagi'}
                </button>
                <button onClick={() => remove(v)} disabled={busy === v.id} className="btn-ghost !py-1.5 !px-2.5 text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function VacancyModal({ open, initial, onClose, onSaved }: any) {
  const isEdit = initial && initial.id;
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF({
      title: initial?.title || '', department: initial?.department || '', location: initial?.location || '',
      employmentType: initial?.employmentType || 'PKWTT', quota: initial?.quota || 1,
      status: initial?.status || 'OPEN', description: initial?.description || '',
      salaryMin: initial?.salaryMin || '', salaryMax: initial?.salaryMax || '',
    });
  }, [open]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      await api(isEdit ? `/api/hr/vacancies/${initial.id}` : '/api/hr/vacancies', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ ...f, quota: Number(f.quota) || 1, salaryMin: f.salaryMin || null, salaryMax: f.salaryMax || null }),
      });
      onSaved(); onClose();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal menyimpan lowongan.')); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah lowongan' : 'Buat lowongan baru'} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Judul posisi *"><input className="input" value={f.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="cth: Staff Administrasi" /></Field>
        <Field label="Departemen"><input className="input" value={f.department || ''} onChange={(e) => set('department', e.target.value)} placeholder="cth: Operasional" /></Field>
        <Field label="Lokasi"><input className="input" value={f.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="cth: Cirebon" /></Field>
        <Field label="Jenis kepegawaian">
          <select className="input" value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
            {Object.entries(EMP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Kuota"><input type="number" min={1} className="input" value={f.quota} onChange={(e) => set('quota', e.target.value)} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="OPEN">Dibuka</option><option value="DRAFT">Draf</option><option value="CLOSED">Ditutup</option>
          </select>
        </Field>
        <Field label="Gaji minimal (Rp)"><input type="number" min={0} className="input" value={f.salaryMin || ''} onChange={(e) => set('salaryMin', e.target.value)} placeholder="cth: 3000000" /></Field>
        <Field label="Gaji maksimal (Rp)"><input type="number" min={0} className="input" value={f.salaryMax || ''} onChange={(e) => set('salaryMax', e.target.value)} placeholder="cth: 4500000" /></Field>
        <div className="sm:col-span-2">
          <Field label="Deskripsi"><textarea className="input" rows={4} value={f.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="Tugas, syarat, dan benefit…" /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary">Batal</button>
        <button onClick={save} disabled={saving || !f.title?.trim()} className="btn-primary">{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </Modal>
  );
}

/* ============================== KANDIDAT ============================== */

function CandidateTab({ items, vacancies, q, setQ, onAdd, onOpen }: any) {
  const [stageFilter, setStageFilter] = useState('');
  const filtered = items.filter((c: any) =>
    (!stageFilter || c.stage === stageFilter) &&
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || '').includes(q)));
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / telepon…" className="input !pl-9" />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="input !w-auto">
          <option value="">Semua tahap</option>
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={onAdd} className="btn-primary"><Plus className="h-4 w-4" /> Tambah kandidat</button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <div className="table-wrap !border-0 !rounded-none">
          <table className="table">
            <thead><tr><th>Nama</th><th>Lowongan</th><th>Kontak</th><th>Tahap</th><th>Rating</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c: any) => {
                const st = STAGES.find((s) => s.id === c.stage);
                return (
                  <tr key={c.id}>
                    <td className="font-medium text-ink">{c.name}</td>
                    <td className="text-muted">{c.vacancy?.title || '—'}</td>
                    <td className="text-muted text-[13px]">{c.phone || c.email || '—'}</td>
                    <td><span className={st?.cls || 'badge'}>{st?.label || c.stage}</span></td>
                    <td>{c.rating ? <span className="flex items-center gap-1 text-[13px]"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{c.rating}</span> : '—'}</td>
                    <td className="text-right"><button onClick={() => onOpen(c)} className="btn-ghost !py-1 !px-2 text-[12.5px]">Detail <ChevronRight className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="!py-10 text-center text-muted">Belum ada kandidat.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CandidateModal({ open, initial, vacancies, onClose, onSaved }: any) {
  const isEdit = initial && initial.id;
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF({
      vacancyId: initial?.vacancyId || '', name: initial?.name || '', email: initial?.email || '',
      phone: initial?.phone || '', address: initial?.address || '',
      birthDate: initial?.birthDate ? String(initial.birthDate).slice(0, 10) : '',
      education: initial?.education || '', experience: initial?.experience || '',
      source: initial?.source || '', stage: initial?.stage || 'LAMARAN',
      rating: initial?.rating || '', notes: initial?.notes || '',
    });
  }, [open]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      await api(isEdit ? `/api/hr/candidates/${initial.id}` : '/api/hr/candidates', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ ...f, rating: f.rating || null }),
      });
      onSaved(); onClose();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal menyimpan kandidat.')); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah kandidat' : 'Tambah kandidat'} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="Nama lengkap *"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field></div>
        <Field label="Lowongan dilamar">
          <select className="input" value={f.vacancyId || ''} onChange={(e) => set('vacancyId', e.target.value)}>
            <option value="">— Tanpa lowongan —</option>
            {vacancies.filter((v: any) => v.status === 'OPEN').map((v: any) => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
        </Field>
        <Field label="Tahap">
          <select className="input" value={f.stage} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Telepon/WA"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Tanggal lahir"><input type="date" className="input" value={f.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} /></Field>
        <Field label="Pendidikan"><input className="input" value={f.education || ''} onChange={(e) => set('education', e.target.value)} placeholder="cth: S1 Manajemen" /></Field>
        <Field label="Sumber"><input className="input" value={f.source || ''} onChange={(e) => set('source', e.target.value)} placeholder="cth: Jobstreet, Referral" /></Field>
        <Field label="Rating (1–5)"><input type="number" min={1} max={5} className="input" value={f.rating || ''} onChange={(e) => set('rating', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Alamat"><input className="input" value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Pengalaman"><textarea className="input" rows={3} value={f.experience || ''} onChange={(e) => set('experience', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Catatan"><textarea className="input" rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary">Batal</button>
        <button onClick={save} disabled={saving || !f.name?.trim()} className="btn-primary">{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </Modal>
  );
}

function CandidateDetailModal({ candidate, onClose, onChanged, onHire }: any) {
  const [moving, setMoving] = useState(false);
  if (!candidate) return null;
  const c = candidate;
  const st = STAGES.find((s) => s.id === c.stage);
  const canHire = !c.employee && c.stage !== 'DITOLAK';

  async function moveStage(stage: string) {
    setMoving(true);
    try {
      await api(`/api/hr/candidates/${c.id}`, { method: 'PUT', body: JSON.stringify({ ...c, vacancyId: c.vacancyId || null, stage }) });
      onChanged();
      onClose();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal memindahkan tahap.')); }
    finally { setMoving(false); }
  }
  async function remove() {
    if (!confirm(`Hapus kandidat "${c.name}"?`)) return;
    try { await api(`/api/hr/candidates/${c.id}`, { method: 'DELETE' }); onChanged(); onClose(); }
    catch (e: any) { alert(friendlyFetchError(e, 'Gagal menghapus.')); }
  }

  const rows: [string, any][] = [
    ['Lowongan', c.vacancy?.title || '—'],
    ['Telepon', c.phone || '—'],
    ['Email', c.email || '—'],
    ['Tanggal lahir', tgl(c.birthDate)],
    ['Pendidikan', c.education || '—'],
    ['Sumber', c.source || '—'],
    ['Alamat', c.address || '—'],
  ];

  return (
    <Modal open onClose={onClose} title={c.name} wide>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className={st?.cls || 'badge'}>{st?.label}</span>
        {c.rating ? <span className="flex items-center gap-1 text-[13px] text-amber-600"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {c.rating}/5</span> : null}
        {c.source && <span className="badge-blue">{c.source}</span>}
        {c.employee && <span className="badge-green">Sudah jadi karyawan ({c.employee.employeeNo})</span>}
        {c.cvUrl && (
          <a href={`/api/hr/candidates/${c.id}/cv`} className="btn-secondary !py-1.5 !px-3 text-[12.5px]" download>
            <FileDown className="h-3.5 w-3.5" /> Unduh CV{c.cvName ? ` (${c.cvName.split('.').pop()?.toUpperCase()})` : ''}
          </a>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] mb-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2"><span className="text-muted w-28 shrink-0">{k}</span><span className="text-ink">{v}</span></div>
        ))}
      </div>
      {c.experience && <div className="mb-3"><p className="label">Pengalaman</p><p className="text-[13.5px] text-ink whitespace-pre-wrap">{c.experience}</p></div>}
      {c.notes && <div className="mb-3"><p className="label">Catatan</p><p className="text-[13.5px] text-ink whitespace-pre-wrap">{c.notes}</p></div>}

      <p className="label">Pindahkan tahap</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {STAGES.filter((s) => s.id !== c.stage).map((s) => (
          <button key={s.id} disabled={moving} onClick={() => moveStage(s.id)} className="btn-secondary !py-1.5 !px-3 text-[12.5px]">{s.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-line">
        <button onClick={remove} className="btn-ghost text-red-600 !py-2"><Trash2 className="h-4 w-4" /> Hapus</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary">Tutup</button>
          {canHire && <button onClick={() => onHire(c)} className="btn-primary"><UserCheck className="h-4 w-4" /> Terima & jadikan karyawan</button>}
        </div>
      </div>
    </Modal>
  );
}

/* ============================== HIRE ============================== */

function HireModal({ candidate, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (candidate) setF({
      position: candidate.vacancy?.title || '', department: '', joinDate: today(),
      contractType: 'PKWTT', contractNo: '', salary: '', probationMonths: 3,
    });
  }, [candidate]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      await api(`/api/hr/candidates/${candidate.id}/hire`, { method: 'POST', body: JSON.stringify(f) });
      onSaved(); onClose();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal memproses penerimaan.')); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!candidate} onClose={onClose} title={`Terima "${candidate?.name}" sebagai karyawan`} wide>
      <p className="text-[13px] text-muted mb-4">Satu langkah ini membuat <b className="text-ink">data karyawan</b> (nomor otomatis) sekaligus <b className="text-ink">kontrak kerja</b>, dan memindahkan kandidat ke tahap Diterima.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Jabatan *"><input className="input" value={f.position || ''} onChange={(e) => set('position', e.target.value)} /></Field>
        <Field label="Departemen"><input className="input" value={f.department || ''} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="Tanggal bergabung *"><input type="date" className="input" value={f.joinDate || ''} onChange={(e) => set('joinDate', e.target.value)} /></Field>
        <Field label="Jenis kontrak">
          <select className="input" value={f.contractType} onChange={(e) => set('contractType', e.target.value)}>
            <option value="PKWTT">PKWTT (tetap)</option><option value="PKWT">PKWT (kontrak)</option>
          </select>
        </Field>
        <Field label="Nomor kontrak *"><input className="input" value={f.contractNo || ''} onChange={(e) => set('contractNo', e.target.value)} placeholder="cth: PKWTT/2026/001" /></Field>
        <Field label="Gaji pokok (Rp)"><input type="number" min={0} className="input" value={f.salary || ''} onChange={(e) => set('salary', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Masa percobaan (bulan)"><input type="number" min={0} max={12} className="input" value={f.probationMonths ?? 3} onChange={(e) => set('probationMonths', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary">Batal</button>
        <button onClick={save} disabled={saving || !f.position?.trim() || !f.contractNo?.trim() || !f.joinDate} className="btn-primary">
          {saving ? 'Memproses…' : 'Terima & buat karyawan'}
        </button>
      </div>
    </Modal>
  );
}

/* ============================== KARYAWAN ============================== */

function EmployeeTab({ items, q, setQ, onAdd, onEdit, onReload }: any) {
  const [busy, setBusy] = useState('');
  const filtered = items.filter((e: any) =>
    !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.employeeNo.toLowerCase().includes(q.toLowerCase()) || e.position.toLowerCase().includes(q.toLowerCase()));
  async function remove(e: any) {
    if (!confirm(`Hapus karyawan "${e.name}"? Kontrak terkait ikut terhapus.`)) return;
    setBusy(e.id);
    try { await api(`/api/hr/employees/${e.id}`, { method: 'DELETE' }); onReload(); }
    catch (err: any) { alert(friendlyFetchError(err, 'Gagal menghapus.')); }
    finally { setBusy(''); }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / NIK / jabatan…" className="input !pl-9" />
        </div>
        <button onClick={() => onAdd({})} className="btn-primary"><Plus className="h-4 w-4" /> Tambah karyawan</button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <div className="table-wrap !border-0 !rounded-none">
          <table className="table">
            <thead><tr><th>No. Karyawan</th><th>Nama</th><th>Jabatan</th><th>Bergabung</th><th>Kontrak</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((e: any) => {
                const latest = e.contracts?.[0];
                return (
                  <tr key={e.id}>
                    <td className="font-mono text-[13px]">{e.employeeNo}</td>
                    <td className="font-medium text-ink">{e.name}</td>
                    <td className="text-muted">{e.position}{e.department ? ` · ${e.department}` : ''}</td>
                    <td className="text-muted">{tgl(e.joinDate)}</td>
                    <td>{latest ? <span className={latest.type === 'PKWTT' ? 'badge-green' : 'badge-blue'}>{latest.type}</span> : <span className="text-muted text-[12px]">Belum ada</span>}</td>
                    <td><span className={EMP_STATUS[e.status]?.cls || 'badge'}>{EMP_STATUS[e.status]?.label || e.status}</span></td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => onEdit(e)} className="btn-ghost !py-1 !px-2 text-[12.5px]"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(e)} disabled={busy === e.id} className="btn-ghost !py-1 !px-2 text-red-600 text-[12.5px]"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="!py-10 text-center text-muted">Belum ada karyawan.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EmployeeModal({ open, initial, onClose, onSaved }: any) {
  const isEdit = initial && initial.id;
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF({
      employeeNo: initial?.employeeNo || '', name: initial?.name || '', nik: initial?.nik || '',
      email: initial?.email || '',
      phone: initial?.phone || '', address: initial?.address || '',
      birthDate: initial?.birthDate ? String(initial.birthDate).slice(0, 10) : '',
      position: initial?.position || '', department: initial?.department || '',
      joinDate: initial?.joinDate ? String(initial.joinDate).slice(0, 10) : today(),
      status: initial?.status || 'AKTIF',
    });
  }, [open]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      await api(isEdit ? `/api/hr/employees/${initial.id}` : '/api/hr/employees', {
        method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(f),
      });
      onSaved(); onClose();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal menyimpan karyawan.')); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah karyawan' : 'Tambah karyawan'} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nomor karyawan *"><input className="input" value={f.employeeNo || ''} onChange={(e) => set('employeeNo', e.target.value)} placeholder="cth: EMP-2026-001" /></Field>
        <Field label="Nama lengkap *"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="NIK (KTP)"><input className="input" value={f.nik || ''} onChange={(e) => set('nik', e.target.value)} placeholder="16 digit" maxLength={20} /></Field>
        <Field label="Jabatan *"><input className="input" value={f.position || ''} onChange={(e) => set('position', e.target.value)} /></Field>
        <Field label="Departemen"><input className="input" value={f.department || ''} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="Tanggal bergabung *"><input type="date" className="input" value={f.joinDate || ''} onChange={(e) => set('joinDate', e.target.value)} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="AKTIF">Aktif</option><option value="CUTI">Cuti</option><option value="NONAKTIF">Nonaktif</option>
          </select>
        </Field>
        <Field label="Telepon"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Tanggal lahir"><input type="date" className="input" value={f.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} /></Field>
        <div><Field label="Alamat"><input className="input" value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary">Batal</button>
        <button onClick={save} disabled={saving || !f.employeeNo?.trim() || !f.name?.trim() || !f.position?.trim() || !f.joinDate} className="btn-primary">{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </Modal>
  );
}

/* ============================== KONTRAK ============================== */

function ContractTab({ items, q, setQ, onAdd, onEdit, onReload, onLetter }: any) {
  const [typeFilter, setTypeFilter] = useState('');
  const [busy, setBusy] = useState('');
  const filtered = items.filter((c: any) =>
    (!typeFilter || c.type === typeFilter) &&
    (!q || c.contractNo.toLowerCase().includes(q.toLowerCase()) || c.employee.name.toLowerCase().includes(q.toLowerCase())));
  async function remove(c: any) {
    if (!confirm(`Hapus kontrak ${c.contractNo} ("${c.employee.name}")?`)) return;
    setBusy(c.id);
    try { await api(`/api/hr/contracts/${c.id}`, { method: 'DELETE' }); onReload(); }
    catch (e: any) { alert(friendlyFetchError(e, 'Gagal menghapus.')); }
    finally { setBusy(''); }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no. kontrak / nama…" className="input !pl-9" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input !w-auto">
          <option value="">Semua jenis</option><option value="PKWTT">PKWTT</option><option value="PKWT">PKWT</option>
        </select>
        <button onClick={() => onAdd({})} className="btn-primary"><Plus className="h-4 w-4" /> Buat kontrak</button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <div className="table-wrap !border-0 !rounded-none">
          <table className="table">
            <thead><tr><th>No. Kontrak</th><th>Karyawan</th><th>Jenis</th><th>Periode</th><th>Gaji</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-mono text-[13px]">{c.contractNo}</td>
                  <td className="font-medium text-ink">{c.employee.name}<span className="text-muted font-normal"> · {c.employee.employeeNo}</span></td>
                  <td><span className={c.type === 'PKWTT' ? 'badge-green' : 'badge-blue'}>{c.type}</span></td>
                  <td className="text-muted text-[13px]">{tgl(c.startDate)} – {c.endDate ? tgl(c.endDate) : '∞'}</td>
                  <td className="text-muted">{rupiah(c.salary)}</td>
                  <td><span className={CONTRACT_STATUS[c.status]?.cls || 'badge'}>{CONTRACT_STATUS[c.status]?.label || c.status}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => onLetter(c)} title="Surat perjanjian (PDF)" className="btn-ghost !py-1 !px-2 text-brand text-[12.5px]"><FileDown className="h-4 w-4" /></button>
                    <button onClick={() => onEdit(c)} className="btn-ghost !py-1 !px-2 text-[12.5px]"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(c)} disabled={busy === c.id} className="btn-ghost !py-1 !px-2 text-red-600 text-[12.5px]"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="!py-10 text-center text-muted">Belum ada kontrak.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ContractModal({ open, initial, employees, presetEmployee, onClose, onSaved }: any) {
  const isEdit = initial && initial.id;
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF({
      employeeId: initial?.employeeId || presetEmployee || '',
      contractNo: initial?.contractNo || '', type: initial?.type || 'PKWTT',
      startDate: initial?.startDate ? String(initial.startDate).slice(0, 10) : today(),
      endDate: initial?.endDate ? String(initial.endDate).slice(0, 10) : '',
      probationEnd: initial?.probationEnd ? String(initial.probationEnd).slice(0, 10) : '',
      salary: initial?.salary || '', position: initial?.position || '',
      status: initial?.status || 'AKTIF', notes: initial?.notes || '',
    });
  }, [open]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    try {
      await api(isEdit ? `/api/hr/contracts/${initial.id}` : '/api/hr/contracts', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ ...f, salary: f.salary || null, endDate: f.endDate || null, probationEnd: f.probationEnd || null }),
      });
      onSaved(); onClose();
    } catch (e: any) { alert(friendlyFetchError(e, 'Gagal menyimpan kontrak.')); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah kontrak' : 'Buat kontrak kerja'} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Karyawan *">
          <select className="input" value={f.employeeId || ''} onChange={(e) => { set('employeeId', e.target.value); const emp = employees.find((x: any) => x.id === e.target.value); if (emp && !isEdit) set('position', emp.position); }}>
            <option value="">— Pilih karyawan —</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.employeeNo})</option>)}
          </select>
        </Field>
        <Field label="Nomor kontrak *"><input className="input" value={f.contractNo || ''} onChange={(e) => set('contractNo', e.target.value)} placeholder="cth: PKWTT/2026/001" /></Field>
        <Field label="Jenis kontrak">
          <select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="PKWTT">PKWTT (waktu tidak tertentu)</option><option value="PKWT">PKWT (waktu tertentu)</option>
          </select>
        </Field>
        <Field label="Jabatan *"><input className="input" value={f.position || ''} onChange={(e) => set('position', e.target.value)} /></Field>
        <Field label="Tanggal mulai *"><input type="date" className="input" value={f.startDate || ''} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Tanggal berakhir (PKWT)"><input type="date" className="input" value={f.endDate || ''} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Akhir masa percobaan"><input type="date" className="input" value={f.probationEnd || ''} onChange={(e) => set('probationEnd', e.target.value)} /></Field>
        <Field label="Gaji pokok (Rp)"><input type="number" min={0} className="input" value={f.salary || ''} onChange={(e) => set('salary', e.target.value)} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="AKTIF">Aktif</option><option value="BERAKHIR">Berakhir</option><option value="DIPUTUS">Diputus</option>
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="Catatan"><textarea className="input" rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary">Batal</button>
        <button onClick={save} disabled={saving || !f.employeeId || !f.contractNo?.trim() || !f.position?.trim() || !f.startDate} className="btn-primary">{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </Modal>
  );
}

/* ============================== SURAT PERJANJIAN ============================== */

function LetterModal({ contract, onClose }: any) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  if (!contract) return null;
  const c = contract;

  function download() {
    window.open(`/api/hr/contracts/${c.id}/letter`, '_blank');
  }

  async function sendWa() {
    if (!phone.trim()) { alert('Isi nomor WhatsApp admin dulu.'); return; }
    setSending(true); setSentOk(false);
    try {
      await api(`/api/hr/contracts/${c.id}/send-wa`, { method: 'POST', body: JSON.stringify({ phone: phone.trim() }) });
      setSentOk(true);
    } catch (e: any) {
      alert(friendlyFetchError(e, 'Gagal mengirim via WhatsApp.'));
    } finally { setSending(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Surat Perjanjian ${c.type}`}>
      <div className="rounded-xl border border-line bg-slate-50 dark:bg-slate-800/40 p-4 text-[13.5px]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <span className="text-muted">Nomor kontrak</span><span className="font-mono text-ink">{c.contractNo}</span>
          <span className="text-muted">Karyawan</span><span className="text-ink font-medium">{c.employee.name} · {c.employee.employeeNo}</span>
          <span className="text-muted">Jenis</span><span><span className={c.type === 'PKWTT' ? 'badge-green' : 'badge-blue'}>{c.type}</span></span>
          <span className="text-muted">Jabatan</span><span className="text-ink">{c.position}</span>
          <span className="text-muted">Periode</span><span className="text-ink">{tgl(c.startDate)} – {c.endDate ? tgl(c.endDate) : '∞'}</span>
          <span className="text-muted">Gaji pokok</span><span className="text-ink">{rupiah(c.salary)}</span>
        </div>
      </div>
      <p className="text-[12.5px] text-muted mt-3">
        Surat dibuat otomatis dalam format PDF (A4) berisi para pihak, 9 pasal perjanjian, dan kolom tanda tangan — siap print.
      </p>

      <div className="mt-4">
        <button onClick={download} className="btn-primary w-full">
          <FileDown className="h-4 w-4" /> Download PDF
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-line">
        <p className="label">Kirim ke WhatsApp admin untuk diprint</p>
        <div className="flex gap-2">
          <input
            className="input flex-1" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="cth: 081234567890" inputMode="tel"
          />
          <button onClick={sendWa} disabled={sending} className="btn-secondary shrink-0">
            <Send className="h-4 w-4" /> {sending ? 'Mengirim…' : 'Kirim'}
          </button>
        </div>
        {sentOk && <p className="text-[13px] text-emerald-600 mt-2">Terkirim! Surat PDF sudah masuk ke WhatsApp nomor tersebut.</p>}
        <p className="text-[12px] text-muted mt-1.5">Membutuhkan WhatsApp yang terhubung di menu Saluran.</p>
      </div>

      <div className="flex justify-end mt-5">
        <button onClick={onClose} className="btn-secondary">Tutup</button>
      </div>
    </Modal>
  );
}
