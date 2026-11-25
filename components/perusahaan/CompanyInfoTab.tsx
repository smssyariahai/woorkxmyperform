'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Field, Input } from '@/components/ui/input';
import {
  BUSINESS_TYPE_LABEL,
  ENTITY_FORMS,
  ENTITY_FORM_LABEL,
  INDUSTRIES,
  INDUSTRY_LABEL,
  isValidPhone,
} from '@/lib/perusahaan/constants';
import { compressImage } from '@/lib/perusahaan/compress';
import { apiJson, type OrganizationProfile, type TaxData } from './PerusahaanClient';
import { RegionPicker } from './RegionPicker';
import { MapPicker } from './MapPicker';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function CompanyInfoTab({
  organization,
  tax,
  canManage,
  onSaved,
}: {
  organization: OrganizationProfile;
  tax: TaxData | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  // ---- Informasi Umum ----
  const [name, setName] = useState(organization.name ?? '');
  const [phone, setPhone] = useState(organization.phone ?? '');
  const [businessType, setBusinessType] = useState(organization.businessType ?? '');
  const [entityForm, setEntityForm] = useState(organization.entityForm ?? '');
  const [industry, setIndustry] = useState(organization.industry ?? '');
  const [industryQuery, setIndustryQuery] = useState(
    organization.industry ? INDUSTRY_LABEL[organization.industry] ?? '' : ''
  );
  const [industryOpen, setIndustryOpen] = useState(false);
  const [email, setEmail] = useState(organization.email ?? '');
  const [address, setAddress] = useState(organization.address ?? '');
  const [region, setRegion] = useState({
    country: organization.country || 'Indonesia',
    province: organization.province ?? '',
    city: organization.city ?? '',
    district: organization.district ?? '',
    village: organization.village ?? '',
    postalCode: organization.postalCode ?? '',
  });
  const [latitude, setLatitude] = useState<number | null>(organization.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(organization.longitude ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ---- Informasi Pajak ----
  const [npwp15, setNpwp15] = useState(tax?.npwp15 ?? '');
  const [npwp16, setNpwp16] = useState(tax?.npwp16 ?? '');
  const [taxDate, setTaxDate] = useState(tax?.taxDate ?? '');
  const [taxpayerName, setTaxpayerName] = useState(tax?.taxpayerName ?? '');
  const [isTaxpayer, setIsTaxpayer] = useState(tax?.isTaxpayer ?? false);
  const [taxIdNumber, setTaxIdNumber] = useState(tax?.taxIdNumber ?? '');
  const [savingTax, setSavingTax] = useState(false);

  const filteredIndustries = INDUSTRIES.filter((i) =>
    i.label.toLowerCase().includes(industryQuery.trim().toLowerCase())
  ).slice(0, 10);

  function resetCompany() {
    setName(organization.name ?? '');
    setPhone(organization.phone ?? '');
    setBusinessType(organization.businessType ?? '');
    setEntityForm(organization.entityForm ?? '');
    setIndustry(organization.industry ?? '');
    setIndustryQuery(
      organization.industry ? INDUSTRY_LABEL[organization.industry] ?? '' : ''
    );
    setEmail(organization.email ?? '');
    setAddress(organization.address ?? '');
    setRegion({
      country: organization.country || 'Indonesia',
      province: organization.province ?? '',
      city: organization.city ?? '',
      district: organization.district ?? '',
      village: organization.village ?? '',
      postalCode: organization.postalCode ?? '',
    });
    setLatitude(organization.latitude ?? null);
    setLongitude(organization.longitude ?? null);
  }

  function resetTax() {
    setNpwp15(tax?.npwp15 ?? '');
    setNpwp16(tax?.npwp16 ?? '');
    setTaxDate(tax?.taxDate ?? '');
    setTaxpayerName(tax?.taxpayerName ?? '');
    setIsTaxpayer(tax?.isTaxpayer ?? false);
    setTaxIdNumber(tax?.taxIdNumber ?? '');
  }

  function validateCompany(): string | null {
    if (!name.trim() || name.trim().length < 2) return 'Nama perusahaan minimal 2 karakter.';
    if (!isValidPhone(phone)) return 'Nomor telepon perusahaan tidak valid.';
    if (businessType !== 'UMKM' && businessType !== 'BADAN_USAHA')
      return 'Jenis usaha wajib dipilih.';
    if (businessType === 'BADAN_USAHA' && !entityForm)
      return 'Bentuk badan usaha wajib dipilih untuk jenis usaha Badan Usaha.';
    if (!industry) return 'Industri wajib dipilih.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'Format email perusahaan tidak valid.';
    if (region.postalCode && !/^[0-9]{3,10}$/.test(region.postalCode))
      return 'Kode pos hanya boleh berisi angka.';
    return null;
  }

  function companyPayload() {
    return {
      name: name.trim(),
      phone: phone.trim(),
      businessType,
      entityForm: businessType === 'BADAN_USAHA' ? entityForm || null : null,
      industry,
      email: email.trim() || null,
      address: address.trim() || null,
      country: region.country || 'Indonesia',
      province: region.province.trim() || null,
      city: region.city.trim() || null,
      district: region.district.trim() || null,
      village: region.village.trim() || null,
      postalCode: region.postalCode.trim() || null,
      latitude,
      longitude,
    };
  }

  async function saveCompany(validate: boolean) {
    if (validate) {
      const err = validateCompany();
      if (err) {
        toast.error(err);
        return;
      }
    }
    setSaving(true);
    try {
      await apiJson('/api/perusahaan/profil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyPayload()),
      });
      toast.success(validate ? 'Informasi perusahaan berhasil disimpan.' : 'Draft berhasil disimpan.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan informasi perusahaan.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTax() {
    const digits = (v: string) => v.replace(/[^0-9]/g, '');
    const n15 = digits(npwp15);
    const n16 = digits(npwp16);
    const tid = digits(taxIdNumber);
    if (n15.length > 15) return toast.error('NPWP 15 digit maksimal 15 angka.');
    if (n16.length > 16) return toast.error('NPWP 16 digit maksimal 16 angka.');
    if (tid.length > 16) return toast.error('Nomor Identifikasi Wajib Pajak maksimal 16 angka.');
    if (taxDate && Number.isNaN(new Date(taxDate).getTime()))
      return toast.error('Tanggal kena pajak tidak valid.');
    setSavingTax(true);
    try {
      await apiJson('/api/perusahaan/pajak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npwp15: n15 || null,
          npwp16: n16 || null,
          taxDate: taxDate || null,
          taxpayerName: taxpayerName.trim() || null,
          isTaxpayer,
          taxIdNumber: tid || null,
        }),
      });
      toast.success('Informasi pajak berhasil disimpan.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan informasi pajak.');
    } finally {
      setSavingTax(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Logo hanya menerima PNG, JPG, JPEG, atau WebP.');
      return;
    }
    setUploadingLogo(true);
    try {
      let blob: Blob = file;
      if (file.size > LOGO_MAX_BYTES) {
        const res = await compressImage(file, LOGO_MAX_BYTES);
        if (res.overLimit) {
          toast.error('Logo masih melebihi 2 MB setelah kompresi. Gunakan gambar yang lebih kecil.');
          return;
        }
        blob = res.blob;
      }
      const fd = new FormData();
      fd.append('logo', blob, file.name);
      const r = await fetch('/api/admin/office/branding', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal mengunggah logo.');
      toast.success('Logo perusahaan diperbarui.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengunggah logo.');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    if (!confirm('Hapus logo perusahaan?')) return;
    try {
      const r = await fetch('/api/admin/office/branding', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'logo' }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal menghapus logo.');
      toast.success('Logo dihapus.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus logo.');
    }
  }

  const logoUrl = organization.logoPath
    ? `/api/office/logo?orgId=${organization.id}`
    : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ============ Informasi Umum ============ */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Informasi Umum Perusahaan</h2>
          <p className="mt-0.5 text-sm text-muted">
            Identitas resmi perusahaan yang ditampilkan pada profil WOORK.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Perusahaan / Usaha *">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama perusahaan"
              disabled={!canManage}
              maxLength={200}
            />
          </Field>
          <Field label="Nomor Telepon Perusahaan *">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+6221xxxxxxx"
              disabled={!canManage}
              inputMode="tel"
            />
          </Field>
        </div>

        <Field label="Jenis Usaha *">
          <div className="grid gap-3 sm:grid-cols-2">
            {(['UMKM', 'BADAN_USAHA'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setBusinessType(t)}
                disabled={!canManage}
                aria-pressed={businessType === t}
                className={`rounded-card border p-4 text-left transition-colors ${
                  businessType === t
                    ? 'border-brand bg-brand-50 dark:bg-brand-900/20'
                    : 'border-line bg-white dark:bg-slate-900 hover:border-brand/50'
                }`}
              >
                <span className="block text-sm font-semibold text-ink">
                  {BUSINESS_TYPE_LABEL[t]}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  {t === 'UMKM'
                    ? 'Usaha perorangan, UMKM, dan usaha kecil.'
                    : 'PT, PT Perorangan, CV, Yayasan, Koperasi, dan sejenisnya.'}
                </span>
              </button>
            ))}
          </div>
          {organization.businessType && businessType !== organization.businessType && (
            <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">
              Jenis usaha berubah — dokumen yang sudah diunggah tidak dihapus, hanya disesuaikan
              daftar wajibnya.
            </p>
          )}
        </Field>

        {businessType === 'BADAN_USAHA' && (
          <Field label="Bentuk Badan Usaha *">
            <select
              className="input"
              value={entityForm}
              onChange={(e) => setEntityForm(e.target.value)}
              disabled={!canManage}
            >
              <option value="">— Pilih bentuk badan usaha —</option>
              {ENTITY_FORMS.map((f) => (
                <option key={f} value={f}>
                  {ENTITY_FORM_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Industri *">
          <div className="relative">
            <Input
              value={industryQuery}
              onChange={(e) => {
                setIndustryQuery(e.target.value);
                setIndustryOpen(true);
                if (!e.target.value) setIndustry('');
              }}
              onFocus={() => setIndustryOpen(true)}
              onBlur={() => {
                setTimeout(() => {
                  setIndustryOpen(false);
                  setIndustryQuery(industry ? INDUSTRY_LABEL[industry] ?? '' : '');
                }, 150);
              }}
              placeholder="Ketik untuk mencari industri…"
              disabled={!canManage}
            />
            {industryOpen && industryQuery.trim() && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-card border border-line bg-white dark:bg-slate-900 shadow-soft">
                {filteredIndustries.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted">Tidak ada industri yang cocok.</p>
                )}
                {filteredIndustries.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    onMouseDown={() => {
                      setIndustry(i.key);
                      setIndustryQuery(i.label);
                      setIndustryOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Email Perusahaan" optional>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="info@perusahaan.com"
            disabled={!canManage}
            inputMode="email"
          />
          <p className="mt-1 text-[12px] text-muted">
            Kontak resmi perusahaan. Tidak harus sama dengan email Akun Master.
          </p>
        </Field>

        <Field label="Alamat Lengkap" optional>
          <textarea
            className="input min-h-[72px] resize-y"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Nama jalan, nomor gedung/bangunan, blok/nomor unit, RT/RW"
            disabled={!canManage}
            maxLength={500}
          />
        </Field>

        <RegionPicker
          value={region}
          onChange={(patch) => setRegion((v) => ({ ...v, ...patch }))}
          disabled={!canManage}
        />

        <Field label="Lokasi Kantor Pusat" optional>
          <MapPicker
            latitude={latitude}
            longitude={longitude}
            onChange={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
            disabled={!canManage}
          />
          <p className="mt-1 text-[12px] text-muted">
            Lokasi tidak diambil otomatis — pilih sendiri titik kantor pusat di peta.
          </p>
        </Field>

        <Field label="Logo Perusahaan" optional>
          <div className="flex flex-wrap items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo perusahaan"
                className="h-16 w-16 rounded-card border border-line bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-card border border-dashed border-line text-[11px] text-muted">
                Belum ada logo
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLogo(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn-secondary !py-2 !px-3 text-[13px]"
                onClick={() => logoInputRef.current?.click()}
                disabled={!canManage || uploadingLogo}
              >
                {uploadingLogo ? 'Mengunggah…' : logoUrl ? 'Ganti Logo' : 'Upload Logo'}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  className="btn-ghost !py-2 !px-3 text-[13px] text-danger"
                  onClick={() => void removeLogo()}
                  disabled={!canManage}
                >
                  Hapus
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            PNG, JPG, JPEG, atau WebP. Maksimal 2 MB — gambar besar dikompres otomatis.
          </p>
        </Field>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void saveCompany(true)}
            disabled={!canManage || saving}
          >
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void saveCompany(false)}
            disabled={!canManage || saving}
          >
            Simpan Draft
          </button>
          <button type="button" className="btn-ghost" onClick={resetCompany} disabled={!canManage}>
            Batal
          </button>
        </div>
      </div>

      {/* ============ Informasi Pajak ============ */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Informasi Pajak</h2>
          <p className="mt-0.5 text-sm text-muted">
            Semua field opsional — dapat diisi bertahap tanpa menghambat penyimpanan.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NPWP 15 Digit (Format Lama)" optional>
            <Input
              value={npwp15}
              onChange={(e) => setNpwp15(e.target.value.replace(/[^0-9]/g, '').slice(0, 15))}
              placeholder="15 digit angka"
              disabled={!canManage}
              inputMode="numeric"
              maxLength={15}
            />
          </Field>
          <Field label="NPWP 16 Digit (Format Baru)" optional>
            <Input
              value={npwp16}
              onChange={(e) => setNpwp16(e.target.value.replace(/[^0-9]/g, '').slice(0, 16))}
              placeholder="16 digit angka"
              disabled={!canManage}
              inputMode="numeric"
              maxLength={16}
            />
          </Field>
          <Field label="Tanggal Kena Pajak Perusahaan" optional>
            <Input
              type="date"
              value={taxDate}
              onChange={(e) => setTaxDate(e.target.value)}
              disabled={!canManage}
            />
          </Field>
          <Field label="Nama Wajib Pajak" optional>
            <Input
              value={taxpayerName}
              onChange={(e) => setTaxpayerName(e.target.value)}
              placeholder="Nama sesuai dokumen perpajakan"
              disabled={!canManage}
              maxLength={200}
            />
          </Field>
        </div>

        <Field label="Wajib Pajak NPWP" optional>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isTaxpayer}
              onClick={() => setIsTaxpayer((v) => !v)}
              disabled={!canManage}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                isTaxpayer ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  isTaxpayer ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-ink">{isTaxpayer ? 'Ya' : 'Tidak'}</span>
          </div>
        </Field>

        <Field label="Nomor Identifikasi Wajib Pajak (NPWP) 16 Digit" optional>
          <Input
            value={taxIdNumber}
            onChange={(e) => setTaxIdNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 16))}
            placeholder="16 digit angka"
            disabled={!canManage}
            inputMode="numeric"
            maxLength={16}
          />
          <p className="mt-1 text-[12px] text-muted">
            Bila sama dengan NPWP 16 digit, cukup isi salah satunya — sistem menyinkronkannya.
          </p>
        </Field>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void saveTax()}
            disabled={!canManage || savingTax}
          >
            {savingTax ? 'Menyimpan…' : 'Simpan Pajak'}
          </button>
          <button type="button" className="btn-ghost" onClick={resetTax} disabled={!canManage}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
