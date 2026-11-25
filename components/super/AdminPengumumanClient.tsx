'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  Check,
  ChevronDown,
  Megaphone,
  Send,
  Users,
} from 'lucide-react';
import { Badge, Card, CardTitle } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { formatTanggalJam } from '@/lib/pengumuman/client';

// Halaman Pengumuman Platform (admin pusat) — kirim satu pengumuman ke semua
// tenant aktif, ke tenant dengan paket tertentu, atau ke tenant tertentu.
// Per tenant tujuan dibuat satu baris Announcement di DB tenant-nya
// (author = admin pusat yang login) lalu di-fan-out seperti publish
// per-kantor. Satu batch id (UUID) disimpan di filters tiap baris
// ({ platform: true, platformBatchId }) sebagai jejak pengiriman per tenant.

type Priority = 'normal' | 'penting' | 'mendesak';

interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  memberCount: number;
}

interface CatalogTier {
  id: string;
  name: string;
}

interface CatalogModule {
  id: string;
  moduleKey: string;
  name: string;
}

interface BatchOrg {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  announcementId: string | null;
  status: string;
  sentAt: string | null;
  recipientCount: number;
  emailStatus: string;
  error: string | null;
}

interface Batch {
  batchId: string;
  title: string;
  summary: string;
  priority: string;
  targetType: string;
  authorName: string;
  createdAt: string;
  sentAt: string | null;
  totalKantor: number;
  terkirim: number;
  gagal: number;
  dilewati: number;
  orgs: BatchOrg[];
}

interface SendResult {
  batchId: string;
  title: string;
  alreadySent: boolean;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  normal: 'Normal',
  penting: 'Penting',
  mendesak: 'Mendesak',
};

const PRIORITY_TONE: Record<Priority, 'red' | 'amber' | 'gray'> = {
  mendesak: 'red',
  penting: 'amber',
  normal: 'gray',
};

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data ?? body;
}

const EMPTY_FORM = {
  title: '',
  summary: '',
  content: '',
  priority: 'normal' as Priority,
  channelApp: true,
  channelEmail: false,
};

