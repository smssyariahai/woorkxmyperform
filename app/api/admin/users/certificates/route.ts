import { requireAuth, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png']);

/**
 * POST /api/admin/users/certificates — unggah lampiran sertifikat / file custom.
 * FormData: file (pdf/jpg/png ≤ 5 MB), scope? (id user — 'new' bila tambah baru).
 * Mengembalikan { path } untuk disimpan di education.certificatePath atau
 * nilai custom tipe FILE. File yatim (form dibatalkan) tidak dihapus otomatis.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const keys = await getUserPermissions(ctx);
    if (!keys.has('USERS_CREATE') && !keys.has('USERS_UPDATE')) {
      return apiErr('Anda tidak memiliki akses untuk tindakan ini.', 403);
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return apiErr('File tidak ditemukan.', 422);
    }
    const f = file;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return apiErr('File harus PDF, JPG, atau PNG.', 422);
    if (f.size > MAX_BYTES) return apiErr('Ukuran file maksimal 5 MB.', 422);
    const scope = String(form.get('scope') || 'new').replace(/[^a-zA-Z0-9_-]/g, '') || 'new';
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const fileName = `${scope}-${Date.now()}-${safeName}`;
    const dir = join(process.cwd(), 'uploads', 'users', 'certificates');
    await mkdir(dir, { recursive: true });
    const buf = Buffer.from(await f.arrayBuffer());
    await writeFile(join(dir, fileName), buf);
    return apiOk({ path: `uploads/users/certificates/${fileName}`, name: f.name, size: f.size });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunggah file.', 500);
  }
}
