'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/input';
import { formatIDR } from '@/lib/modular';

type CatalogStatus = 'ACTIVE' | 'DISCONTINUED' | 'DELETED';

interface UserTier {
  id: string;
  name: string;
  maxUsers: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustomPrice: boolean;
  minStorageGb: number;
  status: CatalogStatus;
  sortOrder: number;
}

interface StorageTier {
  id: string;
  name: string;
  capacityGb: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustomPrice: boolean;
  status: CatalogStatus;
  sortOrder: number;
}

interface ModulePriceRow {
  id: string;
  moduleKey: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  status: CatalogStatus;
  sortOrder: number;
}

interface BillingSettings {
  ppnRateBps: number;
  invoiceValidityHours: number;
}

interface Catalog {
  userTiers: UserTier[];
  storageTiers: StorageTier[];
  modules: ModulePriceRow[];
  settings: BillingSettings;
}

type Tab = 'user' | 'storage' | 'modules' | 'settings';
type ModalKind = 'user' | 'storage' | 'module';

interface Draft {
  name: string;
  moduleKey: string;
  maxUsers: string;
  noMaxUsers: boolean;
  capacityGb: string;
  noCapacity: boolean;
  monthlyPrice: string;
  yearlyPrice: string;
  isCustomPrice: boolean;
  minStorageGb: string;
  sortOrder: string;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  moduleKey: '',
  maxUsers: '',
  noMaxUsers: false,
  capacityGb: '',
  noCapacity: false,
  monthlyPrice: '',
  yearlyPrice: '',
  isCustomPrice: false,
  minStorageGb: '100',
  sortOrder: '0',
};

function statusBadge(status: CatalogStatus) {
  if (status === 'ACTIVE') return <Badge tone="green">Aktif</Badge>;
  if (status === 'DISCONTINUED') return <Badge tone="amber">Dihentikan</Badge>;
  return <Badge tone="red">Dihapus</Badge>;
}

function priceCell(monthly: number | null, yearly: number | null) {
  if (monthly === null && yearly === null) {
    return <span className="text-muted italic">Harga khusus (hubungi Master)</span>;
  }
  return (
    <span>
      {monthly !== null ? formatIDR(monthly) : '—'}
      {' / bln · '}
      {yearly !== null ? formatIDR(yearly) : '—'}
      {' / thn'}
    </span>
  );
}

