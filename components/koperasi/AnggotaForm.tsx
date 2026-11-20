// components/koperasi/AnggotaForm.tsx — port dari backup MyPerform
// (src/pages/KoperasiAnggotaForm.tsx, 917 baris): formulir pendaftaran
// anggota KSPPS — kartu putih + header emerald, box Upload KTP, accordion
// A/B/C (default terbuka), datalist cabang, No HP awalan +62, tombol Cari
// NIK, Reset, konfirmasi sebelum simpan, dan tombol Kirim JSON.
// Dipakai halaman /koperasi/anggota-baru (tambah) dan
// /koperasi/anggota-baru/[id] (edit, prop anggotaId + initial).
// PENYEDERHANAAN WOORK (kontrak Gelombang 5):
// - OCR KTP DITUNDA: tidak ada auto-OCR saat foto KTP diunggah dan tidak ada
//   pilihan AI. Tombol "Analisa KTP" memanggil POST /api/koperasi/anggota/
//   ocr-ktp yang selalu menjawab { configured: false }; pesannya ditampilkan
//   sebagai banner kuning yang jelas di form (bukan gagal diam-diam).
// - Simpan edit memakai PATCH (backup: PUT); foto lama dipertahankan bila
//   tidak diubah, dihapus bila dikirim string kosong.
// - Kirim JSON butuh anggota tersimpan (kontrak: { anggotaId, urlId? }).
'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, ScanSearch, Search, X } from 'lucide-react';
import { ImagePicker } from './ImagePicker';
import { SignaturePad } from './SignaturePad';
import KirimJsonModal from './KirimJsonModal';
import { buildAnggotaJson } from '@/lib/koperasi/kirimJson';
import { CABANG_OPTIONS } from '@/lib/koperasi/cabang';
import {
  checkNik,
  createKoperasiAnggota,
  fetchKoperasiAnggotaDetail,
  fetchKoperasiCabang,
  ocrKtp,
  updateKoperasiAnggota,
  type KoperasiAnggota,
} from '@/lib/koperasi/client';

const JENIS_KELAMIN_OPTIONS = ['Laki-laki', 'Perempuan'];
const STATUS_PERKAWINAN_OPTIONS = ['Belum Kawin', 'Kawin', 'Cerai Hidup', 'Cerai Mati'];
const PENGHASILAN_OPTIONS = [
  '< Rp 3 Juta',
  'Rp 3 Juta - 5 Juta',
  'Rp 5 Juta - 10 Juta',
  '> Rp 10 Juta',
];
const TUJUAN_OPTIONS = ['Simpanan / Tabungan', 'Pembiayaan / Pinjaman'];

export const OCR_NOT_CONFIGURED_MSG =
  'OCR KTP belum dikonfigurasi — membutuhkan kunci AI (modul API keys, Gelombang 6). Isi data anggota secara manual.';

interface AnggotaFormValues {
  cabang: string;
  nik: string;
  namaLengkap: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  alamatKtp: string;
  noHp: string;
  namaIbuKandung: string;
  pekerjaan: string;
  statusPerkawinan: string;
  penghasilanBulanan: string;
  tujuanKeanggotaan: string;
  fotoKtp: string;
  fotoAnggota: string;
  tandaTangan: string;
  setujuMobileBanking: boolean;
  setujuPernyataan: boolean;
}

const EMPTY_FORM: AnggotaFormValues = {
  cabang: '',
  nik: '',
  namaLengkap: '',
  tempatLahir: '',
  tanggalLahir: '',
  jenisKelamin: '',
  alamatKtp: '',
  noHp: '',
  namaIbuKandung: '',
  pekerjaan: '',
  statusPerkawinan: '',
  penghasilanBulanan: '',
  tujuanKeanggotaan: '',
  fotoKtp: '',
  fotoAnggota: '',
  tandaTangan: '',
  setujuMobileBanking: false,
  setujuPernyataan: false,
};

const inputCls =
  'w-full px-3 py-2 sm:px-4 sm:py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm bg-white';
const labelCls = 'block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5';
const reqMark = <span className="text-red-500">*</span>;

// No HP disimpan sebagai digit tanpa awalan 0 dan tanpa +62 (awalan +62
// hanya tampil di form, seperti referensi).
const normalizeHp = (v: string) =>
  String(v || '')
    .replace(/\D/g, '')
    .replace(/^62/, '')
    .replace(/^0/, '');

