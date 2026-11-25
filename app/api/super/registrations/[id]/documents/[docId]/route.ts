import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { REGISTRATION_UPLOAD_DIR } from '@/lib/tenant/tenant-registration';
import { logRegistrationKtpAccess } from '@/lib/tenant/registration-review';

export const dynamic = 'force-dynamic';

/**
 * GET /api/super/registrations/[id]/documents/[docId] — unduh dokumen
 * pendaftaran (guard MANAGE). KTP (PIC_KTP) hanya Master Administrator
 * (ctx.isSuperAdmin) + setiap akses KTP dicatat di audit log.
 * storedPath divalidasi: harus di bawah uploads/registrations/<id>/ dan
 * basename saja (tolak traversal). File TIDAK pernah disajikan lewat rute
 * publik/statis.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string; docId: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_REGISTRATIONS_MANAGE',
      req,
    );
    const doc = await masterPrisma.tenantRegistrationDocument.findUnique({
      where: { id: params.docId },
    });
    if (!doc || doc.registrationId !== params.id) {
      return apiErr('Dokumen tidak ditemukan.', 404);
    }
    if (doc.docType === 'PIC_KTP' && !ctx.isSuperAdmin) {
      return apiErr(
        'Dokumen KTP hanya boleh dibuka oleh Master Administrator.',
        403,
      );
    }
    const prefix = `uploads/registrations/${params.id}/`;
    if (!doc.storedPath.startsWith(prefix)) {
      return apiErr('Dokumen tidak ditemukan.', 404);
    }
    const rest = doc.storedPath.slice(prefix.length);
    if (!rest || rest !== basename(rest) || rest.includes('\\')) {
      return apiErr('Dokumen tidak ditemukan.', 404);
    }
    const abs = join(REGISTRATION_UPLOAD_DIR, params.id, rest);
    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch {
      return apiErr('File dokumen tidak ditemukan.', 404);
    }
    if (doc.docType === 'PIC_KTP') {
      await logRegistrationKtpAccess(params.id, doc.id, ctx.userId).catch(
        () => undefined,
      );
    }
    const safeName = doc.fileName.replace(/["\\\r\n]/g, '_');
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': doc.mimeType,
        'content-disposition': `attachment; filename="${safeName}"`,
        'content-length': String(buf.length),
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('[super/registrations/[id]/documents] GET gagal:', e);
    return apiErr('Gagal mengunduh dokumen.', 500);
  }
}
