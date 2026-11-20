'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  fetchKirimUrls,
  addKirimUrl,
  updateKirimUrl,
  deleteKirimUrl,
  type KirimUrlItem,
} from '@/lib/emas/client';

// Halaman Pengaturan URL Json Modul Simulasi Emas — porting dari backup
// src/pages/SimulasiPengaturanUrl.tsx. SATU daftar URL (scope 'simulasi')
// yang dipakai bersama oleh Kalkulator Gadai Emas & PKE.
// Perbedaan dari backup:
// - Panggilan pg backup ke endpoint kirim/pengaturan dan kirim/urls diganti
//   helper lib/emas/client.ts (API /api/emas/kirim-urls). Di WOORK canManage
//   selalu true (akses modul Emas adalah gerbangnya).
// - Pengiriman JSON-nya sendiri (modal Kirim JSON) adalah Gelombang 11 — halaman
//   ini hanya mengelola daftar URL-nya.

export default function SimulasiPengaturanUrlPage() {
  const [urlList, setUrlList] = useState<KirimUrlItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newJudul, setNewJudul] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDeskripsi, setNewDeskripsi] = useState('');
  const [editing, setEditing] = useState<KirimUrlItem | null>(null);
  const [deleting, setDeleting] = useState<KirimUrlItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchKirimUrls('simulasi')
      .then((r) => {
        setUrlList(Array.isArray(r?.urls) ? r.urls : []);
        setCanManage(!!r?.canManage);
      })
      .catch(() => {
        setUrlList([]);
        setCanManage(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const addUrl = async () => {
    const judul = newJudul.trim();
    const url = newUrl.trim();
    const deskripsi = newDeskripsi.trim();
    if (!judul || !url) return;
    setBusy(true);
    setMsg(null);
    try {
      const urls = await addKirimUrl({ scope: 'simulasi', judul, url, deskripsi });
      setUrlList(urls || []);
      setNewJudul('');
      setNewUrl('');
      setNewDeskripsi('');
      setMsg({ ok: true, text: `URL "${judul}" ditambahkan.` });
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal menambah URL.' });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const judul = editing.judul.trim();
    const url = editing.url.trim();
    if (!judul || !url) return;
    setBusy(true);
    setMsg(null);
    try {
      const urls = await updateKirimUrl({ scope: 'simulasi', id: editing.id, judul, url, deskripsi: editing.deskripsi.trim() });
      setUrlList(urls || []);
      setEditing(null);
      setMsg({ ok: true, text: 'URL diperbarui.' });
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal mengubah URL.' });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setMsg(null);
    try {
      const urls = await deleteKirimUrl(deleting.id, 'simulasi');
      setUrlList(urls || []);
      setMsg({ ok: true, text: `URL "${deleting.judul}" dihapus.` });
      setDeleting(null);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal menghapus URL.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Pengaturan URL Json</h1>
        <p className="text-xs text-muted">
          Satu daftar URL server tujuan kirim JSON yang dipakai bersama oleh Kalkulator Gadai Emas dan PKE.
          Daftar ini akan dipakai saat fitur Kirim JSON tersedia.
        </p>
      </div>
      <div className="bg-white rounded-xl border border-line p-4 sm:p-6 space-y-4 max-w-2xl">
        <h2 className="text-sm font-bold text-ink">Daftar URL Server</h2>
        {loading ? (
          <p className="text-xs text-muted">
            <Loader2 size={14} className="animate-spin inline mr-2" /> Memuat daftar URL...
          </p>
        ) : (
          <>
            {!canManage && (
              <p className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-muted">
                Daftar ini hanya bisa diubah oleh admin atau pengguna dengan akses tulis modul Gadai Emas / PKE.
              </p>
            )}
            <ul className="divide-y divide-slate-100 border border-line rounded-xl overflow-hidden">
              {urlList.map((u) => (
                <li key={u.id} className="px-3 py-2.5">
                  {editing && editing.id === u.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editing.judul}
                        onChange={(e) => setEditing({ ...editing, judul: e.target.value })}
                        placeholder="Judul"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                      />
                      <input
                        type="url"
                        value={editing.url}
                        onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                        placeholder="https://server-tujuan/contoh/endpoint"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        value={editing.deskripsi}
                        onChange={(e) => setEditing({ ...editing, deskripsi: e.target.value })}
                        placeholder="Deskripsi (opsional)"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-ink">{u.judul}</p>
                        <p className="text-[11px] text-muted break-all">{u.url}</p>
                        {u.deskripsi && <p className="text-[11px] text-muted">{u.deskripsi}</p>}
                      </div>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing({ ...u })}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink"
                            aria-label={`Ubah ${u.judul}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(u)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                            aria-label={`Hapus ${u.judul}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {urlList.length === 0 && (
                <li className="px-3 py-4 text-xs text-muted">Belum ada URL. Tambahkan URL pertama di bawah.</li>
              )}
            </ul>
            {canManage && (
              <div className="space-y-2 border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-700">Tambah URL baru</p>
                <input
                  type="text"
                  value={newJudul}
                  onChange={(e) => setNewJudul(e.target.value)}
                  placeholder="Judul, mis. Server Pusat"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-amber-500"
                />
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://server-tujuan/contoh/endpoint"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  value={newDeskripsi}
                  onChange={(e) => setNewDeskripsi(e.target.value)}
                  placeholder="Deskripsi (opsional)"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-amber-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addUrl}
                    disabled={busy || !newJudul.trim() || !newUrl.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-xs sm:text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <Plus size={15} /> Tambah URL
                  </button>
                </div>
              </div>
            )}
            {msg && (
              <div
                className={
                  msg.ok
                    ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800'
                    : 'rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700'
                }
              >
                {msg.text}
              </div>
            )}
          </>
        )}
      </div>
      {deleting && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !busy && setDeleting(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-ink">Hapus URL &quot;{deleting.judul}&quot;?</h2>
            <p className="text-xs text-slate-600">
              URL ini akan hilang dari pilihan kirim Gadai Emas &amp; PKE. Bila ada pengguna yang menjadikannya default, default mereka akan kembali ke pilihan pertama.
            </p>
            <p className="text-[11px] text-muted break-all">{deleting.url}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Hapus URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
