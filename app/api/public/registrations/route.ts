import { apiOk, apiErr } from '@/lib/utils';
import {
  createTenantRegistration,
  RegistrationError,
  type CreateRegistrationInput,
  type RegistrationFiles,
} from '@/lib/tenant/tenant-registration';

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
 * POST /api/public/registrations — pendaftaran tenant baru (Jalur B).
 * multipart/form-data. 201 { registrationId, statusToken, status };
 * 400 pesan Indonesia yang jelas; 409 bila trial NIB sudah dipakai.
 * TIDAK membuat tenant/akun — hanya catatan di master DB (Fase 3 yang
 * memproses verifikasi + provisioning).
 */
export async function POST(req: Request) {
  try {
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
      turnstileToken: str(fd, 'turnstileToken'),
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
    const { id, statusToken } = await createTenantRegistration(input, files);
    return apiOk(
      { registrationId: id, statusToken, status: 'PENDING_VERIFICATION' },
      201,
    );
  } catch (e) {
    if (e instanceof RegistrationError) {
      return apiErr(e.message, e.status);
    }
    console.error('[public/registrations] POST gagal:', e);
    return apiErr('Pendaftaran gagal diproses. Silakan coba lagi.', 500);
  }
}
