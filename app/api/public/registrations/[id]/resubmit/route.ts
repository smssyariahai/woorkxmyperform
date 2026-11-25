import { apiOk, apiErr } from '@/lib/utils';
import {
  RegistrationError,
  type CreateRegistrationInput,
  type RegistrationFiles,
} from '@/lib/tenant/tenant-registration';
import { resubmitRegistration } from '@/lib/tenant/registration-review';

export const dynamic = 'force-dynamic';

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === 'string' ? v : null;
}

function parseJsonField<T>(raw: string | null, label: string): T {
  if (!raw) throw new RegistrationError(`${label} wajib diisi.`);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new RegistrationError(`${label} tidak valid.`);
  }
}

/**
 * POST /api/public/registrations/[id]/resubmit?token=... — kirim ulang
 * pendaftaran yang diminta perbaikan (tanpa login, pakai statusToken yang
 * sama). Field + file sama seperti create Fase 2. 200 { id, status };
 * 400 pesan Indonesia; 404 bila token salah; 409 bila status bukan
 * NEEDS_REVISION.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    const fd = await req.formData();
    const input: CreateRegistrationInput = {
      companyName: str(fd, 'companyName') ?? '',
      legalEntityType: str(fd, 'legalEntityType') ?? '',
      businessField: str(fd, 'businessField') ?? '',
      companyAddress: str(fd, 'companyAddress') ?? '',
      city: str(fd, 'city') ?? '',
      companyPhone: str(fd, 'companyPhone') ?? '',
      picName: str(fd, 'picName') ?? '',
      picPosition: str(fd, 'picPosition') ?? '',
      picEmail: str(fd, 'picEmail') ?? '',
      picPhone: str(fd, 'picPhone') ?? '',
      nib: str(fd, 'nib'),
      userTierId: str(fd, 'userTierId') ?? '',
      storageTierId: str(fd, 'storageTierId') ?? '',
      moduleKeys: parseJsonField<string[]>(str(fd, 'moduleKeys'), 'Pilihan modul'),
      billingCycle: (str(fd, 'billingCycle') ?? 'MONTHLY') as 'MONTHLY' | 'YEARLY',
      startChoice: (str(fd, 'startChoice') ?? 'TRIAL') as 'TRIAL' | 'PAID',
      npwpStatus: (str(fd, 'npwpStatus') ?? 'HAS_NPWP') as 'HAS_NPWP' | 'NO_NPWP',
      npwpStatement: str(fd, 'npwpStatement'),
      selfAssessment: parseJsonField(
        str(fd, 'selfAssessment'),
        'Self assessment',
      ),
      identityDocType: (str(fd, 'identityDocType') ?? '') as
        | 'NIB'
        | 'AKTA'
        | 'SK_KEMENKUMHAM',
      cooperativeDocType: (str(fd, 'cooperativeDocType') || null) as
        | 'SK_KOPERASI'
        | 'AKTA_KOPERASI'
        | null,
    };
    const fileOf = (key: string): File | null => {
      const v = fd.get(key);
      return v instanceof File ? v : null;
    };
    const files: RegistrationFiles = {
      identityDoc: fileOf('identityDoc'),
      ktpDoc: fileOf('ktpDoc'),
      npwpDoc: fileOf('npwpDoc'),
      cooperativeDoc: fileOf('cooperativeDoc'),
      supportingDocs: fd
        .getAll('supportingDocs')
        .filter((v): v is File => v instanceof File),
    };
    const result = await resubmitRegistration(params.id, token, input, files);
    return apiOk(result);
  } catch (e) {
    if (e instanceof RegistrationError) {
      return apiErr(e.message, e.status);
    }
    console.error('[public/registrations/[id]/resubmit] POST gagal:', e);
    return apiErr('Kirim ulang gagal diproses. Silakan coba lagi.', 500);
  }
}
