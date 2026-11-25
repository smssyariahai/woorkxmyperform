'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { Search, Activity, RefreshCw, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

export function TenantsClient() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/super/tenants');
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal memuat daftar tenant.');
      setItems(j.data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat daftar tenant.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((t) =>
      [t.companyName, t.companySlug, t.tenantCode].some((v: string) => String(v || '').toLowerCase().includes(needle)),
    );
  }, [items, q]);

  async function postAction(path: string, key: string, okMsg: string) {
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

  async function checkHealth(t: any) {
    setBusy(`health:${t.id}`);
    try {
      const r = await fetch(`/api/super/tenants/${t.id}/health`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Cek kesehatan gagal.');
      const d = j.data;
      if (d.ok) {
        toast.success(`Database "${t.companyName}" sehat (${d.tableCount ?? '?'} tabel, migrasi ${d.migrationVersion || '—'}).`);
      } else {
        const failed = (d.checks || []).filter((c: any) => !c.ok).map((c: any) => c.name).join(', ');
        toast.error(`Database "${t.companyName}" tidak sehat: ${failed || 'cek gagal'}. Lihat detail tenant.`);
      }
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Cek kesehatan gagal.');
    } finally {
      setBusy('');
    }
  }

  async function retryProvision(t: any) {
    if (!confirm(`Ulangi provisioning untuk "${t.companyName}"?`)) return;
    await postAction(`/api/super/tenants/${t.id}/retry`, `retry:${t.id}`, `Provisioning "${t.companyName}" dimulai ulang.`);
  }

  async function toggleSuspend(t: any) {
    const suspending = t.tenantStatus !== 'SUSPENDED';
    if (suspending) {
      if (!confirm(`Suspend tenant "${t.companyName}"?\n\nPengguna tenant ini TIDAK BISA login sampai tenant diaktifkan kembali. Data tidak dihapus.`)) return;
      await postAction(`/api/super/tenants/${t.id}/suspend`, `suspend:${t.id}`, `Tenant "${t.companyName}" di-suspend.`);
    } else {
      if (!confirm(`Aktifkan kembali tenant "${t.companyName}"?`)) return;
      await postAction(`/api/super/tenants/${t.id}/reactivate`, `suspend:${t.id}`, `Tenant "${t.companyName}" diaktifkan kembali.`);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Tenant & Database</h1>
        <p className="text-sm text-muted">Kelola seluruh tenant (perusahaan) beserta database PostgreSQL masing-masing.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari perusahaan, slug, atau kode tenant…" className="!pl-9" />
      </div>

      {loading ? (
        <Card><p className="text-sm text-muted text-center py-8">Memuat daftar tenant…</p></Card>
      ) : error ? (
        <Card>
          <p className="text-sm text-danger text-center py-4">{error}</p>
          <div className="text-center pb-4">
            <button onClick={() => { setLoading(true); load(); }} className="btn-secondary !py-2 text-[13px]">Coba Lagi</button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card><p className="text-sm text-muted text-center py-8">{items.length === 0 ? 'Belum ada tenant.' : 'Tidak ada tenant yang cocok dengan pencarian.'}</p></Card>
      ) : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-4 py-3 font-semibold">Perusahaan</th>
                <th className="px-4 py-3 font-semibold">Tenant Code</th>
                <th className="px-4 py-3 font-semibold">Database</th>
                <th className="px-4 py-3 font-semibold">Status Tenant</th>
                <th className="px-4 py-3 font-semibold">Status DB</th>
                <th className="px-4 py-3 font-semibold">Migrasi</th>
                <th className="px-4 py-3 font-semibold">Kesehatan Terakhir</th>
                <th className="px-4 py-3 font-semibold">Langganan</th>
                <th className="px-4 py-3 font-semibold">Dibuat</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const ts = tenantStatusBadge(t.tenantStatus);
                const ds = dbStatusBadge(t.databaseStatus);
                const cs = connBadge(t.connectionStatus);
                const suspended = t.tenantStatus === 'SUSPENDED';
                return (
                  <tr key={t.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-3">
                      <Link href={`/admin/tenants/${t.id}`} className="block font-bold text-ink hover:text-brand">{t.companyName}</Link>
                      <span className="text-[12px] text-muted">{t.companySlug}</span>
                    </td>
                    <td className="px-4 py-3"><code className="text-[12px] bg-canvas px-1.5 py-0.5 rounded">{t.tenantCode}</code></td>
                    <td className="px-4 py-3">
                      <span className="block">{t.databaseName}</span>
                      <span className="text-[12px] text-muted">{t.databaseHost}:{t.databasePort}</span>
                    </td>
                    <td className="px-4 py-3"><Badge tone={ts.tone}>{ts.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge tone={ds.tone}>{ds.label}</Badge>
                        <Badge tone={cs.tone}>{cs.label}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[12px]">{t.migrationVersion || '—'}</code>
                    </td>
                    <td className="px-4 py-3 text-muted">{fmtDateTime(t.lastHealthCheck)}</td>
                    <td className="px-4 py-3 text-muted">—</td>
                    <td className="px-4 py-3 text-muted">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/admin/tenants/${t.id}`} className="btn-ghost !py-1.5 !px-3 text-[12px]">Detail</Link>
                        <button
                          onClick={() => checkHealth(t)}
                          disabled={busy !== ''}
                          title="Cek kesehatan database"
                          className="inline-flex items-center justify-center rounded-btn p-2 text-muted transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                        >
                          <Activity className={cn('h-4 w-4', busy === `health:${t.id}` && 'animate-pulse')} />
                        </button>
                        {t.tenantStatus !== 'ACTIVE' && (
                          <button
                            onClick={() => retryProvision(t)}
                            disabled={busy !== ''}
                            title="Ulangi provisioning"
                            className="inline-flex items-center justify-center rounded-btn p-2 text-muted transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleSuspend(t)}
                          disabled={busy !== ''}
                          title={suspended ? 'Aktifkan kembali' : 'Suspend tenant'}
                          className={cn(
                            'inline-flex items-center justify-center rounded-btn p-2 transition-colors disabled:opacity-50',
                            suspended ? 'text-muted hover:bg-emerald-50 hover:text-emerald-600' : 'text-muted hover:bg-red-50 hover:text-danger',
                          )}
                        >
                          {suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
