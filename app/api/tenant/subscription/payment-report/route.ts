import { auth } from '@/lib/auth';
import { apiOk, apiErr } from '@/lib/utils';
import { reportTenantPayment } from '@/lib/tenant/bank-reconciliation';
import {
  LifecycleError,
  resolveOwnSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import { shapeReport } from '@/lib/tenant/bank-reconciliation';

export const dynamic = 'force-dynamic';

/** POST /api/tenant/subscription/payment-report — OWNER melaporkan "saya
 *  sudah transfer" (Bab 9.5). Multipart: invoiceId?, bankCode,
 *  transferDate (ISO), amount, proof? (PDF/JPG/PNG <=10 MB).
 *  Laporan menjadi tugas rekonsiliasi untuk Master (status PENDING). */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const u = session?.user as any;
    if (!u?.id && !u?.email) {
      return apiErr('Belum login. Silakan masuk kembali.', 401);
    }
    const own = await resolveOwnSubscription({ id: u.id, email: u.email });
    if (!own) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    if (!own.isOwner) {
      return apiErr(
        'Hanya admin kantor (OWNER) yang bisa melaporkan pembayaran.',
        403,
      );
    }
    const form = await req.formData();
    const invoiceIdRaw = form.get('invoiceId');
    const bankCode = String(form.get('bankCode') ?? '');
    const transferDateRaw = String(form.get('transferDate') ?? '');
    const amount = Number(form.get('amount'));
    const proof = form.get('proof');
    const report = await reportTenantPayment({
      tenantId: own.tenant.id,
      invoiceId:
        invoiceIdRaw && String(invoiceIdRaw).trim()
          ? String(invoiceIdRaw)
          : null,
      bankCode,
      transferDate: new Date(transferDateRaw),
      amount,
      proofFile: proof instanceof File ? proof : null,
    });
    return apiOk({ report: shapeReport(report) }, 201);
  } catch (e: any) {
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal melaporkan pembayaran.', 500);
  }
}
