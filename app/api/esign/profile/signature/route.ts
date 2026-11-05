import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { sha256 } from '@/lib/esign/hash';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * GET /api/esign/profile/signature — serve PNG tanda tangan milik sendiri,
 * secara privat. Hanya pemiliknya yang bisa mengakses.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const profile = await prisma.esignProfile.findUnique({
      where: { userId: ctx.userId },
      select: { signaturePath: true },
    });
    if (!profile?.signaturePath) return apiErr('Belum ada tanda tangan tersimpan.', 404);
    const safe = profile.signaturePath.split('/').pop()!.split('\\').pop()!;
    const full = join(process.cwd(), 'uploads', 'esign', 'signatures', safe);
    if (!existsSync(full)) return apiErr('File tanda tangan tidak ditemukan.', 404);
    const buf = await readFile(full);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tanda tangan.', 500);
  }
}

/**
 * POST /api/esign/profile/signature — simpan tanda tangan pribadi.
 * Terima multipart (field: file) ATAU JSON { image: "data:image/png;base64,..." }.
 * Maks 1 MB, harus benar file PNG (magic bytes). File disimpan sebagai
 * uploads/esign/signatures/<userId>.png dan menimpa versi lama bila ada.
 * Dokumen yang SUDAH ditandatangani tidak terpengaruh: mereka menyimpan
 * salinan gambarnya sendiri lewat EsignSignature.signatureAsset.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    let buf: Buffer | null = null;

    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) {
        return apiErr('Tidak ada file tanda tangan.', 422);
      }
      if (file.size > MAX_BYTES) {
        return apiErr('Ukuran maksimal 1 MB.', 422);
      }
      buf = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json().catch(() => ({}));
      const image = typeof body?.image === 'string' ? body.image : '';
      const m = image.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!m) {
        return apiErr('Format harus PNG (data URL base64).', 422);
      }
      buf = Buffer.from(m[1], 'base64');
      if (buf.length === 0 || buf.length > MAX_BYTES) {
        return apiErr('Ukuran maksimal 1 MB.', 422);
      }
    }

    if (!buf || !isPng(buf)) {
      return apiErr('File bukan PNG yang valid.', 422);
    }
    const hash = sha256(buf);

    const dir = join(process.cwd(), 'uploads', 'esign', 'signatures');
    await mkdir(dir, { recursive: true });
    const stored = `${ctx.userId}.png`;
    await writeFile(join(dir, stored), buf);

    await prisma.esignProfile.upsert({
      where: { userId: ctx.userId },
      update: { signaturePath: stored, signatureHash: hash },
      create: { userId: ctx.userId, signaturePath: stored, signatureHash: hash },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_ESIGN_SIGNATURE',
      module: 'ESIGN',
      description: `${ctx.name} menyimpan/memperbarui tanda tangan E-Sign — SHA-256 ${hash.slice(0, 12)}…`,
      ipAddress: getClientIp(req),
    });
    return apiOk({
      signatureUrl: '/api/esign/profile/signature',
      signatureHash: hash,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan tanda tangan.', 500);
  }
}
