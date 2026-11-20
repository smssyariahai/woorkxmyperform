// app/(dashboard)/koperasi/pengaturan/page.tsx — pengaturan koperasi.
// Port dari backup MyPerform (src/pages/KoperasiPengaturan.tsx, 580 baris):
// 1. Daftar Cabang (master): dipakai dropdown cabang di form pendaftaran
//    anggota. Tambah, ubah nama (ikut mengubah cabang anggota yang
//    memakainya), dan hapus — hapus cabang yang masih punya anggota wajib
//    memilih: pindahkan anggota ke cabang lain, atau biarkan kosong.
// 2. URL Server: alamat server tujuan JSON pendaftaran anggota — tambah,
//    ubah, hapus, dan pilih URL default.
// Tulis HANYA untuk OWNER/ADMIN/isSuperAdmin di sisi UI (dari sesi
// NextAuth); API juga meng-gate — bila API menolak 403, tampilkan pesan
// yang jelas.
'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  addKoperasiCabang,
  addKoperasiUrl,
  deleteKoperasiCabang,
  deleteKoperasiUrl,
  fetchKoperasiAnggotaCounts,
  fetchKoperasiCabang,
  fetchKoperasiPengaturan,
  renameKoperasiCabang,
  saveKoperasiDefaultUrl,
  updateKoperasiUrl,
  type KoperasiCabangRow,
  type KoperasiUrlRow,
} from '@/lib/koperasi/client';

