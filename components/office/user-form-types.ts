// Tipe & state untuk form Tambah/Edit Pengguna (sidebar 4 bagian).

export interface FamilyRow {
  key: string;
  name: string;
  relationship: string;
  phone: string;
  address: string;
  occupation: string;
}

export interface EducationRow {
  key: string;
  kind: 'FORMAL' | 'INFORMAL';
  degree: string;
  name: string;
  institution: string;
  fieldOfStudy: string;
  grade: string;
  startYear: string;
  endYear: string;
  expiryDate: string;
  cost: string;
  activity: string;
  hasCertificate: boolean;
  certificatePath: string;
  certificateName: string;
}

export interface ExperienceRow {
  key: string;
  companyName: string;
  position: string;
  startYear: string;
  endYear: string;
}

export interface UserFormState {
  name: string;
  email: string;
  username: string;
  phone: string;
  password: string;
  status: 'ACTIVE' | 'INACTIVE';
  roleId: string;
  departmentId: string;
  jobTitle: string;
  docAccessLevel: string;
  profile: {
    birthDate: string;
    gender: string;
    maritalStatus: string;
    bloodType: string;
    religion: string;
    nik: string;
    ktpAddress: string;
    postalCode: string;
    homeAddress: string;
  };
  family: FamilyRow[];
  employment: {
    companyName: string;
    employeeId: string;
    organizationName: string;
    position: string;
    jobLevel: string;
    employmentStatus: string;
    branch: string;
    joinDate: string;
    endDate: string;
    grade: string;
    classLevel: string;
    managerId: string;
    approvalApproverId: string;
    approvalNote: string;
  };
  educations: EducationRow[];
  experiences: ExperienceRow[];
  customValues: Record<string, string>;
  /** Hak akses per modul baru: 'READ' | 'WRITE' | 'NONE' (tanpa entri = WRITE). */
  moduleAccess: Record<string, 'READ' | 'WRITE' | 'NONE'>;
}

export interface FormRefs {
  roles: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string; email: string; jobTitle: string | null }>;
  customFields: Array<{ id: string; label: string; type: string; options: string | null; required: boolean }>;
  orgModules: string[];
  /** modul baru yang dilanggan kantor (dashboard & setting selalu ada). */
  subscribedModules?: string[];
}

export function emptyFormState(): UserFormState {
  return {
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    status: 'ACTIVE',
    roleId: '',
    departmentId: '',
    jobTitle: '',
    docAccessLevel: 'INTERNAL',
    profile: {
      birthDate: '',
      gender: '',
      maritalStatus: '',
      bloodType: '',
      religion: '',
      nik: '',
      ktpAddress: '',
      postalCode: '',
      homeAddress: '',
    },
    family: [],
    employment: {
      companyName: '',
      employeeId: '',
      organizationName: '',
      position: '',
      jobLevel: '',
      employmentStatus: '',
      branch: '',
      joinDate: '',
      endDate: '',
      grade: '',
      classLevel: '',
      managerId: '',
      approvalApproverId: '',
      approvalNote: '',
    },
    educations: [],
    experiences: [],
    customValues: {},
    moduleAccess: {},
  };
}

