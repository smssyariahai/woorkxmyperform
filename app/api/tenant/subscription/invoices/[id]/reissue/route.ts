import { auth } from '@/lib/auth';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { reissueInvoice } from '@/lib/tenant/bank-reconciliation';
import {
  LifecycleError,
  resolveOwnSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import { shapeInvoice } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** POST /api/tenant/subscription/invoices/[id]/reissue — OWNER minta
 *  invoice baru untuk invoice Kedaluwarsa (Bab 9.5: sistem TIDAK PERNAH
 *  menerbitkan ulang otomatis; invoice baru dibuat atas permintaan tenant).
 *  Lifecycle DIHAPUS/NONAKTIF -> 409. actorType 'TENANT' di log otomasi. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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
        'Hanya admin kantor (OWNER) yang bisa meminta invoice baru.',
        403,
      );
    }
    if (
      own.subscription.lifecycleStatus === 'DIHAPUS' ||
      own.subscription.lifecycleStatus === 'NONAKTIF'
    ) {
      return apiErr(
        'Langganan sudah berhenti — invoice baru tidak bisa diterbitkan.',
        409,
      );
    }
    const invoice = await masterPrisma.subscriptionInvoice.findUnique({
      where: { id: params.id },
    });
    if (!invoice || invoice.tenantId !== own.tenant.id) {
      return apiErr('Invoice tidak ditemukan.', 404);
    }
    // actorUserId: id PlatformUser pemanggil (cari by id/email sesi).
    let actorId = own.membership.id;
    if (u.id) {
      const pu = await masterPrisma.platformUser.findUnique({
        where: { id: u.id },
        select: { id: true },
      });
      if (pu) actorId = pu.id;
    }
    if (actorId === own.membership.id && u.email) {
      const pu = await masterPrisma.platformUser.findUnique({
        where: { email: String(u.email).toLowerCase() },
        select: { id: true },
      });
      if (pu) actorId = pu.id;
    }
    const created = await reissueInvoice({
      invoiceId: invoice.id,
      actorId,
      actorType: 'TENANT',
    });
    return apiOk({ invoice: shapeInvoice(created) }, 201);
  } catch (e: any) {
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menerbitkan ulang invoice.', 500);
  }
}