export function PackagePricingClient() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('user');
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: ModalKind; row: UserTier | StorageTier | ModulePriceRow | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: ModalKind; row: UserTier | StorageTier | ModulePriceRow } | null>(null);
  const [ppnPct, setPpnPct] = useState('11');
  const [validityHours, setValidityHours] = useState('24');

  async function load() {
    const r = await fetch('/api/super/pricing/catalog');
    const j = await r.json();
    if (!j.success) {
      toast.error(j.message || 'Gagal memuat katalog paket.');
      setLoading(false);
      return;
    }
    const data = j.data as Catalog;
    setCatalog(data);
    if (data.settings) {
      setPpnPct(String((data.settings.ppnRateBps ?? 1100) / 100));
      setValidityHours(String(data.settings.invoiceValidityHours ?? 24));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd(kind: ModalKind) {
    setDraft(EMPTY_DRAFT);
    setModal({ kind, row: null });
  }

  function openEdit(kind: ModalKind, row: UserTier | StorageTier | ModulePriceRow) {
    const base: Draft = { ...EMPTY_DRAFT, name: row.name, sortOrder: String(row.sortOrder ?? 0) };
    if (kind === 'user') {
      const r = row as UserTier;
      base.maxUsers = r.maxUsers !== null ? String(r.maxUsers) : '';
      base.noMaxUsers = r.maxUsers === null;
      base.monthlyPrice = r.monthlyPrice !== null ? String(r.monthlyPrice) : '';
      base.yearlyPrice = r.yearlyPrice !== null ? String(r.yearlyPrice) : '';
      base.isCustomPrice = r.isCustomPrice;
      base.minStorageGb = String(r.minStorageGb);
    } else if (kind === 'storage') {
      const r = row as StorageTier;
      base.capacityGb = r.capacityGb !== null ? String(r.capacityGb) : '';
      base.noCapacity = r.capacityGb === null;
      base.monthlyPrice = r.monthlyPrice !== null ? String(r.monthlyPrice) : '';
      base.yearlyPrice = r.yearlyPrice !== null ? String(r.yearlyPrice) : '';
      base.isCustomPrice = r.isCustomPrice;
    } else {
      const r = row as ModulePriceRow;
      base.moduleKey = r.moduleKey;
      base.monthlyPrice = String(r.monthlyPrice);
      base.yearlyPrice = String(r.yearlyPrice);
    }
    setDraft(base);
    setModal({ kind, row });
  }

  function parsePrice(v: string): number | null {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : NaN;
  }

  async function saveModal() {
    if (!modal) return;
    const { kind, row } = modal;
    const name = draft.name.trim();
    if (!name) {
      toast.error('Nama wajib diisi.');
      return;
    }
    const monthly = draft.isCustomPrice ? null : parsePrice(draft.monthlyPrice);
    const yearly = draft.isCustomPrice ? null : parsePrice(draft.yearlyPrice);
    if (
      (monthly !== null && (Number.isNaN(monthly) || monthly < 0)) ||
      (yearly !== null && (Number.isNaN(yearly) || yearly < 0))
    ) {
      toast.error('Harga harus angka bulat >= 0.');
      return;
    }
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      toast.error('Urutan harus angka bulat >= 0.');
      return;
    }

    const body: Record<string, unknown> = { name, sortOrder };
    if (kind === 'user') {
      const minStorageGb = Number(draft.minStorageGb);
      if (!Number.isInteger(minStorageGb) || minStorageGb < 0) {
        toast.error('Storage minimum harus angka bulat >= 0 (GB).');
        return;
      }
      const maxUsers = draft.noMaxUsers ? null : (draft.maxUsers.trim() === '' ? null : Number(draft.maxUsers));
      if (maxUsers !== null && (!Number.isInteger(maxUsers) || maxUsers <= 0)) {
        toast.error('Maks pengguna harus angka bulat > 0, atau centang tanpa batas.');
        return;
      }
      body.maxUsers = maxUsers;
      body.monthlyPrice = monthly;
      body.yearlyPrice = yearly;
      body.isCustomPrice = draft.isCustomPrice;
      body.minStorageGb = minStorageGb;
    } else if (kind === 'storage') {
      const capacityGb = draft.noCapacity ? null : (draft.capacityGb.trim() === '' ? null : Number(draft.capacityGb));
      if (capacityGb !== null && (!Number.isInteger(capacityGb) || capacityGb <= 0)) {
        toast.error('Kapasitas harus angka bulat > 0 (GB), atau centang di atas 2 TB.');
        return;
      }
      body.capacityGb = capacityGb;
      body.monthlyPrice = monthly;
      body.yearlyPrice = yearly;
      body.isCustomPrice = draft.isCustomPrice;
    } else {
      if (!row) {
        const key = draft.moduleKey.trim().toLowerCase();
        if (!/^[a-z0-9_-]+$/.test(key)) {
          toast.error('Kunci modul wajib diisi (huruf kecil, angka, - atau _).');
          return;
        }
        body.moduleKey = key;
      }
      if (monthly === null || yearly === null) {
        toast.error('Modul berbayar wajib punya harga bulanan dan tahunan.');
        return;
      }
      body.monthlyPrice = monthly;
      body.yearlyPrice = yearly;
    }

    const endpoint =
      kind === 'user' ? 'user-tiers' : kind === 'storage' ? 'storage-tiers' : 'modules';
    setBusy('save');
    try {
      const r = await fetch(
        row ? `/api/super/pricing/${endpoint}/${row.id}` : `/api/super/pricing/${endpoint}`,
        {
          method: row ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(row ? 'Perubahan disimpan.' : 'Data baru ditambahkan.');
      setModal(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(kind: ModalKind, row: UserTier | StorageTier | ModulePriceRow, status: 'ACTIVE' | 'DISCONTINUED') {
    const endpoint =
      kind === 'user' ? 'user-tiers' : kind === 'storage' ? 'storage-tiers' : 'modules';
    setBusy(`status-${row.id}`);
    try {
      const r = await fetch(`/api/super/pricing/${endpoint}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(status === 'ACTIVE' ? 'Diaktifkan lagi.' : 'Dihentikan. Pelanggan lama tetap berjalan sampai masa berlakunya habis.');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah status.');
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const { kind, row } = deleteTarget;
    const endpoint =
      kind === 'user' ? 'user-tiers' : kind === 'storage' ? 'storage-tiers' : 'modules';
    setBusy(`delete-${row.id}`);
    try {
      const r = await fetch(`/api/super/pricing/${endpoint}/${row.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Dihapus dari katalog. Riwayat langganan yang sudah berjalan tidak ikut terhapus.');
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    const pct = Number(ppnPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('PPN harus antara 0% sampai 100%.');
      return;
    }
    const hours = Number(validityHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      toast.error('Durasi invoice harus 1–168 jam.');
      return;
    }
    setBusy('settings');
    try {
      const r = await fetch('/api/super/pricing/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ppnRateBps: Math.round(pct * 100), invoiceValidityHours: hours }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengaturan billing disimpan.');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setBusy(null);
    }
  }

  function rowActions(kind: ModalKind, row: UserTier | StorageTier | ModulePriceRow) {
    const deleted = row.status === 'DELETED';
    return (
      <div className="flex flex-wrap gap-1.5 justify-end">
        {!deleted && (
          <>
            <button onClick={() => openEdit(kind, row)} className="btn-secondary !py-1 !px-2 text-[12px]">
              Edit
            </button>
            {row.status === 'ACTIVE' ? (
              <button
                onClick={() => setStatus(kind, row, 'DISCONTINUED')}
                disabled={busy === `status-${row.id}`}
                className="btn-secondary !py-1 !px-2 text-[12px]"
              >
                Hentikan
              </button>
            ) : (
              <button
                onClick={() => setStatus(kind, row, 'ACTIVE')}
                disabled={busy === `status-${row.id}`}
                className="btn-secondary !py-1 !px-2 text-[12px]"
              >
                Aktifkan lagi
              </button>
            )}
            <button
              onClick={() => setDeleteTarget({ kind, row })}
              disabled={busy === `delete-${row.id}`}
              className="btn-danger !py-1 !px-2 text-[12px]"
            >
              Hapus
            </button>
          </>
        )}
        {deleted && <span className="text-[12px] text-muted">Tidak bisa diubah</span>}
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'user', label: 'Tier Pengguna' },
    { key: 'storage', label: 'Tier Storage' },
    { key: 'modules', label: 'Modul Berbayar' },
    { key: 'settings', label: 'Pengaturan Billing' },
  ];

  return (
    <div className="max-w-[960px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Paket &amp; Harga</h1>
        <p className="text-sm text-muted">
          Katalog paket tenant: batas pengguna, batas storage, dan harga modul berbayar.
          Harga baru hanya berlaku untuk langganan dan perpanjangan baru — harga
          langganan yang sudah berjalan tidak berubah. Paket yang dihentikan tetap
          berlaku untuk pelanggan lama sampai masa berlakunya habis.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? 'btn-primary !py-2 text-[13px]' : 'btn-secondary !py-2 text-[13px]'}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <Card><p className="text-sm text-muted text-center py-8">Memuat katalog…</p></Card>
      )}

      {!loading && catalog && tab === 'user' && (
        <Card className="!p-0 overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Tier Pengguna</h2>
            <button onClick={() => openAdd('user')} className="btn-primary !py-2 text-[13px]">+ Tambah Tier</button>
          </div>
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-t border-line text-muted">
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">Maks Pengguna</th>
                <th className="px-4 py-3 font-semibold">Harga</th>
                <th className="px-4 py-3 font-semibold">Min. Storage</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {catalog.userTiers.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3">{row.maxUsers !== null ? `${row.maxUsers} pengguna` : 'Di atas 500'}</td>
                  <td className="px-4 py-3">{priceCell(row.monthlyPrice, row.yearlyPrice)}</td>
                  <td className="px-4 py-3">{row.minStorageGb >= 1000 ? `${row.minStorageGb / 1000} TB` : `${row.minStorageGb} GB`}</td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">{rowActions('user', row)}</td>
                </tr>
              ))}
              {catalog.userTiers.length === 0 && (
                <tr className="border-t border-line"><td colSpan={6} className="px-4 py-6 text-center text-muted">Belum ada tier pengguna.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && catalog && tab === 'storage' && (
        <Card className="!p-0 overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Tier Storage</h2>
            <button onClick={() => openAdd('storage')} className="btn-primary !py-2 text-[13px]">+ Tambah Tier</button>
          </div>
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-t border-line text-muted">
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">Kapasitas</th>
                <th className="px-4 py-3 font-semibold">Harga</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {catalog.storageTiers.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3">{row.capacityGb !== null ? (row.capacityGb >= 1000 ? `${row.capacityGb / 1000} TB` : `${row.capacityGb} GB`) : 'Di atas 2 TB'}</td>
                  <td className="px-4 py-3">{priceCell(row.monthlyPrice, row.yearlyPrice)}</td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">{rowActions('storage', row)}</td>
                </tr>
              ))}
              {catalog.storageTiers.length === 0 && (
                <tr className="border-t border-line"><td colSpan={5} className="px-4 py-6 text-center text-muted">Belum ada tier storage.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && catalog && tab === 'modules' && (
        <Card className="!p-0 overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Modul Berbayar</h2>
            <button onClick={() => openAdd('module')} className="btn-primary !py-2 text-[13px]">+ Tambah Modul</button>
          </div>
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-t border-line text-muted">
                <th className="px-4 py-3 font-semibold">Modul</th>
                <th className="px-4 py-3 font-semibold">Kunci</th>
                <th className="px-4 py-3 font-semibold">Harga</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {catalog.modules.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-muted">{row.moduleKey}</td>
                  <td className="px-4 py-3">{formatIDR(row.monthlyPrice)} / bln · {formatIDR(row.yearlyPrice)} / thn</td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">{rowActions('module', row)}</td>
                </tr>
              ))}
              {catalog.modules.length === 0 && (
                <tr className="border-t border-line"><td colSpan={5} className="px-4 py-6 text-center text-muted">Belum ada modul berbayar.</td></tr>
              )}
            </tbody>
          </table>
          <p className="px-4 py-3 text-[12.5px] text-muted border-t border-line">
            Harga modul flat per tenant per bulan, bukan per pengguna. Modul inti
            (Dashboard, Manajemen User, Pengumuman, Kalender Kerja, Kalkulator,
            Setting) selalu termasuk tanpa biaya tambahan.
          </p>
        </Card>
      )}

      {!loading && catalog && tab === 'settings' && (
        <Card className="!p-5 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Pengaturan Billing</h2>
            <p className="text-[12.5px] text-muted">
              Berlaku untuk invoice yang terbit setelah perubahan ini. PPN dibebankan
              ke tenant di atas harga dasar paket.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="PPN (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={ppnPct}
                onChange={(e) => setPpnPct(e.target.value)}
              />
            </Field>
            <Field label="Masa berlaku invoice (jam)">
              <Input
                type="number"
                min={1}
                max={168}
                value={validityHours}
                onChange={(e) => setValidityHours(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted">
              Saat ini: PPN {ppnPct}% · invoice berlaku {validityHours} jam sejak terbit.
            </p>
            <button onClick={saveSettings} disabled={busy === 'settings'} className="btn-primary !py-2 text-[13px]">
              {busy === 'settings' ? 'Menyimpan…' : 'Simpan Pengaturan'}
            </button>
          </div>
        </Card>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="card w-full max-w-md p-5 shadow-pop max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink">
              {modal.row ? 'Edit ' : 'Tambah '}
              {modal.kind === 'user' ? 'Tier Pengguna' : modal.kind === 'storage' ? 'Tier Storage' : 'Modul Berbayar'}
            </h3>
            <div className="mt-4 space-y-4">
              <Field label="Nama">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={modal.kind === 'user' ? 'Sampai 50 pengguna' : modal.kind === 'storage' ? '500 GB' : 'TAL'} />
              </Field>
              {modal.kind === 'module' && !modal.row && (
                <Field label="Kunci modul">
                  <Input value={draft.moduleKey} onChange={(e) => setDraft({ ...draft, moduleKey: e.target.value })} placeholder="tal" />
                </Field>
              )}
              {modal.kind === 'user' && (
                <>
                  <Field label="Maks pengguna">
                    <Input type="number" min={1} value={draft.maxUsers} disabled={draft.noMaxUsers} onChange={(e) => setDraft({ ...draft, maxUsers: e.target.value })} />
                  </Field>
                  <label className="flex items-center gap-2 text-[13px] text-ink">
                    <input type="checkbox" checked={draft.noMaxUsers} onChange={(e) => setDraft({ ...draft, noMaxUsers: e.target.checked })} />
                    Tanpa batas (di atas 500 pengguna, harga khusus)
                  </label>
                  <Field label="Storage minimum wajib (GB)">
                    <Input type="number" min={0} value={draft.minStorageGb} onChange={(e) => setDraft({ ...draft, minStorageGb: e.target.value })} />
                  </Field>
                </>
              )}
              {modal.kind === 'storage' && (
                <>
                  <Field label="Kapasitas (GB)">
                    <Input type="number" min={1} value={draft.capacityGb} disabled={draft.noCapacity} onChange={(e) => setDraft({ ...draft, capacityGb: e.target.value })} />
                  </Field>
                  <label className="flex items-center gap-2 text-[13px] text-ink">
                    <input type="checkbox" checked={draft.noCapacity} onChange={(e) => setDraft({ ...draft, noCapacity: e.target.checked })} />
                    Di atas 2 TB (harga khusus)
                  </label>
                </>
              )}
              {modal.kind !== 'module' && (
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" checked={draft.isCustomPrice} onChange={(e) => setDraft({ ...draft, isCustomPrice: e.target.checked })} />
                  Harga khusus (hubungi Master)
                </label>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Harga bulanan (Rp)">
                  <Input type="number" min={0} value={draft.monthlyPrice} disabled={draft.isCustomPrice} onChange={(e) => setDraft({ ...draft, monthlyPrice: e.target.value })} />
                </Field>
                <Field label="Harga tahunan (Rp)">
                  <Input type="number" min={0} value={draft.yearlyPrice} disabled={draft.isCustomPrice} onChange={(e) => setDraft({ ...draft, yearlyPrice: e.target.value })} />
                </Field>
              </div>
              <Field label="Urutan tampil">
                <Input type="number" min={0} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setModal(null)} className="btn-secondary !py-2 text-[13px]">Batal</button>
                <button onClick={saveModal} disabled={busy === 'save'} className="btn-primary !py-2 text-[13px]">
                  {busy === 'save' ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="card w-full max-w-md p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink">Hapus dari katalog?</h3>
            <p className="text-[12.5px] text-muted mt-1">
              {deleteTarget.row.name} akan dihapus dari katalog dan tidak bisa dipilih
              lagi. Riwayat langganan perusahaan yang sudah memakai paket ini tetap
              tersimpan dan tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary !py-2 text-[13px]">Batal</button>
              <button onClick={doDelete} disabled={busy === `delete-${deleteTarget.row.id}`} className="btn-danger !py-2 text-[13px]">
                {busy === `delete-${deleteTarget.row.id}` ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
