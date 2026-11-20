// Client helper Modul E-Arsip — pengganti fetch mentah di halaman /earsip
// dan /earsip/kategori. Respons API dibungkus { success, data } (apiOk /
// apiErr dari lib/utils); helper ini meng-unwrap `body.data ?? body` (pola
// lib/tal/client.ts) — halaman JANGAN hand-roll apiJson sendiri.

export const EARSIP_CONFIDENTIALITIES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'] as const;
export type EarsipConfidentiality = (typeof EARSIP_CONFIDENTIALITIES)[number];

export const EARSIP_CONFIDENTIALITY_LABEL: Record<EarsipConfidentiality, string> = {
  PUBLIC: 'Publik',
  INTERNAL: 'Internal',
  CONFIDENTIAL: 'Rahasia',
};

export const EARSIP_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type EarsipStatus = (typeof EARSIP_STATUSES)[number];

export const EARSIP_STATUS_LABEL: Record<EarsipStatus, string> = {
  ACTIVE: 'Aktif',
  ARCHIVED: 'Diarsipkan',
};

export const EARSIP_ALLOWED_LABEL = 'PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG (maks 10 MB)';

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Validasi ringan di frontend (server tetap memvalidasi ulang). */
export function validateEarsipFileClient(file: File): string | null {
  const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];
  const blocked = [
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.php', '.py',
    '.com', '.scr', '.msi', '.jar', '.html', '.htm', '.zip', '.rar', '.7z',
  ];
  if (file.size === 0) return 'File kosong.';
  if (file.size > 10 * 1024 * 1024) return 'Ukuran file maksimal 10 MB.';
  const parts = file.name.toLowerCase().split('.');
  if (parts.length < 2) return 'File harus memiliki ekstensi.';
  for (const seg of parts.slice(1)) {
    if (blocked.includes(`.${seg}`)) return 'Jenis file ini tidak diizinkan.';
  }
  const ext = `.${parts[parts.length - 1]}`;
  if (!allowed.includes(ext)) return 'Tipe file tidak diizinkan. Hanya PDF, DOC, DOCX, XLS, XLSX, JPG, dan PNG.';
  return null;
}

export interface ArchiveCategoryItem {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parentName: string | null;
  createdById: string | null;
  createdByName: string | null;
  documentCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveDocumentItem {
  id: string;
  organizationId: string;
  categoryId: string;
  categoryName: string;
  title: string;
  documentNumber: string | null;
  documentDate: string | null;
  description: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploaderId: string;
  uploaderName: string;
  uploaderEmail?: string;
  confidentiality: string;
  status: string;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EarsipStats {
  totalDocuments: number;
  totalCategories: number;
  totalUploads: number;
  totalSizeBytes: number;
  latestDocuments: ArchiveDocumentItem[];
}

export interface EarsipUploader {
  id: string;
  name: string;
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data ?? body;
}

function qs<T extends object>(params: T): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

export interface ListDocumentsParams {
  q?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  uploaderId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listDocuments(params: ListDocumentsParams = {}): Promise<{
  documents: ArchiveDocumentItem[];
  categories: ArchiveCategoryItem[];
  uploaders: EarsipUploader[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  canManage: boolean;
  canAccessConfidential: boolean;
}> {
  return apiJson(`/api/earsip/documents${qs(params)}`);
}

export async function getStats(): Promise<EarsipStats> {
  return apiJson('/api/earsip/stats');
}

export interface UploadDocumentInput {
  title: string;
  categoryId: string;
  documentNumber?: string;
  documentDate?: string;
  description?: string;
  confidentiality?: EarsipConfidentiality;
  file: File;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<ArchiveDocumentItem> {
  const form = new FormData();
  form.set('title', input.title);
  form.set('categoryId', input.categoryId);
  if (input.documentNumber) form.set('documentNumber', input.documentNumber);
  if (input.documentDate) form.set('documentDate', input.documentDate);
  if (input.description) form.set('description', input.description);
  if (input.confidentiality) form.set('confidentiality', input.confidentiality);
  form.set('file', input.file);
  return apiJson('/api/earsip/documents', { method: 'POST', body: form });
}

export interface UpdateDocumentInput {
  title?: string;
  documentNumber?: string | null;
  documentDate?: string | null;
  description?: string | null;
  categoryId?: string;
  confidentiality?: EarsipConfidentiality;
  status?: EarsipStatus;
}

export async function updateDocument(id: string, input: UpdateDocumentInput): Promise<ArchiveDocumentItem> {
  return apiJson(`/api/earsip/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await apiJson(`/api/earsip/documents/${id}`, { method: 'DELETE' });
}

export async function listCategories(): Promise<{ categories: ArchiveCategoryItem[]; canManage: boolean }> {
  return apiJson('/api/earsip/categories');
}

export async function createCategory(input: {
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<ArchiveCategoryItem> {
  return apiJson('/api/earsip/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string | null; parentId?: string | null }
): Promise<ArchiveCategoryItem> {
  return apiJson(`/api/earsip/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await apiJson(`/api/earsip/categories/${id}`, { method: 'DELETE' });
}
