// Form Tambah/Edit Pengguna — halaman penuh dengan sidebar 4 bagian.
// Sidebar 1: Detail Akun dan Status · 2: Info Ketenagakerjaan
// 3: Info Tambahan · 4: Hak Akses Modul.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Briefcase, ChevronLeft, ListPlus, ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AccountSection,
  CustomFieldsSection,
  EducationSection,
  EmploymentSection,
  FamilySection,
  ModuleAccessSection,
  PersonalSection,
} from './UserFormSections';
import {
  detailToFormState,
  emptyFormState,
  formStateToPayload,
  type FormRefs,
  type UserFormState,
} from './user-form-types';

const SIDEBARS = [
  { id: 'akun', label: 'Detail Akun dan Status', desc: 'Akun, data personal & keluarga', Icon: User },
  { id: 'kerja', label: 'Info Ketenagakerjaan', desc: 'Jabatan, pendidikan & pengalaman', Icon: Briefcase },
  { id: 'tambahan', label: 'Info Tambahan', desc: 'Field custom kantor', Icon: ListPlus },
  { id: 'modul', label: 'Hak Akses Modul', desc: 'Modul yang boleh dibuka', Icon: ShieldCheck },
] as const;

type SidebarId = (typeof SIDEBARS)[number]['id'];

const FIRST_ACCORDION: Record<SidebarId, string> = {
  akun: 'akun',
  kerja: 'kerja',
  tambahan: 'tambahan',
  modul: 'modul',
};

