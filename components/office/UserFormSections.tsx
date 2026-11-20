// Section-section form Tambah/Edit Pengguna (Sidebar 1–4).
// Dipakai components/office/UserForm.tsx.

'use client';

import { useState } from 'react';
import { ChevronDown, Plus, Trash2, Upload, FileText, X } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MODULAR_MODULES, MODULAR_TO_LEGACY } from '@/lib/modular';
import {
  BLOOD_TYPES,
  CUSTOM_FIELD_TYPES,
  DOC_ACCESS_LEVELS,
  EMPLOYMENT_STATUSES,
  FORMAL_DEGREES,
  GENDERS,
  JOB_LEVELS,
  MARITAL_STATUSES,
  RELATIONSHIPS,
  RELIGIONS,
  parseFieldOptions,
} from '@/lib/user-profile';
import type { EducationRow, ExperienceRow, FamilyRow, FormRefs, UserFormState } from './user-form-types';

/* ---------------- helpers ---------------- */

export function Accordion({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left hover:bg-slate-50 transition-colors">
        <span>
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          {subtitle && <span className="block text-[12.5px] text-muted mt-0.5">{subtitle}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-slate-100">{children}</div>}
    </Card>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<string | { value: string; label: string }>;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">{placeholder ?? '— Pilih —'}</option>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </Field>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-emerald-500' : 'bg-slate-300',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function FileUpload({
  value,
  fileName,
  scope,
  onUpload,
  onClear,
}: {
  value: string;
  fileName: string;
  scope: string;
  onUpload: (file: File, scope: string) => Promise<{ path: string; name: string } | null>;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (value) {
    return (
      <div className="flex items-center gap-2 text-[13px] rounded-btn border border-slate-200 bg-slate-50 px-3 py-2">
        <FileText className="h-4 w-4 shrink-0 text-muted" />
        <a
          href={`/api/admin/users/files?path=${encodeURIComponent(value)}`}
          target="_blank"
          rel="noreferrer"
          className="text-brand-600 hover:underline truncate"
        >
          {fileName || value.split('/').pop()}
        </a>
        <button type="button" onClick={onClear} className="ml-auto shrink-0 text-danger hover:underline text-[12px]">
          Hapus
        </button>
      </div>
    );
  }
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 rounded-btn border border-dashed border-slate-300 px-3 py-2 text-[13px] text-muted cursor-pointer hover:border-brand-400 hover:text-ink transition-colors',
        busy && 'opacity-60 pointer-events-none'
      )}
    >
      <Upload className="h-4 w-4" />
      {busy ? 'Mengunggah…' : 'Lampirkan File (PDF/JPG/PNG ≤ 5 MB)'}
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            await onUpload(f, scope);
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </label>
  );
}

/* ---------------- Sidebar 1 ---------------- */