export function toDateInput(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

let keyCounter = 0;
export function nextKey(): string {
  keyCounter += 1;
  return `row-${Date.now().toString(36)}-${keyCounter}`;
}

/** Detail API (GET /api/admin/users/:id) -> state form. */
export function detailToFormState(detail: any): UserFormState {
  const s = emptyFormState();
  const u = detail.user ?? {};
  s.name = u.name ?? '';
  s.email = u.email ?? '';
  s.username = u.username ?? '';
  s.phone = u.phone ?? '';
  s.status = detail.membership?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  s.roleId = detail.membership?.roleId ?? '';
  s.departmentId = detail.membership?.departmentId ?? '';
  s.jobTitle = detail.membership?.jobTitle ?? '';
  const p = detail.profile ?? {};
  s.docAccessLevel = p.docAccessLevel ?? 'INTERNAL';
  s.profile = {
    birthDate: toDateInput(p.birthDate),
    gender: p.gender ?? '',
    maritalStatus: p.maritalStatus ?? '',
    bloodType: p.bloodType ?? '',
    religion: p.religion ?? '',
    nik: p.nik ?? '',
    ktpAddress: p.ktpAddress ?? '',
    postalCode: p.postalCode ?? '',
    homeAddress: p.homeAddress ?? '',
  };
  s.family = (detail.family ?? []).map((f: any) => ({
    key: nextKey(),
    name: f.name ?? '',
    relationship: f.relationship ?? '',
    phone: f.phone ?? '',
    address: f.address ?? '',
    occupation: f.occupation ?? '',
  }));
  const em = detail.employment ?? null;
  if (em) {
    s.employment = {
      companyName: em.companyName ?? '',
      employeeId: em.employeeId ?? '',
      organizationName: em.organizationName ?? '',
      position: em.position ?? '',
      jobLevel: em.jobLevel ?? '',
      employmentStatus: em.employmentStatus ?? '',
      branch: em.branch ?? '',
      joinDate: toDateInput(em.joinDate),
      endDate: toDateInput(em.endDate),
      grade: em.grade ?? '',
      classLevel: em.classLevel ?? '',
      managerId: em.managerId ?? '',
      approvalApproverId: em.approvalApproverId ?? '',
      approvalNote: em.approvalNote ?? '',
    };
  }
  s.educations = (detail.educations ?? []).map((x: any) => ({
    key: nextKey(),
    kind: x.kind === 'INFORMAL' ? 'INFORMAL' : 'FORMAL',
    degree: x.degree ?? '',
    name: x.name ?? '',
    institution: x.institution ?? '',
    fieldOfStudy: x.fieldOfStudy ?? '',
    grade: x.grade ?? '',
    startYear: x.startYear != null ? String(x.startYear) : '',
    endYear: x.endYear != null ? String(x.endYear) : '',
    expiryDate: toDateInput(x.expiryDate),
    cost: x.cost != null ? String(x.cost) : '',
    activity: x.activity ?? '',
    hasCertificate: !!x.hasCertificate,
    certificatePath: x.certificatePath ?? '',
    certificateName: (x.certificatePath ?? '').split('/').pop() ?? '',
  }));
  s.experiences = (detail.experiences ?? []).map((x: any) => ({
    key: nextKey(),
    companyName: x.companyName ?? '',
    position: x.position ?? '',
    startYear: x.startYear != null ? String(x.startYear) : '',
    endYear: x.endYear != null ? String(x.endYear) : '',
  }));
  s.customValues = { ...(detail.customValues ?? {}) };
  // moduleAccess: format baru Record<modul, 'READ'|'WRITE'|'NONE'>;
  // terima juga format lama boolean (true = WRITE, false = NONE).
  const ma: Record<string, 'READ' | 'WRITE' | 'NONE'> = {};
  for (const [k, v] of Object.entries(detail.moduleAccess ?? {})) {
    if (v === 'READ' || v === 'WRITE' || v === 'NONE') ma[k] = v;
    else ma[k] = v === false ? 'NONE' : 'WRITE';
  }
  s.moduleAccess = ma;
  return s;
}

/** State form -> payload API (POST/PATCH). */
export function formStateToPayload(s: UserFormState, mode: 'create' | 'edit'): any {
  const payload: any = {
    name: s.name.trim(),
    email: s.email.trim(),
    username: s.username.trim() || undefined,
    phone: s.phone.trim(),
    status: s.status,
    roleId: s.roleId,
    departmentId: s.departmentId || null,
    jobTitle: s.jobTitle.trim(),
    profile: {
      birthDate: s.profile.birthDate || undefined,
      gender: s.profile.gender || undefined,
      maritalStatus: s.profile.maritalStatus || undefined,
      bloodType: s.profile.bloodType || undefined,
      religion: s.profile.religion || undefined,
      nik: s.profile.nik.trim() || undefined,
      ktpAddress: s.profile.ktpAddress.trim() || undefined,
      postalCode: s.profile.postalCode.trim() || undefined,
      homeAddress: s.profile.homeAddress.trim() || undefined,
      docAccessLevel: s.docAccessLevel,
    },
    family: s.family.map((f) => ({
      name: f.name.trim(),
      relationship: f.relationship,
      phone: f.phone.trim() || undefined,
      address: f.address.trim() || undefined,
      occupation: f.occupation.trim() || undefined,
    })),
    employment: {
      companyName: s.employment.companyName.trim() || undefined,
      employeeId: s.employment.employeeId.trim() || undefined,
      organizationName: s.employment.organizationName.trim() || undefined,
      position: s.employment.position.trim() || undefined,
      jobLevel: s.employment.jobLevel || undefined,
      employmentStatus: s.employment.employmentStatus || undefined,
      branch: s.employment.branch.trim() || undefined,
      joinDate: s.employment.joinDate || undefined,
      endDate: s.employment.endDate || undefined,
      grade: s.employment.grade.trim() || undefined,
      classLevel: s.employment.classLevel.trim() || undefined,
      managerId: s.employment.managerId || undefined,
      approvalApproverId: s.employment.approvalApproverId || undefined,
      approvalNote: s.employment.approvalNote.trim() || undefined,
    },
    educations: s.educations.map((x) => ({
      kind: x.kind,
      degree: x.degree || undefined,
      name: x.name.trim() || undefined,
      institution: x.institution.trim() || undefined,
      fieldOfStudy: x.fieldOfStudy.trim() || undefined,
      grade: x.grade.trim() || undefined,
      startYear: x.startYear === '' ? undefined : Number(x.startYear),
      endYear: x.endYear === '' ? undefined : Number(x.endYear),
      expiryDate: x.expiryDate || undefined,
      cost: x.cost === '' ? undefined : Number(x.cost),
      activity: x.activity.trim() || undefined,
      hasCertificate: x.hasCertificate,
      certificatePath: x.certificatePath || undefined,
    })),
    experiences: s.experiences.map((x) => ({
      companyName: x.companyName.trim(),
      position: x.position.trim(),
      startYear: x.startYear === '' ? undefined : Number(x.startYear),
      endYear: x.endYear === '' ? undefined : Number(x.endYear),
    })),
    customValues: { ...s.customValues },
    moduleAccess: { ...s.moduleAccess },
  };
  if (mode === 'create' && s.password) payload.password = s.password;
  return payload;
}