export default function KoperasiPengaturanPage() {
  const { data: session, status: sessionStatus } = useSession();
  const sessionRole = (session?.user as any)?.role as string | undefined;
  const sessionSuper = (session?.user as any)?.isSuperAdmin === true;
  // Bila peran belum diketahui (sesi masih dimuat), tampilkan kontrol tulis
  // — API tetap meng-gate; bila peran diketahui dan bukan OWNER/ADMIN/
  // isSuperAdmin, kunci kontrol tulis di UI.
  const roleKnown = sessionStatus === 'authenticated';
  const canWrite =
    !roleKnown || sessionSuper || sessionRole === 'OWNER' || sessionRole === 'ADMIN';

  const [cabangList, setCabangList] = useState<KoperasiCabangRow[]>([]);
  const [loadingCabang, setLoadingCabang] = useState(true);
  const [newNama, setNewNama] = useState('');
  const [editing, setEditing] = useState<{ lama: string; baru: string } | null>(null);
  const [deleting, setDeleting] = useState<KoperasiCabangRow | null>(null);
  const [pindahTujuan, setPindahTujuan] = useState('');
  const [busy, setBusy] = useState(false);
  const [cabangMsg, setCabangMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [urlList, setUrlList] = useState<KoperasiUrlRow[]>([]);
  const [defaultUrlId, setDefaultUrlId] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [newJudul, setNewJudul] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDeskripsi, setNewDeskripsi] = useState('');
  const [editingUrl, setEditingUrl] = useState<KoperasiUrlRow | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<KoperasiUrlRow | null>(null);
  const [busyUrl, setBusyUrl] = useState(false);
  const [urlMsg, setUrlMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCabang = () => {
    setLoadingCabang(true);
    Promise.all([
      fetchKoperasiCabang(),
      // Jumlah anggota per cabang tidak disediakan API — hitung dari daftar.
      fetchKoperasiAnggotaCounts().catch(() => ({} as Record<string, number>)),
    ])
      .then(([rows, counts]) =>
        setCabangList(rows.map((c) => ({ ...c, jumlah: counts[c.nama] ?? 0 })))
      )
      .catch(() => {})
      .finally(() => setLoadingCabang(false));
  };

  const loadUrls = () => {
    setLoadingUrl(true);
    fetchKoperasiPengaturan()
      .then((r) => {
        setUrlList(r.urls);
        setDefaultUrlId(r.defaultUrlId);
      })
      .catch(() => {})
      .finally(() => setLoadingUrl(false));
  };

  useEffect(() => {
    loadCabang();
    loadUrls();
  }, []);

  const forbiddenMsg = (e: any, fallback: string) =>
    /403/.test(e?.message || '')
      ? 'Anda tidak punya akses untuk mengubah pengaturan ini (hanya OWNER/ADMIN).'
      : e?.message || fallback;

  const addCabang = async () => {
    const nama = newNama.trim();
    if (!nama) return;
    setBusy(true);
    setCabangMsg(null);
    try {
      await addKoperasiCabang(nama);
      setNewNama('');
      setCabangMsg({ ok: true, text: `Cabang "${nama}" ditambahkan.` });
      loadCabang();
    } catch (e: any) {
      setCabangMsg({ ok: false, text: forbiddenMsg(e, 'Gagal menambah cabang.') });
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!editing) return;
    const baru = editing.baru.trim();
    if (!baru || baru === editing.lama) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setCabangMsg(null);
    try {
      const { diubah, gagal } = await renameKoperasiCabang(editing.lama, baru);
      setCabangMsg({
        ok: gagal === 0,
        text: `Cabang diubah menjadi "${baru}"${diubah ? ` — ${diubah} anggota ikut berubah.` : '.'}${gagal ? ` ${gagal} anggota gagal diubah — periksa manual.` : ''}`,
      });
      setEditing(null);
      loadCabang();
    } catch (e: any) {
      setCabangMsg({ ok: false, text: forbiddenMsg(e, 'Gagal mengubah cabang.') });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (aksi: 'pindah' | 'kosongkan' | 'langsung') => {
    if (!deleting) return;
    if (aksi === 'pindah' && !pindahTujuan) return;
    setBusy(true);
    setCabangMsg(null);
    try {
      const { dipindah: n, gagal } = await deleteKoperasiCabang(
        deleting.nama,
        aksi === 'langsung' ? undefined : { aksi, tujuan: pindahTujuan || undefined }
      );
      setCabangMsg({
        ok: gagal === 0,
        text:
          (aksi === 'pindah'
            ? `Cabang "${deleting.nama}" dihapus — ${n} anggota dipindahkan ke "${pindahTujuan}".`
            : aksi === 'kosongkan'
              ? `Cabang "${deleting.nama}" dihapus — ${n} anggota cabangnya dikosongkan.`
              : `Cabang "${deleting.nama}" dihapus.`) +
          (gagal ? ` ${gagal} anggota gagal diproses — periksa manual.` : ''),
      });
      setDeleting(null);
      setPindahTujuan('');
      loadCabang();
    } catch (e: any) {
      setCabangMsg({ ok: false, text: forbiddenMsg(e, 'Gagal menghapus cabang.') });
    } finally {
      setBusy(false);
    }
  };

  const addUrl = async () => {
    const judul = newJudul.trim();
    const url = newUrl.trim();
    const deskripsi = newDeskripsi.trim();
    if (!judul || !url) return;
    setBusyUrl(true);
    setUrlMsg(null);
    try {
      const urls = await addKoperasiUrl({ judul, url, deskripsi });
      setUrlList(urls);
      setNewJudul('');
      setNewUrl('');
      setNewDeskripsi('');
      setUrlMsg({ ok: true, text: `URL "${judul}" ditambahkan.` });
    } catch (e: any) {
      setUrlMsg({ ok: false, text: forbiddenMsg(e, 'Gagal menambah URL.') });
    } finally {
      setBusyUrl(false);
    }
  };

  const saveUrlEdit = async () => {
    if (!editingUrl) return;
    const judul = editingUrl.judul.trim();
    const url = editingUrl.url.trim();
    if (!judul || !url) return;
    setBusyUrl(true);
    setUrlMsg(null);
    try {
      const urls = await updateKoperasiUrl({
        id: editingUrl.id,
        judul,
        url,
        deskripsi: editingUrl.deskripsi.trim(),
      });
      setUrlList(urls);
      setEditingUrl(null);
      setUrlMsg({ ok: true, text: 'URL diperbarui.' });
    } catch (e: any) {
      setUrlMsg({ ok: false, text: forbiddenMsg(e, 'Gagal mengubah URL.') });
    } finally {
      setBusyUrl(false);
    }
  };

  const doDeleteUrl = async () => {
    if (!deletingUrl) return;
    setBusyUrl(true);
    setUrlMsg(null);
    try {
      const urls = await deleteKoperasiUrl(deletingUrl.id);
      setUrlList(urls);
      setUrlMsg({ ok: true, text: `URL "${deletingUrl.judul}" dihapus.` });
      setDeletingUrl(null);
      if (defaultUrlId === deletingUrl.id) setDefaultUrlId(null);
    } catch (e: any) {
      setUrlMsg({ ok: false, text: forbiddenMsg(e, 'Gagal menghapus URL.') });
    } finally {
      setBusyUrl(false);
    }
  };

  const setDefault = async (id: string) => {
    setBusyUrl(true);
    setUrlMsg(null);
    try {
      await saveKoperasiDefaultUrl(id);
      setDefaultUrlId(id);
      setUrlMsg({ ok: true, text: 'URL default disimpan.' });
    } catch (e: any) {
      setUrlMsg({ ok: false, text: forbiddenMsg(e, 'Gagal menyimpan URL default.') });
    } finally {
      setBusyUrl(false);
    }
  };

  const otherBranches = deleting ? cabangList.filter((c) => c.nama !== deleting.nama).map((c) => c.nama) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Pengaturan Kirim JSON</h1>
        <p className="text-xs text-slate-500">
          Atur daftar cabang untuk form pendaftaran anggota, dan URL server tujuan kirim JSON.
        </p>
      </div>

      {!canWrite && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Anda hanya bisa melihat pengaturan ini. Perubahan (tambah/ubah/hapus cabang &amp; URL) hanya untuk OWNER/ADMIN.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800">Daftar Cabang</h2>
        <p className="text-[11px] text-slate-500 -mt-2">
          Daftar ini dipakai dropdown cabang di form pendaftaran anggota. Mengubah nama cabang ikut mengubah data anggota yang memakai cabang itu.
        </p>
        {loadingCabang ? (
          <p className="text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin inline mr-2" /> Memuat daftar cabang...
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {cabangList.map((c) => (
              <li key={c.nama} className="flex items-center gap-2 px-3 py-2.5">
                {editing && editing.lama === c.nama ? (
                  <>
                    <input
                      type="text"
                      value={editing.baru}
                      onChange={(e) => setEditing({ ...editing, baru: e.target.value })}
                      className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={saveRename}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 text-xs sm:text-sm font-medium text-slate-800 truncate">{c.nama}</span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {c.jumlah} anggota
                    </span>
                    {canWrite && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing({ lama: c.nama, baru: c.nama })}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-label={`Ubah ${c.nama}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleting(c);
                            setPindahTujuan('');
                          }}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                          aria-label={`Hapus ${c.nama}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
            {cabangList.length === 0 && (
              <li className="px-3 py-4 text-xs text-slate-500">Belum ada cabang. Tambahkan cabang pertama di bawah.</li>
            )}
          </ul>
        )}
        {canWrite && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newNama}
              onChange={(e) => setNewNama(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCabang();
                }
              }}
              placeholder="Nama cabang baru, mis. Cabang Ciledug"
              className="flex-1 min-w-0 border-2 border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={addCabang}
              disabled={busy || !newNama.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus size={15} /> Tambah
            </button>
          </div>
        )}
        {cabangMsg && (
          <div
            className={
              cabangMsg.ok
                ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800'
                : 'rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700'
            }
          >
            {cabangMsg.text}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800">Daftar URL Server Tujuan Kirim JSON</h2>
        <p className="text-[11px] text-slate-500 -mt-2">
          Saat kirim JSON, pengguna memilih salah satu URL di sini. URL default berlaku untuk seluruh kantor dan bisa diubah
          dari daftar ini atau dari jendela Kirim JSON. Pengiriman dilakukan lewat server WOORK, jadi tidak terkendala CORS. Foto dikirim sebagai base64.
        </p>
        {loadingUrl ? (
          <p className="text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin inline mr-2" /> Memuat daftar URL...
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {urlList.map((u) => (
                <li key={u.id} className="px-3 py-2.5">
                  {editingUrl && editingUrl.id === u.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingUrl.judul}
                        onChange={(e) => setEditingUrl({ ...editingUrl, judul: e.target.value })}
                        placeholder="Judul"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                      />
                      <input
                        type="url"
                        value={editingUrl.url}
                        onChange={(e) => setEditingUrl({ ...editingUrl, url: e.target.value })}
                        placeholder="https://server-tujuan/contoh/endpoint"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                      />
                      <input
                        type="text"
                        value={editingUrl.deskripsi}
                        onChange={(e) => setEditingUrl({ ...editingUrl, deskripsi: e.target.value })}
                        placeholder="Deskripsi (opsional)"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveUrlEdit}
                          disabled={busyUrl}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUrl(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-800">
                          {u.judul}{' '}
                          {defaultUrlId === u.id && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Default</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 break-all">{u.url}</p>
                        {u.deskripsi && <p className="text-[11px] text-slate-500">{u.deskripsi}</p>}
                        {defaultUrlId !== u.id && (
                          <button
                            type="button"
                            onClick={() => setDefault(u.id)}
                            disabled={busyUrl}
                            className="mt-1 text-[11px] font-semibold text-emerald-700 underline disabled:opacity-50"
                          >
                            Jadikan default
                          </button>
                        )}
                      </div>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingUrl({ ...u })}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            aria-label={`Ubah ${u.judul}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingUrl(u)}
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
                <li className="px-3 py-4 text-xs text-slate-500">Belum ada URL. Tambahkan URL pertama di bawah.</li>
              )}
            </ul>
            {canWrite && (
              <div className="space-y-2 border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-700">Tambah URL baru</p>
                <input
                  type="text"
                  value={newJudul}
                  onChange={(e) => setNewJudul(e.target.value)}
                  placeholder="Judul, mis. Server Pusat"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-emerald-500"
                />
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://server-tujuan/contoh/endpoint"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={newDeskripsi}
                  onChange={(e) => setNewDeskripsi(e.target.value)}
                  placeholder="Deskripsi (opsional)"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-emerald-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addUrl}
                    disabled={busyUrl || !newJudul.trim() || !newUrl.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Plus size={15} /> Tambah URL
                  </button>
                </div>
              </div>
            )}
            {urlMsg && (
              <div
                className={
                  urlMsg.ok
                    ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800'
                    : 'rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700'
                }
              >
                {urlMsg.text}
              </div>
            )}
          </>
        )}
      </div>

      {deleting && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !busy && setDeleting(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">Hapus Cabang &quot;{deleting.nama}&quot;?</h2>
              <button
                type="button"
                onClick={() => !busy && setDeleting(null)}
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
            {deleting.jumlah > 0 ? (
              <>
                <p className="text-xs text-slate-600">
                  Ada <span className="font-bold text-red-600">{deleting.jumlah} anggota</span> terdaftar sebagai cabang ini.
                  Apa yang dilakukan terhadap anggota tersebut?
                </p>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">Pindahkan anggota ke cabang lain:</label>
                  <div className="flex gap-2">
                    <select
                      value={pindahTujuan}
                      onChange={(e) => setPindahTujuan(e.target.value)}
                      className="flex-1 min-w-0 border border-slate-300 rounded-xl px-2.5 py-2 text-xs bg-white outline-none"
                    >
                      <option value="">Pilih cabang tujuan</option>
                      {otherBranches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => doDelete('pindah')}
                      disabled={busy || !pindahTujuan}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Pindahkan &amp; Hapus
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => doDelete('kosongkan')}
                  disabled={busy}
                  className="w-full px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  Biarkan Kosong &amp; Hapus (cabang anggota jadi kosong)
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-600">Tidak ada anggota terdaftar sebagai cabang ini. Cabang bisa langsung dihapus.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              {deleting.jumlah === 0 && (
                <button
                  type="button"
                  onClick={() => doDelete('langsung')}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Hapus Cabang
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deletingUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !busyUrl && setDeletingUrl(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Hapus URL &quot;{deletingUrl.judul}&quot;?</h2>
            <p className="text-xs text-slate-600">
              URL ini akan hilang dari pilihan kirim. Bila ada pengguna yang menjadikannya default, default mereka akan kembali ke pilihan pertama.
            </p>
            <p className="text-[11px] text-slate-500 break-all">{deletingUrl.url}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUrl(null)}
                disabled={busyUrl}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={doDeleteUrl}
                disabled={busyUrl}
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
