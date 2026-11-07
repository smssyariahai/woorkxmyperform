import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * GET /api/admin/users/files?path=uploads/users/certificates/...
 * Serve lampiran sertifikat / file custom secara privat (USERS_VIEW).
 * Path harus di bawah uploads/users/certificates/ — tanpa traversal.
 */
export async function GET(req: Request) {
  try {
    await requirePermission('USERS_VIEW', req);
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('path') ?? '';
    if (!raw.startsWith('uploads/users/certificates/')) {
      return apiErr('Jalur file tidak valid.', 422);
    }
    const safe = raw.split('/').pop()!.split('\\').pop()!;
    if (!safe || safe.includes('..')) return apiErr('Jalur file tidak valid.', 422);
    const full = join(process.cwd(), 'uploads', 'users', 'certificates', safe);
    if (!existsSync(full)) return apiErr('File tidak ditemukan.', 404);
    const ext = (safe.split('.').pop() || '').toLowerCase();
    const buf = await readFile(full);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${safe}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat file.', 500);
  }
}