export function AccountSection({
  s,
  update,
  refs,
  mode,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  refs: FormRefs;
  mode: 'create' | 'edit';
  open: boolean;
  onToggle: () => void;
}) {
  const isSuper = false; // badge super admin dikelola dari halaman daftar
  return (
    <Accordion title="Info Akun" subtitle="Identitas login & status akun di kantor ini." open={open} onToggle={onToggle}>
      <div className="grid sm:grid-cols-2 gap-4">
        {mode === 'edit' && (
          <SelectField
            label="Status Akun"
            value={s.status}
            onChange={(v) => update({ status: v === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
            options={[
              { value: 'ACTIVE', label: 'Aktif' },
              { value: 'INACTIVE', label: 'Nonaktif' },
            ]}
            placeholder="— Pilih status —"
          />
        )}
        <Field label="Username" optional>
          <Input
            value={s.username}
            onChange={(e) => update({ username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
            placeholder="cth: dwi.ramadanu"
          />
        </Field>
        <Field label="Nama Lengkap *">
          <Input value={s.name} onChange={(e) => update({ name: e.target.value })} placeholder="Nama lengkap" />
        </Field>
        <Field label="Email *">
          <Input type="email" value={s.email} onChange={(e) => update({ email: e.target.value })} placeholder="nama@kantor.id" />
        </Field>
        <Field label="No HP / WA" optional>
          <Input value={s.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="cth: 62812xxxx" />
        </Field>
        <SelectField
          label="Level Akses Dokumen"
          value={s.docAccessLevel}
          onChange={(v) => update({ docAccessLevel: v || 'INTERNAL' })}
          options={DOC_ACCESS_LEVELS.map((d) => ({ value: d.value, label: `${d.label} — ${d.hint}` }))}
          placeholder="— Pilih level —"
        />
        <SelectField
          label="Role System *"
          value={s.roleId}
          onChange={(v) => update({ roleId: v })}
          options={refs.roles.map((r) => ({ value: r.id, label: r.name }))}
          placeholder="— Pilih role —"
        />
        <SelectField
          label="Divisi"
          value={s.departmentId}
          onChange={(v) => update({ departmentId: v })}
          options={refs.departments.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="— Tanpa divisi —"
        />
        <Field label="Jabatan" optional>
          <Input value={s.jobTitle} onChange={(e) => update({ jobTitle: e.target.value })} placeholder="cth: Staff HR" />
        </Field>
        {mode === 'create' && (
          <Field label="Password awal" optional>
            <Input
              type="password"
              value={s.password}
              onChange={(e) => update({ password: e.target.value })}
              placeholder="Kosongkan bila belum diset"
            />
          </Field>
        )}
      </div>
      {isSuper && null}
      <p className="text-[12.5px] text-muted mt-4">
        Status Administrator Pusat dan reset password tetap dikelola dari halaman daftar pengguna.
      </p>
    </Accordion>
  );
}

export function PersonalSection({
  s,
  update,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const p = s.profile;
  const set = (patch: Partial<typeof p>) => update({ profile: { ...p, ...patch } });
  return (
    <Accordion title="Info Personal Data" subtitle="Data diri sesuai KTP." open={open} onToggle={onToggle}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Tanggal Lahir" optional>
          <Input type="date" value={p.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
        </Field>
        <SelectField label="Gender" value={p.gender} onChange={(v) => set({ gender: v })} options={GENDERS.map((g) => ({ value: g.value, label: g.label }))} />
        <SelectField label="Status Perkawinan" value={p.maritalStatus} onChange={(v) => set({ maritalStatus: v })} options={MARITAL_STATUSES} />
        <SelectField label="Golongan Darah" value={p.bloodType} onChange={(v) => set({ bloodType: v })} options={BLOOD_TYPES} />
        <SelectField label="Agama" value={p.religion} onChange={(v) => set({ religion: v })} options={RELIGIONS} />
        <Field label="NIK (Nomor Induk Kependudukan)" optional>
          <Input value={p.nik} onChange={(e) => set({ nik: e.target.value.replace(/\D/g, '').slice(0, 16) })} placeholder="16 digit angka" inputMode="numeric" />
        </Field>
        <Field label="Alamat Lengkap Sesuai KTP" optional>
          <textarea value={p.ktpAddress} onChange={(e) => set({ ktpAddress: e.target.value })} className="input min-h-[80px] resize-y" placeholder="Jalan, RT/RW, kelurahan, kecamatan, kota" />
        </Field>
        <Field label="Kode Pos" optional>
          <Input value={p.postalCode} onChange={(e) => set({ postalCode: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="cth: 45153" inputMode="numeric" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Alamat Lengkap Tempat Tinggal (Jika Berbeda)" optional>
            <textarea value={p.homeAddress} onChange={(e) => set({ homeAddress: e.target.value })} className="input min-h-[80px] resize-y" placeholder="Kosongkan bila sama dengan alamat KTP" />
          </Field>
        </div>
      </div>
    </Accordion>
  );
}

export function FamilySection({
  s,
  update,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const setRow = (key: string, patch: Partial<FamilyRow>) =>
    update({ family: s.family.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  return (
    <Accordion title="Info Kontak Keluarga / Kerabat" subtitle="Kontak darurat & keluarga — bisa lebih dari satu." open={open} onToggle={onToggle}>
      <div className="space-y-4">
        {s.family.length === 0 && <p className="text-[13px] text-muted">Belum ada kontak keluarga. Tambahkan bila perlu.</p>}
        {s.family.map((f, i) => (
          <div key={f.key} className="rounded-btn border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">Kontak #{i + 1}</span>
              <button type="button" onClick={() => update({ family: s.family.filter((x) => x.key !== f.key) })} className="p-1.5 text-muted hover:text-danger rounded-btn hover:bg-red-50" title="Hapus kontak">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nama Lengkap *">
                <Input value={f.name} onChange={(e) => setRow(f.key, { name: e.target.value })} placeholder="Nama lengkap" />
              </Field>
              <SelectField label="Hubungan dengan Karyawan *" value={f.relationship} onChange={(v) => setRow(f.key, { relationship: v })} options={RELATIONSHIPS} />
              <Field label="No HP" optional>
                <Input value={f.phone} onChange={(e) => setRow(f.key, { phone: e.target.value })} placeholder="cth: 62812xxxx" />
              </Field>
              <Field label="Pekerjaan" optional>
                <Input value={f.occupation} onChange={(e) => setRow(f.key, { occupation: e.target.value })} placeholder="cth: Wiraswasta" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Alamat Lengkap" optional>
                  <textarea value={f.address} onChange={(e) => setRow(f.key, { address: e.target.value })} className="input min-h-[64px] resize-y" />
                </Field>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update({
              family: [...s.family, { key: `fam-${Date.now()}`, name: '', relationship: '', phone: '', address: '', occupation: '' }],
            })
          }
          className="inline-flex items-center gap-1.5 rounded-btn border border-dashed border-slate-300 px-3 py-2 text-[13px] text-muted hover:border-brand-400 hover:text-ink transition-colors"
        >
          <Plus className="h-4 w-4" /> Tambah Kontak Keluarga
        </button>
      </div>
    </Accordion>
  );
}

/* ---------------- Sidebar 2 ---------------- */

export function EmploymentSection({
  s,
  update,
  refs,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  refs: FormRefs;
  open: boolean;
  onToggle: () => void;
}) {
  const e = s.employment;
  const set = (patch: Partial<typeof e>) => update({ employment: { ...e, ...patch } });
  const memberOptions = refs.members.map((m) => ({
    value: m.id,
    label: m.jobTitle ? `${m.name} — ${m.jobTitle}` : m.name,
  }));
  return (
    <Accordion title="Info Ketenagakerjaan" subtitle="Status & posisi karyawan di kantor ini." open={open} onToggle={onToggle}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nama Perusahaan" optional>
          <Input value={e.companyName} onChange={(ev) => set({ companyName: ev.target.value })} placeholder="cth: PT Woork Indonesia" />
        </Field>
        <Field label="ID Karyawan" optional>
          <Input value={e.employeeId} onChange={(ev) => set({ employeeId: ev.target.value })} placeholder="cth: EMP-2026-001" />
        </Field>
        <Field label="Nama Organisasi" optional>
          <Input value={e.organizationName} onChange={(ev) => set({ organizationName: ev.target.value })} placeholder="cth: Divisi Operasional" />
        </Field>
        <Field label="Posisi Pekerjaan" optional>
          <Input value={e.position} onChange={(ev) => set({ position: ev.target.value })} placeholder="cth: Staff Administrasi" />
        </Field>
        <SelectField label="Tingkat Jabatan" value={e.jobLevel} onChange={(v) => set({ jobLevel: v })} options={JOB_LEVELS} />
        <SelectField label="Status Kepegawaian" value={e.employmentStatus} onChange={(v) => set({ employmentStatus: v })} options={EMPLOYMENT_STATUSES} />
        <Field label="Cabang" optional>
          <Input value={e.branch} onChange={(ev) => set({ branch: ev.target.value })} placeholder="cth: Cirebon" />
        </Field>
        <Field label="Tanggal Bergabung" optional>
          <Input type="date" value={e.joinDate} onChange={(ev) => set({ joinDate: ev.target.value })} />
        </Field>
        <Field label="Tanggal Berakhirnya Status Kepegawaian" optional>
          <Input type="date" value={e.endDate} onChange={(ev) => set({ endDate: ev.target.value })} />
        </Field>
        <Field label="Golongan" optional>
          <Input value={e.grade} onChange={(ev) => set({ grade: ev.target.value })} placeholder="cth: III/a" />
        </Field>
        <Field label="Kelas" optional>
          <Input value={e.classLevel} onChange={(ev) => set({ classLevel: ev.target.value })} placeholder="cth: A" />
        </Field>
        <SelectField
          label="Manajer / Atasan Langsung"
          value={e.managerId}
          onChange={(v) => set({ managerId: v })}
          options={memberOptions}
          placeholder="— Pilih atasan —"
        />
        <SelectField
          label="Alur Persetujuan (Jika Berbeda dengan Manajer)"
          value={e.approvalApproverId}
          onChange={(v) => set({ approvalApproverId: v })}
          options={memberOptions}
          placeholder="— Sama dengan atasan —"
        />
        <div className="sm:col-span-2">
          <Field label="Catatan Alur Persetujuan" optional>
            <Input value={e.approvalNote} onChange={(ev) => set({ approvalNote: ev.target.value })} placeholder="cth: Persetujuan akhir oleh HRD" />
          </Field>
        </div>
      </div>
    </Accordion>
  );
}

export function EducationSection({
  s,
  update,
  scope,
  onUpload,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  scope: string;
  onUpload: (file: File, scope: string) => Promise<{ path: string; name: string } | null>;
  open: boolean;
  onToggle: () => void;
}) {
  const setEdu = (key: string, patch: Partial<EducationRow>) =>
    update({ educations: s.educations.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  const setExp = (key: string, patch: Partial<ExperienceRow>) =>
    update({ experiences: s.experiences.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  const formal = s.educations.filter((x) => x.kind === 'FORMAL');
  const informal = s.educations.filter((x) => x.kind === 'INFORMAL');

  const eduCard = (x: EducationRow) => (
    <div key={x.key} className="rounded-btn border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">{x.kind === 'FORMAL' ? 'Pendidikan Formal' : 'Pendidikan Informal'}</span>
        <button
          type="button"
          onClick={() => update({ educations: s.educations.filter((y) => y.key !== x.key) })}
          className="p-1.5 text-muted hover:text-danger rounded-btn hover:bg-red-50"
          title="Hapus"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {x.kind === 'FORMAL' ? (
          <>
            <div className="sm:col-span-2">
              <SelectField label="Derajat Pendidikan Formal *" value={x.degree} onChange={(v) => setEdu(x.key, { degree: v })} options={FORMAL_DEGREES} />
            </div>
            <Field label="Institusi *">
              <Input value={x.institution} onChange={(e) => setEdu(x.key, { institution: e.target.value })} placeholder="cth: Universitas Indonesia" />
            </Field>
            <Field label="Bidang Studi" optional>
              <Input value={x.fieldOfStudy} onChange={(e) => setEdu(x.key, { fieldOfStudy: e.target.value })} placeholder="cth: Manajemen" />
            </Field>
            <Field label="Grade" optional>
              <Input value={x.grade} onChange={(e) => setEdu(x.key, { grade: e.target.value })} placeholder="cth: 3.5 / A" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Nama Pendidikan *">
              <Input value={x.name} onChange={(e) => setEdu(x.key, { name: e.target.value })} placeholder="cth: Pelatihan K3" />
            </Field>
            <Field label="Dipegang Oleh *">
              <Input value={x.institution} onChange={(e) => setEdu(x.key, { institution: e.target.value })} placeholder="cth: Lembaga Pelatihan ABC" />
            </Field>
            <Field label="Tanggal Kedaluwarsa" optional>
              <Input type="date" value={x.expiryDate} onChange={(e) => setEdu(x.key, { expiryDate: e.target.value })} />
            </Field>
            <Field label="Biaya (Rp)" optional>
              <Input type="number" min={0} value={x.cost} onChange={(e) => setEdu(x.key, { cost: e.target.value })} placeholder="cth: 1500000" />
            </Field>
          </>
        )}
        <Field label="Tahun Mulai *">
          <Input type="number" min={1900} max={2100} value={x.startYear} onChange={(e) => setEdu(x.key, { startYear: e.target.value })} placeholder="cth: 2018" />
        </Field>
        <Field label="Tahun Selesai *">
          <Input type="number" min={1900} max={2100} value={x.endYear} onChange={(e) => setEdu(x.key, { endYear: e.target.value })} placeholder="cth: 2022" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Kegiatan" optional>
            <Input value={x.activity} onChange={(e) => setEdu(x.key, { activity: e.target.value })} placeholder="cth: Ketua BEM" />
          </Field>
        </div>
        <div className="sm:col-span-2 space-y-2">
          <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
            <input type="checkbox" checked={x.hasCertificate} onChange={(e) => setEdu(x.key, { hasCertificate: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
            Memiliki Sertifikat
          </label>
          {x.hasCertificate && (
            <FileUpload
              value={x.certificatePath}
              fileName={x.certificateName}
              scope={scope}
              onUpload={async (f, sc) => {
                const r = await onUpload(f, sc);
                if (r) setEdu(x.key, { certificatePath: r.path, certificateName: r.name });
                return r;
              }}
              onClear={() => setEdu(x.key, { certificatePath: '', certificateName: '' })}
            />
          )}
        </div>
      </div>
    </div>
  );

  const addEdu = (kind: 'FORMAL' | 'INFORMAL') =>
    update({
      educations: [
        ...s.educations,
        {
          key: `edu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          degree: '',
          name: '',
          institution: '',
          fieldOfStudy: '',
          grade: '',
          startYear: '',
          endYear: '',
          expiryDate: '',
          cost: '',
          activity: '',
          hasCertificate: false,
          certificatePath: '',
          certificateName: '',
        },
      ],
    });

  return (
    <Accordion title="Pendidikan & Pengalaman" subtitle="Riwayat pendidikan formal, informal, dan pengalaman kerja." open={open} onToggle={onToggle}>
      <div className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-[13px] font-semibold text-ink">Pendidikan Formal</h4>
          {formal.length === 0 && <p className="text-[13px] text-muted">Belum ada pendidikan formal.</p>}
          {formal.map(eduCard)}
          <button type="button" onClick={() => addEdu('FORMAL')} className="inline-flex items-center gap-1.5 rounded-btn border border-dashed border-slate-300 px-3 py-2 text-[13px] text-muted hover:border-brand-400 hover:text-ink transition-colors">
            <Plus className="h-4 w-4" /> Tambah Pendidikan Formal
          </button>
        </div>

        <div className="space-y-4">
          <h4 className="text-[13px] font-semibold text-ink">Pendidikan Informal</h4>
          {informal.length === 0 && <p className="text-[13px] text-muted">Belum ada pendidikan informal.</p>}
          {informal.map(eduCard)}
          <button type="button" onClick={() => addEdu('INFORMAL')} className="inline-flex items-center gap-1.5 rounded-btn border border-dashed border-slate-300 px-3 py-2 text-[13px] text-muted hover:border-brand-400 hover:text-ink transition-colors">
            <Plus className="h-4 w-4" /> Tambah Pendidikan Informal
          </button>
        </div>

        <div className="space-y-4">
          <h4 className="text-[13px] font-semibold text-ink">Pengalaman Kerja</h4>
          {s.experiences.length === 0 && <p className="text-[13px] text-muted">Belum ada pengalaman kerja.</p>}
          {s.experiences.map((x, i) => (
            <div key={x.key} className="rounded-btn border border-slate-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">Pengalaman #{i + 1}</span>
                <button
                  type="button"
                  onClick={() => update({ experiences: s.experiences.filter((y) => y.key !== x.key) })}
                  className="p-1.5 text-muted hover:text-danger rounded-btn hover:bg-red-50"
                  title="Hapus"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nama Perusahaan *">
                  <Input value={x.companyName} onChange={(e) => setExp(x.key, { companyName: e.target.value })} placeholder="cth: PT Maju Bersama" />
                </Field>
                <Field label="Posisi Pekerjaan *">
                  <Input value={x.position} onChange={(e) => setExp(x.key, { position: e.target.value })} placeholder="cth: Staff Gudang" />
                </Field>
                <Field label="Tahun Mulai" optional>
                  <Input type="number" min={1900} max={2100} value={x.startYear} onChange={(e) => setExp(x.key, { startYear: e.target.value })} placeholder="cth: 2020" />
                </Field>
                <Field label="Tahun Selesai" optional>
                  <Input type="number" min={1900} max={2100} value={x.endYear} onChange={(e) => setExp(x.key, { endYear: e.target.value })} placeholder="cth: 2023" />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                experiences: [...s.experiences, { key: `exp-${Date.now()}`, companyName: '', position: '', startYear: '', endYear: '' }],
              })
            }
            className="inline-flex items-center gap-1.5 rounded-btn border border-dashed border-slate-300 px-3 py-2 text-[13px] text-muted hover:border-brand-400 hover:text-ink transition-colors"
          >
            <Plus className="h-4 w-4" /> Tambah Pengalaman Kerja
          </button>
        </div>
      </div>
    </Accordion>
  );
}

/* ---------------- Sidebar 3 ---------------- */

export function CustomFieldsSection({
  s,
  update,
  refs,
  scope,
  onUpload,
  onDefsChange,
  canManage,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  refs: FormRefs;
  scope: string;
  onUpload: (file: File, scope: string) => Promise<{ path: string; name: string } | null>;
  onDefsChange: () => void;
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [showManage, setShowManage] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('SHORT_TEXT');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const setVal = (id: string, v: string) => update({ customValues: { ...s.customValues, [id]: v } });

  async function addDef() {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/users/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim(),
          type: newType,
          options: newType === 'SELECT' ? newOptions.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
          required: newRequired,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setNewLabel('');
      setNewOptions('');
      setNewRequired(false);
      onDefsChange();
    } catch (e: any) {
      alert(e.message || 'Gagal menambah field.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDef(id: string, label: string) {
    if (!confirm(`Hapus field "${label}" beserta semua nilainya?`)) return;
    try {
      const r = await fetch(`/api/admin/users/custom-fields/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const cv = { ...s.customValues };
      delete cv[id];
      update({ customValues: cv });
      onDefsChange();
    } catch (e: any) {
      alert(e.message || 'Gagal menghapus field.');
    }
  }

  return (
    <Accordion title="Info Tambahan" subtitle="Field custom yang ditentukan admin kantor." open={open} onToggle={onToggle}>
      <div className="space-y-4">
        {refs.customFields.length === 0 && (
          <p className="text-[13px] text-muted">
            Belum ada field tambahan. Admin dapat menambahkan field custom (mis. golongan SIM, ukuran seragam, nomor NPWP) lewat Kelola Field di bawah.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          {refs.customFields.map((def) => {
            const val = s.customValues[def.id] ?? '';
            const label = `${def.label}${def.required ? ' *' : ''}`;
            const typeLabel = CUSTOM_FIELD_TYPES.find((t) => t.value === def.type)?.label ?? def.type;
            return (
              <div key={def.id}>
                {def.type === 'LONG_TEXT' ? (
                  <Field label={label}>
                    <textarea value={val} onChange={(e) => setVal(def.id, e.target.value)} className="input min-h-[80px] resize-y" />
                  </Field>
                ) : def.type === 'SELECT' ? (
                  <SelectField label={label} value={val} onChange={(v) => setVal(def.id, v)} options={parseFieldOptions(def.options)} />
                ) : def.type === 'BOOLEAN' ? (
                  <div>
                    <span className="label">{label}</span>
                    <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer mt-1">
                      <input type="checkbox" checked={val === 'true'} onChange={(e) => setVal(def.id, e.target.checked ? 'true' : 'false')} className="h-4 w-4 accent-emerald-600" />
                      Ya
                    </label>
                  </div>
                ) : def.type === 'FILE' ? (
                  <div>
                    <span className="label">{label}</span>
                    <div className="mt-1">
                      <FileUpload
                        value={val}
                        fileName={val.split('/').pop() ?? ''}
                        scope={scope}
                        onUpload={async (f, sc) => {
                          const r = await onUpload(f, sc);
                          if (r) setVal(def.id, r.path);
                          return r;
                        }}
                        onClear={() => setVal(def.id, '')}
                      />
                    </div>
                  </div>
                ) : (
                  <Field label={label}>
                    <Input
                      type={def.type === 'NUMBER' || def.type === 'CURRENCY' ? 'number' : def.type === 'DATE' ? 'date' : def.type === 'TIME' ? 'time' : def.type === 'EMAIL' ? 'email' : def.type === 'URL' ? 'url' : def.type === 'PHONE' ? 'tel' : 'text'}
                      value={val}
                      onChange={(e) => setVal(def.id, e.target.value)}
                      placeholder={typeLabel}
                    />
                  </Field>
                )}
              </div>
            );
          })}
        </div>

        {canManage && (
          <div className="border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowManage((v) => !v)} className="text-[13px] font-medium text-brand-600 hover:underline">
              {showManage ? 'Tutup Kelola Field' : 'Kelola Field Tambahan'}
            </button>
            {showManage && (
              <div className="mt-3 space-y-3">
                {refs.customFields.map((def) => (
                  <div key={def.id} className="flex items-center gap-2 text-[13px]">
                    <span className="font-medium text-ink">{def.label}</span>
                    <span className="text-muted">· {CUSTOM_FIELD_TYPES.find((t) => t.value === def.type)?.label ?? def.type}</span>
                    {def.required && <span className="text-danger text-[11px]">wajib</span>}
                    <button type="button" onClick={() => deleteDef(def.id, def.label)} className="ml-auto p-1 text-muted hover:text-danger rounded-btn hover:bg-red-50" title="Hapus field">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="grid sm:grid-cols-2 gap-3 rounded-btn border border-slate-200 p-3">
                  <Field label="Nama Field Baru *">
                    <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="cth: Nomor NPWP" />
                  </Field>
                  <SelectField
                    label="Jenis Informasi"
                    value={newType}
                    onChange={(v) => setNewType(v)}
                    options={CUSTOM_FIELD_TYPES.map((t) => ({ value: t.value, label: `${t.label} — ${t.hint}` }))}
                    placeholder="— Pilih jenis —"
                  />
                  {newType === 'SELECT' && (
                    <div className="sm:col-span-2">
                      <Field label="Pilihan (pisahkan dengan koma) *">
                        <Input value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder="cth: A, B, C" />
                      </Field>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                    <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                    Wajib diisi
                  </label>
                  <div className="sm:col-span-2 flex justify-end">
                    <button type="button" onClick={addDef} disabled={busy || !newLabel.trim()} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                      {busy ? 'Menyimpan…' : 'Tambah Field'}
                    </button>
                  </div>
                </div>
                <p className="text-[12px] text-muted">
                  Jenis yang tersedia: Teks Pendek, Teks Panjang, Angka, Nominal (Rp), Tanggal, Waktu, Pilihan (Dropdown), Ya/Tidak, Email, No. Telepon, Tautan/URL, File/Lampiran.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Accordion>
  );
}

/* ---------------- Sidebar 4 ---------------- */

export function ModuleAccessSection({
  s,
  update,
  refs,
  open,
  onToggle,
}: {
  s: UserFormState;
  update: (p: Partial<UserFormState>) => void;
  refs: FormRefs;
  open: boolean;
  onToggle: () => void;
}) {
  // Modul yang bisa diatur: modul baru yang dilanggan kantor (fallback ke
  // daftar lama bila refs belum membawa subscribedModules).
  const tenantModules = MODULAR_MODULES.filter((m) => m.key !== 'pusat');
  const orgActive = (key: string) => {
    // Modul non-billable selalu aktif untuk kantor (lib/subscription.ts:
    // isModuleSubscribed) — pengaturannya jangan terkunci walau daftar
    // langganan tidak menyebutkannya.
    const mod = MODULAR_MODULES.find((m) => m.key === key);
    if (mod && !mod.billable) return true;
    if (refs.subscribedModules) return refs.subscribedModules.includes(key);
    if (key === 'dashboard' || key === 'setting') return true;
    const legacy = MODULAR_TO_LEGACY[key as keyof typeof MODULAR_TO_LEGACY] ?? [];
    return refs.orgModules.length === 0 || legacy.some((l) => refs.orgModules.includes(l));
  };
  // Pilihan hak akses sebagai tombol (satu klik langsung terpilih).
  const levelOptions = [
    { value: 'WRITE' as const, short: 'Write', title: 'Write — kelola penuh', activeCls: 'bg-emerald-600 text-white' },
    { value: 'READ' as const, short: 'Read', title: 'Read — hanya melihat', activeCls: 'bg-sky-600 text-white' },
    { value: 'NONE' as const, short: 'Tidak ada', title: 'Tidak ada akses', activeCls: 'bg-slate-500 text-white' },
  ];
  return (
    <Accordion title="Hak Akses Modul" subtitle="Atur tiap modul: Read (hanya melihat) atau Write (kelola penuh). Tanpa pilihan = Write." open={open} onToggle={onToggle}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted leading-relaxed">
          Hak akses ini <b className="text-ink">benar-benar ditegakkan</b>: pengguna dengan akses Read
          tidak bisa melakukan perubahan di modul itu (API menolak, 403), dan tanpa akses
          menunya disembunyikan. Modul yang tidak dilanggan kantor tidak bisa diaktifkan per pengguna.
        </p>
        {tenantModules.map((m) => {
          const active = orgActive(m.key);
          const level = (s.moduleAccess[m.key] ?? 'WRITE') as 'READ' | 'WRITE' | 'NONE';
          return (
            <div key={m.key} className="flex flex-wrap items-center gap-3 rounded-btn border border-slate-200 px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">{m.label}</span>
                <span className="block text-[12px] text-muted">
                  {m.pages.map((p) => p.label).join(', ')}
                  {!active ? ' — tidak dilanggan kantor ini.' : level === 'WRITE' ? ' — kelola penuh.' : level === 'READ' ? ' — hanya melihat.' : ' — tidak bisa dibuka.'}
                </span>
              </div>
              <div className="flex shrink-0 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200" role="group" aria-label={`Hak akses modul ${m.label}`}>
                {levelOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!active}
                    title={opt.title}
                    aria-pressed={level === opt.value}
                    onClick={() => update({ moduleAccess: { ...s.moduleAccess, [m.key]: opt.value } })}
                    className={`px-2.5 py-2 text-[12px] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      level === opt.value ? opt.activeCls : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.short}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Accordion>
  );
}
