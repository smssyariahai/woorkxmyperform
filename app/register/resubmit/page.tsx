'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RegistrationForm, type RegistrationInitialData } from '@/components/auth/RegistrationForm';
import { apiJson } from '@/lib/calendar/client';

function normalizeEditData(raw: any): RegistrationInitialData {
  const docs: any[] = Array.isArray(raw?.documents) ? raw.documents : [];
  const identityDoc = docs.find((d) => d.docType === 'COMPANY_IDENTITY');
  const coopDoc = docs.find((d) => d.docType === 'COOPERATIVE');
  const sa = raw?.selfAssessment ?? {};
  return {
    companyName: raw?.companyName ?? '',
    legalEntityType: raw?.legalEntityType ?? 'PT',
    businessField: raw?.businessField ?? '',
    companyAddress: raw?.companyAddress ?? '',
    city: raw?.city ?? '',
    companyPhone: raw?.companyPhone ?? '',
    picName: raw?.picName ?? '',
    picPosition: raw?.picPosition ?? '',
    picEmail: raw?.picEmail ?? '',
    picPhone: raw?.picPhone ?? '',
    nib: raw?.nib ?? '',
    userTierId: raw?.userTierId ?? '',
    storageTierId: raw?.storageTierId ?? '',
    moduleKeys: Array.isArray(raw?.moduleKeys) ? raw.moduleKeys : [],
    billingCycle: raw?.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
    startChoice: raw?.startChoice === 'PAID' ? 'PAID' : 'TRIAL',
    selfAssessment: {
      employeeCount3mo: typeof sa.employeeCount3mo === 'number' ? sa.employeeCount3mo : undefined,
      neededModules: Array.isArray(sa.neededModules) ? sa.neededModules : [],
      dataDigitized: sa.dataDigitized ?? '',
      adminName: sa.adminName ?? '',
      adminEmail: sa.adminEmail ?? '',
      adminPhone: sa.adminPhone ?? '',
      wantsBranding: typeof sa.wantsBranding === 'boolean' ? sa.wantsBranding : undefined,
      docVolume: sa.docVolume ?? '',
      heardFrom: sa.heardFrom ?? '',
      heardFromDetail: sa.heardFromDetail ?? '',
    },
    npwpStatus: raw?.npwpStatus === 'NO_NPWP' ? 'NO_NPWP' : 'HAS_NPWP',
    npwpStatement: raw?.npwpStatement ?? '',
    identityDocType: raw?.identityDocType ?? identityDoc?.docSubtype ?? 'NIB',
    cooperativeDocType: raw?.cooperativeDocType ?? coopDoc?.docSubtype ?? 'SK_KOPERASI',
    documents: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      docSubtype: d.docSubtype ?? null,
      fileName: d.fileName,
      fileSize: d.fileSize ?? 0,
    })),
  };
}

function ResubmitInner() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get('ref') ?? '';
  const token = params.get('token') ?? '';
  const [initialData, setInitialData] = useState<RegistrationInitialData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ref || !token) {
      setError('Tautan perbaikan tidak lengkap. Buka tautan kirim ulang dari halaman status pendaftaran Anda.');
      setLoading(false);
      return;
    }
    apiJson<any>(`/api/public/registrations/${encodeURIComponent(ref)}/edit?token=${encodeURIComponent(token)}`)
      .then((raw) => setInitialData(normalizeEditData(raw)))
      .catch(() => setError('Pendaftaran tidak ditemukan, tautan sudah tidak berlaku, atau pendaftaran ini sudah tidak perlu diperbaiki.'))
      .finally(() => setLoading(false));
  }, [ref, token]);

  if (loading) return <p className="mt-8 text-sm text-muted">Memuat data pendaftaran…</p>;

  if (error || !initialData) {
    return (
      <div className="mt-8 rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
        {error || 'Data pendaftaran tidak dapat dimuat.'}
      </div>
    );
  }

  return (
    <RegistrationForm
      mode="resubmit"
      initialData={initialData}
      registrationId={ref}
      statusToken={token}
      onSuccess={(data) =>
        router.push(`/register/status?ref=${encodeURIComponent(data.registrationId)}&token=${encodeURIComponent(data.statusToken)}`)
      }
    />
  );
}

export default function RegistrationResubmitPage() {
  return (
    <Suspense fallback={<p className="mt-8 text-sm text-muted">Memuat data pendaftaran…</p>}>
      <ResubmitInner />
    </Suspense>
  );
}
