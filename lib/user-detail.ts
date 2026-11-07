// Helper bersama untuk data lengkap pengguna (Manajemen Pengguna — halaman
// Tambah/Edit). Dipakai API GET/PATCH/POST. Validasi di sini agar form
// tambah dan edit memakai aturan yang sama.

import { prisma } from '@/lib/db';
import { apiErr } from '@/lib/utils';
import { AVAILABLE_MODULES, parseOrgModules, type ModuleKey } from '@/lib/modules';
import {
  BLOOD_TYPES,
  FORMAL_DEGREES,
  MARITAL_STATUSES,
  RELATIONSHIPS,
  RELIGIONS,
  isCustomFieldType,
  parseFieldOptions,
} from '@/lib/user-profile';

const MODULE_KEYS = AVAILABLE_MODULES.map((m) => m.key) as ModuleKey[];

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function intOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function dateOrNull(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function boolOr(v: unknown, def = false): boolean {
  return v === undefined || v === null ? def : v === true || v === 'true';
}

export interface NormalizedDetail {
  profile: {
    birthDate: Date | null;
    gender: string | null;
    maritalStatus: string | null;
    bloodType: string | null;
    religion: string | null;
    nik: string | null;
    ktpAddress: string | null;
    postalCode: string | null;
    homeAddress: string | null;
    docAccessLevel: string;
  } | null;
  family: Array<{ id?: string; name: string; relationship: string; phone: string | null; address: string | null; occupation: string | null }>;
  employment: {
    companyName: string | null;
    employeeId: string | null;
    organizationName: string | null;
    position: string | null;
    jobLevel: string | null;
    employmentStatus: string | null;
    branch: string | null;
    joinDate: Date | null;
    endDate: Date | null;
    grade: string | null;
    classLevel: string | null;
    managerId: string | null;
    approvalApproverId: string | null;
    approvalNote: string | null;
  } | null;
  educations: Array<{
    id?: string;
    kind: 'FORMAL' | 'INFORMAL';
    degree: string | null;
    name: string | null;
    institution: string | null;
    fieldOfStudy: string | null;
    grade: string | null;
    startYear: number | null;
    endYear: number | null;
    expiryDate: Date | null;
    cost: number | null;
    activity: string | null;
    hasCertificate: boolean;
    certificatePath: string | null;
  }>;
  experiences: Array<{ id?: string; companyName: string; position: string; startYear: number | null; endYear: number | null }>;
  customValues: Array<{ fieldDefId: string; value: string }>;
  moduleAccess: Array<{ moduleKey: string; allowed: boolean }>;
}

function bad(msg: string): never {
  throw apiErr(msg, 422);
}

function checkYear(y: number | null, label: string) {
  if (y !== null && (y < 1900 || y > 2100)) bad(`${label} harus antara 1900–2100.`);
}

/** Validasi + normalisasi payload form lengkap. */
export async function validateUserDetailInput(
  body: any,
  opts: { organizationId: string; userId: string; membershipId?: string }
): Promise<NormalizedDetail> {
  const { organizationId, userId } = opts;

  // --- Profil ---
  const p = body?.profile ?? null;
  let profile: NormalizedDetail['profile'] = null;
  if (p && typeof p === 'object') {
    const birthDate = dateOrNull(p.birthDate);
    if (p.birthDate && !birthDate) bad('Tanggal lahir tidak valid.');
    const gender = str(p.gender);
    if (gender && gender !== 'L' && gender !== 'P') bad('Gender harus L atau P.');
    const maritalStatus = str(p.maritalStatus);
    if (maritalStatus && !(MARITAL_STATUSES as readonly string[]).includes(maritalStatus)) bad('Status perkawinan tidak dikenal.');
    const bloodType = str(p.bloodType);
    if (bloodType && !(BLOOD_TYPES as readonly string[]).includes(bloodType)) bad('Golongan darah tidak dikenal.');
    const religion = str(p.religion);
    if (religion && !(RELIGIONS as readonly string[]).includes(religion)) bad('Agama tidak dikenal.');
    const nik = str(p.nik);
    if (nik && !/^\d{16}$/.test(nik)) bad('NIK harus 16 digit angka.');
    const docAccessLevel = str(p.docAccessLevel) ?? 'INTERNAL';
    if (!['UMUM', 'INTERNAL', 'RAHASIA'].includes(docAccessLevel)) bad('Level akses dokumen tidak dikenal.');
    profile = {
      birthDate,
      gender,
      maritalStatus,
      bloodType,
      religion,
      nik,
      ktpAddress: str(p.ktpAddress),
      postalCode: str(p.postalCode),
      homeAddress: str(p.homeAddress),
      docAccessLevel,
    };
  }

  // --- Keluarga ---
  const familyRaw = Array.isArray(body?.family) ? body.family : [];
  if (familyRaw.length > 20) bad('Maksimal 20 kontak keluarga.');
  const family = familyRaw.map((f: any, i: number) => {
    const name = str(f?.name);
    if (!name) bad(`Kontak keluarga #${i + 1}: nama lengkap wajib diisi.`);
    const relationship = str(f?.relationship);
    if (!relationship || !(RELATIONSHIPS as readonly string[]).includes(relationship)) {
      bad(`Kontak keluarga #${i + 1}: hubungan tidak dikenal.`);
    }
    return {
      id: typeof f?.id === 'string' ? f.id : undefined,
      name,
      relationship,
      phone: str(f?.phone),
      address: str(f?.address),
      occupation: str(f?.occupation),
    };
  });

  // --- Ketenagakerjaan ---
  const e = body?.employment ?? null;
  let employment: NormalizedDetail['employment'] = null;
  if (e && typeof e === 'object') {
    const joinDate = dateOrNull(e.joinDate);
    if (e.joinDate && !joinDate) bad('Tanggal bergabung tidak valid.');
    const endDate = dateOrNull(e.endDate);
    if (e.endDate && !endDate) bad('Tanggal berakhir status tidak valid.');
    if (joinDate && endDate && endDate < joinDate) bad('Tanggal berakhir tidak boleh sebelum tanggal bergabung.');
    const managerId = str(e.managerId);
    const approvalApproverId = str(e.approvalApproverId);
    for (const [label, refId] of [['Manajer/Atasan Langsung', managerId], ['Alur persetujuan', approvalApproverId]] as const) {
      if (refId) {
        if (refId === userId) bad(`${label} tidak boleh diri sendiri.`);
        const m = await prisma.membership.findFirst({
          where: { userId: refId, organizationId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!m) bad(`${label}: pengguna tidak aktif di kantor ini.`);
      }
    }
    employment = {
      companyName: str(e.companyName),
      employeeId: str(e.employeeId),
      organizationName: str(e.organizationName),
      position: str(e.position),
      jobLevel: str(e.jobLevel),
      employmentStatus: str(e.employmentStatus),
      branch: str(e.branch),
      joinDate,
      endDate,
      grade: str(e.grade),
      classLevel: str(e.classLevel),
      managerId,
      approvalApproverId,
      approvalNote: str(e.approvalNote),
    };
  }

  // --- Pendidikan ---
  const eduRaw = Array.isArray(body?.educations) ? body.educations : [];
  if (eduRaw.length > 20) bad('Maksimal 20 riwayat pendidikan.');
  const educations = eduRaw.map((x: any, i: number) => {
    const kind = x?.kind === 'INFORMAL' ? 'INFORMAL' : 'FORMAL';
    const degree = str(x?.degree);
    const name = str(x?.name);
    const institution = str(x?.institution);
    const startYear = intOrNull(x?.startYear);
    const endYear = intOrNull(x?.endYear);
    if (startYear === null || endYear === null) bad(`Pendidikan #${i + 1}: tahun mulai & tahun selesai wajib diisi.`);
    checkYear(startYear, `Pendidikan #${i + 1}: tahun mulai`);
    checkYear(endYear, `Pendidikan #${i + 1}: tahun selesai`);
    if (endYear < startYear) bad(`Pendidikan #${i + 1}: tahun selesai tidak boleh sebelum tahun mulai.`);
    if (kind === 'FORMAL') {
      if (!degree || !(FORMAL_DEGREES as readonly string[]).includes(degree)) {
        bad(`Pendidikan #${i + 1}: derajat pendidikan formal wajib dipilih dari daftar.`);
      }
      if (!institution) bad(`Pendidikan #${i + 1}: institusi wajib diisi.`);
    } else {
      if (!name) bad(`Pendidikan #${i + 1}: nama pendidikan wajib diisi.`);
      if (!institution) bad(`Pendidikan #${i + 1}: penyelenggara wajib diisi.`);
    }
    const expiryDate = dateOrNull(x?.expiryDate);
    if (x?.expiryDate && !expiryDate) bad(`Pendidikan #${i + 1}: tanggal kedaluwarsa tidak valid.`);
    const cost = intOrNull(x?.cost);
    if (x?.cost !== undefined && x?.cost !== null && x?.cost !== '' && cost === null) bad(`Pendidikan #${i + 1}: biaya harus angka.`);
    if (cost !== null && cost < 0) bad(`Pendidikan #${i + 1}: biaya tidak boleh negatif.`);
    const certificatePath = str(x?.certificatePath);
    if (certificatePath && !certificatePath.startsWith('uploads/users/certificates/')) {
      bad(`Pendidikan #${i + 1}: jalur lampiran sertifikat tidak valid.`);
    }
    return {
      id: typeof x?.id === 'string' ? x.id : undefined,
      kind,
      degree,
      name,
      institution,
      fieldOfStudy: str(x?.fieldOfStudy),
      grade: str(x?.grade),
      startYear,
      endYear,
      expiryDate,
      cost,
      activity: str(x?.activity),
      hasCertificate: boolOr(x?.hasCertificate),
      certificatePath,
    };
  });

  // --- Pengalaman kerja ---
  const expRaw = Array.isArray(body?.experiences) ? body.experiences : [];
  if (expRaw.length > 20) bad('Maksimal 20 riwayat pengalaman kerja.');
  const experiences = expRaw.map((x: any, i: number) => {
    const companyName = str(x?.companyName);
    const position = str(x?.position);
    if (!companyName) bad(`Pengalaman kerja #${i + 1}: nama perusahaan wajib diisi.`);
    if (!position) bad(`Pengalaman kerja #${i + 1}: posisi pekerjaan wajib diisi.`);
    const startYear = intOrNull(x?.startYear);
    const endYear = intOrNull(x?.endYear);
    checkYear(startYear, `Pengalaman #${i + 1}: tahun mulai`);
    checkYear(endYear, `Pengalaman #${i + 1}: tahun selesai`);
    if (startYear !== null && endYear !== null && endYear < startYear) {
      bad(`Pengalaman #${i + 1}: tahun selesai tidak boleh sebelum tahun mulai.`);
    }
    return { id: typeof x?.id === 'string' ? x.id : undefined, companyName, position, startYear, endYear };
  });

  // --- Nilai custom ---
  const defs = await prisma.userCustomFieldDef.findMany({
    where: { organizationId },
    select: { id: true, label: true, type: true, options: true, required: true },
  });
  const defById = new Map(defs.map((d) => [d.id, d]));
  const cvRaw = body?.customValues && typeof body.customValues === 'object' ? body.customValues : {};
  const customValues: Array<{ fieldDefId: string; value: string }> = [];
  for (const def of defs) {
    const raw = cvRaw[def.id];
    const val = raw === undefined || raw === null ? '' : String(raw).trim();
    if (def.required && val === '') bad(`Field tambahan "${def.label}" wajib diisi.`);
    if (val === '') continue;
    if (!isCustomFieldType(def.type)) continue;
    if (def.type === 'NUMBER' || def.type === 'CURRENCY') {
      if (!/^-?\d+(\.\d+)?$/.test(val)) bad(`Field tambahan "${def.label}" harus angka.`);
    } else if (def.type === 'EMAIL') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) bad(`Field tambahan "${def.label}" harus email yang valid.`);
    } else if (def.type === 'SELECT') {
      if (!parseFieldOptions(def.options).includes(val)) bad(`Field tambahan "${def.label}": pilihan tidak dikenal.`);
    } else if (def.type === 'BOOLEAN') {
      if (val !== 'true' && val !== 'false') bad(`Field tambahan "${def.label}" harus Ya/Tidak.`);
    } else if (def.type === 'DATE') {
      if (!dateOrNull(val)) bad(`Field tambahan "${def.label}" harus tanggal yang valid.`);
    } else if (def.type === 'FILE') {
      if (!val.startsWith('uploads/users/certificates/')) bad(`Field tambahan "${def.label}": jalur file tidak valid.`);
    }
    customValues.push({ fieldDefId: def.id, value: val });
  }
  // Tolak field tak dikenal (bukan milik kantor ini).
  for (const key of Object.keys(cvRaw)) {
    if (!defById.has(key)) bad('Field tambahan tidak dikenal.');
  }

  // --- Hak akses modul ---
  const maRaw = body?.moduleAccess && typeof body.moduleAccess === 'object' ? body.moduleAccess : {};
  const moduleAccess: Array<{ moduleKey: string; allowed: boolean }> = [];
  for (const key of Object.keys(maRaw)) {
    if (!(MODULE_KEYS as readonly string[]).includes(key)) bad('Modul tidak dikenal.');
    moduleAccess.push({ moduleKey: key, allowed: maRaw[key] === true || maRaw[key] === 'true' });
  }

  return { profile, family, employment, educations, experiences, customValues, moduleAccess };
}

/**
 * Operasi tulis untuk data lengkap (dijalankan dalam satu $transaction
 * bersama update user/membership oleh route pemanggil).
 * Semantik daftar (keluarga/pendidikan/pengalaman): payload adalah daftar
 * lengkap — baris yang tidak ada di payload dihapus.
 */
export function buildUserDetailOps(
  d: NormalizedDetail,
  ids: { userId: string; membershipId: string }
): any[] {
  const ops: any[] = [];
  const { userId, membershipId } = ids;

  // Profil (upsert 1:1).
  if (d.profile) {
    ops.push(
      prisma.userProfile.upsert({
        where: { userId },
        create: { userId, ...d.profile },
        update: { ...d.profile },
      })
    );
  } else {
    ops.push(prisma.userProfile.deleteMany({ where: { userId } }));
  }

  // Keluarga — ganti penuh.
  ops.push(prisma.userFamilyContact.deleteMany({ where: { userId } }));
  d.family.forEach((f, i) => {
    ops.push(
      prisma.userFamilyContact.create({
        data: { userId, name: f.name, relationship: f.relationship, phone: f.phone, address: f.address, occupation: f.occupation, sortOrder: i },
      })
    );
  });

  // Ketenagakerjaan (upsert 1:1 per membership).
  if (d.employment) {
    ops.push(
      prisma.userEmployment.upsert({
        where: { membershipId },
        create: { membershipId, ...d.employment },
        update: { ...d.employment },
      })
    );
  } else {
    ops.push(prisma.userEmployment.deleteMany({ where: { membershipId } }));
  }

  // Pendidikan — ganti penuh.
  ops.push(prisma.userEducation.deleteMany({ where: { userId } }));
  d.educations.forEach((x, i) => {
    ops.push(
      prisma.userEducation.create({
        data: {
          userId,
          kind: x.kind,
          degree: x.degree,
          name: x.name,
          institution: x.institution,
          fieldOfStudy: x.fieldOfStudy,
          grade: x.grade,
          startYear: x.startYear,
          endYear: x.endYear,
          expiryDate: x.expiryDate,
          cost: x.cost,
          activity: x.activity,
          hasCertificate: x.hasCertificate,
          certificatePath: x.certificatePath,
          sortOrder: i,
        },
      })
    );
  });

  // Pengalaman kerja — ganti penuh.
  ops.push(prisma.userWorkExperience.deleteMany({ where: { userId } }));
  d.experiences.forEach((x, i) => {
    ops.push(
      prisma.userWorkExperience.create({
        data: { userId, companyName: x.companyName, position: x.position, startYear: x.startYear, endYear: x.endYear, sortOrder: i },
      })
    );
  });

  // Nilai custom — ganti penuh.
  ops.push(prisma.userCustomValue.deleteMany({ where: { membershipId } }));
  d.customValues.forEach((v) => {
    ops.push(prisma.userCustomValue.create({ data: { membershipId, fieldDefId: v.fieldDefId, value: v.value } }));
  });

  // Hak akses modul — hanya simpan baris allowed=false (tanpa baris = ikut kantor).
  ops.push(prisma.userModuleAccess.deleteMany({ where: { membershipId } }));
  d.moduleAccess
    .filter((m) => !m.allowed)
    .forEach((m) => {
      ops.push(prisma.userModuleAccess.create({ data: { membershipId, moduleKey: m.moduleKey, allowed: false } }));
    });

  return ops;
}

/** Referensi untuk form (role, divisi, anggota kantor, field custom, modul). */
export async function getUserFormRefs(organizationId: string, excludeUserId?: string) {
  const [roles, departments, members, customFields, org] = await Promise.all([
    prisma.role.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.department.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.membership.findMany({
      where: { organizationId, status: 'ACTIVE', ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
      take: 500,
    }),
    prisma.userCustomFieldDef.findMany({
      where: { organizationId },
      select: { id: true, label: true, type: true, options: true, required: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { modules: true } }),
  ]);
  return {
    roles,
    departments,
    members: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, jobTitle: m.jobTitle })),
    customFields,
    orgModules: parseOrgModules(org?.modules), // [] = semua aktif
  };
}

