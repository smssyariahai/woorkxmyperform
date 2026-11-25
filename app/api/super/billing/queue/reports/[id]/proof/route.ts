import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { PAYMENT_PROOF_DIR } from '@/lib/tenant/bank-reconciliation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/super/billing/queue/reports/[id]/proof — unduh bukti transfer
 * laporan tenant (guard BILLING_MANAGE; Master saja — pola unduh dokumen
 * Fase 3). storedPath divalidasi: harus di bawah
 * uploads/payment-proofs/<tenantId>/ dan basename saja (tolak traversal).
 * File TIDAK pernah disajikan lewat rute publik/statis.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requirePlatformPermission('PLATFORM_BILLING_MANAGE', req);
    const report = await masterPrisma.tenantPaymentReport.findUnique({
      where: { id: params.id },
    });
    if (!report || !report.proofPath) {
      return apiErr('Bukti transfer tidak ditemukan.', 404);
    }
    const prefix = `uploads/payment-proofs/${report.tenantId}/`;
    if (!report.proofPath.startsWith(prefix)) {
      return apiErr('Bukti transfer tidak ditemukan.', 404);
    }
    const rest = report.proofPath.slice(prefix.length);
    if (!rest || rest !== basename(rest) || rest.includes('\\')) {
      return apiErr('Bukti transfer tidak ditemukan.', 404);
    }
    const abs = join(PAYMENT_PROOF_DIR, report.tenantId, rest);
    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch {
      return apiErr('File bukti tidak ditemukan.', 404);
    }
    const ext = rest.slice(rest.lastIndexOf('.')).toLowerCase();
    const mime =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : 'image/jpeg';
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': mime,
        'content-disposition': `attachment; filename="bukti-${report.id}${ext}"`,
        'content-length': String(buf.length),
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunduh bukti transfer.', 500);
  }
}