function fromAnggota(a: KoperasiAnggota): AnggotaFormValues {
  return {
    cabang: a.cabang || '',
    nik: a.nik || '',
    namaLengkap: a.namaLengkap || '',
    tempatLahir: a.tempatLahir || '',
    tanggalLahir: a.tanggalLahir || '',
    jenisKelamin: a.jenisKelamin || '',
    alamatKtp: a.alamatKtp || '',
    noHp: normalizeHp(a.noHp || ''),
    namaIbuKandung: a.namaIbuKandung || '',
    pekerjaan: a.pekerjaan || '',
    statusPerkawinan: a.statusPerkawinan || '',
    penghasilanBulanan: a.penghasilanBulanan || '',
    tujuanKeanggotaan: a.tujuanKeanggotaan || '',
    fotoKtp: a.fotoKtp || '',
    fotoAnggota: a.fotoAnggota || '',
    tandaTangan: a.tandaTangan || '',
    setujuMobileBanking: !!a.setujuMobileBanking,
    setujuPernyataan: !!a.setujuPernyataan,
  };
}

const Accordion: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, open, onToggle, children }) => (
  <div className="border border-gray-200 rounded-lg overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex justify-between items-center bg-gray-50 p-3 md:p-4 hover:bg-gray-100 focus:outline-none transition"
    >
      <h2 className="text-base sm:text-lg font-semibold text-gray-700">{title}</h2>
      <ChevronDown
        size={20}
        className={`text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      />
    </button>
    <div
      className="bg-white border-t border-gray-100 overflow-hidden transition-all duration-300"
      style={{ maxHeight: open ? '2000px' : '0', opacity: open ? 1 : 0 }}
    >
      <div className="p-3 md:p-4">{children}</div>
    </div>
  </div>
);

export default function AnggotaForm({ anggotaId }: { anggotaId?: string }) {
  const router = useRouter();
  const isEdit = !!anggotaId;
  const [form, setForm] = useState<AnggotaFormValues>(EMPTY_FORM);
  // Daftar cabang dari server (master di Pengaturan); fallback ke daftar
  // default bila endpoint gagal, supaya form tetap bisa dipakai.
  const [cabangOptions, setCabangOptions] = useState<string[]>(CABANG_OPTIONS);
  const [loadedForm, setLoadedForm] = useState<AnggotaFormValues | null>(null);
  // Foto lama (URL serve) — dipakai untuk memutuskan kirim/pertahankan/hapus.
  const [originalFoto, setOriginalFoto] = useState({ fotoKtp: '', fotoAnggota: '', tandaTangan: '' });
  const [originalNik, setOriginalNik] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [kirimOpen, setKirimOpen] = useState(false);
  // Field wajib yang masih kosong saat tombol simpan diklik.
  const [missing, setMissing] = useState<{ key: string; label: string; id: string }[]>([]);
  const [nikState, setNikState] = useState<{ kind: string; text: string; foundId?: string } | null>(null);
  const [nikChecking, setNikChecking] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState('');
  const [accA, setAccA] = useState(true);
  const [accB, setAccB] = useState(true);
  const [accC, setAccC] = useState(true);

  const set = <K extends keyof AnggotaFormValues>(key: K, value: AnggotaFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMissing([]);
  };

  const ic = (key: string) =>
    missing.some((m) => m.key === key)
      ? inputCls.replace('border-slate-200', 'border-red-400')
      : inputCls;

  useEffect(() => {
    fetchKoperasiCabang()
      .then((rows) => {
        const names = rows.map((c) => c.nama).filter(Boolean);
        if (names.length > 0) setCabangOptions(names);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit || !anggotaId) return;
    setLoading(true);
    fetchKoperasiAnggotaDetail(anggotaId)
      .then((a) => {
        const initial = fromAnggota(a);
        setForm(initial);
        setLoadedForm(initial);
        setOriginalNik(a.nik || '');
        setOriginalFoto({
          fotoKtp: a.fotoKtp || '',
          fotoAnggota: a.fotoAnggota || '',
          tandaTangan: a.tandaTangan || '',
        });
      })
      .catch((e: any) => setError(e?.message || 'Gagal memuat data anggota.'))
      .finally(() => setLoading(false));
  }, [isEdit, anggotaId]);

  const doCheckNik = async () => {
    const nik = form.nik.trim();
    if (!/^\d{16}$/.test(nik)) {
      setNikState({ kind: 'error', text: 'NIK harus 16 digit angka sebelum dicari.' });
      return;
    }
    if (isEdit && nik === originalNik) {
      setNikState({ kind: 'info', text: 'NIK ini milik anggota yang sedang diedit (tidak berubah).' });
      return;
    }
    setNikChecking(true);
    setNikState(null);
    try {
      const d = await checkNik(nik);
      if (d.exists) {
        setNikState({
          kind: 'error',
          text: `NIK sudah terdaftar atas nama ${d.anggota?.namaLengkap || '-'}${d.anggota?.cabang ? ` (${d.anggota.cabang})` : ''}.`,
          foundId: d.anggota?.id,
        });
      } else {
        setNikState({ kind: 'ok', text: 'NIK tersedia, belum terdaftar.' });
      }
    } catch (e: any) {
      setNikState({ kind: 'error', text: e?.message || 'Gagal memeriksa NIK.' });
    } finally {
      setNikChecking(false);
    }
  };

  // Auto-cek NIK: begitu NIK genap 16 digit, langsung periksa apakah sudah
  // terdaftar — tanpa menekan Cari NIK. Sekali per nilai NIK.
  const lastAutoNikRef = useRef<string | null>(null);
  useEffect(() => {
    const nik = form.nik.trim();
    if (!/^\d{16}$/.test(nik)) {
      lastAutoNikRef.current = null;
      return;
    }
    if (isEdit && nik === originalNik) return;
    if (nikChecking) return;
    if (nik === lastAutoNikRef.current) return;
    lastAutoNikRef.current = nik;
    doCheckNik();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nik, nikChecking]);

  // OCR KTP DITUNDA (Gelombang 5): tombol ini memanggil endpoint yang
  // selalu menjawab { configured: false } — pesannya ditampilkan sebagai
  // banner, bukan gagal diam-diam.
  const runOcr = async () => {
    if (ocrBusy) return;
    if (!form.fotoKtp) {
      setOcrNote('Upload foto KTP dulu sebelum analisa.');
      return;
    }
    setOcrBusy(true);
    setOcrNote('');
    try {
      const d = await ocrKtp();
      setOcrNote(d.message || OCR_NOT_CONFIGURED_MSG);
    } catch (e: any) {
      setOcrNote(e?.message || OCR_NOT_CONFIGURED_MSG);
    } finally {
      setOcrBusy(false);
    }
  };

  const resetForm = () => {
    if (isEdit && loadedForm) {
      setForm(loadedForm);
    } else {
      setForm(EMPTY_FORM);
    }
    setNikState(null);
    setOcrNote('');
    setError('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const miss: { key: string; label: string; id: string }[] = [];
    if (!form.cabang.trim()) miss.push({ key: 'cabang', label: 'Cabang', id: 'field-cabang' });
    if (!/^\d{16}$/.test(form.nik.trim())) miss.push({ key: 'nik', label: 'NIK (16 digit)', id: 'field-nik' });
    if (!form.namaLengkap.trim()) miss.push({ key: 'namaLengkap', label: 'Nama Lengkap', id: 'field-nama' });
    if (!form.tempatLahir.trim()) miss.push({ key: 'tempatLahir', label: 'Tempat Lahir', id: 'field-tempat' });
    if (!form.tanggalLahir.trim()) miss.push({ key: 'tanggalLahir', label: 'Tanggal Lahir', id: 'field-tanggal' });
    if (!form.jenisKelamin) miss.push({ key: 'jenisKelamin', label: 'Jenis Kelamin', id: 'field-jk' });
    if (!form.alamatKtp.trim()) miss.push({ key: 'alamatKtp', label: 'Alamat Sesuai KTP', id: 'field-alamat' });
    if (!form.noHp.trim()) miss.push({ key: 'noHp', label: 'No. HP / WhatsApp', id: 'field-hp' });
    if (!form.setujuPernyataan) miss.push({ key: 'setujuPernyataan', label: 'Pernyataan', id: 'field-pernyataan' });
    if (miss.length) {
      setMissing(miss);
      setAccA(true);
      setAccB(true);
      setAccC(true);
      setTimeout(() => {
        const el = document.getElementById(miss[0].id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement | null)?.focus?.();
      }, 350);
      return;
    }
    setMissing([]);
    setConfirmOpen(true);
  };

  // Foto: kirim data URL bila baru/diubah, "" bila dihapus, undefined
  // (dihilangkan) bila tidak berubah — sesuai kontrak API edit.
  const fotoField = (key: 'fotoKtp' | 'fotoAnggota' | 'tandaTangan') => {
    const cur = form[key];
    const orig = originalFoto[key];
    if (!isEdit) return cur || '';
    if (cur === orig) return undefined;
    return cur || '';
  };

  const confirmSave = async () => {
    setSaving(true);
    try {
      const fotoKtp = fotoField('fotoKtp');
      const fotoAnggota = fotoField('fotoAnggota');
      const tandaTangan = fotoField('tandaTangan');
      const payload: Record<string, unknown> = {
        ...form,
        cabang: form.cabang.trim(),
      };
      // Hapus field foto yang tidak berubah (undefined) agar API
      // mempertahankan foto lama; JSON.stringify membuang undefined.
      if (fotoKtp === undefined) delete payload.fotoKtp;
      else payload.fotoKtp = fotoKtp;
      if (fotoAnggota === undefined) delete payload.fotoAnggota;
      else payload.fotoAnggota = fotoAnggota;
      if (tandaTangan === undefined) delete payload.tandaTangan;
      else payload.tandaTangan = tandaTangan;
      if (isEdit && anggotaId) {
        await updateKoperasiAnggota(anggotaId, payload as any);
      } else {
        await createKoperasiAnggota(payload as any);
      }
      setConfirmOpen(false);
      router.push('/koperasi/anggota');
    } catch (e: any) {
      setConfirmOpen(false);
      setError(e?.message || 'Gagal menyimpan anggota.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const fmtTanggal = (s: string) => {
    if (!s) return '—';
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const confirmRows: [string, string][] = [
    ['Cabang', form.cabang],
    ['NIK', form.nik],
    ['Nama Lengkap', form.namaLengkap],
    ['Tempat Lahir', form.tempatLahir],
    ['Tanggal Lahir', fmtTanggal(form.tanggalLahir)],
    ['Jenis Kelamin', form.jenisKelamin || '—'],
    ['Alamat Sesuai KTP', form.alamatKtp],
    ['No. HP / WhatsApp', form.noHp ? `+62 ${form.noHp}` : '—'],
    ['Nama Ibu Kandung', form.namaIbuKandung || '—'],
    ['Pekerjaan', form.pekerjaan || '—'],
    ['Status Perkawinan', form.statusPerkawinan || '—'],
    ['Penghasilan Bulanan', form.penghasilanBulanan || '—'],
    ['Tujuan Keanggotaan', form.tujuanKeanggotaan || '—'],
    ['Mobile Banking', form.setujuMobileBanking ? 'Ya' : 'Tidak'],
    ['Pernyataan', form.setujuPernyataan ? 'Disetujui' : '—'],
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        <Loader2 size={18} className="animate-spin mr-2" /> Memuat data anggota...
      </div>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="bg-emerald-600 text-white p-4 sm:p-6 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">
            {isEdit ? 'Edit Data Anggota' : 'Formulir Pendaftaran Anggota'}
          </h1>
        </div>
        <Link
          href="/koperasi/anggota"
          className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs sm:text-sm font-semibold border border-emerald-400 shadow whitespace-nowrap"
        >
          List Anggota
        </Link>
      </div>

      <div className="p-3.5 sm:p-6 md:p-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Upload KTP — OCR DITUNDA (Gelombang 5): isi otomatis via AI belum
            tersedia; tombol Analisa menampilkan pesan itu dengan jelas. */}
        <div className="mb-5 md:mb-8 p-3.5 sm:p-5 bg-emerald-50 rounded-lg border border-emerald-200">
          <h2 className="text-base sm:text-lg font-semibold text-emerald-800 mb-1">Upload KTP</h2>
          <p className="text-xs sm:text-sm text-gray-600 mb-3">
            Upload foto KTP Anda. Isi otomatis via AI belum tersedia — isi data anggota secara manual di bawah.
          </p>
          <ImagePicker
            label="Foto KTP"
            value={form.fotoKtp}
            onChange={(v) => set('fotoKtp', v)}
            hint="Foto KTP dari galeri atau langsung dari kamera."
            dropNoun="foto KTP"
            perspectiveCrop
          />
          {form.fotoKtp && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={ocrBusy}
                onClick={runOcr}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {ocrBusy ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />} Analisa KTP dengan AI
              </button>
            </div>
          )}
          {ocrNote && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              {ocrNote}
            </div>
          )}
        </div>

        <form onSubmit={submit}>
          <div className="mb-3 md:mb-4">
            <Accordion title="A. Data Identitas Pribadi" open={accA} onToggle={() => setAccA((o) => !o)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div className="md:col-span-2">
                  <label className={labelCls}>Pilihan Cabang {reqMark}</label>
                  <input
                    type="text"
                    id="field-cabang"
                    list="koperasi-cabang-list"
                    value={form.cabang}
                    onChange={(e) => set('cabang', e.target.value)}
                    placeholder="Pilih atau ketik cabang baru..."
                    className={ic('cabang')}
                  />
                  <datalist id="koperasi-cabang-list">
                    {cabangOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={labelCls}>NIK (Sesuai KTP) {reqMark}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="field-nik"
                      inputMode="numeric"
                      maxLength={16}
                      value={form.nik}
                      onChange={(e) => {
                        set('nik', e.target.value.replace(/\D/g, '').slice(0, 16));
                        setNikState(null);
                      }}
                      placeholder="16 digit angka"
                      className={`${ic('nik')} flex-1`}
                    />
                    <button
                      type="button"
                      disabled={nikChecking}
                      onClick={doCheckNik}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium whitespace-nowrap disabled:opacity-50"
                    >
                      {nikChecking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      Cari NIK
                    </button>
                  </div>
                  {nikState && (
                    <div className="mt-1">
                      <p
                        className={`text-xs ${
                          nikState.kind === 'ok'
                            ? 'text-emerald-600'
                            : nikState.kind === 'info'
                              ? 'text-gray-500'
                              : 'text-red-600'
                        }`}
                      >
                        {nikState.text}
                      </p>
                      {nikState.foundId && (
                        <button
                          type="button"
                          onClick={() => router.push(`/koperasi/anggota-baru/${nikState.foundId}`)}
                          className="mt-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
                        >
                          Buka &amp; edit anggota ini
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Nama Lengkap {reqMark}</label>
                  <input type="text" id="field-nama" value={form.namaLengkap} onChange={(e) => set('namaLengkap', e.target.value)} className={ic('namaLengkap')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Tempat Lahir {reqMark}</label>
                    <input type="text" id="field-tempat" value={form.tempatLahir} onChange={(e) => set('tempatLahir', e.target.value)} className={ic('tempatLahir')} />
                  </div>
                  <div>
                    <label className={labelCls}>Tanggal Lahir {reqMark}</label>
                    <input type="date" id="field-tanggal" value={form.tanggalLahir} onChange={(e) => set('tanggalLahir', e.target.value)} className={ic('tanggalLahir')} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Jenis Kelamin {reqMark}</label>
                  <select id="field-jk" value={form.jenisKelamin} onChange={(e) => set('jenisKelamin', e.target.value)} className={ic('jenisKelamin')}>
                    <option value="">Pilih...</option>
                    {JENIS_KELAMIN_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>Alamat Sesuai KTP {reqMark}</label>
                  <textarea
                    id="field-alamat"
                    value={form.alamatKtp}
                    onChange={(e) => set('alamatKtp', e.target.value)}
                    rows={2}
                    className={`${ic('alamatKtp')} resize-y`}
                  />
                </div>
                <div>
                  <label className={labelCls}>No. HP / WhatsApp {reqMark}</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md font-medium text-sm">+62</span>
                    <input
                      type="tel"
                      id="field-hp"
                      inputMode="numeric"
                      value={form.noHp}
                      onChange={(e) => set('noHp', normalizeHp(e.target.value))}
                      placeholder="8123456789"
                      className={
                        missing.some((m) => m.key === 'noHp')
                          ? 'w-full px-3 py-2 border-2 border-red-400 rounded-r-md focus:outline-none focus:ring-2 focus:ring-red-400 text-sm bg-white'
                          : 'w-full px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white'
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>
                    Nama Ibu Kandung <span className="text-xs text-gray-400 font-normal">(Opsional)</span>
                  </label>
                  <input type="text" value={form.namaIbuKandung} onChange={(e) => set('namaIbuKandung', e.target.value)} className={inputCls} />
                </div>
              </div>
            </Accordion>
          </div>

          <div className="mb-3 md:mb-4">
            <Accordion title="B. Data Pekerjaan & Keuangan (KYC)" open={accB} onToggle={() => setAccB((o) => !o)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className={labelCls}>Pekerjaan</label>
                  <input type="text" value={form.pekerjaan} onChange={(e) => set('pekerjaan', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Status Perkawinan</label>
                  <select value={form.statusPerkawinan} onChange={(e) => set('statusPerkawinan', e.target.value)} className={inputCls}>
                    <option value="">Pilih...</option>
                    {STATUS_PERKAWINAN_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Perkiraan Penghasilan/Bulan</label>
                  <select value={form.penghasilanBulanan} onChange={(e) => set('penghasilanBulanan', e.target.value)} className={inputCls}>
                    <option value="">Pilih...</option>
                    {PENGHASILAN_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tujuan Keanggotaan</label>
                  <select value={form.tujuanKeanggotaan} onChange={(e) => set('tujuanKeanggotaan', e.target.value)} className={inputCls}>
                    <option value="">Pilih...</option>
                    {TUJUAN_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Accordion>
          </div>

          <div className="mb-5 md:mb-8">
            <Accordion title="C. Dokumen Tambahan & Tanda Tangan" open={accC} onToggle={() => setAccC((o) => !o)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <ImagePicker
                    label="Foto Diri (Kamera/Galeri)"
                    value={form.fotoAnggota}
                    onChange={(v) => set('fotoAnggota', v)}
                    hint="Foto anggota dari galeri atau langsung dari kamera."
                    dropNoun="foto diri"
                  />
                </div>
                <div>
                  <SignaturePad value={form.tandaTangan} onChange={(v) => set('tandaTangan', v)} />
                </div>
              </div>
            </Accordion>
          </div>

          <div className="bg-gray-50 p-3 md:p-4 border border-gray-200 rounded-md mb-3 md:mb-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.setujuMobileBanking}
                onChange={(e) => set('setujuMobileBanking', e.target.checked)}
                className="mt-1 w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-600 leading-relaxed">Bersedia menggunakan Layanan Mobile Banking.</span>
            </label>
          </div>

          <div className="bg-gray-50 p-3 md:p-4 border border-gray-200 rounded-md mb-5 md:mb-8">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="field-pernyataan"
                checked={form.setujuPernyataan}
                onChange={(e) => set('setujuPernyataan', e.target.checked)}
                className="mt-1 w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <span className={`text-sm leading-relaxed ${missing.some((m) => m.key === 'setujuPernyataan') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                <strong>Pernyataan:</strong> Saya menyatakan bahwa data yang diberikan adalah benar. Saya bersedia mematuhi AD/ART KSPPS. {reqMark}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
            >
              Reset
            </button>
            <Link
              href="/koperasi/anggota"
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
            >
              Batal
            </Link>
            <button
              type="button"
              onClick={() => setKirimOpen(true)}
              className="px-5 py-2 border border-emerald-300 text-emerald-700 font-medium rounded-md hover:bg-emerald-50 transition"
            >
              Kirim JSON
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Daftar Sekarang'}
            </button>
          </div>
        </form>
      </div>
    </div>

      {missing.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:max-w-sm z-[90] bg-red-600 text-white rounded-xl shadow-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">Isi semua field wajib</p>
              <p className="text-xs text-red-100 mt-1">
                Masih kosong: {missing.map((m) => m.label).join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMissing([])}
              aria-label="Tutup notifikasi"
              className="shrink-0 p-1 rounded-full hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {isEdit ? 'Konfirmasi Perubahan Data' : 'Konfirmasi Data Anggota'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Periksa kembali data berikut sebelum disimpan.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                aria-label="Tutup"
                className="shrink-0 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-2 text-sm">
              {confirmRows.map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="w-40 shrink-0 text-slate-500">{label}</span>
                  <span className="flex-1 font-medium text-slate-800 break-words">{value || '—'}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-slate-500 mb-2">Foto &amp; Tanda Tangan</p>
                <div className="flex gap-4">
                  {([
                    ['Foto KTP', form.fotoKtp],
                    ['Foto Diri', form.fotoAnggota],
                    ['Tanda Tangan', form.tandaTangan],
                  ] as [string, string][]).map(([label, src]) => (
                    <div key={label} className="text-center">
                      {src ? (
                        <img src={src} alt={label} className="w-20 h-20 object-cover rounded-lg border border-slate-200 bg-slate-50" />
                      ) : (
                        <div className="w-20 h-20 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 px-1">
                          Belum ada
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmSave}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
      {kirimOpen && (
        <KirimJsonModal
          open={kirimOpen}
          onClose={() => setKirimOpen(false)}
          payload={buildAnggotaJson(form)}
          anggotaId={isEdit ? anggotaId : null}
        />
      )}
    </>
  );
}