/** Detail lengkap satu pengguna (untuk halaman edit). */
export async function getUserDetail(membershipId: string, organizationId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId },
    include: {
      user: { select: { id: true, name: true, email: true, username: true, phone: true, status: true, isSuperAdmin: true, createdAt: true } },
      role: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      employment: true,
      customValues: { select: { fieldDefId: true, value: true } },
      moduleAccess: { select: { moduleKey: true, allowed: true } },
    },
  });
  if (!membership) return null;
  const [profile, family, educations, experiences] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: membership.userId } }),
    prisma.userFamilyContact.findMany({ where: { userId: membership.userId }, orderBy: { sortOrder: 'asc' } }),
    prisma.userEducation.findMany({ where: { userId: membership.userId }, orderBy: { sortOrder: 'asc' } }),
    prisma.userWorkExperience.findMany({ where: { userId: membership.userId }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const refs = await getUserFormRefs(organizationId, membership.userId);
  const denied = new Set(membership.moduleAccess.filter((a) => !a.allowed).map((a) => a.moduleKey));
  const moduleAccess: Record<string, boolean> = {};
  for (const m of AVAILABLE_MODULES) moduleAccess[m.key] = !denied.has(m.key);
  const customValues: Record<string, string> = {};
  for (const v of membership.customValues) customValues[v.fieldDefId] = v.value ?? '';
  return {
    membership: { id: membership.id, status: membership.status, roleId: membership.roleId, roleName: membership.role.name, departmentId: membership.departmentId, jobTitle: membership.jobTitle, joinedAt: membership.joinedAt },
    user: membership.user,
    profile,
    family,
    employment: membership.employment,
    educations,
    experiences,
    customValues,
    moduleAccess,
    refs,
  };
}
