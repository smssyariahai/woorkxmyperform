// Client helper HR Detail — pengganti fetch mentah di halaman
// /hr/detail dan /hr/detail/[id]. Respons API dibungkus { success, data }
// (apiOk / apiErr dari lib/utils); helper ini meng-unwrap
// `body.data ?? body` (pola lib/tal/client.ts) — halaman JANGAN hand-roll
// apiJson sendiri.
//
// Basis data: HrEmployee + HrContract saja (lihat
// woorkxmyperform-docs/ANALYSIS_UPDATE_2026-11-19.md Item 3). Field yang
// tidak ada di model (cabang, atasan, tempat lahir, jenis kelamin, foto,
// dokumen KTP/KK/ijazah/NPWP, riwayat jabatan/mutasi/status) memang TIDAK
// dikirim API dan TIDAK dirender halaman detail.

export interface HrContractItem {
  id: string;
  contractNo: string;
  type: string;
  startDate: string;
  endDate: string | null;
  probationEnd: string | null;
  salary: number | null;
  position: string;
  status: string;
  /** Path relatif file kontrak, pola Koperasi: "uploads/hr/contracts/<file>". */
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HrCandidateOrigin {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  education: string | null;
  source: string | null;
  stage: string;
  appliedAt: string;
  vacancy: { id: string; title: string } | null;
}

export interface HrEmployeeItem {
  id: string;
  employeeNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  birthDate: string | null;
  position: string;
  department: string | null;
  joinDate: string;
  status: string;
  nik: string | null;
  candidateId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Kontrak terbaru saja (list) atau seluruh kontrak (detail). */
  contracts?: HrContractItem[];
  candidate?: HrCandidateOrigin | null;
  createdBy?: { id: string; name: string | null } | null;
}

export interface HrEmployeeInput {
  employeeNo: string;
  name: string;
  nik?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: string | null;
  position: string;
  department?: string | null;
  joinDate: string;
  status: 'AKTIF' | 'CUTI' | 'NONAKTIF';
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data ?? body;
}

function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') s.set(k, v);
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

export interface ListEmployeesParams {
  q?: string;
  status?: string;
  /** Departemen (teks bebas di HrEmployee.department) — cocok persis. */
  department?: string;
  /** Index signature agar bisa diteruskan ke qs() (Record<string, string | undefined>). */
  [key: string]: string | undefined;
}

/** GET /api/hr/employees — daftar karyawan (maks 200, pola route existing). */
export async function listEmployees(
  params: ListEmployeesParams = {}
): Promise<{ items: HrEmployeeItem[] }> {
  return apiJson(`/api/hr/employees${qs(params)}`);
}

/** GET /api/hr/employees/[id] — detail satu karyawan + seluruh kontrak + kandidat asal. */
export async function getEmployee(
  id: string
): Promise<{ item: HrEmployeeItem; canManage: boolean }> {
  return apiJson(`/api/hr/employees/${encodeURIComponent(id)}`);
}

/** PUT /api/hr/employees/[id] — ubah karyawan (gate HR_MANAGE di server). */
export async function updateEmployee(
  id: string,
  input: HrEmployeeInput
): Promise<HrEmployeeItem> {
  const data = await apiJson(`/api/hr/employees/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.item as HrEmployeeItem;
}

/** POST /api/hr/employees — tambah karyawan manual (gate HR_MANAGE di server). */
export async function createEmployee(input: HrEmployeeInput): Promise<HrEmployeeItem> {
  const data = await apiJson('/api/hr/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.item as HrEmployeeItem;
}

/** DELETE /api/hr/employees/[id] — hapus karyawan + kontrak terkait (gate HR_MANAGE). */
export async function deleteEmployee(id: string): Promise<void> {
  await apiJson(`/api/hr/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** URL unduh file kontrak (disajikan privat lewat API, gate HR_VIEW). */
export function contractFileUrl(contractId: string): string {
  return `/api/hr/contracts/${encodeURIComponent(contractId)}/file`;
}

/**
 * POST /api/hr/contracts/[id]/file — unggah file kontrak (PDF, maks 10 MB,
 * pola app/api/esign/documents/[id]/upload/route.ts). Mengembalikan fileUrl
 * baru yang tersimpan di HrContract.fileUrl.
 */
export async function uploadContractFile(
  contractId: string,
  file: File
): Promise<{ fileUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  return apiJson(`/api/hr/contracts/${encodeURIComponent(contractId)}/file`, {
    method: 'POST',
    body: form,
  });
}
