'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { Activity, ArrowLeft, Database, Download, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIDR } from '@/lib/modular';
import { apiJson } from '@/lib/calendar/client';

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function tenantStatusBadge(status: string): { tone: 'green' | 'amber' | 'red' | 'gray'; label: string } {
  switch (status) {
    case 'ACTIVE':
      return { tone: 'green', label: 'Aktif' };
    case 'PENDING_PROVISIONING':
      return { tone: 'amber', label: 'Menunggu Provisioning' };
    case 'SUSPENDED':
      return { tone: 'red', label: 'Suspended' };
    case 'FAILED':
      return { tone: 'red', label: 'Gagal' };
    default:
      return { tone: 'gray', label: status };
  }
}

function dbStatusBadge(status: string): { tone: 'green' | 'amber' | 'red' | 'gray'; label: string } {
  switch (status) {
    case 'ACTIVE':
      return { tone: 'green', label: 'Aktif' };
    case 'PROVISIONING':
      return { tone: 'amber', label: 'Provisioning' };
    case 'FAILED':
      return { tone: 'red', label: 'Gagal' };
    default:
      return { tone: 'gray', label: status || '—' };
  }
}

function connBadge(status: string | null | undefined): { tone: 'green' | 'amber' | 'red' | 'gray'; label: string } {
  switch (status) {
    case 'HEALTHY':
      return { tone: 'green', label: 'Sehat' };
    case 'UNHEALTHY':
      return { tone: 'red', label: 'Tidak Sehat' };
    case 'PROVISIONING':
      return { tone: 'amber', label: 'Provisioning' };
    default:
      return { tone: 'gray', label: status || '—' };
  }
}

