'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MasterAccountTab } from './MasterAccountTab';
import { CompanyInfoTab } from './CompanyInfoTab';
import { DocumentsTab } from './DocumentsTab';

// ---------------------------------------------------------------------------
// Tipe data (sesuai respons GET /api/perusahaan/profil)
// ---------------------------------------------------------------------------

export interface MasterAccount {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  businessType: string | null;
  entityForm: string | null;
  industry: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  logoPath: string | null;
  profileStatus: string;
  profileCompletedAt: string | null;
}

export interface TaxData {
  npwp15: string | null;
  npwp16: string | null;
  taxDate: string | null;
  taxpayerName: string | null;
  isTaxpayer: boolean;
  taxIdNumber: string | null;
}

export interface CompanyDoc {
  id: string;
  docType: string;
  label: string | null;
  originalName: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  status: string;
  uploadedByName: string;
  uploadedAt: string;
}

export interface Completeness {
  percent: number;
  status: string;
  missing: string[];
  requiredFields: number;
  filledFields: number;
  requiredDocs: number;
  uploadedDocs: number;
  totalDocs: number;
}

export interface ProfileData {
  organization: OrganizationProfile;
  masterAccount: MasterAccount | null;
  tax: TaxData | null;
  documents: CompanyDoc[];
  completeness: Completeness;
}

/** Helper fetch API WOORK (respons dibungkus { success, data }). */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.success === false) {
    throw new Error(body.message || `Gagal memuat data (${r.status}).`);
  }
  return (body.data ?? body) as T;
}

const TABS = [
  { key: 'master', label: 'Akun Master' },
  { key: 'perusahaan', label: 'Informasi Perusahaan' },
  { key: 'dokumen', label: 'Dokumen Perusahaan' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function PerusahaanClient({ canManage }: { canManage: boolean }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('master');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiJson<ProfileData>('/api/perusahaan/profil');
      setProfile(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat profil perusahaan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-6 text-sm text-muted">Memuat Manajemen Perusahaan…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-6">
          <p className="text-sm text-danger">Profil perusahaan tidak dapat dimuat.</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => load()}>
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const c = profile.completeness;
  const isComplete = c.status === 'LENGKAP';

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header + kelengkapan */}
      <div className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink">Manajemen Perusahaan</h1>
            <p className="mt-1 text-sm text-muted">
              Kelola identitas akun, informasi perusahaan, perpajakan, dan dokumen legalitas
              perusahaan.
            </p>
          </div>
          <span className={isComplete ? 'badge-green' : 'badge-amber'}>
            {isComplete ? 'Lengkap' : 'Belum Lengkap'}
          </span>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>Kelengkapan profil</span>
            <span className="font-semibold text-ink">{c.percent}%</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-brand'}`}
              style={{ width: `${c.percent}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            {c.filledFields} dari {c.requiredFields} data wajib terisi
            {' · '}
            {c.uploadedDocs} dari {c.requiredDocs} dokumen wajib terunggah
            {c.totalDocs > c.requiredDocs ? ` · total ${c.totalDocs} dokumen` : ''}
          </p>
          {c.missing.length > 0 && (
            <p className="mt-1 text-[13px] text-amber-700 dark:text-amber-300">
              Masih kurang: {c.missing.join(', ')}.
            </p>
          )}
        </div>
      </div>

      {/* Tab — di HP jadi pill geser horizontal */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-line text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!canManage && (
        <p className="rounded-card border border-line bg-white dark:bg-slate-900 px-4 py-3 text-sm text-muted">
          Anda hanya dapat melihat data perusahaan. Perubahan membutuhkan hak akses
          PERUSAHAAN_MANAGE.
        </p>
      )}

      {tab === 'master' && (
        <MasterAccountTab
          masterAccount={profile.masterAccount}
          canManage={canManage}
          onSaved={() => load(true)}
        />
      )}
      {tab === 'perusahaan' && (
        <CompanyInfoTab
          organization={profile.organization}
          tax={profile.tax}
          canManage={canManage}
          onSaved={() => load(true)}
        />
      )}
      {tab === 'dokumen' && (
        <DocumentsTab
          businessType={profile.organization.businessType}
          documents={profile.documents}
          canManage={canManage}
          onChanged={() => load(true)}
        />
      )}
    </div>
  );
}
