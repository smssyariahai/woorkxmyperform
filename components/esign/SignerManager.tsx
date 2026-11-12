'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { Search, Plus, Trash2, MapPin, GripVertical } from 'lucide-react';
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
  signingGroup: number;
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

type DragItem = { type: 'signer'; signerId: string } | { type: 'group'; group: number };

/**
 * Atur penandatangan di halaman detail dokumen: cari pengguna, tambah
 * ke grup, hapus selama DRAFT, dan atur urutan/grup dengan drag-and-drop.
 *
 * Grup: penandatangan dalam satu grup menandatangani bersamaan; antar grup
 * berurutan (SEQUENTIAL) — grup berikutnya baru dapat giliran setelah grup
 * sebelumnya selesai semua. Seret baris signer untuk pindah grup / ubah
 * urutan; seret header grup untuk mengurutkan grup; seret ke zona
 * "Grup baru" untuk membuka langkah baru.
 */
export function SignerManager({
  documentId,
  signers,
  canManage,
  fileUrl,
  workflowType,
  onChanged,
}: {
  documentId: string;
  signers: SignerRow[];
  canManage: boolean;
  fileUrl: string | null;
  workflowType: string;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [groupSel, setGroupSel] = useState('new');
  const [position, setPosition] = useState<EsignPosition | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextOrder = (signers ?? []).reduce((m, s) => Math.max(m, s.signingOrder), 0) + 1;

  // Kelompokkan signer per grup (nomor tampil 1..N sesuai urutan grup).
  const sorted = useMemo(
    () =>
      [...(signers ?? [])].sort(
        (a, b) => a.signingGroup - b.signingGroup || a.signingOrder - b.signingOrder
      ),
    [signers]
  );
  const groups = useMemo(() => {
    const keys = [...new Set(sorted.map((s) => s.signingGroup))].sort((a, b) => a - b);
    return keys.map((raw, i) => ({
      raw,
      no: i + 1,
      signers: sorted.filter((s) => s.signingGroup === raw),
    }));
  }, [sorted]);
  const maxGroup = groups.length ? Math.max(...groups.map((g) => g.raw)) : 0;

  // Bila grup yang dipilih di form tambah sudah tidak ada, kembali ke "Grup baru".
  useEffect(() => {
    if (groupSel !== 'new' && !groups.some((g) => String(g.raw) === groupSel)) {
      setGroupSel('new');
    }
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
      const signingGroup = groupSel === 'new' ? maxGroup + 1 : Number(groupSel);
      const data = await api(`/api/esign/documents/${documentId}/signers`, {
        method: 'POST',
        body: JSON.stringify({
          userId: selected.userId,
          signingOrder: nextOrder,
          signingGroup,
          placementPage: position?.page ?? null,
          placementX: position?.x ?? null,
          placementY: position?.y ?? null,
          placementWidth: position?.width ?? null,
          placementHeight: position?.height ?? null,
        }),
      });
      toast.success(`${selected.name} ditambahkan sebagai penandatangan (Grup ${signingGroup}).`);
      if (data?.warning) toast.warning(data.warning);
      setSelected(null);
      setQ('');
      setResults([]);
      setPosition(null);
      setShowPicker(false);
      setGroupSel('new');
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

  // ---- Drag-and-drop: urutan + grup ----

  function arrangement(): { signerId: string; group: number }[] {
    return sorted.map((s) => ({ signerId: s.id, group: s.signingGroup }));
  }

  async function persistOrder(arr: { signerId: string; group: number }[]) {
    // Normalisasi nomor grup 1..N sesuai urutan kemunculan pertama.
    const map = new Map<number, number>();
    const items = arr.map((a) => {
      if (!map.has(a.group)) map.set(a.group, map.size + 1);
      return { signerId: a.signerId, signingGroup: map.get(a.group)! };
    });
    setReordering(true);
    try {
      await api(`/api/esign/documents/${documentId}/signers`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      toast.success('Urutan penandatangan diperbarui.');
      onChanged();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal mengubah urutan penandatangan.'));
    } finally {
      setReordering(false);
    }
  }

  function startDrag(e: React.DragEvent, item: DragItem) {
    if (!canManage || reordering) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'text/plain',
      item.type === 'signer' ? item.signerId : `group:${item.group}`
    );
    setDrag(item);
  }

  function endDrag() {
    setDrag(null);
    setDragOver(null);
  }

  function overTarget(e: React.DragEvent, key: string) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(key);
  }

  function dropOnSigner(e: React.DragEvent, target: SignerRow) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    const arr = arrangement();
    if (drag.type === 'signer') {
      const idx = arr.findIndex((a) => a.signerId === drag.signerId);
      if (idx === -1) return;
      const [moved] = arr.splice(idx, 1);
      const tIdx = arr.findIndex((a) => a.signerId === target.id);
      moved.group = target.signingGroup;
      arr.splice(Math.max(tIdx, 0), 0, moved);
      setDrag(null);
      setDragOver(null);
      void persistOrder(arr);
    } else {
      // Grup dijatuhkan ke signer = pindah grup sebelum grup signer tsb.
      if (drag.group === target.signingGroup) return;
      const moved = arr.filter((a) => a.group === drag.group);
      const rest = arr.filter((a) => a.group !== drag.group);
      const tIdx = rest.findIndex((a) => a.group === target.signingGroup);
      rest.splice(Math.max(tIdx, 0), 0, ...moved);
      setDrag(null);
      setDragOver(null);
      void persistOrder(rest);
    }
  }

  function dropOnGroup(e: React.DragEvent, groupRaw: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    const arr = arrangement();
    if (drag.type === 'signer') {
      const idx = arr.findIndex((a) => a.signerId === drag.signerId);
      if (idx === -1) return;
      const [moved] = arr.splice(idx, 1);
      moved.group = groupRaw;
      // Sisipkan setelah signer terakhir grup tujuan.
      let insertAt = arr.length;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].group === groupRaw) {
          insertAt = i + 1;
          break;
        }
      }
      arr.splice(insertAt, 0, moved);
      setDrag(null);
      setDragOver(null);
      void persistOrder(arr);
    } else {
      if (drag.group === groupRaw) return;
      const moved = arr.filter((a) => a.group === drag.group);
      const rest = arr.filter((a) => a.group !== drag.group);
      const tIdx = rest.findIndex((a) => a.group === groupRaw);
      rest.splice(Math.max(tIdx, 0), 0, ...moved);
      setDrag(null);
      setDragOver(null);
      void persistOrder(rest);
    }
  }

  function dropOnNewGroup(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag || drag.type !== 'signer') return;
    const arr = arrangement();
    const idx = arr.findIndex((a) => a.signerId === drag.signerId);
    if (idx === -1) return;
    const [moved] = arr.splice(idx, 1);
    moved.group = maxGroup + 1;
    arr.push(moved);
    setDrag(null);
    setDragOver(null);
    void persistOrder(arr);
  }

  const statusCls: Record<string, string> = {
    PENDING: 'badge-gray',
    SIGNED: 'badge-green',
    REJECTED: 'badge-red',
  };

  return (
    <div>
      {workflowType === 'SEQUENTIAL' && groups.length > 1 && (
        <p className="mt-2 text-[12px] text-muted">
          Penandatangan dalam satu grup menandatangani bersamaan; grup berikutnya baru mendapat
          giliran setelah semua di grup sebelumnya selesai.
        </p>
      )}
      {signers?.length ? (
        <div className="mt-3 space-y-3">
          {groups.map((g) => {
            const draggingGroup = drag?.type === 'group' && drag.group === g.raw;
            const overGroup = dragOver === `group:${g.raw}`;
            return (
              <div
                key={g.raw}
                className={`overflow-hidden rounded-lg border border-line ${
                  draggingGroup ? 'opacity-40' : ''
                } ${overGroup ? 'ring-2 ring-brand-500' : ''}`}
                onDragOver={(e) => overTarget(e, `group:${g.raw}`)}
                onDrop={(e) => dropOnGroup(e, g.raw)}
              >
                <div
                  className={`flex cursor-grab items-center gap-2 border-b border-line px-3 py-2 ${
                    overGroup ? 'bg-brand-100' : 'bg-slate-50'
                  }`}
                  draggable={canManage && !reordering}
                  onDragStart={(e) => startDrag(e, { type: 'group', group: g.raw })}
                  onDragEnd={endDrag}
                  onDragOver={(e) => overTarget(e, `group:${g.raw}`)}
                  onDrop={(e) => dropOnGroup(e, g.raw)}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-muted" />
                  <span className="text-[13px] font-semibold text-ink">Grup {g.no}</span>
                  <span className="text-[12px] text-muted">
                    · {g.signers.length} penandatangan — tanda tangan bersamaan
                    {workflowType === 'SEQUENTIAL' ? ', setelah grup sebelumnya selesai' : ''}
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {g.signers.map((s) => {
                    const draggingSigner = drag?.type === 'signer' && drag.signerId === s.id;
                    const overSigner = dragOver === `signer:${s.id}`;
                    return (
                      <li
                        key={s.id}
                        draggable={canManage && !reordering}
                        onDragStart={(e) => startDrag(e, { type: 'signer', signerId: s.id })}
                        onDragEnd={endDrag}
                        onDragOver={(e) => overTarget(e, `signer:${s.id}`)}
                        onDrop={(e) => dropOnSigner(e, s)}
                        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                          draggingSigner ? 'opacity-40' : ''
                        } ${overSigner ? 'bg-brand-50 ring-1 ring-inset ring-brand-400' : ''} ${
                          canManage ? 'cursor-grab' : ''
                        }`}
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-1">
                          <GripVertical className="h-4 w-4 shrink-0 text-muted" />
                          <span className="mr-1 inline-block min-w-6 rounded bg-brand-50 px-1.5 py-0.5 text-center text-[11px] font-bold text-brand-700">
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
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {canManage && (
            <div
              className={`rounded-lg border border-dashed px-3 py-2.5 text-center text-[13px] text-muted ${
                dragOver === 'new-group'
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line'
              }`}
              onDragOver={(e) => overTarget(e, 'new-group')}
              onDrop={dropOnNewGroup}
            >
              {drag?.type === 'signer'
                ? 'Lepaskan di sini untuk membuat Grup baru'
                : '＋ Seret penandatangan ke sini untuk membuat Grup baru'}
            </div>
          )}
        </div>
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
                  Grup
                  <select
                    className="input ml-2 w-52"
                    value={groupSel}
                    onChange={(e) => setGroupSel(e.target.value)}
                  >
                    {groups.map((g) => (
                      <option key={g.raw} value={String(g.raw)}>
                        Grup {g.no} — gabung ({g.signers.length} orang)
                      </option>
                    ))}
                    <option value="new">＋ Grup baru (langkah berikutnya)</option>
                  </select>
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
