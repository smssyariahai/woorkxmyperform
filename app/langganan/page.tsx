import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { resolveOwnSubscription, getSubscriptionLifecycle } from '@/lib/tenant/subscription-lifecycle';
import { getLatestUnpaidInvoice } from '@/lib/tenant/subscription-automation';
import { getBankAccounts } from '@/lib/tenant/bank-reconciliation';
import { Card, Badge } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';
import { formatIDR } from '@/lib/modular';
import { LanggananActions } from '@/components/langganan/LanggananActions';

/**
 * Halaman status langganan tenant (Fase 4 §7).
 *
 * PENTING — halaman ini BERDIRI SENDIRI di luar grup (dashboard): layout
 * dashboard memanggil getAuthContext() yang mengembalikan null untuk tenant
 * NONAKTIF (requireAuthTenant menolak), sehingga halaman di dalam grup itu
 * tidak pernah bisa dibuka oleh pengguna NONAKTIF — audiens utama halaman
 * ini. Di sini auth dilakukan via auth() mentah + resolveOwnSubscription
 * (sesi → PlatformUser → membership → tenant + subscription, tanpa tenant
 * context). Bila tidak ada sesi → /login. URL tetap /langganan.
 */

const LIFECYCLE_LABELS: Record<string, string> = {
  TRIAL: 'Trial',
  AKTIF: 'Aktif',
  MENUNGGAK: 'Menunggak',
  DITANGGUHKAN: 'Ditangguhkan',
  NONAKTIF: 'Nonaktif',
  DIHAPUS: 'Dihapus',
};

type BadgeTone = 'green' | 'amber' | 'blue' | 'red' | 'gray';

function lifecycleBadge(status: string): { tone: BadgeTone; label: string } {
  // Catatan: sistem Badge hanya punya 5 tone (tanpa oranye).
  switch (status) {
    case 'TRIAL':
      return { tone: 'blue', label: 'Trial' };
    case 'AKTIF':
      return { tone: 'green', label: 'Aktif' };
    case 'MENUNGGAK':
      return { tone: 'amber', label: 'Menunggak' };
    case 'DITANGGUHKAN':
      return { tone: 'red', label: 'Ditangguhkan' };
    case 'NONAKTIF':
      return { tone: 'gray', label: 'Nonaktif' };
    case 'DIHAPUS':
      return { tone: 'red', label: 'Dihapus' };
    default:
      return { tone: 'gray', label: status };
  }
}

function daysLeft(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function hoursLeft(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 3600000));
}

function invoiceTotal(inv: any): number {
  if (typeof inv?.transferTotal === 'number') return inv.transferTotal;
  return (inv?.baseAmount ?? 0) + (inv?.ppnAmount ?? 0) + (inv?.uniqueCode ?? 0);
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-[13.5px] font-medium text-ink mt-0.5 break-words">{value}</p>
    </div>
  );
}

