'use client';

// Porting dari backup src/pages/Calculator.tsx (MyPerform) → WOORK.
// "Kalkulator Gadai Elektronik": taksir & plafond HP berdasarkan checklist
// kondisi, tarif biayaAdminElektronik + jasaTitip.elektronik dari
// GoldSetting (key 'tarif_biaya', fallback lib/emas/defaultSettings.ts).
// Perubahan vs backup:
// - Router & konteks auth backup dihapus; simpan/
//   muat/hapus simulasi lewat helper lib/emas/client.ts
//   (fetchSimulations / saveSimulation / deleteSimulation, type 'Elektronik');
//   session dibaca server dari cookie NextAuth, user tidak dioper ke API.
// - SELURUH panel asisten AI DIHAPUS (Gelombang 6, belum ada backend):
//   selector agen/model AI, endpoint chat & kunci AI backup, endpoint daftar
//   model provider AI, info limit kunci & formatter-nya,
//   tombol "Cari" tahun & harga (AI search), dan seksi "Simulasi by AI"
//   beserta halaman cetak ke-2-nya. Kalkulasi inti TIDAK memakai AI.
// - Tombol kamera (Camera) DIPERTAHANKAN: itu hanya file picker foto lokal
//   (maks 5 foto, URL.createObjectURL), bukan OCR dan tidak memanggil AI.
// - Foto tidak ikut tersimpan ke server (object URL lokal); hanya data
//   form yang disimpan sebagai simulasi — sama seperti backup.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calculator, Save, RefreshCcw, Smartphone, User, CheckSquare, Settings, Box,
  AlertCircle, DollarSign, Percent, AlertTriangle, XCircle, Camera, X, Printer,
  FolderOpen, Loader2, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  fetchGoldSettings, fetchSimulations, saveSimulation, deleteSimulation,
} from '@/lib/emas/client';
import type { SimulationItem } from '@/lib/emas/client';
import { defaultSettingsData } from '@/lib/emas/defaultSettings';

