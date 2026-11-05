'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { Search, Plus, Trash2, MapPin } from 'lucide-react';
import { PdfViewer, type EsignPosition } from './PdfViewer';

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

interface SignerRow {
  id: string;
  userId: string;
  signerName: string;
  signerPosition?: string | null;
  signerDepartment?: string | null;
  signingOrder: number;
  signingStatus: string;
  placementPage?: number | null;
  placementX?: number | null;
  placementY?: number | null;
  placementWidth?: number | null;
  placementHeight?: number | null;
  signedAt?: string | null;
  rejectedReason?: string | null;
}

interface SearchUser {
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
}

/**
 * Atur penandatangan di halaman detail dokumen: cari pengguna, tambah
 * dengan urutan + posisi di PDF, hapus selama DRAFT.
 */
export function SignerManager({
  documentId,
  signers,
  canManage,
  fileUrl,
  onChanged,
}: {
  documentId: string;
  signers: SignerRow[];
  canManage: boolean;
  fileUrl: string | null;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [order, setOrder] = useState(1);
  const [position, setPosition] = useState<EsignPosition | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextOrder = (signers ?? []).reduce((m, s) => Math.max(m, s.signingOrder), 0) + 1;

  useEffect(() => {
    setOrder(nextOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signers?.length]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api(`/api/esign/signers/search?q=${encodeURIComponent(q.trim())}`);
        setResults(data.items ?? []);
      } catch (e: any) {
        toast.error(friendlyFetchError(e, 'Gagal mencari pengguna.'));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function add() {
    if (!selected) return;
    setAdding(true);
    try {
      const data = await api(`/api/esign/documents/${documentId}/signers`, {
        method: 'POST',
        body: JSON.stringify({
          userId: selected.userId,
          signingOrder: order,
          placementPage: position?.page ?? null,
          placementX: position?.x ?? null,
          placementY: position?.y ?? null,
          placementWidth: position?.width ?? null,
          placementHeight: position?.height ?? null,
        }),
      });
      toast.success(`${selected.name} ditambahkan sebagai penandatangan.`);
      if (data?.warning) toast.warning(data.warning);
      setSelected(null);
      setQ('');
      setResults([]);
      setPosition(null);
      setShowPicker(false);
      onChanged();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menambahkan penandatangan.'));
    } finally {
      setAdding(false);
    }
  }

  async function removeSigner(s: SignerRow) {
    if (!window.confirm(`Hapus ${s.signerName} dari penandatangan?`)) return;
    setBusyId(s.id);
    try {
      await api(`/api/esign/documents/${documentId}/signers/${s.id}`, { method: 'DELETE' });
      toast.success('Penandatangan dihapus.');
      onChanged();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menghapus penandatangan.'));
    } finally {
      setBusyId(null);
    }
  }

  const statusCls: Record<string, string> = {
    PENDING: 'badge-gray',
    SIGNED: 'badge-green',
    REJECTED: 'badge-red',
  };

  return (
    <div>
      {signers?.length ? (
        <ul className="mt-3 space-y-2">
          {signers.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px]"
            >
              <span>
                <span className="mr-2 inline-block min-w-6 rounded bg-brand-50 px-1.5 py-0.5 text-center text-[11px] font-bold text-brand-700">
                  {s.signingOrder}
                </span>
                <b>{s.signerName}</b>
                {s.signerPosition ? <span className="text-muted"> · {s.signerPosition}</span> : null}
                {s.signerDepartment ? <span className="text-muted"> · {s.signerDepartment}</span> : null}
                {s.placementPage != null && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-muted">
                    <MapPin className="h-3 w-3" /> Hal. {s.placementPage}
                  </span>
                )}
                {s.signingStatus === 'REJECTED' && s.rejectedReason ? (
                  <span className="block text-[12px] text-danger">Ditolak: {s.rejectedReason}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <span className={statusCls[s.signingStatus] ?? 'badge-gray'}>{s.signingStatus}</span>
                {canManage && (
                  <button
                    type="button"
                    className="text-danger hover:underline disabled:opacity-50"
                    onClick={() => removeSigner(s)}
                    disabled={busyId === s.id}
                    title="Hapus penandatangan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Belum ada penandatangan.</p>
      )}

      {canManage && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-[13px] font-semibold text-ink">Tambah penandatangan</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              className="input w-full !pl-9"
              placeholder="Cari nama atau email pengguna… (min. 2 huruf)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <p className="mt-1 text-[12px] text-muted">Mencari…</p>}
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-lg">
                {results.map((u) => (
                  <li key={u.userId}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-[13px] hover:bg-brand-50"
                      onClick={() => {
                        setSelected(u);
                        setResults([]);
                        setQ(u.name);
                      }}
                    >
                      <b>{u.name}</b> <span className="text-muted">· {u.email}</span>
                      {u.position ? <span className="block text-[12px] text-muted">{u.position}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && (
            <div className="space-y-3 rounded-lg border border-line bg-brand-50/50 p-3">
              <p className="text-[13px]">
                <b>{selected.name}</b>
                {selected.position ? <span className="text-muted"> · {selected.position}</span> : null}
                <span className="block text-[12px] text-muted">{selected.email}</span>
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-[12px] text-muted">
                  Urutan
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="input ml-2 w-20"
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value) || 1)}
                  />
                </label>
                {fileUrl && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowPicker((v) => !v)}
                  >
                    {position ? `Posisi: Hal. ${position.page} (klik untuk ubah)` : 'Pilih posisi di PDF (opsional)'}
                  </button>
                )}
                <button type="button" className="btn-primary" onClick={add} disabled={adding}>
                  <Plus className="mr-1 inline h-4 w-4" /> {adding ? 'Menambahkan…' : 'Tambah'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSelected(null);
                    setQ('');
                    setPosition(null);
                    setShowPicker(false);
                  }}
                >
                  Batal
                </button>
              </div>
              {showPicker && fileUrl && (
                <div>
                  <p className="mb-2 text-[12px] text-muted">
                    Klik pada halaman PDF untuk menempatkan kotak tanda tangan penandatangan ini.
                  </p>
                  <PdfViewer src={fileUrl} selectable onSelectPosition={setPosition} selected={position} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