export function UserForm({
  mode,
  membershipId,
  userId,
  canManageCustomFields,
}: {
  mode: 'create' | 'edit';
  membershipId?: string;
  userId?: string;
  canManageCustomFields: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<SidebarId>('akun');
  const [openAcc, setOpenAcc] = useState<Record<string, boolean>>({ akun: true });
  const [state, setState] = useState<UserFormState>(() => emptyFormState());
  const [refs, setRefs] = useState<FormRefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = useCallback((p: Partial<UserFormState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  const toggleAcc = useCallback((key: string) => {
    setOpenAcc((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const goSidebar = useCallback((id: SidebarId) => {
    setActive(id);
    setOpenAcc((prev) => {
      const first = FIRST_ACCORDION[id];
      if (prev[first]) return prev;
      return { ...prev, [first]: true };
    });
  }, []);

  const loadRefs = useCallback(async () => {
    const r = await fetch('/api/admin/users/refs');
    const j = await r.json();
    if (!j.success) throw new Error(j.message || 'Gagal memuat referensi.');
    return j.data as FormRefs;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        if (mode === 'edit' && membershipId) {
          const r = await fetch(`/api/admin/users/${membershipId}`);
          const j = await r.json();
          if (!j.success) throw new Error(j.message || 'Gagal memuat pengguna.');
          if (!alive) return;
          setState(detailToFormState(j.data));
          setRefs(j.data.refs as FormRefs);
        } else {
          const r = await loadRefs();
          if (!alive) return;
          setRefs(r);
        }
      } catch (e: any) {
        if (alive) setLoadError(e.message || 'Gagal memuat data.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, membershipId, loadRefs]);

  const refreshDefs = useCallback(async () => {
    try {
      const r = await loadRefs();
      setRefs((prev) => (prev ? { ...prev, customFields: r.customFields } : r));
    } catch {
      /* biarkan daftar lama */
    }
  }, [loadRefs]);

  const uploadFile = useCallback(
    async (file: File, scope: string): Promise<{ path: string; name: string } | null> => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('scope', scope);
        const r = await fetch('/api/admin/users/certificates', { method: 'POST', body: fd });
        const j = await r.json();
        if (!j.success) throw new Error(j.message || 'Gagal mengunggah file.');
        return { path: j.data.path, name: j.data.name };
      } catch (e: any) {
        toast.error(e.message || 'Gagal mengunggah file.');
        return null;
      }
    },
    []
  );

  async function save() {
    if (!state.name.trim()) {
      toast.error('Nama lengkap wajib diisi.');
      goSidebar('akun');
      return;
    }
    if (!state.email.trim()) {
      toast.error('Email wajib diisi.');
      goSidebar('akun');
      return;
    }
    if (!state.roleId) {
      toast.error('Role System wajib dipilih.');
      goSidebar('akun');
      return;
    }
    setBusy(true);
    try {
      const payload = formStateToPayload(state, mode);
      const url = mode === 'create' ? '/api/admin/users' : `/api/admin/users/${membershipId}`;
      const r = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal menyimpan.');
      toast.success(mode === 'create' ? 'Pengguna ditambahkan.' : 'Data pengguna diperbarui.');
      router.push('/admin-kantor/users');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  const scope = userId ?? 'new';
  const title = mode === 'create' ? 'Tambah Pengguna' : `Edit Pengguna — ${state.name || ''}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => router.push('/admin-kantor/users')} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink mb-1">
            <ChevronLeft className="h-4 w-4" /> Kembali ke daftar
          </button>
          <h1 className="text-[22px] font-bold text-ink">{title}</h1>
          <p className="text-sm text-muted">
            {mode === 'create' ? 'Isi data pengguna baru — simpan untuk membuat akun.' : 'Ubah data pengguna — perubahan tersimpan untuk kantor ini.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-10 w-64 rounded-btn bg-slate-100 animate-pulse" />
          <div className="h-64 rounded-btn bg-slate-100 animate-pulse" />
        </div>
      ) : loadError ? (
        <div className="card p-6 text-center space-y-3">
          <p className="text-sm text-danger">{loadError}</p>
          <button onClick={() => location.reload()} className="btn-primary !py-2 text-[13px]">
            Coba lagi
          </button>
        </div>
      ) : refs ? (
        <>
          {/* Sidebar — desktop */}
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            <aside className="hidden lg:block w-64 shrink-0 lg:sticky lg:top-4 space-y-1.5">
              {SIDEBARS.map(({ id, label, desc, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => goSidebar(id)}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-btn px-3.5 py-3 text-left transition-colors',
                    active === id ? 'bg-brand-50 text-ink ring-1 ring-brand-200' : 'text-muted hover:bg-slate-100 hover:text-ink'
                  )}
                >
                  <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', active === id ? 'text-brand-600' : 'text-muted')} />
                  <span>
                    <span className="block text-[13.5px] font-semibold leading-tight">{label}</span>
                    <span className="block text-[12px] text-muted mt-0.5 leading-tight">{desc}</span>
                  </span>
                </button>
              ))}
            </aside>

            {/* Sidebar — mobile: chip horizontal */}
            <div className="lg:hidden -mx-4 px-4 overflow-x-auto pb-1 -mb-1">
              <div className="flex gap-2 w-max">
                {SIDEBARS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goSidebar(id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium whitespace-nowrap border transition-colors',
                      active === id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-muted border-slate-200'
                    )}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full space-y-4">
              {active === 'akun' && (
                <>
                  <AccountSection s={state} update={update} refs={refs} mode={mode} open={!!openAcc.akun} onToggle={() => toggleAcc('akun')} />
                  <PersonalSection s={state} update={update} open={!!openAcc.personal} onToggle={() => toggleAcc('personal')} />
                  <FamilySection s={state} update={update} open={!!openAcc.keluarga} onToggle={() => toggleAcc('keluarga')} />
                </>
              )}
              {active === 'kerja' && (
                <>
                  <EmploymentSection s={state} update={update} refs={refs} open={!!openAcc.kerja} onToggle={() => toggleAcc('kerja')} />
                  <EducationSection s={state} update={update} scope={scope} onUpload={uploadFile} open={!!openAcc.pendidikan} onToggle={() => toggleAcc('pendidikan')} />
                </>
              )}
              {active === 'tambahan' && (
                <CustomFieldsSection
                  s={state}
                  update={update}
                  refs={refs}
                  scope={scope}
                  onUpload={uploadFile}
                  onDefsChange={refreshDefs}
                  canManage={canManageCustomFields}
                  open={!!openAcc.tambahan}
                  onToggle={() => toggleAcc('tambahan')}
                />
              )}
              {active === 'modul' && (
                <ModuleAccessSection s={state} update={update} refs={refs} open={!!openAcc.modul} onToggle={() => toggleAcc('modul')} />
              )}
            </div>
          </div>

          {/* Bar simpan */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/90 backdrop-blur border-t border-slate-200 flex items-center justify-end gap-2 z-10">
            <button onClick={() => router.push('/admin-kantor/users')} className="btn-ghost !py-2 text-[13px]">
              Batal
            </button>
            <button onClick={save} disabled={busy} className="btn-primary !py-2 text-[13px] disabled:opacity-60">
              {busy ? 'Menyimpan…' : mode === 'create' ? 'Tambah Pengguna' : 'Simpan Perubahan'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