function jobBadge(status: string): { tone: 'green' | 'amber' | 'red' | 'gray'; label: string } {
  switch (status) {
    case 'SUCCEEDED':
      return { tone: 'green', label: 'Berhasil' };
    case 'FAILED':
      return { tone: 'red', label: 'Gagal' };
    case 'RUNNING':
      return { tone: 'amber', label: 'Berjalan' };
    case 'PENDING':
      return { tone: 'gray', label: 'Menunggu' };
    default:
      return { tone: 'gray', label: status };
  }
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-[13.5px] font-medium text-ink mt-0.5 break-words">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Siklus hidup langganan (Fase 4 §5.5 + 7.4)                         */
/* ------------------------------------------------------------------ */

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
  // Catatan: sistem Badge hanya punya 5 tone (tanpa oranye) — DITANGGUHKAN
  // memakai merah seperti DIHAPUS; keduanya dibedakan lewat label.
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

function parseSnapshot(raw: any): any {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

type SubPanel = null | 'package' | 'extend' | 'suspend' | 'reactivate' | 'deactivate' | 'delete';

function SubscriptionSection({
  tenantId,
  tenantCode,
  companyName,
  onTenantChanged,
}: {
  tenantId: string;
  tenantCode: string;
  companyName: string;
  onTenantChanged: () => void;
}) {
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState<SubPanel>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(30);
  const [catalog, setCatalog] = useState<any>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pkgUserTier, setPkgUserTier] = useState('');
  const [pkgStorageTier, setPkgStorageTier] = useState('');
  const [pkgModules, setPkgModules] = useState<string[]>([]);

  const loadSub = useCallback(async () => {
    try {
      const j = await apiJson<any>(`/api/super/tenants/${tenantId}/subscription`);
      setSub(j);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat langganan.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadSub();
  }, [loadSub]);

  function openPanel(p: SubPanel) {
    setPanel(p);
    setReason('');
  }

  async function postSub(path: string, body: any, okMsg: string) {
    setBusy(path);
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Aksi gagal.');
      toast.success(okMsg);
      if (j.data?.packageSyncWarning) {
        toast.error(`Peringatan sinkronisasi modul: ${j.data.packageSyncWarning}`);
      }
      setPanel(null);
      setReason('');
      await loadSub();
      onTenantChanged();
    } catch (e: any) {
      toast.error(e.message || 'Aksi gagal.');
    } finally {
      setBusy('');
    }
  }

  function requireReason(): boolean {
    if (reason.trim().length < 10) {
      toast.error('Alasan wajib diisi minimal 10 karakter.');
      return false;
    }
    return true;
  }

  async function openPackagePanel() {
    openPanel('package');
    const s = sub?.subscription;
    setPkgUserTier(s?.userTierId ?? '');
    setPkgStorageTier(s?.storageTierId ?? '');
    setPkgModules(Array.isArray(s?.moduleKeys) ? [...s.moduleKeys] : []);
    if (!catalog) {
      setCatalogLoading(true);
      try {
        const c = await apiJson<any>('/api/super/pricing/catalog');
        setCatalog(c);
      } catch (e: any) {
        toast.error(e.message || 'Gagal memuat katalog paket.');
      } finally {
        setCatalogLoading(false);
      }
    }
  }

  function toggleModule(key: string) {
    setPkgModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function savePackage() {
    if (!pkgUserTier || !pkgStorageTier) {
      toast.error('Pilih tier pengguna dan tier storage.');
      return;
    }
    await postSub(
      `/api/super/tenants/${tenantId}/subscription/change-package`,
      { userTierId: pkgUserTier, storageTierId: pkgStorageTier, moduleKeys: pkgModules },
      `Paket langganan "${companyName}" diubah.`,
    );
  }

  async function saveExtend() {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      toast.error('Jumlah hari harus 1–365.');
      return;
    }
    await postSub(
      `/api/super/tenants/${tenantId}/subscription/extend`,
      { days: n },
      `Masa aktif "${companyName}" diperpanjang ${n} hari.`,
    );
  }

  async function confirmDeletion() {
    if (!requireReason()) return;
    // Pola restore yang sudah ada di file ini: ketik kode tenant via prompt().
    const code = prompt(
      `Hapus PERMANEN tenant "${companyName}"?\n\nDatabase, role database, dan file backup tenant ini akan DIHAPUS dan tidak bisa dipulihkan. Ketik persis kode tenant "${tenantCode}" untuk mengonfirmasi:`,
    );
    if (code === null) return;
    if (code !== tenantCode) {
      toast.info('Penghapusan dibatalkan — kode konfirmasi tidak cocok.');
      return;
    }
    await postSub(
      `/api/super/tenants/${tenantId}/subscription/confirm-deletion`,
      { reason: reason.trim(), confirmCode: code },
      `Tenant "${companyName}" dihapus permanen.`,
    );
  }

  const s = sub?.subscription;
  const snap = parseSnapshot(s?.packageSnapshot);
  const lb = lifecycleBadge(s?.lifecycleStatus ?? '');
  const history: any[] = sub?.history || [];
  const retentionLeft = daysLeft(s?.retentionEndsAt);
  const status = s?.lifecycleStatus as string | undefined;

  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-ink">Langganan</h2>
        {s && <Badge tone={lb.tone}>{lb.label}</Badge>}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted text-center py-4">Memuat langganan…</p>
      ) : error || !s ? (
        <div className="mt-3">
          <p className="text-sm text-danger">{error || 'Data langganan tidak ditemukan.'}</p>
          <button
            onClick={() => {
              setLoading(true);
              loadSub();
            }}
            className="btn-secondary !py-2 text-[13px] mt-3"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <Fact
              label="Paket"
              value={
                snap ? (
                  <span>
                    {snap.userTier?.name ?? '—'}
                    {' · '}
                    {snap.storageTier?.name ?? '—'}
                    {snap.modules?.length ? ` · ${(snap.modules as any[]).map((m: any) => m.name).join(', ')}` : ''}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Fact
              label="Harga"
              value={
                snap && snap.basePrice != null
                  ? `${formatIDR(snap.basePrice)} / ${s?.billingCycle === 'YEARLY' ? 'tahun' : 'bulan'}${snap.hasCustomPrice ? ' (ada harga khusus)' : ''}`
                  : '—'
              }
            />
            <Fact label="Siklus Penagihan" value={s.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'} />
            <Fact label="Kuota Pengguna" value={`${s.userQuota ?? '—'} user`} />
            <Fact label="Trial Berakhir" value={fmtDateTime(s.trialEndsAt)} />
            <Fact label="Periode Berakhir" value={fmtDateTime(s.currentPeriodEndsAt)} />
            {s.retentionStartsAt && (
              <Fact label="Retensi Dimulai" value={fmtDateTime(s.retentionStartsAt)} />
            )}
            {s.retentionEndsAt && (
              <Fact
                label="Retensi Berakhir"
                value={`${fmtDateTime(s.retentionEndsAt)}${retentionLeft != null ? ` (sisa ${retentionLeft} hari)` : ''}`}
              />
            )}
          </div>
          {s.lifecycleReason && (
            <p className="mt-3 text-[13px] text-muted">
              Alasan terakhir: <span className="text-ink">{s.lifecycleReason}</span>
            </p>
          )}
          {status === 'DIHAPUS' && (
            <p className="mt-3 text-[13px] text-danger">
              Tenant ini sudah dihapus permanen (tombstone). Info perusahaan disimpan 1 tahun sejak penghapusan.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {(status === 'TRIAL' || status === 'AKTIF' || status === 'MENUNGGAK') && (
              <>
                <button onClick={openPackagePanel} disabled={busy !== ''} className="btn-secondary !py-2 text-[13px] disabled:opacity-50">
                  Ubah Paket
                </button>
                <button onClick={() => openPanel('extend')} disabled={busy !== ''} className="btn-secondary !py-2 text-[13px] disabled:opacity-50">
                  Perpanjang
                </button>
                <button onClick={() => openPanel('suspend')} disabled={busy !== ''} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
                  Tangguhkan
                </button>
                <button onClick={() => openPanel('deactivate')} disabled={busy !== ''} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
                  Nonaktifkan
                </button>
              </>
            )}
            {status === 'DITANGGUHKAN' && (
              <>
                <button onClick={() => openPanel('reactivate')} disabled={busy !== ''} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                  Aktifkan Kembali
                </button>
                <button onClick={() => openPanel('deactivate')} disabled={busy !== ''} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
                  Nonaktifkan
                </button>
              </>
            )}
            {status === 'NONAKTIF' && (
              <>
                <button onClick={() => openPanel('reactivate')} disabled={busy !== ''} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                  Batalkan Penghentian
                </button>
                <button onClick={() => openPanel('delete')} disabled={busy !== ''} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
                  Konfirmasi Hapus
                </button>
              </>
            )}
          </div>

          {panel === 'package' && (
            <div className="mt-4 border border-line rounded-btn p-4 space-y-3">
              <h3 className="text-[13.5px] font-bold text-ink">Ubah Paket</h3>
              {catalogLoading ? (
                <p className="text-sm text-muted">Memuat katalog paket…</p>
              ) : catalog ? (
                <>
                  <div>
                    <label className="label">Tier Pengguna</label>
                    <select className="input" value={pkgUserTier} onChange={(e) => setPkgUserTier(e.target.value)}>
                      <option value="">— Pilih tier —</option>
                      {catalog.userTiers.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.maxUsers != null ? ` (s.d. ${t.maxUsers} user)` : ' (harga khusus)'}
                          {t.monthlyPrice != null ? ` — ${formatIDR(t.monthlyPrice)}/bln` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Tier Storage</label>
                    <select className="input" value={pkgStorageTier} onChange={(e) => setPkgStorageTier(e.target.value)}>
                      <option value="">— Pilih tier —</option>
                      {catalog.storageTiers.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.capacityGb != null ? ` (${t.capacityGb} GB)` : ' (harga khusus)'}
                          {t.monthlyPrice != null ? ` — ${formatIDR(t.monthlyPrice)}/bln` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Modul Berbayar</label>
                    <div className="space-y-1.5">
                      {catalog.modules.map((m: any) => (
                        <label key={m.moduleKey} className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pkgModules.includes(m.moduleKey)}
                            onChange={() => toggleModule(m.moduleKey)}
                            className="h-4 w-4 accent-brand"
                          />
                          {m.name} — {formatIDR(m.monthlyPrice)}/bln
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="text-[12px] text-muted">
                    Validasi minimum storage dan minimal 1 modul berbayar (untuk langganan berbayar) dilakukan server. Bila pemakaian saat ini
                    melebihi batas paket baru, perubahan tetap dicatat tanpa verifikasi pemakaian (pemakaian belum diukur di mana pun).
                  </p>
                </>
              ) : (
                <p className="text-sm text-danger">Katalog paket gagal dimuat.</p>
              )}
              <div className="flex gap-2">
                <button onClick={savePackage} disabled={busy !== '' || catalogLoading} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                  Simpan Paket
                </button>
                <button onClick={() => setPanel(null)} disabled={busy !== ''} className="btn-ghost !py-2 text-[13px] disabled:opacity-50">
                  Batal
                </button>
              </div>
            </div>
          )}

          {panel === 'extend' && (
            <div className="mt-4 border border-line rounded-btn p-4 space-y-3">
              <h3 className="text-[13.5px] font-bold text-ink">Perpanjang Masa Aktif</h3>
              <div>
                <label className="label">Jumlah hari (1–365)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </div>
              <p className="text-[12px] text-muted">
                Trial: tanggal akhir trial digeser. Langganan berbayar: akhir periode berjalan digeser.
              </p>
              <div className="flex gap-2">
                <button onClick={saveExtend} disabled={busy !== ''} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                  Perpanjang
                </button>
                <button onClick={() => setPanel(null)} disabled={busy !== ''} className="btn-ghost !py-2 text-[13px] disabled:opacity-50">
                  Batal
                </button>
              </div>
            </div>
          )}

          {(panel === 'suspend' || panel === 'reactivate' || panel === 'deactivate') && (
            <div className="mt-4 border border-line rounded-btn p-4 space-y-3">
              <h3 className="text-[13.5px] font-bold text-ink">
                {panel === 'suspend'
                  ? 'Tangguhkan Langganan'
                  : panel === 'reactivate'
                    ? status === 'NONAKTIF'
                      ? 'Batalkan Penghentian'
                      : 'Aktifkan Kembali'
                    : 'Nonaktifkan Langganan'}
              </h3>
              <div>
                <label className="label">Alasan (minimal 10 karakter)</label>
                <textarea
                  className="input min-h-[72px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    panel === 'suspend'
                      ? 'Contoh: Menunggak pembayaran 2 siklus dan tidak merespons pengingat.'
                      : panel === 'reactivate'
                        ? 'Contoh: Pembayaran sudah diterima, akses dipulihkan.'
                        : 'Contoh: Permintaan berhenti dari Client Admin, masa retensi dimulai.'
                  }
                />
              </div>
              {panel === 'deactivate' && (
                <p className="text-[12px] text-muted">
                  Tenant masuk masa retensi 60 hari: semua pengguna tidak bisa login ke workspace, tetapi Client Admin tetap bisa mengunduh
                  data dari halaman Langganan.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!requireReason()) return;
                    const path =
                      panel === 'suspend'
                        ? `/api/super/tenants/${tenantId}/subscription/suspend`
                        : panel === 'reactivate'
                          ? `/api/super/tenants/${tenantId}/subscription/reactivate`
                          : `/api/super/tenants/${tenantId}/subscription/deactivate`;
                    const okMsg =
                      panel === 'suspend'
                        ? `Langganan "${companyName}" ditangguhkan.`
                        : panel === 'reactivate'
                          ? `Langganan "${companyName}" diaktifkan kembali.`
                          : `Langganan "${companyName}" dinonaktifkan (retensi 60 hari).`;
                    postSub(path, { reason: reason.trim() }, okMsg);
                  }}
                  disabled={busy !== ''}
                  className={cn('!py-2 text-[13px] disabled:opacity-50', panel === 'reactivate' ? 'btn-primary' : 'btn-danger')}
                >
                  {panel === 'suspend' ? 'Tangguhkan' : panel === 'reactivate' ? 'Aktifkan' : 'Nonaktifkan'}
                </button>
                <button onClick={() => setPanel(null)} disabled={busy !== ''} className="btn-ghost !py-2 text-[13px] disabled:opacity-50">
                  Batal
                </button>
              </div>
            </div>
          )}

          {panel === 'delete' && (
            <div className="mt-4 border border-red-200 rounded-btn p-4 space-y-3">
              <h3 className="text-[13.5px] font-bold text-danger">Konfirmasi Penghapusan Permanen</h3>
              <p className="text-[13px] text-muted">
                Hanya bisa dilakukan bila masa retensi sudah habis
                {retentionLeft != null && retentionLeft > 0 ? ` (sisa ${retentionLeft} hari)` : ''}. Database, role database, dan file backup
                tenant akan dihapus dan tidak bisa dipulihkan. Baris tenant + langganan tetap tersimpan sebagai tombstone.
              </p>
              <div>
                <label className="label">Alasan (minimal 10 karakter)</label>
                <textarea
                  className="input min-h-[72px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Masa retensi 60 hari sudah habis, penghapusan disetujui."
                />
              </div>
              <p className="text-[12px] text-muted">Setelah klik Hapus Permanen, Anda diminta mengetik kode tenant sebagai konfirmasi.</p>
              <div className="flex gap-2">
                <button onClick={confirmDeletion} disabled={busy !== ''} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
                  Hapus Permanen
                </button>
                <button onClick={() => setPanel(null)} disabled={busy !== ''} className="btn-ghost !py-2 text-[13px] disabled:opacity-50">
                  Batal
                </button>
              </div>
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-[13.5px] font-bold text-ink">Riwayat Perubahan Status</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Belum ada riwayat perubahan status.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 pr-3 font-semibold">Tanggal</th>
                      <th className="py-2 pr-3 font-semibold">Perubahan</th>
                      <th className="py-2 pr-3 font-semibold">Alasan</th>
                      <th className="py-2 font-semibold">Oleh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h: any) => (
                      <tr key={h.id} className="border-b border-line last:border-0 align-top">
                        <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{fmtDateTime(h.createdAt)}</td>
                        <td className="py-2.5 pr-3">
                          {LIFECYCLE_LABELS[h.fromStatus] ?? h.fromStatus} → {LIFECYCLE_LABELS[h.toStatus] ?? h.toStatus}
                        </td>
                        <td className="py-2.5 pr-3 break-words">{h.reason || '—'}</td>
                        <td className="py-2.5 text-muted break-all">{h.changedByName ?? h.changedByUserId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function TenantDetailClient({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/super/tenants/${tenantId}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal memuat detail tenant.');
      setData(j.data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat detail tenant.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function postAction(path: string, key: string, okMsg: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(key);
    try {
      const r = await fetch(path, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Aksi gagal.');
      toast.success(okMsg);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Aksi gagal.');
    } finally {
      setBusy('');
    }
  }

  async function checkHealth() {
    setBusy('health');
    try {
      const r = await fetch(`/api/super/tenants/${tenantId}/health`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Cek kesehatan gagal.');
      const d = j.data;
      if (d.ok) {
        toast.success(`Database sehat (${d.tableCount ?? '?'} tabel, migrasi ${d.migrationVersion || '—'}).`);
      } else {
        const failed = (d.checks || []).filter((c: any) => !c.ok).map((c: any) => `${c.name}: ${c.detail}`).join(' | ');
        toast.error(`Database tidak sehat — ${failed || 'cek gagal'}.`);
      }
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Cek kesehatan gagal.');
    } finally {
      setBusy('');
    }
  }

  async function runMigrate() {
    await postAction(
      `/api/super/tenants/${tenantId}/migrate`,
      'migrate',
      'Migrasi database tenant selesai.',
      `Jalankan migrasi database tenant "${data?.companyName}" ke versi terbaru (${data?.latestMigrationVersion})?`,
    );
  }

  async function makeBackup() {
    await postAction(
      `/api/super/tenants/${tenantId}/backup`,
      'backup',
      'Backup database tenant berhasil dibuat.',
      `Buat backup database tenant "${data?.companyName}" sekarang?`,
    );
  }

  async function restoreBackup(filename: string) {
    const code = prompt(
      `Pulihkan database "${data?.companyName}" dari backup "${filename}"?\n\nSEMUA DATA SAAT INI di database tenant ini akan DIGANTI dengan isi backup. Ketik persis kode tenant "${data?.tenantCode}" untuk mengonfirmasi:`,
    );
    if (code === null) return;
    if (code !== data?.tenantCode) {
      toast.info('Restore dibatalkan — kode konfirmasi tidak cocok.');
      return;
    }
    setBusy(`restore:${filename}`);
    try {
      const r = await fetch(`/api/super/tenants/${tenantId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, confirmCode: code }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Restore gagal.');
      toast.success(`Database dipulihkan dari "${filename}" (migrasi ${j.data?.migrationVersion || '—'}).`);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Restore gagal.');
    } finally {
      setBusy('');
    }
  }

  async function toggleSuspend() {
    const suspending = data?.tenantStatus !== 'SUSPENDED';
    if (suspending) {
      await postAction(
        `/api/super/tenants/${tenantId}/suspend`,
        'suspend',
        `Tenant "${data?.companyName}" di-suspend.`,
        `Suspend tenant "${data?.companyName}"?\n\nPengguna tenant ini TIDAK BISA login sampai tenant diaktifkan kembali. Data tidak dihapus.`,
      );
    } else {
      await postAction(
        `/api/super/tenants/${tenantId}/reactivate`,
        'suspend',
        `Tenant "${data?.companyName}" diaktifkan kembali.`,
        `Aktifkan kembali tenant "${data?.companyName}"?`,
      );
    }
  }

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-5">
        <Card><p className="text-sm text-muted text-center py-8">Memuat detail tenant…</p></Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-5">
        <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar tenant
        </Link>
        <Card>
          <p className="text-sm text-danger text-center py-4">{error || 'Tenant tidak ditemukan.'}</p>
          <div className="text-center pb-4">
            <button onClick={() => { setLoading(true); load(); }} className="btn-secondary !py-2 text-[13px]">Coba Lagi</button>
          </div>
        </Card>
      </div>
    );
  }

  const ts = tenantStatusBadge(data.tenantStatus);
  const ds = dbStatusBadge(data.databaseStatus);
  const cs = connBadge(data.connectionStatus);
  const suspended = data.tenantStatus === 'SUSPENDED';
  const backups: any[] = data.backups || [];
  const jobs: any[] = data.jobs || [];

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke daftar tenant
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">{data.companyName}</h1>
          <p className="text-sm text-muted">
            <code className="bg-canvas px-1.5 py-0.5 rounded text-[12.5px]">{data.tenantCode}</code>
            {' · '}slug <span className="font-medium text-ink">{data.companySlug}</span>
            {' · '}dibuat {fmtDateTime(data.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={ts.tone}>{ts.label}</Badge>
          <Badge tone={ds.tone}>DB: {ds.label}</Badge>
          <Badge tone={cs.tone}>Koneksi: {cs.label}</Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="!p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink flex items-center gap-2"><Database className="h-4 w-4 text-muted" /> Database</h2>
            <button onClick={checkHealth} disabled={busy !== ''} className="btn-ghost !py-1.5 !px-3 text-[12px] disabled:opacity-50">
              <Activity className={cn('h-3.5 w-3.5', busy === 'health' && 'animate-pulse')} /> Cek Kesehatan
            </button>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <Fact label="Host" value={`${data.databaseHost}:${data.databasePort}`} />
            <Fact label="Nama Database" value={<code className="text-[12.5px]">{data.databaseName}</code>} />
            <Fact label="Status Koneksi" value={cs.label} />
            <Fact label="Cek Kesehatan Terakhir" value={fmtDateTime(data.lastHealthCheck)} />
            <Fact label="Jumlah Tabel" value={data.tableCount != null ? `${data.tableCount} tabel` : '— (database tidak terjangkau)'} />
            <Fact label="Jumlah User (Mirror)" value={data.userMirrorCount != null ? `${data.userMirrorCount} user` : '— (database tidak terjangkau)'} />
            <Fact label="Jumlah Membership (Master)" value={`${data.membershipCount ?? 0} membership`} />
            <Fact
              label="Versi Migrasi"
              value={
                <span className="inline-flex items-center gap-2">
                  <code className="text-[12.5px]">{data.migrationVersion || '—'}</code>
                  {data.isMigrationBehind ? (
                    <Badge tone="amber">Tertinggal</Badge>
                  ) : (
                    <Badge tone="green">Terbaru</Badge>
                  )}
                </span>
              }
            />
          </div>
          <p className="mt-3 text-[12px] text-muted">Versi migrasi terbaru: <code>{data.latestMigrationVersion || '—'}</code></p>
          {data.subscription && (
            <p className="mt-2 text-[12.5px] text-muted">
              Langganan{' '}
              <b className={data.subscription.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}>
                {data.subscription.status === 'ACTIVE' ? 'Aktif' : data.subscription.status}
              </b>
              {' · '}paket {data.subscription.plan}
              {' · '}{data.subscription.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'}
              {' · '}kuota {data.subscription.userQuota} user
              {data.subscription.trialEndsAt ? ` · trial s.d. ${fmtDateTime(data.subscription.trialEndsAt)}` : ''}
            </p>
          )}
          {data.isMigrationBehind && (
            <div className="mt-4">
              <button onClick={runMigrate} disabled={busy !== ''} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                <RotateCcw className="h-4 w-4" /> Jalankan Migrasi ke {data.latestMigrationVersion}
              </button>
            </div>
          )}
        </Card>

        <Card className="!p-5">
          <h2 className="text-[15px] font-bold text-ink">Provisioning</h2>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Belum ada job provisioning untuk tenant ini.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {jobs.map((j: any) => {
                const jb = jobBadge(j.status);
                return (
                  <div key={j.id} className="border border-line rounded-btn p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={jb.tone}>{jb.label}</Badge>
                      <span className="text-[12px] text-muted">{fmtDateTime(j.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-[13px] text-ink">
                      Langkah: <b>{j.step || '—'}</b>{' · '}percobaan: {j.attempts}
                      {j.finishedAt ? ` · selesai ${fmtDateTime(j.finishedAt)}` : ''}
                    </p>
                    {j.errorMessage && (
                      <p className="mt-1 text-[12.5px] text-danger break-words whitespace-pre-wrap">{j.errorMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="!p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink flex items-center gap-2"><Download className="h-4 w-4 text-muted" /> Backup Database</h2>
          <button onClick={makeBackup} disabled={busy !== ''} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
            Buat Backup
          </button>
        </div>
        {backups.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Belum ada backup untuk tenant ini.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 pr-3 font-semibold">File</th>
                  <th className="py-2 pr-3 font-semibold">Ukuran</th>
                  <th className="py-2 pr-3 font-semibold">Dibuat</th>
                  <th className="py-2 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b: any) => (
                  <tr key={b.filename} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3"><code className="text-[12px] break-all">{b.filename}</code></td>
                    <td className="py-2.5 pr-3 text-muted">{formatBytes(b.sizeBytes)}</td>
                    <td className="py-2.5 pr-3 text-muted">{fmtDateTime(b.createdAt)}</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => restoreBackup(b.filename)}
                        disabled={busy !== ''}
                        className="btn-ghost !py-1.5 !px-3 text-[12px] disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">
          Restore mengganti SELURUH isi database tenant ini dengan isi file backup, lalu menjalankan migrasi ke versi terbaru. Restore meminta kode tenant sebagai konfirmasi.
        </p>
      </Card>

      <SubscriptionSection tenantId={tenantId} tenantCode={data.tenantCode} companyName={data.companyName} onTenantChanged={load} />

      <Card className="!p-5 !border-red-200">
        <h2 className="text-[15px] font-bold text-danger">Zona Bahaya</h2>
        <p className="mt-2 text-[13px] text-muted">
          {suspended
            ? `Tenant "${data.companyName}" saat ini di-suspend: pengguna tenant TIDAK BISA login. Aktifkan kembali untuk memulihkan akses. Data tenant tidak dihapus.`
            : `Suspend tenant "${data.companyName}": pengguna tenant TIDAK BISA login sampai tenant diaktifkan kembali. Data tenant tidak dihapus.`}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Tidak ada tombol hapus database di halaman ini — penghapusan database tenant hanya boleh dilakukan lewat prosedur retensi/pemulihan yang disetujui administrator.
        </p>
        <div className="mt-4">
          <button
            onClick={toggleSuspend}
            disabled={busy !== ''}
            className={cn('!py-2 text-[13px] disabled:opacity-50', suspended ? 'btn-primary' : 'btn-danger')}
          >
            {suspended ? (<><Play className="h-4 w-4" /> Aktifkan Kembali Tenant</>) : (<><Pause className="h-4 w-4" /> Suspend Tenant</>)}
          </button>
        </div>
      </Card>
    </div>
  );
}
