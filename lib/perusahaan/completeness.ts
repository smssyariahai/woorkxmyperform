// Kelengkapan profil perusahaan — dihitung dari data nyata (org + pajak + dokumen).
//
// Status administratif saja: BELUM_LENGKAP / LENGKAP. Workflow verifikasi
// (MENUNGGU_VERIFIKASI / TERVERIFIKASI / PERLU_PERBAIKAN) belum ada dan
// sengaja tidak dihitung di sini; kolom Organization.profileStatus
// disediakan untuk masa depan.

import { docTypesFor } from './constants';

export type ProfileStatus = 'BELUM_LENGKAP' | 'LENGKAP';

export interface OrgProfileLike {
  name?: string | null;
  phone?: string | null;
  businessType?: string | null;
  entityForm?: string | null;
  industry?: string | null;
}

export interface DocLike {
  docType: string;
}

export interface CompletenessResult {
  percent: number;
  status: ProfileStatus;
  /** Daftar field/dokumen wajib yang masih kurang (label manusiawi). */
  missing: string[];
  requiredFields: number;
  filledFields: number;
  requiredDocs: number;
  uploadedDocs: number;
  totalDocs: number;
}

export function computeCompleteness(
  org: OrgProfileLike,
  _tax: unknown,
  docs: DocLike[]
): CompletenessResult {
  const missing: string[] = [];
  let requiredFields = 0;
  let filledFields = 0;

  const check = (label: string, filled: boolean) => {
    requiredFields += 1;
    if (filled) filledFields += 1;
    else missing.push(label);
  };

  check('Nama Perusahaan', !!org.name && org.name.trim().length >= 2);
  check('Nomor Telepon Perusahaan', !!org.phone && org.phone.trim().length > 0);
  check('Jenis Usaha', !!org.businessType);
  if (org.businessType === 'BADAN_USAHA') {
    check('Bentuk Badan Usaha', !!org.entityForm);
  }
  check('Industri', !!org.industry);

  // Dokumen wajib sesuai jenis usaha yang dipilih.
  const defs = docTypesFor(org.businessType ?? null);
  const requiredDefs = defs.filter((d) => d.required);
  const uploadedTypes = new Set(docs.map((d) => d.docType));
  let requiredDocs = 0;
  let uploadedDocs = 0;
  for (const def of requiredDefs) {
    requiredDocs += 1;
    if (uploadedTypes.has(def.key)) uploadedDocs += 1;
    else missing.push(`Dokumen ${def.label}`);
  }

  const totalRequired = requiredFields + requiredDocs;
  const totalFilled = filledFields + uploadedDocs;
  const percent = totalRequired === 0 ? 0 : Math.round((totalFilled / totalRequired) * 100);
  const status: ProfileStatus = totalRequired > 0 && totalFilled === totalRequired ? 'LENGKAP' : 'BELUM_LENGKAP';

  return {
    percent,
    status,
    missing,
    requiredFields: totalRequired,
    filledFields: totalFilled,
    requiredDocs,
    uploadedDocs,
    totalDocs: docs.length,
  };
}
