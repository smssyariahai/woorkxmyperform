'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Logo } from '@/components/ui/primitives';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuthConfig } from '@/components/auth/useAuthConfig';
import { apiJson } from '@/lib/calendar/client';
import { formatIDR } from '@/lib/modular';

/* ------------------------------------------------------------------ */
/* Tipe katalog (sesuai GET /api/public/pricing — getCatalogForRegistration) */
/* ------------------------------------------------------------------ */

interface UserTier {
  id: string;
  name: string;
  maxUsers: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustomPrice: boolean;
  minStorageGb: number;
  sortOrder: number;
}

interface StorageTier {
  id: string;
  name: string;
  capacityGb: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustomPrice: boolean;
  sortOrder: number;
}

interface ModulePriceRow {
  id: string;
  moduleKey: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

interface Catalog {
  userTiers: UserTier[];
  storageTiers: StorageTier[];
  modules: ModulePriceRow[];
  settings: { ppnRateBps: number; invoiceValidityHours: number; trialEnabled: boolean };
}

/* ------------------------------------------------------------------ */
/* Props — dipakai /register (mode create) dan /register/resubmit      */
/* ------------------------------------------------------------------ */

export interface RegistrationSelfAssessment {
  employeeCount3mo?: number;
  neededModules?: string[];
  dataDigitized?: string;
  adminName?: string;
  adminEmail?: string;
  adminPhone?: string;
  wantsBranding?: boolean;
  docVolume?: string;
  heardFrom?: string;
  heardFromDetail?: string;
}

export interface RegistrationExistingDocument {
  id: string;
  docType: string;
  docSubtype: string | null;
  fileName: string;
  fileSize: number;
}

export interface RegistrationInitialData {
  companyName?: string;
  legalEntityType?: string;
  businessField?: string;
  companyAddress?: string;
  city?: string;
  companyPhone?: string;
  picName?: string;
  picPosition?: string;
  picEmail?: string;
  picPhone?: string;
  nib?: string;
  userTierId?: string;
  storageTierId?: string;
  moduleKeys?: string[];
  billingCycle?: 'MONTHLY' | 'YEARLY';
  startChoice?: 'TRIAL' | 'PAID';
  selfAssessment?: RegistrationSelfAssessment;
  npwpStatus?: 'HAS_NPWP' | 'NO_NPWP';
  npwpStatement?: string;
  identityDocType?: string;
  cooperativeDocType?: string;
  documents?: RegistrationExistingDocument[];
}

export interface RegistrationFormSuccess {
  registrationId: string;
  statusToken: string;
  status: string;
}

export interface RegistrationFormProps {
  mode: 'create' | 'resubmit';
  initialData?: RegistrationInitialData;
  /** Diperlukan untuk mode resubmit: id + token pendaftaran yang diperbaiki. */
  registrationId?: string;
  statusToken?: string;
  onSuccess?: (data: RegistrationFormSuccess) => void;
}

const LEGAL_ENTITY_TYPES = ['PT', 'CV', 'Koperasi', 'Yayasan', 'Firma', 'Perseorangan', 'Lainnya'];
const IDENTITY_DOC_TYPES = [
  { value: 'NIB', label: 'NIB (Nomor Induk Berusaha)' },
  { value: 'AKTA', label: 'Akta Pendirian' },
  { value: 'SK_KEMENKUMHAM', label: 'SK Kemenkumham' },
];
const COOPERATIVE_DOC_TYPES = [
  { value: 'SK_KOPERASI', label: 'SK Pengesahan Koperasi' },
  { value: 'AKTA_KOPERASI', label: 'Akta Koperasi' },
];
const HEARD_FROM_OPTIONS = ['Pencarian Google', 'Media sosial', 'Rekomendasi teman / rekan', 'Iklan', 'Acara / pameran', 'Lainnya'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];

const DOC_TYPE_LABELS: Record<string, string> = {
  COMPANY_IDENTITY: 'Identitas perusahaan',
  PIC_KTP: 'KTP penanggung jawab',
  NPWP: 'NPWP',
  COOPERATIVE: 'Dokumen koperasi',
  SUPPORTING: 'Dokumen pendukung',
};

const DIGITIZED_LABELS: Record<string, string> = {
  ALL: 'Sudah semua',
  PARTIAL: 'Sebagian',
  NONE: 'Belum sama sekali',
};

const VOLUME_LABELS: Record<string, string> = {
  LOW: 'Sedikit',
  MEDIUM: 'Sedang',
  HIGH: 'Banyak',
};

function fileLabel(f: File | null): string {
  if (!f) return 'Belum diunggah';
  return `${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
}

function identityDocTypeLabel(v: string): string {
  return IDENTITY_DOC_TYPES.find((o) => o.value === v)?.label ?? v;
}

function cooperativeDocTypeLabel(v: string): string {
  return COOPERATIVE_DOC_TYPES.find((o) => o.value === v)?.label ?? v;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3 text-[13px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium text-ink break-words">{value}</span>
    </p>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-input border border-line p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        <button type="button" onClick={onEdit} className="text-[13px] font-semibold text-brand hover:underline">
          Ubah
        </button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function validFile(f: File): string | null {
  if (f.size > MAX_FILE_BYTES) return `Ukuran file ${f.name} melebihi 10 MB.`;
  if (!ALLOWED_EXTS.includes(fileExt(f.name))) return `File ${f.name} harus berformat PDF, JPG, atau PNG.`;
  return null;
}

const STEPS = ['Perusahaan & Paket', 'Self Assessment', 'Dokumen', 'Review'];

export function RegistrationForm({ mode, initialData, registrationId, statusToken, onSuccess }: RegistrationFormProps) {
  const authCfg = useAuthConfig();
  const turnstileSiteKey = authCfg?.turnstileSiteKey ?? null;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [step, setStep] = useState(1);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const sa = initialData?.selfAssessment;

  /* ---- Langkah 1 ---- */
  const [companyName, setCompanyName] = useState(initialData?.companyName ?? '');
  const [legalEntityType, setLegalEntityType] = useState(initialData?.legalEntityType ?? 'PT');
  const [businessField, setBusinessField] = useState(initialData?.businessField ?? '');
  const [companyAddress, setCompanyAddress] = useState(initialData?.companyAddress ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [companyPhone, setCompanyPhone] = useState((initialData?.companyPhone ?? '').replace(/\D/g, ''));
  const [picName, setPicName] = useState(initialData?.picName ?? '');
  const [picPosition, setPicPosition] = useState(initialData?.picPosition ?? '');
  const [picEmail, setPicEmail] = useState(initialData?.picEmail ?? '');
  const [picPhone, setPicPhone] = useState((initialData?.picPhone ?? '').replace(/\D/g, ''));
  const [nib, setNib] = useState(initialData?.nib ?? '');
  const [userTierId, setUserTierId] = useState(initialData?.userTierId ?? '');
  const [storageTierId, setStorageTierId] = useState(initialData?.storageTierId ?? '');
  const [moduleKeys, setModuleKeys] = useState<string[]>(initialData?.moduleKeys ?? []);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>(initialData?.billingCycle ?? 'MONTHLY');
  const [startChoice, setStartChoice] = useState<'TRIAL' | 'PAID'>(initialData?.startChoice ?? 'TRIAL');

  /* ---- Langkah 2 ---- */
  const [employeeCount3mo, setEmployeeCount3mo] = useState(
    sa?.employeeCount3mo !== undefined && sa?.employeeCount3mo !== null ? String(sa.employeeCount3mo) : '',
  );
  const [neededModules, setNeededModules] = useState<string[]>(sa?.neededModules ?? []);
  const [dataDigitized, setDataDigitized] = useState(sa?.dataDigitized ?? '');
  const [adminName, setAdminName] = useState(sa?.adminName ?? '');
  const [adminEmail, setAdminEmail] = useState(sa?.adminEmail ?? '');
  const [adminPhone, setAdminPhone] = useState(sa?.adminPhone ?? '');
  const [wantsBranding, setWantsBranding] = useState<'YA' | 'TIDAK' | ''>(
    sa?.wantsBranding === true ? 'YA' : sa?.wantsBranding === false ? 'TIDAK' : '',
  );
  const [docVolume, setDocVolume] = useState(sa?.docVolume ?? '');
  const [heardFrom, setHeardFrom] = useState(sa?.heardFrom ?? '');
  const [heardFromDetail, setHeardFromDetail] = useState(sa?.heardFromDetail ?? '');

  /* ---- Langkah 3 ---- */
  const [identityDocType, setIdentityDocType] = useState(initialData?.identityDocType ?? 'NIB');
  const [identityDoc, setIdentityDoc] = useState<File | null>(null);
  const [ktpDoc, setKtpDoc] = useState<File | null>(null);
  const [npwpStatus, setNpwpStatus] = useState<'HAS_NPWP' | 'NO_NPWP'>(initialData?.npwpStatus ?? 'HAS_NPWP');
  const [npwpDoc, setNpwpDoc] = useState<File | null>(null);
  const [npwpStatement, setNpwpStatement] = useState(initialData?.npwpStatement ?? '');
  const [cooperativeDocType, setCooperativeDocType] = useState(initialData?.cooperativeDocType ?? 'SK_KOPERASI');
  const [cooperativeDoc, setCooperativeDoc] = useState<File | null>(null);
  const [supportingDocs, setSupportingDocs] = useState<File[]>([]);

  useEffect(() => {
    apiJson<Catalog>('/api/public/pricing')
      .then(setCatalog)
      .catch((e: any) => setCatalogError(e?.message || 'Gagal memuat katalog paket.'));
  }, []);

  /* Trial dimatikan Master (Pengaturan Sistem) → pendaftaran langsung
     berlangganan; pilihan trial tidak ditawarkan. */
  const trialEnabled = catalog?.settings.trialEnabled ?? true;
  useEffect(() => {
    if (catalog && catalog.settings.trialEnabled === false) setStartChoice('PAID');
  }, [catalog]);

  const selectedUserTier = useMemo(
    () => catalog?.userTiers.find((t) => t.id === userTierId) ?? null,
    [catalog, userTierId],
  );
  const selectedStorageTier = useMemo(
    () => catalog?.storageTiers.find((t) => t.id === storageTierId) ?? null,
    [catalog, storageTierId],
  );

  /* Storage yang tersedia: hanya opsi capacityGb >= minimum tier pengguna.
     Tier kapasitas null (di atas 2 TB) selalu memenuhi minimum. */
  const storageOptions = useMemo(() => {
    if (!catalog) return [];
    const min = selectedUserTier?.minStorageGb ?? 0;
    return catalog.storageTiers.map((t) => ({
      tier: t,
      disabled: t.capacityGb !== null && t.capacityGb < min,
    }));
  }, [catalog, selectedUserTier]);

  /* Ringkasan harga live (dasar + PPN + total) per siklus yang dipilih. */
  const priceSummary = useMemo(() => {
    if (!catalog) return null;
    const priceOf = (row: { monthlyPrice: number | null; yearlyPrice: number | null }) =>
      billingCycle === 'YEARLY' ? row.yearlyPrice : row.monthlyPrice;
    const items: { label: string; amount: number | null }[] = [];
    let base = 0;
    let custom = false;
    if (selectedUserTier) {
      const a = priceOf(selectedUserTier);
      items.push({ label: selectedUserTier.name, amount: a });
      if (a === null) custom = true; else base += a;
    }
    if (selectedStorageTier) {
      const a = priceOf(selectedStorageTier);
      items.push({ label: selectedStorageTier.name, amount: a });
      if (a === null) custom = true; else base += a;
    }
    for (const key of moduleKeys) {
      const m = catalog.modules.find((x) => x.moduleKey === key);
      if (m) {
        const a = priceOf(m);
        items.push({ label: m.name, amount: a });
        if (a !== null) base += a;
      }
    }
    const ppn = Math.round((base * (catalog.settings.ppnRateBps ?? 1100)) / 10000);
    return { items, base, ppn, total: base + ppn, custom };
  }, [catalog, selectedUserTier, selectedStorageTier, moduleKeys, billingCycle]);

  function toggle(list: string[], key: string, set: (v: string[]) => void) {
    set(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);
  }

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!companyName.trim()) e.companyName = 'Nama perusahaan wajib diisi.';
    if (!businessField.trim()) e.businessField = 'Bidang usaha wajib diisi.';
    if (!companyAddress.trim()) e.companyAddress = 'Alamat perusahaan wajib diisi.';
    if (!city.trim()) e.city = 'Kota wajib diisi.';
    if (!companyPhone.trim()) e.companyPhone = 'Telepon perusahaan wajib diisi.';
    else if (!/^\d{8,15}$/.test(companyPhone.trim())) e.companyPhone = 'Telepon perusahaan hanya boleh berisi angka (8–15 digit).';
    if (!picName.trim()) e.picName = 'Nama penanggung jawab wajib diisi.';
    if (!picPosition.trim()) e.picPosition = 'Jabatan penanggung jawab wajib diisi.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(picEmail.trim())) e.picEmail = 'Email penanggung jawab tidak valid.';
    if (!picPhone.trim()) e.picPhone = 'Telepon penanggung jawab wajib diisi.';
    else if (!/^\d{8,15}$/.test(picPhone.trim())) e.picPhone = 'Telepon penanggung jawab hanya boleh berisi angka (8–15 digit).';
    if (!userTierId) e.userTierId = 'Pilih batas jumlah pengguna.';
    if (!storageTierId) e.storageTierId = 'Pilih batas storage.';
    if (selectedUserTier && selectedStorageTier && selectedStorageTier.capacityGb !== null && selectedStorageTier.capacityGb < selectedUserTier.minStorageGb) {
      e.storageTierId = `Storage minimum untuk tier ini adalah ${selectedUserTier.minStorageGb} GB.`;
    }
    if (startChoice === 'PAID' && moduleKeys.length === 0) e.moduleKeys = 'Berlangganan berbayar wajib memilih minimal 1 modul berbayar.';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Record<string, string> = {};
    const n = Number(employeeCount3mo);
    if (!employeeCount3mo || !Number.isFinite(n) || n < 1) e.employeeCount3mo = 'Isi perkiraan jumlah pengguna (minimal 1).';
    if (!dataDigitized) e.dataDigitized = 'Pilih status digitalisasi data.';
    if (!adminName.trim()) e.adminName = 'Nama calon Administrator wajib diisi.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) e.adminEmail = 'Email calon Administrator tidak valid.';
    if (!adminPhone.trim()) e.adminPhone = 'Telepon calon Administrator wajib diisi.';
    if (!wantsBranding) e.wantsBranding = 'Pilih Ya atau Tidak.';
    if (!docVolume) e.docVolume = 'Pilih perkiraan volume dokumen.';
    if (!heardFrom) e.heardFrom = 'Pilih dari mana Anda mengenal WOORK.';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep3(): boolean {
    const e: Record<string, string> = {};
    if (!identityDoc) e.identityDoc = 'Dokumen identitas perusahaan wajib diunggah.';
    else { const m = validFile(identityDoc); if (m) e.identityDoc = m; }
    if (!ktpDoc) e.ktpDoc = 'KTP penanggung jawab wajib diunggah.';
    else { const m = validFile(ktpDoc); if (m) e.ktpDoc = m; }
    if (npwpStatus === 'HAS_NPWP') {
      if (!npwpDoc) e.npwpDoc = 'NPWP perusahaan wajib diunggah.';
      else { const m = validFile(npwpDoc); if (m) e.npwpDoc = m; }
    } else if (npwpStatement.trim().length < 10) {
      e.npwpStatement = 'Pernyataan tidak memiliki NPWP minimal 10 karakter.';
    }
    if (legalEntityType === 'Koperasi') {
      if (!cooperativeDoc) e.cooperativeDoc = 'Dokumen koperasi wajib diunggah.';
      else { const m = validFile(cooperativeDoc); if (m) e.cooperativeDoc = m; }
    }
    if (supportingDocs.length > 3) e.supportingDocs = 'Dokumen pendukung maksimal 3 file.';
    else {
      for (const f of supportingDocs) {
        const m = validFile(f);
        if (m) { e.supportingDocs = m; break; }
      }
    }
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  function goToStep(n: 1 | 2 | 3 | 4) {
    setStep(n);
    // Isian berubah setelah review → persetujuan harus dicentang ulang.
    setAgreed(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextStep() {
    setServerError('');
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit() {
    setServerError('');
    if (!validateStep3()) return;
    if (!agreed) {
      setServerError('Mohon centang persetujuan sebelum mengirim pendaftaran.');
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setServerError('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      const selfAssessment = {
        employeeCount3mo: Number(employeeCount3mo),
        neededModules,
        dataDigitized,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPhone: adminPhone.trim(),
        wantsBranding: wantsBranding === 'YA',
        docVolume,
        heardFrom,
        heardFromDetail: heardFromDetail.trim(),
      };
      const fd = new FormData();
      fd.append('companyName', companyName.trim());
      fd.append('legalEntityType', legalEntityType);
      fd.append('businessField', businessField.trim());
      fd.append('companyAddress', companyAddress.trim());
      fd.append('city', city.trim());
      fd.append('companyPhone', companyPhone.trim());
      fd.append('picName', picName.trim());
      fd.append('picPosition', picPosition.trim());
      fd.append('picEmail', picEmail.trim());
      fd.append('picPhone', picPhone.trim());
      if (nib.trim()) fd.append('nib', nib.trim());
      fd.append('userTierId', userTierId);
      fd.append('storageTierId', storageTierId);
      fd.append('moduleKeys', JSON.stringify(moduleKeys));
      fd.append('billingCycle', billingCycle);
      fd.append('startChoice', startChoice);
      fd.append('npwpStatus', npwpStatus);
      if (npwpStatus === 'NO_NPWP') fd.append('npwpStatement', npwpStatement.trim());
      fd.append('selfAssessment', JSON.stringify(selfAssessment));
      fd.append('identityDocType', identityDocType);
      if (legalEntityType === 'Koperasi') fd.append('cooperativeDocType', cooperativeDocType);
      if (turnstileToken) fd.append('turnstileToken', turnstileToken);
      if (identityDoc) fd.append('identityDoc', identityDoc);
      if (ktpDoc) fd.append('ktpDoc', ktpDoc);
      if (npwpDoc) fd.append('npwpDoc', npwpDoc);
      if (cooperativeDoc) fd.append('cooperativeDoc', cooperativeDoc);
      for (const f of supportingDocs) fd.append('supportingDocs', f);
      if (mode === 'create') {
        const data = await apiJson<{ registrationId: string; statusToken: string; status: string }>(
          '/api/public/registrations',
          { method: 'POST', body: fd },
        );
        onSuccess?.(data);
      } else {
        const data = await apiJson<{ id: string; status: string }>(
          `/api/public/registrations/${encodeURIComponent(registrationId ?? '')}/resubmit?token=${encodeURIComponent(statusToken ?? '')}`,
          { method: 'POST', body: fd },
        );
        onSuccess?.({ registrationId: data.id, statusToken: statusToken ?? '', status: data.status });
      }
    } catch (err: any) {
      setServerError(err?.message || 'Pendaftaran gagal dikirim. Silakan coba lagi.');
      setSubmitting(false);
    }
  }

  const cycleLabel = billingCycle === 'YEARLY' ? 'per tahun' : 'per bulan';

  return (
    <div>
      <div className="mb-5 hidden lg:block">
        <Logo />
      </div>
      {mode === 'create' ? (
        <>
          <h1 className="text-[24px] font-bold text-ink">Daftarkan Perusahaan Anda</h1>
          <p className="mt-1 text-sm text-muted">
            Isi formulir, jawab self assessment, unggah dokumen, lalu periksa kembali sebelum dikirim — Master akan memverifikasi pendaftaran Anda.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[24px] font-bold text-ink">Perbaiki Pendaftaran</h1>
          <p className="mt-1 text-sm text-muted">
            Master meminta perbaikan pada pendaftaran Anda. Perbaiki data di bawah ini, lalu kirim ulang — pendaftaran kembali menunggu verifikasi.
          </p>
        </>
      )}

      {/* Indikator langkah */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ' +
                  (done ? 'bg-brand text-white' : active ? 'bg-brand text-white' : 'bg-line text-muted')
                }
              >
                {done ? '✓' : n}
              </span>
              <span className={'hidden sm:block text-[12px] font-medium ' + (active ? 'text-ink' : 'text-muted')}>
                {label}
              </span>
              {n < 4 && <span className="h-px flex-1 bg-line" />}
            </li>
          );
        })}
      </ol>

      {catalogError && (
        <div className="mt-6 rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
          {catalogError}
        </div>
      )}
      {serverError && (
        <div className="mt-6 rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
          {serverError}
        </div>
      )}

      {/* ======================= LANGKAH 1 ======================= */}
      {step === 1 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-[16px] font-bold text-ink">Perusahaan &amp; Paket</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama perusahaan" error={fieldErrors.companyName}>
              <Input placeholder="PT Maju Bersama" autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>
            <Field label="Bentuk badan usaha" error={fieldErrors.legalEntityType}>
              <select className="input" value={legalEntityType} onChange={(e) => setLegalEntityType(e.target.value)}>
                {LEGAL_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Bidang usaha" error={fieldErrors.businessField}>
            <Input placeholder="Contoh: Perdagangan, Koperasi Simpan Pinjam, Jasa" value={businessField} onChange={(e) => setBusinessField(e.target.value)} />
          </Field>
          <Field label="Alamat perusahaan" error={fieldErrors.companyAddress}>
            <textarea className="input min-h-[56px] resize-y" placeholder="Jalan, nomor, kelurahan, kecamatan" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Kota" error={fieldErrors.city}>
              <Input placeholder="Jakarta" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="Telepon perusahaan" error={fieldErrors.companyPhone}>
              <Input placeholder="021xxxxxxx / 62812xxxxxxx" autoComplete="tel" inputMode="numeric" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama penanggung jawab (PIC)" error={fieldErrors.picName}>
              <Input placeholder="Budi Santoso" autoComplete="name" value={picName} onChange={(e) => setPicName(e.target.value)} />
            </Field>
            <Field label="Jabatan PIC" error={fieldErrors.picPosition}>
              <Input placeholder="Direktur / Manager" value={picPosition} onChange={(e) => setPicPosition(e.target.value)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email PIC" error={fieldErrors.picEmail}>
              <Input type="email" placeholder="nama@perusahaan.com" autoComplete="email" value={picEmail} onChange={(e) => setPicEmail(e.target.value)} />
            </Field>
            <Field label="Telepon PIC (WhatsApp)" error={fieldErrors.picPhone}>
              <Input placeholder="62812xxxxxxx" autoComplete="tel" inputMode="numeric" value={picPhone} onChange={(e) => setPicPhone(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <Field label="NIB / identitas badan usaha" optional error={fieldErrors.nib}>
            <Input placeholder="Nomor Induk Berusaha" value={nib} onChange={(e) => setNib(e.target.value)} />
            <p className="mt-1 text-[12px] text-muted">NIB dipakai untuk hak Trial 1x — satu perusahaan hanya berhak trial satu kali.</p>
          </Field>

          <div className="rounded-input border border-line p-4 space-y-3">
            <h3 className="text-[14px] font-bold text-ink">Pilih paket</h3>
            <Field label="Batas jumlah pengguna" error={fieldErrors.userTierId}>
              <select
                className="input"
                value={userTierId}
                onChange={(e) => { setUserTierId(e.target.value); setStorageTierId(''); }}
                disabled={!catalog}
              >
                <option value="">{catalog ? '— Pilih tier pengguna —' : 'Memuat katalog…'}</option>
                {catalog?.userTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.monthlyPrice !== null ? ` — ${formatIDR(t.monthlyPrice)}/bln` : ' — Harga khusus'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Batas storage" error={fieldErrors.storageTierId}>
              <select className="input" value={storageTierId} onChange={(e) => setStorageTierId(e.target.value)} disabled={!catalog || !userTierId}>
                <option value="">{!userTierId ? 'Pilih tier pengguna dulu' : '— Pilih tier storage —'}</option>
                {storageOptions.map(({ tier, disabled }) => (
                  <option key={tier.id} value={tier.id} disabled={disabled}>
                    {tier.name}{tier.monthlyPrice !== null ? ` — ${formatIDR(tier.monthlyPrice)}/bln` : ' — Harga khusus'}
                    {disabled ? ' (di bawah minimum tier pengguna)' : ''}
                  </option>
                ))}
              </select>
              {selectedUserTier && (
                <p className="mt-1 text-[12px] text-muted">
                  Storage minimum untuk tier {selectedUserTier.name} adalah {selectedUserTier.minStorageGb} GB.
                </p>
              )}
            </Field>
            <Field label="Modul yang ingin dipakai" error={fieldErrors.moduleKeys}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {catalog?.modules.map((m) => (
                  <label key={m.moduleKey} className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded accent-[#087BFF]"
                      checked={moduleKeys.includes(m.moduleKey)}
                      onChange={() => toggle(moduleKeys, m.moduleKey, setModuleKeys)}
                    />
                    <span>
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-muted"> — {formatIDR(m.monthlyPrice)}/bln</span>
                    </span>
                  </label>
                ))}
                {!catalog && <p className="text-[13px] text-muted">Memuat modul…</p>}
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Siklus pembayaran">
                <div className="flex gap-2">
                  {(['MONTHLY', 'YEARLY'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBillingCycle(c)}
                      className={
                        'flex-1 rounded-input border px-3 py-2.5 text-[13px] font-semibold transition-colors ' +
                        (billingCycle === c ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink')
                      }
                    >
                      {c === 'MONTHLY' ? 'Bulanan' : 'Tahunan (hemat 2 bulan)'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Mulai dengan">
                {trialEnabled ? (
                  <div className="flex gap-2">
                    {(['TRIAL', 'PAID'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setStartChoice(c)}
                        className={
                          'flex-1 rounded-input border px-3 py-2.5 text-[13px] font-semibold transition-colors ' +
                          (startChoice === c ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink')
                        }
                      >
                        {c === 'TRIAL' ? 'Trial 30 hari' : 'Langsung berlangganan'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="rounded-input border border-line bg-canvas px-3 py-2.5 text-[13px] font-semibold text-ink">
                      Langsung berlangganan
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      Trial sedang dinonaktifkan oleh Administrator Pusat.
                    </p>
                  </>
                )}
              </Field>
            </div>

            {/* Ringkasan harga live */}
            {priceSummary && (selectedUserTier || selectedStorageTier || moduleKeys.length > 0) && (
              <div className="rounded-input bg-canvas px-4 py-3 text-[13px]">
                <p className="font-bold text-ink">Ringkasan harga {cycleLabel}</p>
                {priceSummary.items.map((it) => (
                  <p key={it.label} className="mt-1 flex justify-between text-muted">
                    <span>{it.label}</span>
                    <span>{it.amount === null ? 'Harga khusus' : formatIDR(it.amount)}</span>
                  </p>
                ))}
                {priceSummary.custom ? (
                  <p className="mt-2 font-semibold text-ink">Harga khusus (hubungi Master) — total akan dinegosiasikan.</p>
                ) : (
                  <>
                    <p className="mt-1 flex justify-between text-muted">
                      <span>PPN ({catalog ? Math.round((catalog.settings.ppnRateBps ?? 1100) / 100) : 11}%)</span>
                      <span>{formatIDR(priceSummary.ppn)}</span>
                    </p>
                    <p className="mt-2 flex justify-between border-t border-line pt-2 font-bold text-ink">
                      <span>Total {cycleLabel}</span>
                      <span>{formatIDR(priceSummary.total)}</span>
                    </p>
                    {startChoice === 'TRIAL' && (
                      <p className="mt-1 text-muted">Gratis selama 30 hari trial — tagihan pertama diterbitkan saat Anda memilih berlangganan berbayar.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= LANGKAH 2 ======================= */}
      {step === 2 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-[16px] font-bold text-ink">Self Assessment</h2>
          <p className="text-[13px] text-muted">Jawaban Anda membantu Master memahami kebutuhan perusahaan dan mempercepat verifikasi.</p>
          <Field label="1. Berapa karyawan yang akan memakai WOORK dalam 3 bulan pertama?" error={fieldErrors.employeeCount3mo}>
            <Input type="number" min={1} placeholder="Contoh: 25" value={employeeCount3mo} onChange={(e) => setEmployeeCount3mo(e.target.value)} />
          </Field>
          <Field label="2. Modul apa yang paling dibutuhkan? (boleh pilih lebih dari satu)">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {catalog?.modules.map((m) => (
                <label key={m.moduleKey} className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded accent-[#087BFF]"
                    checked={neededModules.includes(m.moduleKey)}
                    onChange={() => toggle(neededModules, m.moduleKey, setNeededModules)}
                  />
                  <span className="font-semibold">{m.name}</span>
                </label>
              ))}
              {!catalog && <p className="text-[13px] text-muted">Memuat modul…</p>}
            </div>
          </Field>
          <Field label="3. Apakah data karyawan / anggota sudah terdigitalisasi?" error={fieldErrors.dataDigitized}>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { value: 'ALL', label: 'Sudah semua' },
                { value: 'PARTIAL', label: 'Sebagian' },
                { value: 'NONE', label: 'Belum sama sekali' },
              ].map((o) => (
                <label key={o.value} className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
                  <input type="radio" name="dataDigitized" className="h-4 w-4 accent-[#087BFF]" checked={dataDigitized === o.value} onChange={() => setDataDigitized(o.value)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="rounded-input border border-line p-4 space-y-3">
            <p className="text-[14px] font-bold text-ink">4. Siapa yang akan menjadi Administrator perusahaan?</p>
            <p className="text-[12px] text-muted">Orang ini menerima undangan Administrator pertama bila pendaftaran disetujui.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nama Administrator" error={fieldErrors.adminName}>
                <Input placeholder="Nama lengkap" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
              </Field>
              <Field label="Email Administrator" error={fieldErrors.adminEmail}>
                <Input type="email" placeholder="admin@perusahaan.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </Field>
            </div>
            <Field label="Telepon Administrator" error={fieldErrors.adminPhone}>
              <Input placeholder="62812xxxxxxx" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} />
            </Field>
          </div>
          <Field label="5. Apakah perusahaan ingin memakai logo dan warna sendiri sejak awal?" error={fieldErrors.wantsBranding}>
            <div className="flex gap-2">
              {(['YA', 'TIDAK'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWantsBranding(v)}
                  className={
                    'flex-1 rounded-input border px-3 py-2.5 text-[13px] font-semibold transition-colors ' +
                    (wantsBranding === v ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink')
                  }
                >
                  {v === 'YA' ? 'Ya' : 'Tidak'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="6. Perkiraan dokumen yang diunggah per bulan" error={fieldErrors.docVolume}>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { value: 'LOW', label: 'Sedikit' },
                { value: 'MEDIUM', label: 'Sedang' },
                { value: 'HIGH', label: 'Banyak' },
              ].map((o) => (
                <label key={o.value} className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
                  <input type="radio" name="docVolume" className="h-4 w-4 accent-[#087BFF]" checked={docVolume === o.value} onChange={() => setDocVolume(o.value)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="7. Dari mana Anda mengenal WOORK?" error={fieldErrors.heardFrom}>
            <select className="input" value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)}>
              <option value="">— Pilih —</option>
              {HEARD_FROM_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <Input
              className="mt-2"
              placeholder="Keterangan tambahan (opsional)"
              value={heardFromDetail}
              onChange={(e) => setHeardFromDetail(e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* ======================= LANGKAH 3 ======================= */}
      {step === 3 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-[16px] font-bold text-ink">Dokumen Verifikasi</h2>
          <p className="text-[13px] text-muted">
            Maksimal 10 MB per file, format PDF, JPG, atau PNG. KTP penanggung jawab hanya dibuka oleh Master Administrator untuk verifikasi.
          </p>
          {mode === 'resubmit' && initialData?.documents && initialData.documents.length > 0 && (
            <div className="rounded-input border border-line px-4 py-3 text-[13px]">
              <p className="font-bold text-ink">Dokumen sebelumnya (akan diganti)</p>
              <p className="mt-1 text-muted">Dokumen lama akan diganti dengan unggahan baru di bawah ini — unggah ulang semua dokumen wajib.</p>
              <ul className="mt-2 space-y-1">
                {initialData.documents.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <span className="text-ink">{DOC_TYPE_LABELS[d.docType] ?? d.docType} — {d.fileName}</span>
                    <span className="shrink-0 text-muted">{(d.fileSize / 1024).toFixed(0)} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Dokumen identitas perusahaan" error={fieldErrors.identityDoc}>
            <select className="input" value={identityDocType} onChange={(e) => setIdentityDocType(e.target.value)}>
              {IDENTITY_DOC_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="input mt-2"
              onChange={(e) => setIdentityDoc(e.target.files?.[0] ?? null)}
            />
            {identityDoc && <p className="mt-1 text-[12px] text-muted">{identityDoc.name} ({(identityDoc.size / 1024 / 1024).toFixed(2)} MB)</p>}
          </Field>
          <Field label="KTP penanggung jawab" error={fieldErrors.ktpDoc}>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="input"
              onChange={(e) => setKtpDoc(e.target.files?.[0] ?? null)}
            />
            {ktpDoc && <p className="mt-1 text-[12px] text-muted">{ktpDoc.name} ({(ktpDoc.size / 1024 / 1024).toFixed(2)} MB)</p>}
          </Field>
          <Field label="NPWP perusahaan" error={fieldErrors.npwpDoc || fieldErrors.npwpStatement}>
            <div className="space-y-2">
              {([
                { value: 'HAS_NPWP', label: 'Perusahaan memiliki NPWP — unggah file NPWP' },
                { value: 'NO_NPWP', label: 'Perusahaan belum memiliki NPWP — tulis pernyataan' },
              ] as const).map((o) => (
                <label key={o.value} className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
                  <input type="radio" name="npwpStatus" className="h-4 w-4 accent-[#087BFF]" checked={npwpStatus === o.value} onChange={() => setNpwpStatus(o.value)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            {npwpStatus === 'HAS_NPWP' ? (
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="input mt-2"
                onChange={(e) => setNpwpDoc(e.target.files?.[0] ?? null)}
              />
            ) : (
              <textarea
                className="input mt-2 min-h-[56px] resize-y"
                placeholder="Tulis pernyataan bahwa perusahaan belum memiliki NPWP (minimal 10 karakter)"
                value={npwpStatement}
                onChange={(e) => setNpwpStatement(e.target.value)}
              />
            )}
            {npwpDoc && npwpStatus === 'HAS_NPWP' && <p className="mt-1 text-[12px] text-muted">{npwpDoc.name} ({(npwpDoc.size / 1024 / 1024).toFixed(2)} MB)</p>}
          </Field>
          {legalEntityType === 'Koperasi' && (
            <Field label="Dokumen koperasi" error={fieldErrors.cooperativeDoc}>
              <select className="input" value={cooperativeDocType} onChange={(e) => setCooperativeDocType(e.target.value)}>
                {COOPERATIVE_DOC_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="input mt-2"
                onChange={(e) => setCooperativeDoc(e.target.files?.[0] ?? null)}
              />
              {cooperativeDoc && <p className="mt-1 text-[12px] text-muted">{cooperativeDoc.name} ({(cooperativeDoc.size / 1024 / 1024).toFixed(2)} MB)</p>}
            </Field>
          )}
          <Field label="Dokumen pendukung" optional error={fieldErrors.supportingDocs}>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              className="input"
              onChange={(e) => setSupportingDocs(Array.from(e.target.files ?? []).slice(0, 3))}
            />
            <p className="mt-1 text-[12px] text-muted">Opsional, maksimal 3 file — contoh: surat domisili.</p>
            {supportingDocs.map((f) => (
              <p key={f.name} className="mt-1 text-[12px] text-muted">{f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)</p>
            ))}
          </Field>
        </div>
      )}

      {/* ======================= LANGKAH 4 ======================= */}
      {step === 4 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-[16px] font-bold text-ink">Review Pendaftaran</h2>
          <p className="text-[13px] text-muted">Periksa kembali semua isian Anda sebelum dikirim. Klik Ubah untuk memperbaiki bagian terkait.</p>

          <ReviewSection title="Perusahaan & Paket" onEdit={() => goToStep(1)}>
            <ReviewRow label="Nama perusahaan" value={companyName} />
            <ReviewRow label="Bentuk badan usaha" value={legalEntityType} />
            <ReviewRow label="Bidang usaha" value={businessField} />
            <ReviewRow label="Alamat perusahaan" value={companyAddress} />
            <ReviewRow label="Kota" value={city} />
            <ReviewRow label="Telepon perusahaan" value={companyPhone} />
            <ReviewRow label="Penanggung jawab" value={`${picName} — ${picPosition}`} />
            <ReviewRow label="Email PIC" value={picEmail} />
            <ReviewRow label="Telepon PIC (WhatsApp)" value={picPhone} />
            <ReviewRow label="NIB" value={nib.trim() || '—'} />
            <ReviewRow label="Batas pengguna" value={selectedUserTier?.name ?? '—'} />
            <ReviewRow label="Batas storage" value={selectedStorageTier?.name ?? '—'} />
            <ReviewRow label="Modul" value={moduleKeys.length > 0 ? moduleKeys.map((k) => catalog?.modules.find((m) => m.moduleKey === k)?.name ?? k).join(', ') : '—'} />
            <ReviewRow label="Siklus pembayaran" value={billingCycle === 'YEARLY' ? 'Tahunan (hemat 2 bulan)' : 'Bulanan'} />
            <ReviewRow label="Mulai dengan" value={startChoice === 'TRIAL' ? 'Trial 30 hari' : 'Langsung berlangganan'} />
            {priceSummary && (selectedUserTier || selectedStorageTier || moduleKeys.length > 0) && (
              <div className="mt-2 rounded-input bg-canvas px-3 py-2 text-[13px]">
                {priceSummary.custom ? (
                  <p className="font-semibold text-ink">Harga khusus (hubungi Master) — total akan dinegosiasikan.</p>
                ) : (
                  <>
                    {priceSummary.items.map((it) => (
                      <p key={it.label} className="mt-1 flex justify-between text-muted">
                        <span>{it.label}</span>
                        <span>{it.amount === null ? 'Harga khusus' : formatIDR(it.amount)}</span>
                      </p>
                    ))}
                    <p className="mt-1 flex justify-between text-muted">
                      <span>PPN ({catalog ? Math.round((catalog.settings.ppnRateBps ?? 1100) / 100) : 11}%)</span>
                      <span>{formatIDR(priceSummary.ppn)}</span>
                    </p>
                    <p className="mt-1 flex justify-between border-t border-line pt-1 font-bold text-ink">
                      <span>Total {cycleLabel}</span>
                      <span>{formatIDR(priceSummary.total)}</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </ReviewSection>

          <ReviewSection title="Self Assessment" onEdit={() => goToStep(2)}>
            <ReviewRow label="Karyawan 3 bulan pertama" value={employeeCount3mo ? `${employeeCount3mo} orang` : '—'} />
            <ReviewRow label="Modul paling dibutuhkan" value={neededModules.length > 0 ? neededModules.map((k) => catalog?.modules.find((m) => m.moduleKey === k)?.name ?? k).join(', ') : '—'} />
            <ReviewRow label="Data sudah terdigitalisasi" value={DIGITIZED_LABELS[dataDigitized] ?? '—'} />
            <ReviewRow label="Administrator" value={`${adminName} — ${adminEmail}`} />
            <ReviewRow label="Telepon Administrator" value={adminPhone} />
            <ReviewRow label="Logo & warna sendiri" value={wantsBranding === 'YA' ? 'Ya' : wantsBranding === 'TIDAK' ? 'Tidak' : '—'} />
            <ReviewRow label="Volume dokumen / bulan" value={VOLUME_LABELS[docVolume] ?? '—'} />
            <ReviewRow label="Mengenal WOORK dari" value={heardFromDetail.trim() ? `${heardFrom} — ${heardFromDetail.trim()}` : heardFrom || '—'} />
          </ReviewSection>

          <ReviewSection title="Dokumen Verifikasi" onEdit={() => goToStep(3)}>
            {mode === 'resubmit' && (
              <p className="text-[12px] text-muted">Dokumen lama akan diganti dengan unggahan baru di bawah ini.</p>
            )}
            <ReviewRow label={identityDocTypeLabel(identityDocType)} value={fileLabel(identityDoc)} />
            <ReviewRow label="KTP penanggung jawab" value={fileLabel(ktpDoc)} />
            {npwpStatus === 'HAS_NPWP' ? (
              <ReviewRow label="NPWP perusahaan" value={fileLabel(npwpDoc)} />
            ) : (
              <ReviewRow label="NPWP perusahaan" value={`Belum memiliki NPWP — ${npwpStatement.trim()}`} />
            )}
            {legalEntityType === 'Koperasi' && (
              <ReviewRow label={cooperativeDocTypeLabel(cooperativeDocType)} value={fileLabel(cooperativeDoc)} />
            )}
            <ReviewRow label="Dokumen pendukung" value={supportingDocs.length > 0 ? supportingDocs.map((f) => f.name).join(', ') : '—'} />
          </ReviewSection>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line bg-canvas px-4 py-3 text-[13px] text-ink">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#087BFF]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Saya menyetujui pendaftaran ini. </span>
              Saya menyatakan bahwa seluruh data perusahaan, jawaban self assessment, dan dokumen yang saya isi dan unggah adalah benar dan sesuai keadaan sebenarnya, dan saya memahami pendaftaran ini akan diverifikasi oleh Master Administrator WOORK.
            </span>
          </label>

          {turnstileSiteKey && (
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />
          )}
        </div>
      )}

      {/* Navigasi langkah */}
      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <Button type="button" variant="secondary" className="flex-1 !py-3" onClick={() => { setServerError(''); setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4); }}>
            Kembali
          </Button>
        )}
        {step < 4 ? (
          <Button type="button" className="flex-1 !py-3" onClick={nextStep}>
            {step === 3 ? 'Lihat Review' : 'Lanjut'}
          </Button>
        ) : (
          <Button type="button" loading={submitting} disabled={!agreed} className="flex-1 !py-3" onClick={onSubmit}>
            {mode === 'resubmit' ? 'Kirim Ulang Pendaftaran' : 'Kirim Pendaftaran'}
          </Button>
        )}
      </div>

      {mode === 'create' && (
        <p className="mt-6 text-center text-[13px] text-muted">
          Sudah memiliki akun?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Masuk
          </Link>
        </p>
      )}
    </div>
  );
}