export default function CalculatorPage() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [savedSimulations, setSavedSimulations] = useState<SimulationItem[]>([]);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Toast Notification State
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'warning' | 'info', text: string) => {
    setAlertMsg({ type, text });
  };

  useEffect(() => {
    if (alertMsg) {
      const timer = setTimeout(() => setAlertMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  // A. DATA ANGGOTA
  const [member, setMember] = useState({
    nama: '', noKtp: '', noHp: '', alamat: '', tanggal: new Date().toISOString().split('T')[0],
  });

  // B. DATA BARANG
  const [item, setItem] = useState({
    merk: '', imei: '', tahun: '', hargaBaru: '', hargaSecond: '', network: '4G', ram: '', rom: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Error States
  const [errors, setErrors] = useState({ ktp: '', imei: '' });

  // C, D, E, F. CHECKLIST (0-5)
  const [scores, setScores] = useState<Record<string, number>>({
    layar: 4, body: 4, kamera: 4, tombol: 4, baterai: 4,
    mesin: 4, sinyal: 4, wifi: 4, speaker: 4,
    dus: 4, charger: 4, nota: 4,
    panic: 4, icloud: 4,
  });

  // G. PARAMETER GADAI
  const [ltv, setLtv] = useState(70);
  const ltvSliderRef = useRef<HTMLInputElement>(null);
  const [jasa, setJasa] = useState('4');
  const [jkw, setJkw] = useState(30);
  const [biayaAdmin, setBiayaAdmin] = useState('');
  const [pinjamanDiambil, setPinjamanDiambil] = useState(0);
  const [adminTiers, setAdminTiers] = useState<any[]>([]);
  const [jasaTitipTiers, setJasaTitipTiers] = useState<any[]>([]);

  // Ambil pengaturan biaya admin elektronik dan jasa titip elektronik dari
  // GoldSetting (key 'tarif_biaya'); fallback ke defaultSettingsData.
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsData = await fetchGoldSettings();
        const tarifData = settingsData?.tarif_biaya;
        if (tarifData) {
          if (tarifData.biayaAdminElektronik) {
            setAdminTiers(tarifData.biayaAdminElektronik);
          }
          if (tarifData.jasaTitip?.elektronik) {
            setJasaTitipTiers(tarifData.jasaTitip.elektronik);
          } else {
            setJasaTitipTiers(defaultSettingsData.jasaTitip.elektronik || [{ id: '1', min: 0, max: 25000000, standar: 96, promo: 0 }]);
          }
        } else {
          setJasaTitipTiers(defaultSettingsData.jasaTitip.elektronik || [{ id: '1', min: 0, max: 25000000, standar: 96, promo: 0 }]);
        }
      } catch (err) {
        console.error('Gagal mengambil pengaturan biaya admin elektronik:', err);
        setAdminTiers(defaultSettingsData.biayaAdminElektronik || []);
        setJasaTitipTiers(defaultSettingsData.jasaTitip.elektronik || [{ id: '1', min: 0, max: 25000000, standar: 96, promo: 0 }]);
      }
    };
    fetchSettings();
  }, []);

  // State untuk Accordion
  const [expandedSections, setExpandedSections] = useState({
    anggota: true,
    barang: true,
    checklist: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const isIphone = item.merk.toLowerCase().includes('iphone');
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const savedData = localStorage.getItem('gadai_data');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        if (parsedData.member) setMember(parsedData.member);
        if (parsedData.item) setItem(parsedData.item);
        if (parsedData.scores) setScores(parsedData.scores);
        if (parsedData.ltv !== undefined) setLtv(parsedData.ltv);
        if (parsedData.biayaAdmin !== undefined) setBiayaAdmin(parsedData.biayaAdmin);
        if (parsedData.jkw !== undefined) setJkw(parsedData.jkw);
        if (parsedData.jasa !== undefined) setJasa(parsedData.jasa);
        if (parsedData.pinjamanDiambil !== undefined) setPinjamanDiambil(parsedData.pinjamanDiambil);
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
  }, []);

  // Bobot Poin Maksimal
  const weights: Record<string, number> = {
    layar: 20, body: 15, kamera: 10, tombol: 10, baterai: 10,
    mesin: 15, sinyal: 10, wifi: 5, speaker: 5,
    dus: 3, charger: 4, nota: 3,
    panic: 20, icloud: 20,
  };

  const formatRp = (number: any) => {
    if (!number || isNaN(number)) return 'Rp0';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
  };

  const formatTanggal = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Auto-update LTV berdasarkan usia HP
  useEffect(() => {
    if (item.tahun) {
      const inputYear = parseInt(item.tahun, 10);
      if (!isNaN(inputYear)) {
        const age = currentYear - inputYear;
        if (age <= 2) {
          setLtv(70);
        } else if (age <= 5) {
          setLtv(50);
        } else {
          setLtv(30);
        }
      }
    }
  }, [item.tahun, currentYear]);

  // Mencegah scroll layar saat scroll di slider LTV
  useEffect(() => {
    const slider = ltvSliderRef.current;
    if (!slider) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 1 : -1;
      setLtv((prev) => Math.min(Math.max(Number(prev) + step, 0), 100));
    };

    slider.addEventListener('wheel', handleWheel, { passive: false });
    return () => slider.removeEventListener('wheel', handleWheel);
  }, []);

  // 1. Kalkulasi Dasar (Nilai Taksiran & Plafond Maksimal)
  const baseCalculations = useMemo(() => {
    let currentPoints = 0;
    let maxPoints = 0;

    const baseKeys = ['layar', 'body', 'kamera', 'tombol', 'baterai', 'mesin', 'sinyal', 'wifi', 'speaker', 'dus', 'charger', 'nota'];
    baseKeys.forEach((key) => {
      maxPoints += weights[key];
      currentPoints += (scores[key] / 5) * weights[key];
    });

    if (isIphone) {
      ['panic', 'icloud'].forEach((key) => {
        maxPoints += weights[key];
        currentPoints += (scores[key] / 5) * weights[key];
      });
    }

    const persentasePoin = maxPoints > 0 ? currentPoints / maxPoints : 0;
    const hargaSecond = parseFloat(String(item.hargaSecond).replace(/[^0-9.-]+/g, '')) || 0;
    const nilaiTaksiran = persentasePoin * hargaSecond;
    const plafond = nilaiTaksiran * (ltv / 100);

    return {
      currentPoints,
      maxPoints,
      persentasePoin: persentasePoin * 100,
      nilaiTaksiran,
      plafond,
    };
  }, [scores, item.hargaSecond, ltv, isIphone]);

  // Fungsi penentuan Biaya Admin Otomatis
  const calculateAdminFee = (pinjaman: number) => {
    if (pinjaman <= 0) return 0;

    if (adminTiers && adminTiers.length > 0) {
      for (const tier of adminTiers) {
        if (pinjaman >= tier.min && (tier.max === null || pinjaman <= tier.max)) {
          return tier.isPercentage ? pinjaman * (tier.fee / 100) : tier.fee;
        }
      }
    }

    // Fallback ke nilai hardcoded lama bila tier belum termuat
    if (pinjaman <= 1000000) return 10000;
    if (pinjaman <= 2000000) return 25000;
    if (pinjaman <= 3000000) return 45000;
    if (pinjaman <= 4000000) return 65000;
    if (pinjaman <= 5000000) return 100000;
    if (pinjaman <= 10000000) return 200000;
    if (pinjaman <= 20000000) return 400000;
    return 500000; // Untuk > 20jt s/d 25jt+
  };

  // 2. Auto-Update Pinjaman Diambil (Dibulatkan 10.000 kebawah)
  useEffect(() => {
    const rounded = Math.floor(baseCalculations.plafond / 10000) * 10000;
    setPinjamanDiambil(rounded);
  }, [baseCalculations.plafond]);

  // 3. Auto-Update Biaya Admin berdasarkan Pinjaman Diambil
  useEffect(() => {
    setBiayaAdmin(String(calculateAdminFee(pinjamanDiambil)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinjamanDiambil, adminTiers]);

  // 3.5. Auto-Update Jasa per 15 Hari (%) berdasarkan Pinjaman Diambil & Jasa Titip Tiers
  useEffect(() => {
    if (jasaTitipTiers.length > 0) {
      const tier = jasaTitipTiers.find((t) => {
        const min = t.min || 0;
        const max = t.max === null || t.max === undefined ? Infinity : t.max;
        return pinjamanDiambil >= min && pinjamanDiambil <= max;
      });

      if (tier) {
        // Gunakan promo jika tersedia dan > 0, jika tidak gunakan standar
        const yearlyRate = (tier.promo > 0) ? tier.promo : tier.standar;
        // Konversi ke rate per 15 hari: rate tahunan / 24
        const ratePer15Days = yearlyRate / 24;
        setJasa(String(ratePer15Days));
      } else {
        setJasa('4');
      }
    }
  }, [pinjamanDiambil, jasaTitipTiers]);

  // 4. Kalkulasi Akhir (Berdasarkan Pinjaman Yang Diambil & Biaya Admin)
  const finalCalculations = useMemo(() => {
    const tarifJasa = parseFloat(jasa) || 0;
    const pengaliJkw = jkw / 15;
    const totalJasa = pinjamanDiambil * (tarifJasa / 100) * pengaliJkw;
    const adminFee = parseFloat(String(biayaAdmin).replace(/[^0-9.-]+/g, '')) || 0;
    const uangDiterima = pinjamanDiambil - adminFee - totalJasa;
    const kewajiban = pinjamanDiambil + totalJasa;

    return { totalJasa, adminFee, uangDiterima, kewajiban };
  }, [pinjamanDiambil, jasa, jkw, biayaAdmin]);

  // Gabungan kalkulasi untuk UI
  const calculations = { ...baseCalculations, ...finalCalculations };

  const handleScoreChange = (key: string, val: number) => setScores((prev) => ({ ...prev, [key]: val }));

  const handlePriceChange = (field: string, value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    setItem((prev) => ({ ...prev, [field]: numericValue }));
  };

  const handleKtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setMember({ ...member, noKtp: val });
    if (val.length > 0 && val.length !== 16) {
      setErrors((prev) => ({ ...prev, ktp: 'No KTP harus tepat 16 digit angka' }));
    } else {
      setErrors((prev) => ({ ...prev, ktp: '' }));
    }
  };

  const handleImeiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setItem({ ...item, imei: val });
    if (val.length > 0 && val.length !== 15) {
      setErrors((prev) => ({ ...prev, imei: 'IMEI harus tepat 15 digit angka' }));
    } else {
      setErrors((prev) => ({ ...prev, imei: '' }));
    }
  };

  const handleCheckImei = () => {
    if (!item.imei) return;
    const textArea = document.createElement('textarea');
    textArea.value = item.imei;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); } catch (err) { /* abaikan */ }
    document.body.removeChild(textArea);
    window.open('https://www.imei.info/id/', '_blank');
  };

  const handleSave = async () => {
    const simulationName = prompt('Masukkan nama untuk menyimpan simulasi ini:', member.nama || `Simulasi ${new Date().toLocaleDateString()}`);
    if (!simulationName) return;

    setIsSaving(true);
    const dataToSave = {
      member,
      item,
      scores,
      ltv,
      biayaAdmin,
      jkw,
      jasa,
      pinjamanDiambil,
    };

    try {
      // Simulasi tersimpan di WOORK via /api/emas/simulations (NextAuth).
      await saveSimulation({
        name: simulationName,
        dataString: JSON.stringify(dataToSave),
        type: 'Elektronik',
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
        memberName: member.nama,
        itemMerk: item.merk,
        itemImei: item.imei,
        plafond: pinjamanDiambil || baseCalculations.plafond,
      });
      showNotification('success', 'Data simulasi berhasil disimpan ke Cloud!');
    } catch (error) {
      console.error('Gagal menyimpan ke Cloud:', error);
      localStorage.setItem('gadai_data', JSON.stringify(dataToSave));
      showNotification('warning', 'Gagal menyimpan ke Cloud, data disimpan secara lokal di browser.');
    }
    setIsSaving(false);
  };

  const loadSimulations = async () => {
    setIsLoadingSaved(true);
    try {
      const loaded = await fetchSimulations('Elektronik');
      loaded.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setSavedSimulations(loaded);
    } catch (error) {
      console.error('Gagal memuat simulasi:', error);
      showNotification('error', 'Gagal memuat simulasi dari Cloud.');
    }
    setIsLoadingSaved(false);
  };

  const applySimulation = (dataString: string) => {
    try {
      const parsed = JSON.parse(dataString);
      if (parsed.member) setMember(parsed.member);
      if (parsed.item) setItem(parsed.item);
      if (parsed.scores) setScores(parsed.scores);
      if (parsed.ltv) setLtv(parsed.ltv);
      if (parsed.biayaAdmin) setBiayaAdmin(parsed.biayaAdmin);
      if (parsed.jkw) setJkw(parsed.jkw);
      if (parsed.jasa) setJasa(parsed.jasa);
      if (parsed.pinjamanDiambil) setPinjamanDiambil(parsed.pinjamanDiambil);
      setIsLoadModalOpen(false);
      showNotification('success', 'Simulasi berhasil dimuat!');
    } catch (e) {
      showNotification('error', 'Data simulasi tidak valid.');
    }
  };

  const handleDeleteSimulation = async (id: string) => {
    try {
      await deleteSimulation(id);
      setSavedSimulations((prev) => prev.filter((sim) => sim.id !== id));
      showNotification('success', 'Simulasi berhasil dihapus!');
    } catch (error) {
      console.error('Gagal menghapus:', error);
      showNotification('error', 'Gagal menghapus simulasi. Silakan periksa koneksi Anda atau coba lagi.');
    }
  };

  const handleReset = () => {
    setIsResetConfirmOpen(true);
  };

  const confirmReset = () => {
    setIsResetConfirmOpen(false);
    setMember({ nama: '', noKtp: '', noHp: '', alamat: '', tanggal: new Date().toISOString().split('T')[0] });
    setItem({ merk: '', ram: '', rom: '', imei: '', tahun: '', hargaBaru: '', hargaSecond: '', network: '4G' });
    setPhotos([]);
    setScores({
      layar: 4, body: 4, kamera: 4, tombol: 4, baterai: 4,
      mesin: 4, sinyal: 4, wifi: 4, speaker: 4,
      dus: 4, charger: 4, nota: 4,
      panic: 4, icloud: 4,
    });
    setLtv(70);
    setBiayaAdmin('');
    setJkw(30);
    setJasa('4');
    setPinjamanDiambil(0);
    setErrors({ ktp: '', imei: '' });
    localStorage.removeItem('gadai_data');
    showNotification('info', 'Formulir berhasil direset.');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const availableSlots = 5 - photos.length;
    if (availableSlots <= 0) return;
    const allowedFiles = files.slice(0, availableSlots);
    const newPhotos = allowedFiles.map((file: any) => URL.createObjectURL(file as Blob));
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePrint = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const printContent = document.querySelector('.print-block');
    if (!printContent) return;

    // Buka tab/jendela baru
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Tolong izinkan pop-up (Allow Pop-ups) browser untuk mencetak.');
      return;
    }

    // Salin semua style (Tailwind & Custom CSS)
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('');

    // Tulis dokumen baru khusus untuk print
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Kalkulator Gadai</title>
          ${styles}
          <style>
            body { background-color: white !important; margin: 0; padding: 0; }
            .print-block { display: block !important; }
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .page-break { page-break-before: always !important; display: block !important; height: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.outerHTML}
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isRejected = isIphone && scores.icloud === 0;
  const isNotRecommended = scores.sinyal === 0;
  const itemFullString = `${item.merk} ${item.network !== '4G' ? item.network : ''} ${item.ram ? `RAM ${item.ram}GB` : ''} ${item.rom ? `ROM ${item.rom}GB` : ''}`.trim();

  const ScoreSelector = ({ label, stateKey, disabled = false }: { label: string; stateKey: string; disabled?: boolean }) => (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-1.5 border-b border-gray-200 ${disabled ? 'opacity-50 bg-gray-50' : ''}`}>
      <div className="flex flex-col mb-1 sm:mb-0">
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map((num) => (
          <button
            key={num}
            type="button"
            disabled={disabled}
            onClick={() => handleScoreChange(stateKey, num)}
            className={`w-7 h-7 rounded-md text-sm font-bold transition-colors ${
              scores[stateKey] === num && !disabled
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full font-sans pb-12">
      <style>
        {`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            html, body, #root, .min-h-screen {
              height: auto !important;
              min-height: auto !important;
              overflow: visible !important;
              position: static !important;
            }
            body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-hidden { display: none !important; }
            .print-block { display: block !important; }
            .print-flex { display: flex !important; }
            .print-grid { display: grid !important; }
            .page-break { page-break-before: always !important; break-before: page !important; display: block !important; height: 0; }
          }
        `}
      </style>

      {/* ===================================================================== */}
      {/* TAMPILAN LAYAR (INTERAKTIF)                                           */}
      {/* ===================================================================== */}
      <div className="w-full space-y-6 print-hidden">

        {/* Floating Toast Notification */}
        {alertMsg && (
          <div className={`fixed top-4 right-4 z-50 max-w-md p-3.5 rounded-xl shadow-2xl border flex items-start gap-3 transition-all duration-300 ${
            alertMsg.type === 'error' ? 'bg-red-50 border-red-300 text-red-900' :
            alertMsg.type === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-900' :
            alertMsg.type === 'info' ? 'bg-blue-50 border-blue-300 text-blue-900' :
            'bg-green-50 border-green-300 text-green-900'
          }`}>
            {alertMsg.type === 'error' && <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />}
            {alertMsg.type === 'warning' && <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />}
            {alertMsg.type === 'info' && <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />}
            {alertMsg.type === 'success' && <CheckSquare className="text-green-600 flex-shrink-0 mt-0.5" size={18} />}
            <div className="flex-1 text-xs font-medium leading-relaxed">{alertMsg.text}</div>
            <button onClick={() => setAlertMsg(null)} className="text-gray-400 hover:text-gray-700">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="bg-blue-700 text-white p-4 sm:p-5 rounded-xl shadow-md flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <Calculator size={30} className="shrink-0" />
            <div>
              <h1 className="text-base sm:text-lg font-bold">Kalkulator Gadai Elektronik</h1>
              <p className="text-blue-100 text-xs">Estimasi Taksiran &amp; Plafond Handphone</p>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button type="button" onClick={() => { setIsLoadModalOpen(true); loadSimulations(); }} className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm" title="Muat Data">
              <FolderOpen size={16} /> <span className="hidden md:inline">Muat</span>
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50" title="Simpan">
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} <span className="hidden md:inline">Simpan</span>
            </button>
            <button type="button" onClick={handleReset} className="bg-white text-red-600 hover:bg-red-50 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm" title="Reset">
              <RefreshCcw size={16} /> <span className="hidden md:inline">Reset</span>
            </button>
            <button type="button" onClick={handlePrint} className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm" title="Cetak">
              <Printer size={16} /> <span className="hidden md:inline">Cetak</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* A. DATA ANGGOTA */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <button
              type="button"
              onClick={() => toggleSection('anggota')}
              className="w-full flex items-center justify-between p-4 sm:p-6 pb-2 text-left border-b border-gray-200"
            >
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                <User size={18} className="text-blue-600" /> A. Data Anggota
              </h2>
              {expandedSections.anggota ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
            </button>
            <div className={`${expandedSections.anggota ? 'block' : 'hidden'} p-4 sm:p-6 pt-4 space-y-3`}>
              <input type="text" placeholder="Nama Lengkap" className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={member.nama} onChange={(e) => setMember({ ...member, nama: e.target.value })} />
              <div>
                <input type="text" maxLength={16} placeholder="No KTP" className={`w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent ${errors.ktp ? 'border-red-500 ring-red-500' : ''}`} value={member.noKtp} onChange={handleKtpChange} />
                {errors.ktp && <p className="text-red-500 text-xs mt-1">{errors.ktp}</p>}
              </div>
              <div className="flex">
                <span className="inline-flex items-center px-3 text-sm text-gray-700 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md">
                  +62
                </span>
                <input type="text" placeholder="81234567890" className="rounded-none rounded-r-md border border-gray-300 w-full p-2 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={member.noHp} onChange={(e) => setMember({ ...member, noHp: e.target.value.replace(/^0+/, '').replace(/[^0-9]/g, '') })} />
              </div>
              <textarea placeholder="Alamat" className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={member.alamat} onChange={(e) => setMember({ ...member, alamat: e.target.value })} />
              <input type="date" className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={member.tanggal} onChange={(e) => setMember({ ...member, tanggal: e.target.value })} />
            </div>
          </div>

          {/* B. DATA BARANG */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <button
              type="button"
              onClick={() => toggleSection('barang')}
              className="w-full flex items-center justify-between p-4 sm:p-6 pb-2 text-left border-b border-gray-200"
            >
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                <Smartphone size={18} className="text-blue-600" /> B. Data Barang
              </h2>
              {expandedSections.barang ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
            </button>
            <div className={`${expandedSections.barang ? 'block' : 'hidden'} p-4 sm:p-6 pt-4 space-y-3`}>
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Merk / Tipe HP &amp; Jaringan</label>
                <div className="flex gap-2 w-full">
                  <input type="text" placeholder="Contoh: iPhone 13 Pro" className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={item.merk} onChange={(e) => setItem({ ...item, merk: e.target.value })} />
                  <button
                    type="button"
                    onClick={() => setItem({ ...item, network: item.network === '4G' ? '5G' : '4G' })}
                    className={`px-3 py-2 rounded-md font-bold text-sm whitespace-nowrap transition-colors ${item.network === '5G' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    {item.network}
                  </button>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Spesifikasi RAM &amp; ROM (GB)</label>
                <div className="flex gap-2 w-full">
                  <div className="relative flex-1">
                    <input type="number" placeholder="RAM" className="w-full p-2 border border-gray-300 rounded-md pr-8 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={item.ram} onChange={(e) => setItem({ ...item, ram: e.target.value })} />
                    <span className="absolute right-2 top-2.5 text-xs text-gray-400 font-bold">GB</span>
                  </div>
                  <div className="relative flex-1">
                    <input type="number" placeholder="ROM" className="w-full p-2 border border-gray-300 rounded-md pr-8 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={item.rom} onChange={(e) => setItem({ ...item, rom: e.target.value })} />
                    <span className="absolute right-2 top-2.5 text-xs text-gray-400 font-bold">GB</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">IMEI</label>
                <div className="w-full">
                  <div className="flex gap-2">
                    <input type="text" maxLength={15} placeholder="IMEI" className={`w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent ${errors.imei ? 'border-red-500 ring-red-500' : ''}`} value={item.imei} onChange={handleImeiChange} />
                    <button
                      type="button"
                      onClick={handleCheckImei}
                      disabled={!item.imei}
                      className={`px-4 py-2 rounded-md font-bold text-white whitespace-nowrap transition-colors ${item.imei ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'}`}
                    >
                      Cek
                    </button>
                  </div>
                  {errors.imei && <p className="text-red-500 text-xs mt-1">{errors.imei}</p>}
                </div>
              </div>

              {/* TAHUN RILIS/PEMBELIAN (input manual — pencarian AI dihapus) */}
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Tahun Rilis/Pembelian</label>
                <div className="flex gap-2 w-full">
                  <input type="number" placeholder="Tahun" className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={item.tahun} onChange={(e) => setItem({ ...item, tahun: e.target.value })} />
                </div>
                {(() => {
                  if (!item.tahun) return null;
                  const inputYear = parseInt(item.tahun, 10);
                  const diff = currentYear - inputYear;
                  if (diff < 0) return <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Tahun Salah</p>;
                  if (diff >= 5) return <p className="text-orange-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Usia HP sudah 5 tahun/lebih</p>;
                  if (diff >= 3) return <p className="text-yellow-600 text-xs mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Usia HP sudah 3 tahun/lebih</p>;
                  return null;
                })()}
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Harga Baru</label>
                <div className="w-full">
                  <div className="relative flex items-center gap-2 w-full">
                    <div className="relative flex-grow">
                      <span className="absolute left-3 top-2.5 font-semibold text-gray-600">Rp</span>
                      <input type="text" placeholder="Harga Baru" className="w-full p-2 pl-10 border border-gray-300 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" value={item.hargaBaru ? new Intl.NumberFormat('id-ID').format(Number(item.hargaBaru)) : ''} onChange={(e) => handlePriceChange('hargaBaru', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Harga Second</label>
                <div className="w-full">
                  <div className="relative flex items-center gap-2 w-full">
                    <div className="relative flex-grow">
                      <span className="absolute left-3 top-2.5 font-semibold text-gray-600">Rp</span>
                      <input type="text" placeholder="Harga Second" className="w-full p-2 pl-10 border border-gray-300 rounded-md bg-green-50 border-green-300 font-bold text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" value={item.hargaSecond ? new Intl.NumberFormat('id-ID').format(Number(item.hargaSecond)) : ''} onChange={(e) => handlePriceChange('hargaSecond', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-gray-700">Foto Barang ({photos.length}/5)</label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photos.length >= 5}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-white ${photos.length >= 5 ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    <Camera size={14} /> Tambah Foto
                  </button>
                  <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={handlePhotoUpload} />
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square rounded-md overflow-hidden border border-gray-200 bg-gray-50 group">
                        <img src={photo} alt={`Foto HP ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity md:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PERINGATAN */}
        <div>
          {isRejected && (
            <div className="bg-red-100 border-l-4 border-red-600 text-red-800 p-4 rounded-md flex items-center gap-3">
              <XCircle size={24} className="text-red-600" />
              <div>
                <p className="font-bold">GADAI DITOLAK</p>
                <p className="text-sm">Perangkat iPhone terdeteksi dengan status iCloud bermasalah (Poin 0).</p>
              </div>
            </div>
          )}
          {!isRejected && isNotRecommended && (
            <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-800 p-4 rounded-md flex items-center gap-3">
              <AlertTriangle size={24} className="text-orange-500" />
              <div>
                <p className="font-bold">TIDAK DIANJURKAN</p>
                <p className="text-sm">Sinyal &amp; IMEI bermasalah (Poin 0). Risiko gadai tinggi.</p>
              </div>
            </div>
          )}
        </div>

        {/* CHECKLISTS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('checklist')}
            className="w-full p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-2 text-left"
          >
            <div className="flex items-center justify-between w-full sm:w-auto">
              <h2 className="text-lg font-bold text-gray-800">Checklist Kondisi &amp; Kelengkapan</h2>
              <div className="sm:hidden">
                {expandedSections.checklist ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
              <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold flex flex-col items-center">
                <span className="text-xs font-normal text-blue-600">Skor: {calculations.currentPoints.toFixed(1)} / {calculations.maxPoints} ({calculations.persentasePoin.toFixed(1)}%)</span>
              </div>
              <div className="hidden sm:block">
                {expandedSections.checklist ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
              </div>
            </div>
          </button>

          <div className={`${expandedSections.checklist ? 'block' : 'hidden'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div className="p-4 border-b border-gray-200 md:border-b-0 md:border-r md:border-gray-200">
                <h3 className="flex items-center gap-2 font-bold text-gray-700 mb-2"><CheckSquare size={14} /> C. Kondisi Fisik</h3>
                <div className="space-y-0.5 mb-4">
                  <ScoreSelector label="Layar (retak/normal)" stateKey="layar" />
                  <ScoreSelector label="Body / Casing" stateKey="body" />
                  <ScoreSelector label="Kamera" stateKey="kamera" />
                  <ScoreSelector label="Tombol & Touchscreen" stateKey="tombol" />
                  <ScoreSelector label="Kesehatan Baterai" stateKey="baterai" />
                </div>
                <h3 className="flex items-center gap-2 font-bold text-gray-700 mb-2"><Settings size={14} /> D. Fungsi &amp; Sistem</h3>
                <div className="space-y-0.5">
                  <ScoreSelector label="Mesin / Performa" stateKey="mesin" />
                  <ScoreSelector label="Sinyal & IMEI" stateKey="sinyal" />
                  <ScoreSelector label="WiFi / Bluetooth" stateKey="wifi" />
                  <ScoreSelector label="Speaker & Mic" stateKey="speaker" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="flex items-center gap-2 font-bold text-gray-700 mb-2"><Box size={14} /> E. Kelengkapan</h3>
                <div className="space-y-0.5 mb-4">
                  <ScoreSelector label="Dus / Box" stateKey="dus" />
                  <ScoreSelector label="Charger Original" stateKey="charger" />
                  <ScoreSelector label="Nota Pembelian" stateKey="nota" />
                </div>
                <h3 className={`flex items-center gap-2 font-bold mb-2 ${isIphone ? 'text-gray-700' : 'text-gray-400'}`}>
                  <AlertCircle size={14} /> F. Khusus iPhone
                </h3>
                <div className="space-y-0.5">
                  <ScoreSelector label="Panic Full" stateKey="panic" disabled={!isIphone} />
                  <ScoreSelector label="iCloud" stateKey="icloud" disabled={!isIphone} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PERHITUNGAN GADAI */}
        <div className={`rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${isRejected ? 'bg-gray-300 grayscale opacity-70' : 'bg-blue-900 text-white'}`}>
          <div className="p-6 border-b border-blue-800">
            <h2 className="flex items-center gap-2 text-xl font-bold mb-4">
              <DollarSign size={20} /> Hasil Kalkulasi Gadai
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="text-blue-200 text-sm block mb-1">Nilai Taksiran ({calculations.persentasePoin.toFixed(1)}%)</label>
                <div className="text-2xl font-bold text-green-400">{formatRp(calculations.nilaiTaksiran)}</div>
              </div>
              <div>
                <label className="text-blue-200 text-sm flex justify-between mb-1">
                  <span>LTV</span>
                  <span className="font-bold text-white">{ltv}%</span>
                </label>
                <input
                  ref={ltvSliderRef}
                  type="range"
                  min="0"
                  max="100"
                  value={ltv}
                  onChange={(e) => setLtv(Number(e.target.value))}
                  className="w-full mt-2 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-blue-200 text-sm block mb-1">Plafond Maksimal</label>
                <div className="text-2xl font-bold text-gray-300">{formatRp(calculations.plafond)}</div>
              </div>
            </div>

            {/* Input Pinjaman & Sub-field lainnya */}
            <div className="bg-blue-800 p-4 rounded-lg border border-blue-700 shadow-inner mb-4">
              <div className="w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-4">
                <label className="text-blue-200 text-sm font-bold w-full sm:w-1/2">Pinjaman Yang Diambil</label>
                <div className="relative w-full sm:w-1/2">
                  <span className="absolute left-3 top-2.5 font-bold text-gray-600">Rp</span>
                  <input
                    type="text"
                    className="w-full p-2 pl-10 border-none rounded-md bg-white text-black font-extrabold text-xl text-right sm:text-left md:text-right focus:outline-none focus:ring-2 focus:ring-gray-400"
                    value={pinjamanDiambil ? new Intl.NumberFormat('id-ID').format(pinjamanDiambil) : ''}
                    onChange={(e) => setPinjamanDiambil(Number(e.target.value.replace(/[^0-9]/g, '')))}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-blue-200 text-sm block mb-1">Biaya Admin</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-semibold text-gray-500">Rp</span>
                  <input type="text" className="w-full p-2 pl-10 border-none rounded-md bg-white text-black font-bold h-[40px] focus:outline-none focus:ring-2 focus:ring-gray-400" value={biayaAdmin ? new Intl.NumberFormat('id-ID').format(Number(biayaAdmin)) : ''} onChange={(e) => setBiayaAdmin(e.target.value.replace(/[^0-9]/g, ''))} />
                </div>
              </div>
              <div>
                <label className="text-blue-200 text-sm block mb-1">Jasa ({jkw} Hari)</label>
                <div className="bg-blue-800/50 p-2 rounded-md border border-blue-700 text-white font-bold h-[40px] flex items-center">
                  {formatRp(calculations.totalJasa)}
                </div>
              </div>
            </div>

            <div className="bg-green-600 p-4 rounded-lg mt-4 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center shadow-sm gap-1 sm:gap-0">
              <span className="font-bold text-white text-sm sm:text-base">Uang Yang Diterima</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-white">{formatRp(calculations.uangDiterima)}</span>
            </div>
          </div>
          <div className="p-6 bg-blue-950 flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/3">
              <label className="text-blue-200 text-sm block mb-1">Jasa per 15 Hari (%)</label>
              <div className="relative">
                <input type="number" step="0.1" value={jasa} onChange={(e) => setJasa(e.target.value)} className="w-full p-2 border-none rounded-md bg-white text-black font-bold focus:outline-none focus:ring-2 focus:ring-gray-400" />
                <Percent size={14} className="absolute right-3 top-3 text-gray-500" />
              </div>
            </div>
            <div className="w-full md:w-1/3">
              <label className="text-blue-200 text-sm block mb-1">Jangka Waktu</label>
              <select value={jkw} onChange={(e) => setJkw(parseInt(e.target.value))} className="w-full p-2 border-none rounded-md bg-white text-black font-bold focus:outline-none focus:ring-2 focus:ring-gray-400">
                <option value={15}>15 Hari</option>
                <option value={30}>30 Hari</option>
                <option value={60}>60 Hari</option>
              </select>
            </div>
            <div className="w-full md:w-1/3 text-right">
              <label className="text-blue-200 text-sm font-bold">Total Kewajiban</label>
              <div className="text-2xl font-bold text-yellow-400 border-t-2 border-transparent">{formatRp(calculations.kewajiban)}</div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-gray-400 text-xs py-4 mt-4 font-medium">
          Kalkulator Simulasi Gadai Elektronik v.1.4.100 (15/04/2026)
        </div>

      </div>

      {/* ===================================================================== */}
      {/* TAMPILAN CETAK (PRINT TEMPLATE)                                       */}
      {/* ===================================================================== */}
      <div className="hidden print-block w-full text-black font-sans text-xs" style={{ fontFamily: 'Arial, sans-serif' }}>

        {/* Header Print */}
        <div className="bg-[#589636] text-white px-4 py-3 border border-[#589636] rounded-[10px] overflow-hidden mb-4">
          <h1 className="text-xl font-bold uppercase tracking-wide">Kalkulator Gadai Elektronik</h1>
          <p className="text-sm text-green-100">Estimasi Taksiran &amp; Plafond Handphone</p>
        </div>

        {/* DATA ANGGOTA & DATA BARANG */}
        <div className="grid grid-cols-2 border border-[#589636] rounded-[10px] overflow-hidden mb-4">
          <div className="border-r border-[#589636] p-3">
            <h2 className="font-bold border-b border-[#589636] pb-1 mb-2 text-[#589636]">A. DATA ANGGOTA</h2>
            <table className="w-full text-xs table-fixed" cellPadding="3">
              <tbody>
                <tr><td className="w-24 align-top text-gray-600">Nama</td><td className="align-top font-medium text-gray-900 break-words">{member.nama || '-'}</td></tr>
                <tr><td className="w-24 align-top text-gray-600">No KTP</td><td className="align-top font-medium text-gray-900 break-words">{member.noKtp || '-'}</td></tr>
                <tr><td className="w-24 align-top text-gray-600">No HP</td><td className="align-top font-medium text-gray-900 break-words">{member.noHp ? `+62${member.noHp}` : '-'}</td></tr>
                <tr><td className="w-24 align-top text-gray-600">Alamat</td><td className="align-top font-medium leading-tight text-gray-900 break-words">{member.alamat || '-'}</td></tr>
                <tr><td className="w-24 pt-6 align-bottom text-gray-600">Tanggal Taksiran</td><td className="pt-6 align-bottom font-medium text-gray-900 break-words">{formatTanggal(member.tanggal)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="p-3">
            <h2 className="font-bold border-b border-[#589636] pb-1 mb-2 text-[#589636]">B. DATA BARANG</h2>
            <table className="w-full text-xs table-fixed" cellPadding="3">
              <tbody>
                <tr><td className="w-28 align-top text-gray-600">Merk / Tipe HP</td><td className="align-top font-medium text-gray-900 break-words">{itemFullString || '-'}</td></tr>
                <tr><td className="w-28 align-top text-gray-600">IMEI</td><td className="align-top font-medium text-gray-900 break-words">{item.imei || '-'}</td></tr>
                <tr><td className="w-28 align-top text-gray-600">Tahun Rilis/Pembelian</td><td className="align-top font-medium text-gray-900 break-words">{item.tahun || '-'}</td></tr>
                <tr><td className="w-28 align-top text-gray-600">Harga Baru</td><td className="align-top font-medium text-gray-900 break-words">{formatRp(item.hargaBaru)}</td></tr>
                <tr><td className="w-28 align-top text-gray-600">Harga Second</td><td className="align-top font-medium text-gray-900 break-words">{formatRp(item.hargaSecond)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CHECKLIST KONDISI & KELENGKAPAN */}
        <div className="border border-[#589636] rounded-[10px] overflow-hidden mb-4">
          <div className="flex justify-between items-stretch border-b border-[#589636] bg-[#589636]">
            <h2 className="font-bold p-2 uppercase flex items-center text-white">CHECKLIST KONDISI &amp; KELENGKAPAN</h2>
            <div className="bg-[#f59522] p-2 px-4 border-l border-[#589636] font-bold text-white flex items-center">
              Skor : {calculations.currentPoints} / {calculations.maxPoints} ({calculations.persentasePoin.toFixed(1)}%)
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-[#589636] text-xs">
            {/* C. KONDISI FISIK */}
            <div className="p-3">
              <h3 className="font-bold mb-3 text-[#589636]">C. KONDISI FISIK</h3>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Layar (retak / normal)</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.layar}</span></div>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Body / Casing</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.body}</span></div>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Kamera</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.kamera}</span></div>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Tombol &amp; Touchscreen</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.tombol}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-700">Kesehatan Baterai</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.baterai}</span></div>
            </div>
            {/* D. FUNGSI & SISTEM */}
            <div className="p-3">
              <h3 className="font-bold mb-3 text-[#589636]">D. FUNGSI &amp; SISTEM</h3>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Mesin / Performa</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.mesin}</span></div>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Sinyal &amp; IMEI</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.sinyal}</span></div>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">WiFi / Bluetooth</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.wifi}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-700">Speaker &amp; Mic</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.speaker}</span></div>
            </div>
            {/* E. KELENGKAPAN */}
            <div className="p-3">
              <h3 className="font-bold mb-3 text-[#589636]">E. KELENGKAPAN</h3>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Dus / Box</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.dus}</span></div>
              <div className="flex justify-between items-center mb-2"><span className="text-gray-700">Charger Original</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.charger}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-700">Nota Pembelian</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.nota}</span></div>
            </div>
            {/* F. KHUSUS IPHONE */}
            <div className="p-3">
              <h3 className={`font-bold mb-3 ${isIphone ? 'text-[#589636]' : 'text-gray-300'}`}>F. KHUSUS IPHONE</h3>
              <div className={`flex justify-between items-center mb-2 ${!isIphone && 'opacity-30'}`}><span className="text-gray-700">Panic Full (iPhone)</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.panic}</span></div>
              <div className={`flex justify-between items-center ${!isIphone && 'opacity-30'}`}><span className="text-gray-700">iCloud (iPhone)</span><span className="bg-[#f4f9f1] w-6 h-6 flex items-center justify-center border border-[#a3c98f] rounded-[10px] font-bold text-gray-900">{scores.icloud}</span></div>
            </div>
          </div>
        </div>

        {/* FOTO BARANG & HASIL KALKULASI */}
        <div className="grid grid-cols-2 gap-4 items-stretch mt-2">

          {/* Foto Barang Section */}
          <div className="flex flex-col">
            <h3 className="text-center font-bold mb-1 text-[#589636]">Foto Barang Jaminan</h3>
            <div className="border border-[#589636] rounded-[10px] overflow-hidden flex-1 flex divide-x divide-[#589636] h-[160px] bg-[#f4f9f1]">
              <div className="w-1/2 p-2 flex items-center justify-center h-full">
                 {photos[0] ? <img src={photos[0]} alt="Foto 1" className="w-full h-full object-contain" /> : <span className="text-gray-400">Foto 1</span>}
              </div>
              <div className="w-1/2 p-2 flex items-center justify-center h-full">
                 {photos[1] ? <img src={photos[1]} alt="Foto 2" className="w-full h-full object-contain" /> : <span className="text-gray-400">Foto 2</span>}
              </div>
            </div>
          </div>

          {/* Hasil Kalkulasi Section */}
          <div className="border border-[#589636] rounded-[10px] overflow-hidden flex flex-col bg-[#f4f9f1]">
            <h2 className="font-bold p-2 border-b border-[#589636] uppercase text-sm bg-[#589636] text-white">HASIL KALKULASI GADAI</h2>

            <div className="p-3 flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="mb-0.5 font-medium text-gray-600">Nilai Taksiran</div>
                  <div className="text-xl font-bold text-gray-900 tracking-tight">{formatRp(calculations.nilaiTaksiran)}</div>
                </div>
                <div className="text-right">
                  <div className="mb-1 text-xs text-gray-600">LTV <span className="font-bold text-gray-900">{ltv}%</span></div>
                  <div className="text-[10px] text-gray-600">Plafond Maks.</div>
                  <div className="text-sm font-bold text-gray-900">{formatRp(calculations.plafond)}</div>
                </div>
              </div>

              <div className="bg-[#fff8ec] border border-[#f59522] rounded-[8px] p-2 flex justify-between items-center shadow-sm text-gray-900 mx-1 mb-1">
                <span className="font-medium text-[#589636] text-[11px]">Pinjaman Yang Diambil</span>
                <span className="text-lg font-bold text-[#f59522]">{formatRp(pinjamanDiambil)}</span>
              </div>

              <div className="flex gap-1 mt-1 mx-1">
                <div className="flex-1 bg-white border border-[#589636] rounded-[8px] p-1.5 flex justify-between items-center shadow-sm">
                  <span className="text-[9px] font-medium text-gray-600">Biaya Admin</span>
                  <span className="text-[10px] font-bold text-gray-900">{formatRp(calculations.adminFee)}</span>
                </div>
                <div className="flex-1 bg-white border border-[#589636] rounded-[8px] p-1.5 flex justify-between items-center shadow-sm">
                  <span className="text-[9px] font-medium text-gray-600">Jasa</span>
                  <span className="text-[10px] font-bold text-gray-900">{formatRp(calculations.totalJasa)}</span>
                </div>
              </div>

              <div className="bg-[#589636] rounded-[8px] p-2 flex justify-between items-center shadow-sm text-white mt-1.5 mx-1">
                <span className="font-bold text-[11px]">Uang Yang Diterima</span>
                <span className="text-lg font-bold text-white">{formatRp(calculations.uangDiterima)}</span>
              </div>
            </div>

            <div className="bg-[#589636] p-2 flex flex-col gap-1.5 border-t border-[#589636] text-white">
              {/* Baris 1 */}
              <div className="flex gap-2 w-full">
                <div className="flex-1">
                  <div className="text-[9px] mb-0.5 font-medium text-green-100">Jasa per 15 Hari</div>
                  <div className="bg-white px-2 py-1 border border-[#589636] rounded-[8px] flex items-center justify-between shadow-sm">
                    <span className="font-bold text-gray-900 text-xs">{jasa}</span>
                    <span className="text-gray-400 text-[9px]">%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[9px] mb-0.5 font-medium text-green-100">Jangka Waktu</div>
                  <div className="bg-white px-2 py-1 border border-[#589636] rounded-[8px] font-bold text-gray-900 shadow-sm text-center text-xs">
                    {jkw} Hari
                  </div>
                </div>
              </div>
              {/* Baris 2 */}
              <div className="w-full">
                <div className="text-[10px] mb-0.5 font-medium text-green-100">Total Kewajiban</div>
                <div className="bg-white px-2 py-1.5 border border-[#f59522] rounded-[8px] text-lg font-bold text-center shadow-sm text-[#f59522]">
                  {formatRp(calculations.kewajiban)}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {isLoadModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setIsLoadModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold flex items-center gap-2"><FolderOpen className="text-blue-600" /> Riwayat Simulasi</h2>
              <button type="button" onClick={() => setIsLoadModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingSaved ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
                </div>
              ) : savedSimulations.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Belum ada simulasi yang disimpan.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <th className="py-3 px-4 font-semibold">Nama Draft</th>
                        <th className="py-3 px-4 font-semibold">Nama Anggota</th>
                        <th className="py-3 px-4 font-semibold">Barang</th>
                        <th className="py-3 px-4 font-semibold">Plafond</th>
                        <th className="py-3 px-4 font-semibold">Tgl Dibuat</th>
                        <th className="py-3 px-4 font-semibold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedSimulations.map((sim) => (
                        <tr key={sim.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 font-medium text-gray-900">{sim.name}</td>
                          <td className="py-3 px-4 text-gray-600">{sim.memberName || '-'}</td>
                          <td className="py-3 px-4 text-gray-600">{sim.itemMerk || '-'} {sim.itemImei ? `(${sim.itemImei})` : ''}</td>
                          <td className="py-3 px-4 text-gray-600">{sim.plafond ? `Rp ${Number(sim.plafond).toLocaleString('id-ID')}` : '-'}</td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            {sim.createdAt ? new Date(sim.createdAt).toLocaleString('id-ID') : 'Baru saja'}
                          </td>
                          <td className="py-3 px-4 flex gap-2 justify-center">
                            <button
                              type="button"
                              onClick={() => { applySimulation(sim.dataString); setIsLoadModalOpen(false); }}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                            >
                              Muat
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(sim.id)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded transition-colors"
                              title="Hapus"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Konfirmasi Hapus</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Apakah Anda yakin ingin menghapus data simulasi ini? Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-500 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const idToDelete = deleteConfirmId;
                    setDeleteConfirmId(null);
                    await handleDeleteSimulation(idToDelete);
                  }}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                <RefreshCcw size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Konfirmasi Reset</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Apakah Anda yakin ingin mereset semua data? Formulir dan hasil hitungan akan dikosongkan.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-500 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmReset}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm"
                >
                  Ya, Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