export function AdminPengumumanClient() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [targetMode, setTargetMode] = useState<'all' | 'package' | 'selected'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [userTiers, setUserTiers] = useState<CatalogTier[]>([]);
  const [storageTiers, setStorageTiers] = useState<CatalogTier[]>([]);
  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [pkgUserTierId, setPkgUserTierId] = useState('');
  const [pkgStorageTierId, setPkgStorageTierId] = useState('');
  const [pkgModuleKey, setPkgModuleKey] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson('/api/admin/pengumuman');
      setTenants(data.tenants ?? []);
      setBatches(data.batches ?? []);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
    // Katalog paket untuk penargetan paket — gagal dimuat (mis. tanpa akses
    // Paket & Harga) tidak menggagalkan halaman; mode paket dinonaktifkan.
    try {
      const catalog = await apiJson('/api/super/pricing/catalog');
      setUserTiers(catalog.userTiers ?? []);
      setStorageTiers(catalog.storageTiers ?? []);
      setModules(catalog.modules ?? []);
      setCatalogError(false);
    } catch {
      setCatalogError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCount = useMemo(
    () =>
      targetMode === 'all'
        ? tenants.length
        : targetMode === 'selected'
          ? selectedIds.filter((id) => tenants.some((o) => o.id === id)).length
          : 0,
    [targetMode, tenants, selectedIds]
  );

  function toggleTenant(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Judul pengumuman wajib diisi.');
      return;
    }
    if (targetMode === 'selected' && selectedIds.length === 0) {
      toast.error('Pilih minimal satu tenant tujuan.');
      return;
    }
    if (
      targetMode === 'package' &&
      !pkgUserTierId &&
      !pkgStorageTierId &&
      !pkgModuleKey
    ) {
      toast.error('Pilih minimal satu filter paket.');
      return;
    }
    setSending(true);
    try {
      // batchId per pengiriman: retry request yang sama tidak menduplikasi batch.
      const batchId = crypto.randomUUID();
      const target =
        targetMode === 'all'
          ? 'all'
          : targetMode === 'package'
            ? {
                package: {
                  ...(pkgUserTierId ? { userTierId: pkgUserTierId } : {}),
                  ...(pkgStorageTierId ? { storageTierId: pkgStorageTierId } : {}),
                  ...(pkgModuleKey ? { moduleKey: pkgModuleKey } : {}),
                },
              }
            : { tenantIds: selectedIds };
      const result = (await apiJson('/api/admin/pengumuman', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim(),
          content: form.content,
          priority: form.priority,
          category: 'announcement',
          channels: { app: form.channelApp, email: form.channelEmail },
          target,
          batchId,
        }),
      })) as SendResult;
      if (result.alreadySent) {
        toast.info('Pengumuman ini sudah pernah dikirim sebelumnya.');
      } else if (result.failedCount > 0) {
        toast.warning(
          `Terkirim ke ${result.sentCount} tenant, ${result.failedCount} tenant gagal. Periksa rincian di bawah.`
        );
      } else {
        toast.success(
          `Pengumuman terkirim ke ${result.sentCount} tenant.`
        );
      }
      setForm(EMPTY_FORM);
      setTargetMode('all');
      setSelectedIds([]);
      setPkgUserTierId('');
      setPkgStorageTierId('');
      setPkgModuleKey('');
      setExpanded(result.batchId);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengirim pengumuman platform.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <Megaphone className="h-5 w-5" />
          Pengumuman Platform
        </h1>
        <p className="mt-1 text-sm text-muted">
          Kirim pengumuman ke semua tenant aktif, ke tenant dengan paket
          tertentu, atau ke tenant tertentu. Setiap tenant menerima satu
          pengumuman di daftar pengumumannya dan notifikasi untuk seluruh
          anggotanya. Pengumuman hanya muncul di tenant yang ditarget.
        </p>
      </div>

      <Card>
        <CardTitle>Tulis Pengumuman</CardTitle>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Judul <span className="text-red-600">*</span>
            </label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Contoh: Pemeliharaan sistem hari Minggu"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Ringkasan
            </label>
            <Input
              value={form.summary}
              maxLength={160}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Ringkasan singkat (maks 160 karakter, tampil di notifikasi)"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Isi Pengumuman
            </label>
            <textarea
              value={form.content}
              rows={5}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Tulis isi pengumuman di sini..."
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                Kategori
              </label>
              <select
                value="announcement"
                disabled
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="announcement">Pengumuman</option>
              </select>
              <p className="mt-1 text-xs text-muted">
                Saat ini hanya kategori Pengumuman yang didukung alur
                per-kantor.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                Prioritas
              </label>
              <div className="flex gap-1 rounded-lg border border-line bg-surface-muted p-1">
                {(['normal', 'penting', 'mendesak'] as Priority[]).map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, priority: p })}
                      className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${
                        form.priority === p
                          ? 'bg-surface text-ink shadow-sm'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Kanal
            </label>
            <div className="flex flex-wrap gap-4 text-sm text-ink">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.channelApp}
                  onChange={(e) =>
                    setForm({ ...form, channelApp: e.target.checked })
                  }
                />
                Notifikasi aplikasi
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.channelEmail}
                  onChange={(e) =>
                    setForm({ ...form, channelEmail: e.target.checked })
                  }
                />
                Email (bila SMTP dikonfigurasi)
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Tenant Tujuan
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTargetMode('all')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  targetMode === 'all'
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                <Users className="mr-1 inline h-4 w-4" />
                Semua tenant aktif ({tenants.length})
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('package')}
                disabled={catalogError}
                title={
                  catalogError
                    ? 'Katalog paket tidak bisa dimuat (butuh akses Paket & Harga).'
                    : undefined
                }
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                  targetMode === 'package'
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                <Building2 className="mr-1 inline h-4 w-4" />
                Paket tertentu
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('selected')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  targetMode === 'selected'
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                <Building2 className="mr-1 inline h-4 w-4" />
                Pilih tenant tertentu
              </button>
            </div>
            {targetMode === 'package' && (
              <div className="mt-3 grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">
                    Tier pengguna
                  </label>
                  <select
                    value={pkgUserTierId}
                    onChange={(e) => setPkgUserTierId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none"
                  >
                    <option value="">Semua tier</option>
                    {userTiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">
                    Tier storage
                  </label>
                  <select
                    value={pkgStorageTierId}
                    onChange={(e) => setPkgStorageTierId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none"
                  >
                    <option value="">Semua tier</option>
                    {storageTiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">
                    Modul
                  </label>
                  <select
                    value={pkgModuleKey}
                    onChange={(e) => setPkgModuleKey(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none"
                  >
                    <option value="">Semua modul</option>
                    {modules.map((m) => (
                      <option key={m.moduleKey} value={m.moduleKey}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted sm:col-span-3">
                  Tenant lama yang paketnya belum tercatat tidak ikut target
                  paket. Filter yang diisi harus cocok semua.
                </p>
              </div>
            )}
            {targetMode === 'selected' && (
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                {tenants.length === 0 && (
                  <p className="p-2 text-sm text-muted">
                    Tidak ada tenant aktif.
                  </p>
                )}
                {tenants.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(o.id)}
                      onChange={() => toggleTenant(o.id)}
                    />
                    <span className="flex-1">{o.name}</span>
                    <span className="text-xs text-muted">
                      {o.tenantCode} · {o.memberCount} anggota
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending || tenants.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending
                ? 'Mengirim…'
                : targetMode === 'all'
                  ? `Kirim ke Semua Tenant (${tenants.length})`
                  : targetMode === 'package'
                    ? 'Kirim ke Tenant Paket Terpilih'
                    : `Kirim ke ${selectedCount} Tenant`}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Riwayat Pengumuman Platform</CardTitle>
        {batches.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Belum ada pengumuman platform"
              description="Pengumuman yang Anda kirim ke tenant-tenant akan tampil di sini beserta status terkirim per tenant."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {batches.map((b) => {
              const isOpen = expanded === b.batchId;
              return (
                <div
                  key={b.batchId}
                  className="rounded-lg border border-line"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(isOpen ? null : b.batchId)
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-ink">
                          {b.title}
                        </span>
                        <Badge tone={PRIORITY_TONE[b.priority as Priority] ?? 'gray'}>
                          {PRIORITY_LABEL[b.priority as Priority] ?? b.priority}
                        </Badge>
                        <Badge tone="gray">
                          {b.targetType === 'ALL'
                            ? 'Semua tenant'
                            : b.targetType === 'PACKAGE'
                              ? 'Paket tertentu'
                              : 'Tenant tertentu'}
                        </Badge>
                        {b.dilewati > 0 && (
                          <Badge tone="amber">
                            {b.dilewati} dilewati
                          </Badge>
                        )}
                        {b.gagal > 0 ? (
                          <Badge tone="amber">
                            {b.terkirim}/{b.totalKantor} terkirim
                          </Badge>
                        ) : (
                          <Badge tone="green">
                            {b.terkirim}/{b.totalKantor} terkirim
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        oleh {b.authorName || '-'} ·{' '}
                        {formatTanggalJam(b.createdAt)}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-line px-4 py-3">
                      {b.summary && (
                        <p className="mb-3 text-sm text-muted">{b.summary}</p>
                      )}
                      <ul className="space-y-1.5">
                        {b.orgs.map((o) => (
                          <li
                            key={o.tenantId}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            {o.status === 'published' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : o.status === 'skipped' ? (
                              <span className="h-4 w-4 text-center text-muted">
                                –
                              </span>
                            ) : (
                              <span className="h-4 w-4 text-center text-amber-600">
                                !
                              </span>
                            )}
                            <span className="font-medium text-ink">
                              {o.tenantName}
                            </span>
                            <span className="text-xs text-muted">
                              {o.tenantCode}
                            </span>
                            {o.status === 'published' ? (
                              <>
                                <Badge tone="green">Terkirim</Badge>
                                <span className="text-xs text-muted">
                                  {formatTanggalJam(o.sentAt)} ·{' '}
                                  {o.recipientCount} penerima
                                  {o.emailStatus !== 'not_requested'
                                    ? ` · email: ${o.emailStatus}`
                                    : ''}
                                </span>
                              </>
                            ) : o.status === 'skipped' ? (
                              <>
                                <Badge tone="gray">Dilewati</Badge>
                                {o.error && (
                                  <span className="text-xs text-muted">
                                    {o.error}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <Badge tone="amber">Belum terkirim</Badge>
                                {o.error && (
                                  <span className="text-xs text-red-600">
                                    {o.error}
                                  </span>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
