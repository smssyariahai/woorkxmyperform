// components/koperasi/KirimJsonModal.tsx — port dari backup MyPerform
// (src/components/koperasi/KirimJsonModal.tsx, 225 baris): modal pratinjau
// + kirim JSON pendaftaran anggota.
// - "Copy JSON" menyalin JSON persis seperti yang ditampilkan.
// - "Kirim ke Server" mengirim lewat POST /api/koperasi/kirim-json
//   { anggotaId, urlId } (kontrak Gelombang 5; di backup payload lengkap
//   dikirim ke server MyPerform). Server tujuan dibaca dari Pengaturan.
// - URL default per kantor disimpan lewat POST /api/koperasi/pengaturan
//   { kirimJson: { defaultUrlId } }.
// Perbedaan WOORK: bila anggota belum tersimpan (anggotaId kosong, mis.
// form tambah baru), tombol kirim nonaktif — simpan dulu, lalu kirim dari
// List Anggota. Copy JSON tetap bisa dipakai. Foto di payload hanya ikut
// bila berupa data URL (lihat lib/koperasi/kirimJson.ts).
'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, Copy, Loader2, Send, X } from 'lucide-react';
import {
  fetchKoperasiPengaturan,
  kirimAnggotaJson,
  saveKoperasiDefaultUrl,
  type KoperasiUrlRow,
} from '@/lib/koperasi/client';
import type { AnggotaJsonPayload } from '@/lib/koperasi/kirimJson';

interface Props {
  open: boolean;
  onClose: () => void;
  payload: AnggotaJsonPayload | null;
  /** ID anggota tersimpan — wajib untuk kirim ke server (kontrak API). */
  anggotaId?: string | null;
}

export default function KirimJsonModal({ open, onClose, payload, anggotaId }: Props) {
  const [urls, setUrls] = useState<KoperasiUrlRow[]>([]);
  const [defaultUrlId, setDefaultUrlId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setSending(false);
    setResult(null);
    setSettingsLoaded(false);
    fetchKoperasiPengaturan()
      .then((p) => {
        setUrls(p.urls);
        setDefaultUrlId(p.defaultUrlId);
        setSelectedId(
          p.defaultUrlId && p.urls.some((u) => u.id === p.defaultUrlId)
            ? p.defaultUrlId
            : p.urls[0]?.id || ''
        );
      })
      .catch(() => {
        setUrls([]);
        setDefaultUrlId(null);
        setSelectedId('');
      })
      .finally(() => setSettingsLoaded(true));
  }, [open ]);

  if (!open || !payload) return null;

  const jsonText = JSON.stringify(payload, null, 2);
  const selected = urls.find((u) => u.id === selectedId);
  const urlOk = !!selected;
  const canSend = urlOk && !!anggotaId;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
    } catch {
      // Fallback untuk browser tanpa izin clipboard.
      const ta = document.createElement('textarea');
      ta.value = jsonText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendJson = async () => {
    if (!canSend || !anggotaId) return;
    setSending(true);
    setResult(null);
    try {
      const r = await kirimAnggotaJson(anggotaId, selectedId);
      if (r.success) {
        setResult({ ok: true, message: `Terkirim ke "${r.tujuan || 'server tujuan'}" (HTTP ${r.status ?? '?'}).` });
      } else {
        setResult({ ok: false, message: `Server tujuan menjawab HTTP ${r.status ?? '?'}${r.detail ? `: ${r.detail}` : '.'}` });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || 'Gagal mengirim JSON.' });
    } finally {
      setSending(false);
    }
  };

  const setAsDefault = async () => {
    if (!selectedId) return;
    setSavingDefault(true);
    try {
      await saveKoperasiDefaultUrl(selectedId);
      setDefaultUrlId(selectedId);
      setResult({ ok: true, message: 'URL default Anda disimpan.' });
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || 'Gagal menyimpan URL default.' });
    } finally {
      setSavingDefault(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">Kirim JSON — PENDAFTARAN_ANGGOTA</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-3 space-y-2">
          {settingsLoaded && urls.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              Belum ada URL Server — tombol kirim nonaktif. Tambahkan dulu di{' '}
              <Link href="/koperasi/pengaturan" className="font-semibold underline" onClick={onClose}>
                Pengaturan Kirim JSON
              </Link>
              . Tombol Copy JSON tetap bisa dipakai.
            </div>
          )}
          {settingsLoaded && !anggotaId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              Anggota ini belum tersimpan, jadi JSON belum bisa dikirim ke server. Simpan dulu,
              lalu kirim dari List Anggota. Tombol Copy JSON tetap bisa dipakai.
            </div>
          )}
          {settingsLoaded && urlOk && selected && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-2">
              <label className="block">
                <span className="text-slate-500">Kirim ke:</span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white outline-none"
                >
                  {urls.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.judul}
                    </option>
                  ))}
                </select>
              </label>
              <p className="break-all">
                <span className="text-slate-500">URL:</span> <span className="font-medium text-slate-800">{selected.url}</span>
              </p>
              {selected.deskripsi && <p className="text-slate-500">{selected.deskripsi}</p>}
              {selectedId === defaultUrlId ? (
                <p className="font-medium text-emerald-700">Ini URL default kantor ✓</p>
              ) : (
                <button
                  type="button"
                  onClick={setAsDefault}
                  disabled={savingDefault}
                  className="text-xs font-semibold text-emerald-700 underline disabled:opacity-50"
                >
                  {savingDefault ? 'Menyimpan...' : 'Jadikan URL default'}
                </button>
              )}
            </div>
          )}
          {result && (
            <div
              className={
                result.ok
                  ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800'
                  : 'rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700'
              }
            >
              {result.message}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {anggotaId && (
            <p className="mb-2 text-[11px] text-slate-500">
              Catatan: foto anggota yang sudah tersimpan dikirim sebagai base64 oleh server — pratinjau di atas menampilkan kolom
              foto kosong karena foto tersimpan sebagai file, bukan data URL.
            </p>
          )}
          <pre className="text-[11px] leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap break-all text-slate-800">
            {jsonText}
          </pre>
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={copyJson}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copied ? 'Tersalin!' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={sendJson}
            disabled={!canSend || sending}
            title={!anggotaId ? 'Simpan anggota dulu sebelum mengirim' : undefined}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Mengirim...' : 'Kirim ke Server'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