export default async function LanggananPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const own = await resolveOwnSubscription(session.user as { id?: string | null; email?: string | null });

  // Bukan sesi tenant (mis. Administrator Pusat / pengguna legacy): tidak ada
  // langganan tenant untuk ditampilkan.
  if (!own) {
    return (
      <div className="max-w-[860px] mx-auto space-y-5 px-4 py-8">
        <h1 className="text-[22px] font-bold text-ink">Langganan</h1>
        <Card>
          <p className="text-sm text-muted py-4 text-center">
            Halaman ini hanya untuk pengguna tenant. Akun Anda tidak terikat ke tenant mana pun.
          </p>
        </Card>
      </div>
    );
  }

  let lifecycle: Awaited<ReturnType<typeof getSubscriptionLifecycle>> | null = null;
  let loadError = '';
  try {
    lifecycle = await getSubscriptionLifecycle(own.tenant.id);
  } catch (e: any) {
    loadError = e?.message || 'Gagal memuat status langganan.';
  }

  const subscription: any = (lifecycle as any)?.subscription ?? own.subscription ?? null;
  const tenant: any = (lifecycle as any)?.tenant ?? own.tenant ?? null;

  if (loadError || !subscription) {
    return (
      <div className="max-w-[860px] mx-auto space-y-5 px-4 py-8">
        <h1 className="text-[22px] font-bold text-ink">Langganan</h1>
        <Card>
          <p className="text-sm text-danger py-4 text-center">{loadError || 'Data langganan tidak ditemukan.'}</p>
        </Card>
      </div>
    );
  }

  const status = String(subscription.lifecycleStatus ?? '');
  const lb = lifecycleBadge(status);
  const isOwner = own.isOwner;
  const retentionLeft = daysLeft(subscription.retentionEndsAt);
  const snap = (subscription as any).packageSnapshotJson;
  const snapObj = typeof snap === 'string' ? (() => { try { return JSON.parse(snap); } catch { return null; } })() : (snap ?? null);

  // Tagihan perpanjangan terbaru yang belum dibayar (Fase 5 §7.7) — via lib
  // otomasi, BUKAN fetch API sendiri. Bila gagal dimuat, kartu disembunyikan.
  let unpaidInvoice: any = null;
  try {
    unpaidInvoice = await getLatestUnpaidInvoice(own.tenant.id);
  } catch {
    unpaidInvoice = null;
  }
  const invoiceHoursLeft = unpaidInvoice ? hoursLeft(unpaidInvoice.validUntil) : null;

  // Rekening penampung yang nomornya sudah diisi Master (Fase 6 §9.5) —
  // via lib, BUKAN fetch API sendiri. Bila gagal dimuat, daftar disembunyikan.
  let bankAccounts: any[] = [];
  try {
    bankAccounts = await getBankAccounts({ onlyFilled: true });
  } catch {
    bankAccounts = [];
  }

  return (
    <div className="max-w-[860px] mx-auto space-y-5 px-4 py-8">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Langganan</h1>
        <p className="text-sm text-muted">
          {tenant?.companyName} · <code className="bg-canvas px-1.5 py-0.5 rounded text-[12.5px]">{tenant?.tenantCode}</code>
        </p>
      </div>

      <Card className="!p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink">Status Langganan</h2>
          <Badge tone={lb.tone}>{lb.label}</Badge>
        </div>

        {subscription.lifecycleReason && (
          <p className="mt-3 text-[13.5px] text-ink">
            <span className="text-muted">Alasan: </span>
            {subscription.lifecycleReason}
          </p>
        )}

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Fact
            label="Paket"
            value={
              snapObj
                ? `${snapObj.userTier?.name ?? '—'} · ${snapObj.storageTier?.name ?? '—'}${snapObj.modules?.length ? ` · ${(snapObj.modules as any[]).map((m: any) => m.name).join(', ')}` : ''}`
                : '—'
            }
          />
          <Fact label="Siklus Penagihan" value={subscription.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'} />
          <Fact label="Trial Berakhir" value={subscription.trialEndsAt ? formatDateTime(subscription.trialEndsAt) : '—'} />
          <Fact label="Periode Berakhir" value={subscription.currentPeriodEndsAt ? formatDateTime(subscription.currentPeriodEndsAt) : '—'} />
          {subscription.retentionStartsAt && (
            <Fact label="Retensi Dimulai" value={formatDateTime(subscription.retentionStartsAt)} />
          )}
          {subscription.retentionEndsAt && (
            <Fact
              label="Retensi Berakhir"
              value={`${formatDateTime(subscription.retentionEndsAt)}${retentionLeft != null ? ` (sisa ${retentionLeft} hari)` : ''}`}
            />
          )}
        </div>

        {status === 'NONAKTIF' && retentionLeft != null && (
          <div className="mt-4 rounded-btn border border-line bg-canvas px-4 py-3">
            <p className="text-[13.5px] font-semibold text-ink">
              {retentionLeft > 0
                ? `Masa retensi tersisa ${retentionLeft} hari.`
                : 'Masa retensi sudah habis.'}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {retentionLeft > 0
                ? 'Selama masa retensi Anda masih bisa mengunduh data perusahaan di bawah ini. Setelah retensi habis dan dikonfirmasi Administrator Pusat, data dihapus permanen.'
                : 'Setelah dikonfirmasi Administrator Pusat, data perusahaan akan dihapus permanen.'}
            </p>
          </div>
        )}

        {status === 'DITANGGUHKAN' && (
          <div className="mt-4 rounded-btn border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-[13.5px] text-amber-900">
              Langganan Anda ditangguhkan. Pengguna Standar tidak bisa masuk ke workspace sampai langganan diaktifkan kembali.
              Hubungi Administrator Pusat bila ada pertanyaan.
            </p>
          </div>
        )}

        {status === 'DIHAPUS' && (
          <p className="mt-4 text-[13.5px] text-danger">
            Langganan ini sudah dihapus permanen. Info perusahaan disimpan 1 tahun sejak penghapusan.
          </p>
        )}
      </Card>

      {unpaidInvoice && (
        <Card className="!p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink">Tagihan Perpanjangan</h2>
            <Badge tone="amber">Belum Dibayar</Badge>
          </div>
          <p className="mt-3 text-[13.5px] text-ink">
            Nomor invoice: <span className="font-semibold">{unpaidInvoice.number}</span>
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            <Fact label="Dasar" value={formatIDR(unpaidInvoice.baseAmount ?? 0)} />
            <Fact label="PPN" value={formatIDR(unpaidInvoice.ppnAmount ?? 0)} />
            <Fact label="Kode unik" value={String(unpaidInvoice.uniqueCode ?? '—')} />
            <Fact label="Total transfer" value={formatIDR(invoiceTotal(unpaidInvoice))} />
            <Fact
              label="Periode"
              value={
                unpaidInvoice.periodStart && unpaidInvoice.periodEnd
                  ? `${formatDateTime(unpaidInvoice.periodStart)} – ${formatDateTime(unpaidInvoice.periodEnd)}`
                  : '—'
              }
            />
            <Fact
              label="Batas berlaku"
              value={
                unpaidInvoice.validUntil
                  ? `${formatDateTime(unpaidInvoice.validUntil)}${invoiceHoursLeft != null ? ` (sisa ~${invoiceHoursLeft} jam)` : ''}`
                  : '—'
              }
            />
          </div>
          {bankAccounts.length > 0 && (
            <div className="mt-3">
              <p className="text-[12px] text-muted">Transfer ke salah satu rekening penampung:</p>
              <ul className="mt-1 space-y-1 text-[13.5px] text-ink">
                {bankAccounts.map((a: any) => (
                  <li key={a.bankCode}>
                    <span className="font-medium">{a.bankName ?? a.bankCode}</span> — {a.accountNumber}
                    {a.accountHolderName ? ` (a.n. ${a.accountHolderName})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[13px] text-muted">
            Transfer total persis yang tertera di atas. Setelah batas berlaku lewat tanpa
            pembayaran, invoice kedaluwarsa dan tidak diterbitkan ulang otomatis; tagihan
            baru dapat dibuat dari halaman penagihan.
          </p>
          <p className="mt-2 text-[13.5px]">
            <a href="/langganan/tagihan" className="text-brand underline font-medium">
              Lihat Semua Tagihan
            </a>
          </p>
        </Card>
      )}

      <Card className="!p-5">
        <h2 className="text-[15px] font-bold text-ink">Aksi</h2>
        <div className="mt-3">
          <LanggananActions lifecycleStatus={status} isOwner={isOwner} />
        </div>
        <p className="mt-3 text-[13.5px]">
          <a href="/langganan/tagihan" className="text-brand underline font-medium">
            Lihat Semua Tagihan
          </a>
          <span className="text-muted"> — daftar invoice, saldo kredit, dan rekening penampung.</span>
        </p>
      </Card>
    </div>
  );
}
