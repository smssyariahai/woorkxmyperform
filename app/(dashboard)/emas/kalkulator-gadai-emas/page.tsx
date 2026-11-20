'use client';

import { useEffect, useState, useRef } from 'react';
import { defaultSettingsData } from '@/lib/emas/defaultSettings';
import {
  fetchGoldHistory,
  fetchGoldSettings,
  fetchSimulations,
  saveSimulation,
  deleteSimulation,
} from '@/lib/emas/client';
import { getTodayWibDateString } from '@/lib/islami/logamMuliaApi';
import { Save, FolderOpen, Loader2, Trash2, X, Plus, Edit, Printer, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, LayoutGrid, List } from 'lucide-react';

// Porting dari backup src/pages/KalkulatorGadaiEmas.tsx (1473 baris).
// Logika kalkulasi dipertahankan apa adanya: faktor karatase, taksir per
// gram, LTV, plafon, ujrah (jasa titip %/tahun per jenis & promo), biaya
// admin dari tarif_biaya, angsuran/jatuh tempo, uang diterima.
// Pemetaan API backup -> woork (lib/emas/client.ts):
//   panggilan settings/history/simulations backup diganti
//   fetchGoldSettings() / fetchGoldHistory() /
//   fetchSimulations/saveSimulation/deleteSimulation
// DIHAPUS (di-defer, lihat laporan): modal + tombol kirim JSON
// (Gelombang 11, Kirim JSON) dan ekstraktor foto jaminan OCR + tombol
// "Tambah dari Foto" (Gelombang 10, OCR). Input item manual tetap jalan.

const KARATASE_FACTORS: Record<string, number> = {
  '24': 1.0,
  '23': 0.958,
  '22': 0.916,
  '21': 0.875,
  '20': 0.83,
  '19': 0.79,
  '18': 0.75,
  '17': 0.75,
  '16': 0.67,
  '10': 0.42,
  '9': 0.375,
  '6': 0.30,
};

const formatRibuan = (num: number | string): string => {
  const parsed = typeof num === 'string' ? parseInt(num.replace(/\./g, '')) || 0 : num;
  return new Intl.NumberFormat('id-ID').format(parsed);
};

const unformatRibuan = (str: string): number => {
  return parseInt(str.replace(/\./g, '')) || 0;
};

const formatFriendlyDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${months[monthIndex]} ${year}`;
};

const formatSimDate = (val: string | undefined) => {
  if (!val) return 'Baru saja';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'Baru saja';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface JaminanItem {
  id: number;
  nama: string;
  jenis: 'Logam Mulia' | 'Perhiasan';
  qty: number;
  gram: number;
  karatase: string;
  harga: number;
  totalTaksiran: number;
  ltv: number;
  nilaiPlafond: number;
}

export default function KalkulatorGadaiEmasPage() {
  const [settings, setSettings] = useState<any>(defaultSettingsData);

  // States for Calculator
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [jenisGadai, setJenisGadai] = useState<'Regular' | 'Cicil'>('Regular');
  const [promoToggle, setPromoToggle] = useState<boolean>(false);
  const [hargaTaksir24K, setHargaTaksir24K] = useState<string>('0');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadTarifAndHarga = async () => {
    // Tarif + riwayat emas kini dari API woork /api/emas/* (PostgreSQL).
    const settingsData = await fetchGoldSettings();
    const tarifData = settingsData?.tarif_biaya;
    if (tarifData) {
      setSettings(tarifData);
    }

    const historyRes = await fetchGoldHistory();
    const historyData: { date: string; hargaTaksir24K: number }[] = [];
    (historyRes?.history || []).forEach((h) => {
      if (h.hargaTaksir24K) {
        historyData.push({
          date: h.date,
          hargaTaksir24K: Number(h.hargaTaksir24K)
        });
      }
    });

    const localTodayStr = getTodayWibDateString();
    const todayEntry = historyData.find(h => h.date === localTodayStr);

    if (todayEntry && todayEntry.hargaTaksir24K > 0) {
      setHargaTaksir24K(formatRibuan(todayEntry.hargaTaksir24K));
      setLastUpdated(todayEntry.date);
    } else {
      setHargaTaksir24K('0');
      setLastUpdated(localTodayStr);
    }
  };

  const handleRefreshHargaTaksir = async () => {
    setIsRefreshing(true);
    try {
      await loadTarifAndHarga();
    } catch (err: any) {
      console.error("Gagal memperbarui harga taksir:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // New Jaminan Form States
  const [isJaminanFormOpen, setIsJaminanFormOpen] = useState<boolean>(true);
  const [isEditingMode, setIsEditingMode] = useState<boolean>(false);
  const jaminanSectionRef = useRef<HTMLDivElement>(null);
  const namaJaminanInputRef = useRef<HTMLInputElement>(null);
  const [namaJaminan, setNamaJaminan] = useState<string>('');
  const [jenisJaminan, setJenisJaminan] = useState<'Logam Mulia' | 'Perhiasan'>('Logam Mulia');
  const [qty, setQty] = useState<number | string>(1);
  const [gram, setGram] = useState<number | string>(1);
  const [karatase, setKaratase] = useState<string>('24');
  const [ltv, setLtv] = useState<number | string>(95);

  // Jaminan List State
  const [jaminanList, setJaminanList] = useState<JaminanItem[]>([]);

  // Result States
  const [pembiayaanDiambil, setPembiayaanDiambil] = useState<string>('0');
  const [pembiayaanPercentage, setPembiayaanPercentage] = useState<number>(50);
  const [jkw, setJkw] = useState<number>(4);

  // Persistence States
  const [savedSimulations, setSavedSimulations] = useState<any[]>([]);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState<'cards' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table'
  );
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [namaDraft, setNamaDraft] = useState('');
  const [memberName, setMemberName] = useState('');

  // 1. Fetch settings from db
  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        await loadTarifAndHarga();
      } catch (err: any) {
        console.error("Error fetching settings:", err);
        if (isMounted) {
          setSettings((prev: any) => (prev && Object.keys(prev).length > 0 ? prev : defaultSettingsData));
        }
      }
    };
    fetchSettings();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Lock / Unlock JKW and update labels based on Jenis Gadai
  useEffect(() => {
    if (jenisGadai === 'Regular') {
      setJkw(4);
    } else {
      setJkw(6);
    }
  }, [jenisGadai]);

  // 3. Auto update LTV when changing jenis jaminan in form
  const handleJenisJaminanChange = (val: 'Logam Mulia' | 'Perhiasan') => {
    setJenisJaminan(val);
    setLtv(val === 'Logam Mulia' ? 95 : 85);
  };

  // 4. Calculations for adding item
  const goldRate = unformatRibuan(hargaTaksir24K);
  const kFactor = KARATASE_FACTORS[karatase] || 1.0;
  const hargaTaksirPerGram = Math.round(goldRate * kFactor);
  const numQty = qty === '' ? 0 : (parseInt(qty.toString()) || 0);
  const numGram = gram === '' ? 0 : (parseFloat(gram.toString().replace(',', '.')) || 0);
  const numLtv = ltv === '' ? 0 : (parseFloat(ltv.toString().replace(',', '.')) || 0);
  const totalTaksiranForm = numQty * numGram * hargaTaksirPerGram;
  const nilaiPlafondForm = Math.round(totalTaksiranForm * (numLtv / 100));

  // 5. Total Plafond across all jaminan items
  const totalPlafond = jaminanList.reduce((sum, item) => sum + item.nilaiPlafond, 0);

  // 6. Sync pembiayaanDiambil with totalPlafond and range slider percentage
  useEffect(() => {
    const calculatedValue = Math.round((totalPlafond * pembiayaanPercentage) / 100);
    setPembiayaanDiambil(formatRibuan(calculatedValue));
  }, [totalPlafond, pembiayaanPercentage]);

  const handlePembiayaanInputChange = (val: string) => {
    const numeric = val.replace(/\D/g, '');
    if (!numeric) {
      setPembiayaanDiambil('0');
      return;
    }
    const num = parseInt(numeric);
    setPembiayaanDiambil(formatRibuan(num));
    if (totalPlafond > 0) {
      const pct = Math.round((num / totalPlafond) * 100);
      if (pct >= 50 && pct <= 100) {
        setPembiayaanPercentage(pct);
      }
    }
  };

  const currentPembiayaanNum = unformatRibuan(pembiayaanDiambil);

  // 7. Calculate interest rate (%) — tarif jasa titip, dipertahankan dari backup
  const getBunga = () => {
    let rate = 0;
    if (promoToggle) {
      if (jenisGadai === 'Regular') {
        if (currentPembiayaanNum <= 25000000) rate = 15;
        else if (currentPembiayaanNum <= 50000000) rate = 14;
        else if (currentPembiayaanNum <= 100000000) rate = 13;
        else rate = 11.5;
      } else { // Cicil
        if (currentPembiayaanNum <= 25000000) rate = 8.5;
        else if (currentPembiayaanNum <= 100000000) rate = 8.0;
        else rate = 7.0;
      }
    } else {
      if (jenisGadai === 'Regular') {
        if (currentPembiayaanNum <= 25000000) rate = 22.95;
        else if (currentPembiayaanNum <= 50000000) rate = 20;
        else if (currentPembiayaanNum <= 100000000) rate = 14;
        else rate = 13;
      } else { // Cicil
        if (jkw < 6) {
          rate = 12;
        } else {
          if (currentPembiayaanNum <= 25000000) rate = 12;
          else if (currentPembiayaanNum <= 100000000) rate = 11;
          else rate = 9.5;
        }
      }
    }
    return rate;
  };

  const bunga = getBunga();

  // 8. Jasa Titip Rupiah
  const getJasaTitipRupiah = () => {
    if (jenisGadai === 'Regular') {
      return Math.round(currentPembiayaanNum * (bunga / 100 / 12) * jkw);
    } else {
      return Math.round((currentPembiayaanNum * ((bunga / 100 / 12) * jkw)) / jkw);
    }
  };
  const jasaTitipRupiah = getJasaTitipRupiah();

  // 9. Biaya Admin (dari tarif_biaya settings, fallback seperti backup)
  const getAdminFee = () => {
    if (settings && settings.biayaAdmin && settings.biayaAdmin.length > 0) {
      for (const tier of settings.biayaAdmin) {
        if (currentPembiayaanNum >= tier.min && (tier.max === null || currentPembiayaanNum <= tier.max)) {
          return tier.isPercentage ? currentPembiayaanNum * (tier.fee / 100) : tier.fee;
        }
      }
    }
    // Fallback
    if (currentPembiayaanNum <= 1000000) return 10000;
    if (currentPembiayaanNum <= 2500000) return 20000;
    if (currentPembiayaanNum <= 5000000) return 30000;
    if (currentPembiayaanNum <= 10000000) return 40000;
    if (currentPembiayaanNum <= 15000000) return 65000;
    if (currentPembiayaanNum <= 20000000) return 90000;
    if (currentPembiayaanNum <= 25000000) return 115000;
    if (currentPembiayaanNum <= 50000000) return 150000;
    if (currentPembiayaanNum <= 75000000) return 175000;
    if (currentPembiayaanNum <= 100000000) return 200000;
    if (currentPembiayaanNum <= 250000000) return 375000;
    return 1000000;
  };
  const biayaAdmin = getAdminFee();

  // 10. Angsuran / Pembayaran Jatuh Tempo
  const getPaymentAmount = () => {
    const bungaBulanan = (bunga / 100) / 12;
    if (jenisGadai === 'Regular') {
      return Math.round(currentPembiayaanNum + (currentPembiayaanNum * bungaBulanan * jkw));
    } else {
      return Math.round((currentPembiayaanNum + (currentPembiayaanNum * bungaBulanan * jkw)) / jkw);
    }
  };
  const angsuranPerBulan = getPaymentAmount();

  // 11. Jumlah yang diterima
  const jumlahDiterima = currentPembiayaanNum - biayaAdmin;

  // Add Item to Jaminan List
  const handleAddJaminan = () => {
    if (!namaJaminan || hargaTaksirPerGram === 0) {
      alert('Harap isi nama jaminan dan harga taksir dengan benar!');
      return;
    }

    const finalQty = qty === '' || isNaN(parseInt(qty.toString())) || parseInt(qty.toString()) < 1
      ? 1
      : Math.max(1, parseInt(qty.toString()));
    const finalGram = gram === '' || isNaN(parseFloat(gram.toString().replace(',', '.'))) || parseFloat(gram.toString().replace(',', '.')) <= 0
      ? 0.01
      : parseFloat(gram.toString().replace(',', '.'));
    const finalLtv = ltv === '' || isNaN(parseFloat(ltv.toString().replace(',', '.')))
      ? 0
      : parseFloat(ltv.toString().replace(',', '.'));

    const calculatedTotalTaksiran = finalQty * finalGram * hargaTaksirPerGram;
    const calculatedNilaiPlafond = Math.round(calculatedTotalTaksiran * (finalLtv / 100));

    const newItem: JaminanItem = {
      id: Date.now(),
      nama: namaJaminan,
      jenis: jenisJaminan,
      qty: finalQty,
      gram: finalGram,
      karatase,
      harga: hargaTaksirPerGram,
      totalTaksiran: calculatedTotalTaksiran,
      ltv: finalLtv,
      nilaiPlafond: calculatedNilaiPlafond,
    };

    setJaminanList([...jaminanList, newItem]);

    // Reset fields except gold rate
    setNamaJaminan('');
    setQty(1);
    setGram(1);
    setLtv(95);
    setIsEditingMode(false);
  };

  const handleEditJaminan = (item: JaminanItem) => {
    setNamaJaminan(item.nama);
    setJenisJaminan(item.jenis);
    setQty(item.qty);
    setGram(item.gram);
    setKaratase(item.karatase);
    setLtv(item.ltv);
    setJaminanList(jaminanList.filter(j => j.id !== item.id));
    setIsJaminanFormOpen(true);
    setIsEditingMode(true);

    // Auto scroll ke formulir tambah barang jaminan dan fokuskan input nama
    setTimeout(() => {
      if (jaminanSectionRef.current) {
        jaminanSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      namaJaminanInputRef.current?.focus();
    }, 100);
  };

  const handleDeleteJaminan = (id: number) => {
    setJaminanList(jaminanList.filter(j => j.id !== id));
  };

  // Save To Cloud (Opens dialog modal first)
  const handleOpenSaveModal = () => {
    setNamaDraft(`Simulasi Gadai Emas ${new Date().toLocaleDateString('id-ID')}`);
    setMemberName('');
    setIsSaveModalOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!namaDraft) {
      alert('Nama Draft harus diisi!');
      return;
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        jenisGadai,
        promoToggle,
        hargaTaksir24K,
        pembiayaanDiambil,
        jkw,
        bunga,
        jaminan: jaminanList.map(j => ({
          nama: j.nama,
          jenis: j.jenis,
          qty: j.qty,
          gram: j.gram,
          karatase: j.karatase,
          harga: formatRibuan(j.harga),
          ltv: j.ltv,
        })),
      };

      const itemNames = jaminanList.map(j => `${j.nama} (${j.gram}gr, ${j.karatase}K)`).join(', ');

      // Simulasi tersimpan di PostgreSQL via /api/emas/simulations.
      await saveSimulation({
        name: namaDraft,
        dataString: JSON.stringify(dataToSave),
        type: 'Gadai Emas',
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
        memberName: memberName,
        itemMerk: itemNames || 'Gadai Emas',
        itemImei: '',
        plafond: unformatRibuan(pembiayaanDiambil),
      });

      alert('Data berhasil disimpan ke Cloud!');
      setIsSaveModalOpen(false);
    } catch (error) {
      console.error("Gagal menyimpan ke Cloud:", error);
      alert('Gagal menyimpan ke Cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch saved simulations
  const loadSimulations = async () => {
    setIsLoadingSaved(true);
    try {
      const loaded = await fetchSimulations('Gadai Emas');
      loaded.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setSavedSimulations(loaded);
    } catch (error) {
      console.error("Gagal memuat simulasi:", error);
      alert("Gagal memuat simulasi dari Cloud.");
    }
    setIsLoadingSaved(false);
  };

  const handleOpenLoadModal = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setHistoryViewMode('cards');
    }
    setIsLoadModalOpen(true);
    loadSimulations();
  };

  const applySimulation = (dataString: string) => {
    try {
      const parsed = JSON.parse(dataString);
      if (parsed.jenisGadai) setJenisGadai(parsed.jenisGadai);
      if (parsed.promoToggle !== undefined) setPromoToggle(parsed.promoToggle);
      if (parsed.hargaTaksir24K) setHargaTaksir24K(parsed.hargaTaksir24K);

      if (parsed.jaminan && parsed.jaminan.length > 0) {
        const reconstructedList = parsed.jaminan.map((item: any, idx: number) => {
          const itemHarga = typeof item.harga === 'string' ? unformatRibuan(item.harga) : item.harga;
          const totalTaksiranVal = item.qty * item.gram * itemHarga;
          const nilaiPlafondVal = Math.round(totalTaksiranVal * (item.ltv / 100));
          return {
            id: Date.now() + idx,
            nama: item.nama,
            jenis: item.jenis,
            qty: item.qty,
            gram: item.gram,
            karatase: item.karatase,
            harga: itemHarga,
            totalTaksiran: totalTaksiranVal,
            ltv: item.ltv,
            nilaiPlafond: nilaiPlafondVal,
          };
        });
        setJaminanList(reconstructedList);
      } else {
        setJaminanList([]);
      }

      setTimeout(() => {
        if (parsed.pembiayaanDiambil) {
          const loadedPlafond = parsed.jaminan?.reduce((sum: number, item: any) => {
            const itemHarga = typeof item.harga === 'string' ? unformatRibuan(item.harga) : item.harga;
            const totalTaksiranVal = item.qty * item.gram * itemHarga;
            return sum + Math.round(totalTaksiranVal * (item.ltv / 100));
          }, 0) || 0;

          const pNum = unformatRibuan(parsed.pembiayaanDiambil);
          setPembiayaanDiambil(parsed.pembiayaanDiambil);
          if (loadedPlafond > 0) {
            const pct = Math.round((pNum / loadedPlafond) * 100);
            if (pct >= 50 && pct <= 100) {
              setPembiayaanPercentage(pct);
            }
          }
        }
        if (parsed.jkw) setJkw(parsed.jkw);
      }, 100);

      setIsLoadModalOpen(false);
    } catch (e) {
      alert("Data simulasi tidak valid.");
    }
  };

  const handleDeleteSimulation = async (id: string) => {
    try {
      await deleteSimulation(id);
      setSavedSimulations(prev => prev.filter(sim => sim.id !== id));
      alert("Simulasi berhasil dihapus!");
    } catch (error) {
      console.error("Gagal menghapus:", error);
      alert("Gagal menghapus simulasi. Silakan periksa koneksi Anda atau coba lagi.");
    }
  };

  return (
    <div className="w-full relative min-h-screen pb-12">
      {/* Dynamic print-only styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          aside, header, nav, .no-print {
            display: none !important;
          }
          body, .min-h-screen, main, #root {
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            height: auto !important;
          }
          .print-card {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 12px !important;
            width: 100% !important;
          }
          .print-badge {
            border: 1px solid #ccc !important;
            color: black !important;
            background: none !important;
          }
          @page {
            size: A4;
            margin: 1cm !important;
          }
        }
      `}} />

      {/* Page Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 no-print bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-sm sm:text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span className="p-1.5 bg-amber-100 rounded-lg text-amber-700 text-xs sm:text-sm">🏆</span> Kalkulator Gadai Emas
        </h1>
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleOpenLoadModal}
            className="flex-1 sm:flex-initial bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition"
          >
            <FolderOpen size={15} /> Muat Draft
          </button>
          <button
            onClick={handleOpenSaveModal}
            className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition"
          >
            <Save size={15} /> Simpan Draft
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 sm:flex-initial bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition"
          >
            <Printer size={15} /> Cetak
          </button>
        </div>
      </div>

      {/* Main Form Content Card */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border-2 border-slate-200 overflow-hidden print-card">
        <div className="bg-gradient-to-r from-amber-500 to-yellow-600 p-4 sm:p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold tracking-tight">Formulir Simulasi Gadai Emas</h2>
            <p className="text-amber-100 text-xs sm:text-sm mt-0.5">Atur detail jaminan emas untuk melakukan penaksiran dan perhitungan pembiayaan.</p>
          </div>
          <div className="hidden sm:block">
            <span className="bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-amber-50">
              V.1.6
            </span>
          </div>
        </div>

        <div className="p-3.5 sm:p-6 md:p-8 space-y-5 sm:space-y-8">
          {/* Section 1: Core Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-6">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Jenis Gadai</label>
              <select
                value={jenisGadai}
                onChange={(e) => setJenisGadai(e.target.value as any)}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 font-medium focus:outline-none focus:border-amber-500 transition"
              >
                <option value="Regular">Gadai Regular</option>
                <option value="Cicil">Gadai Cicil</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Status Promo</label>
              <div className={`flex items-center justify-between h-10 sm:h-12 border-2 rounded-xl px-3 sm:px-4 transition-all duration-200 ${
                promoToggle
                  ? 'bg-emerald-50/70 border-emerald-400 shadow-xs'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full transition-colors ${promoToggle ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  <span className="text-xs sm:text-sm font-medium text-slate-700">
                    {promoToggle ? 'Gunakan Promo (Aktif)' : 'Tarif Standar'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={promoToggle}
                  onClick={() => setPromoToggle(!promoToggle)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                    promoToggle ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  title={promoToggle ? 'Nonaktifkan Promo' : 'Aktifkan Promo'}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      promoToggle ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Harga Taksir 24K (per gram)</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 sm:left-4 text-xs sm:text-sm text-slate-400 font-semibold pointer-events-none">Rp</span>
                <input
                  type="text"
                  value={hargaTaksir24K}
                  onChange={(e) => {
                    const numeric = e.target.value.replace(/\D/g, '');
                    setHargaTaksir24K(formatRibuan(numeric || '0'));
                  }}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pl-9 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition"
                />
                <button
                  type="button"
                  onClick={handleRefreshHargaTaksir}
                  disabled={isRefreshing}
                  className="absolute right-2 sm:right-3 p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition disabled:opacity-50"
                  title="Ambil harga taksir terbaru"
                >
                  <RefreshCw size={16} className={isRefreshing ? "animate-spin text-amber-600" : ""} />
                </button>
              </div>
              {lastUpdated && (
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold mt-1 ml-1">
                  Pembaruan: {formatFriendlyDate(lastUpdated)}
                </p>
              )}
            </div>
          </div>

          <div className="border-t-2 border-slate-200 my-4 sm:my-6"></div>

          {/* Section 2: Jaminan Form (Collapsible) */}
          <div
            ref={jaminanSectionRef}
            id="section-tambah-jaminan"
            className={`border-2 rounded-xl sm:rounded-2xl overflow-hidden no-print shadow-sm scroll-mt-6 transition-all duration-300 ${
              isEditingMode ? 'border-amber-500 ring-4 ring-amber-400/20 shadow-amber-500/10' : 'border-slate-300'
            }`}
          >
            <button
              type="button"
              onClick={() => setIsJaminanFormOpen(!isJaminanFormOpen)}
              className="w-full bg-slate-100/90 px-4 py-3 sm:px-6 sm:py-4 flex justify-between items-center text-xs sm:text-sm text-slate-800 font-bold border-b-2 border-slate-200 hover:bg-slate-100 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>💎 {isEditingMode ? 'Edit Barang Jaminan' : 'Tambah Barang Jaminan'}</span>
                {isEditingMode && (
                  <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    Sedang Mengedit
                  </span>
                )}
              </span>
              {isJaminanFormOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isJaminanFormOpen && (
              <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Nama Jaminan</label>
                    <input
                      ref={namaJaminanInputRef}
                      type="text"
                      value={namaJaminan}
                      onChange={(e) => setNamaJaminan(e.target.value)}
                      placeholder="Contoh: Cincin Kawin, Gelang Rantai, Batangan Antam"
                      className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Jenis Jaminan</label>
                    <select
                      value={jenisJaminan}
                      onChange={(e) => handleJenisJaminanChange(e.target.value as any)}
                      className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 focus:outline-none transition"
                    >
                      <option value="Logam Mulia">Logam Mulia</option>
                      <option value="Perhiasan">Perhiasan</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      onBlur={() => {
                        if (qty === '' || isNaN(Number(qty)) || Number(qty) < 1) {
                          setQty(1);
                        } else {
                          setQty(Math.floor(Number(qty)));
                        }
                      }}
                      placeholder="1"
                      className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Berat (Gram)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={gram}
                      onChange={(e) => setGram(e.target.value)}
                      onBlur={() => {
                        const parsed = parseFloat(gram.toString().replace(',', '.'));
                        if (gram === '' || isNaN(parsed) || parsed <= 0) {
                          setGram(1);
                        } else {
                          setGram(parsed);
                        }
                      }}
                      placeholder="1"
                      className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Karatase</label>
                    <select
                      value={karatase}
                      onChange={(e) => setKaratase(e.target.value)}
                      className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl px-2.5 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 focus:outline-none transition"
                    >
                      <option value="24">24K (100%)</option>
                      <option value="23">23K (95.8%)</option>
                      <option value="22">22K (91.6%)</option>
                      <option value="21">21K (87.5%)</option>
                      <option value="20">20K (83%)</option>
                      <option value="19">19K (79%)</option>
                      <option value="18">18K (75%)</option>
                      <option value="17">17K (75%)</option>
                      <option value="16">16K (67%)</option>
                      <option value="10">10K (42%)</option>
                      <option value="9">9K (37.5%)</option>
                      <option value="6">6K (30%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Harga Taksir (/gr)</label>
                    <input
                      type="text"
                      value={`Rp ${formatRibuan(hargaTaksirPerGram)}`}
                      disabled
                      className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-600 cursor-not-allowed truncate"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Total Taksiran</label>
                    <input
                      type="text"
                      value={`Rp ${formatRibuan(totalTaksiranForm)}`}
                      disabled
                      className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-600 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">LTV (%)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={ltv}
                      onChange={(e) => setLtv(e.target.value)}
                      onBlur={() => {
                        const parsed = parseFloat(ltv.toString().replace(',', '.'));
                        if (ltv === '' || isNaN(parsed)) {
                          setLtv(0);
                        } else {
                          setLtv(Math.min(100, Math.max(0, parsed)));
                        }
                      }}
                      placeholder="0"
                      className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Nilai Plafond</label>
                    <input
                      type="text"
                      value={`Rp ${formatRibuan(nilaiPlafondForm)}`}
                      disabled
                      className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-bold text-slate-700 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleAddJaminan}
                    className={`w-full sm:w-auto font-bold px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md transition ${
                      isEditingMode
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {isEditingMode ? (
                      <>
                        <CheckCircle2 size={16} /> Simpan Perubahan Jaminan
                      </>
                    ) : (
                      <>
                        <Plus size={16} /> Tambah Barang Jaminan
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Daftar Jaminan List */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                  📜 Daftar Jaminan ({jaminanList.length} Barang)
                </h3>
              </div>
            </div>

            {jaminanList.length === 0 ? (
              <div className="text-center py-6 sm:py-10 border-2 border-dashed border-slate-300 bg-slate-50/60 rounded-xl sm:rounded-2xl text-xs sm:text-sm text-slate-500 font-medium px-4">
                Belum ada jaminan yang dimasukkan. Gunakan formulir di atas untuk menambahkan jaminan.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6 print-grid">
                {jaminanList.map((item) => (
                  <div key={item.id} className="relative border-l-4 border-l-amber-500 bg-amber-50/50 rounded-r-xl sm:rounded-r-2xl p-3.5 sm:p-5 border-2 border-amber-300 shadow-sm flex flex-col justify-between hover:bg-amber-50/80 hover:border-amber-400 transition">
                    <div className="absolute top-3 right-3 flex gap-1 no-print">
                      <button
                        onClick={() => handleEditJaminan(item)}
                        className="bg-white p-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm"
                        title="Edit"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteJaminan(item.id)}
                        className="bg-white p-1.5 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 shadow-sm"
                        title="Hapus"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-extrabold text-slate-900 text-sm sm:text-base pr-14">{item.nama}</h4>
                      <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Jenis: <span className="text-slate-900 font-semibold">{item.jenis} ({item.karatase}K)</span></p>
                      <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Berat: <span className="text-slate-900 font-semibold">{item.qty} Pcs x {item.gram} gr</span></p>
                      <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Harga Taksir: <span className="text-slate-900 font-semibold">Rp {formatRibuan(item.harga)}/gr</span></p>
                      <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Total Taksiran: <span className="text-slate-900 font-semibold">Rp {formatRibuan(item.totalTaksiran)}</span></p>
                      <p className="text-[11px] sm:text-xs text-slate-600 font-medium">LTV: <span className="text-slate-900 font-semibold">{item.ltv}%</span></p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t-2 border-amber-200">
                      <p className="text-xs sm:text-sm text-slate-800 font-bold">
                        Plafond: <span className="text-amber-700 font-black">Rp {formatRibuan(item.nilaiPlafond)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t-2 border-slate-200 my-4 sm:my-6"></div>

          {/* Section 4: Hasil Perhitungan (The Core Output Block) */}
          <div className="bg-amber-50/40 rounded-xl sm:rounded-2xl border-2 border-amber-300 shadow-md p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2 border-b-2 border-amber-300 pb-2.5 sm:pb-3">
              📊 Hasil Perhitungan Pembiayaan
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
              {/* Left Column: Input and slider */}
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Plafond Pembiayaan Maksimal</label>
                  <input
                    type="text"
                    value={`Rp ${formatRibuan(totalPlafond)}`}
                    disabled
                    className="w-full bg-slate-100 border-2 border-slate-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-extrabold text-slate-700 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Pembiayaan yang Diambil</label>
                  <div className="relative">
                    <span className="absolute left-3 sm:left-4 top-2.5 sm:top-3 text-xs sm:text-sm text-slate-400 font-semibold">Rp</span>
                    <input
                      type="text"
                      value={pembiayaanDiambil}
                      onChange={(e) => handlePembiayaanInputChange(e.target.value)}
                      className="w-full bg-white border-2 border-slate-300 focus:border-amber-500 rounded-xl pl-9 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none transition"
                    />
                  </div>

                  {/* Range Slider (Custom formatted) */}
                  <div className="mt-3 sm:mt-4 no-print">
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={pembiayaanPercentage}
                      onChange={(e) => setPembiayaanPercentage(parseInt(e.target.value))}
                      className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500 border border-slate-300"
                    />
                    <div className="flex justify-between text-[10px] sm:text-xs font-semibold text-slate-500 mt-1.5">
                      <span>50%</span>
                      <span className="text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md font-bold">{pembiayaanPercentage}% dari Plafond</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Jangka Waktu (Bulan)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={jkw}
                    disabled={jenisGadai === 'Regular'}
                    onChange={(e) => setJkw(Math.max(1, parseInt(e.target.value) || 1))}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 font-bold focus:outline-none transition ${jenisGadai === 'Regular' ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-300 focus:border-amber-500'}`}
                  />
                </div>
              </div>

              {/* Right Column: Calculations details */}
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Jasa Titip / Thn (%)</label>
                    <input
                      type="text"
                      value={`${bunga}%`}
                      disabled
                      className="w-full bg-slate-100 border-2 border-slate-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-700 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 truncate">
                      {jenisGadai === 'Cicil' ? 'Jasa Titip / Bln' : 'Total Jasa Titip'}
                    </label>
                    <input
                      type="text"
                      value={`Rp ${formatRibuan(jasaTitipRupiah)}`}
                      disabled
                      className="w-full bg-slate-100 border-2 border-slate-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-700 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Biaya Admin</label>
                  <input
                    type="text"
                    value={`Rp ${formatRibuan(biayaAdmin)}`}
                    disabled
                    className="w-full bg-slate-100 border-2 border-slate-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-700 cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-amber-100/70 p-3.5 sm:p-4 rounded-xl border-2 border-amber-300 shadow-sm">
                    <span className="block text-[10px] sm:text-xs font-bold text-amber-900 mb-0.5 uppercase tracking-wider">
                      {jenisGadai === 'Regular' ? 'Saat Jatuh Tempo' : 'Angsuran Bulanan'}
                    </span>
                    <span className="text-base sm:text-xl font-black text-amber-800">
                      Rp {formatRibuan(angsuranPerBulan)}
                    </span>
                  </div>

                  <div className="bg-emerald-100/60 p-3.5 sm:p-4 rounded-xl border-2 border-emerald-300 shadow-sm">
                    <span className="block text-[10px] sm:text-xs font-bold text-emerald-900 mb-0.5 uppercase tracking-wider">
                      Uang Diterima Anggota
                    </span>
                    <span className="text-base sm:text-xl font-black text-emerald-800">
                      Rp {formatRibuan(jumlahDiterima)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 text-slate-400 py-4 text-center text-sm font-medium border-t border-slate-700">
          Kalkulator Simulasi Gadai Emas v.1.6 (Pure React Native View)
        </div>
      </div>

      {/* Persistence Modals */}

      {/* Save Draft Modal */}
      {isSaveModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsSaveModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2"><Save /> Simpan Draft Gadai Emas</h3>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Draft / Simulasi</label>
                <input
                  type="text"
                  value={namaDraft}
                  onChange={(e) => setNamaDraft(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Anggota (Opsional)</label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Masukkan nama anggota"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-medium"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-50 border border-slate-200 text-sm font-semibold transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow transition disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan ke Cloud
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Load Draft Modal */}
      {isLoadModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsLoadModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-3.5 sm:p-4 border-b border-gray-200 gap-2">
              <h2 className="text-base sm:text-lg md:text-xl font-bold flex items-center gap-2 text-slate-800 min-w-0">
                <FolderOpen className="text-blue-600 shrink-0" size={20} />
                <span className="truncate">Riwayat Simulasi Gadai Emas</span>
              </h2>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Toggle pilihan Cards vs Tabel di samping tombol X */}
                <div className="flex items-center bg-slate-100 p-0.5 sm:p-1 rounded-lg border border-slate-200" role="group" aria-label="Pilihan Tampilan">
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('cards')}
                    className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md text-xs font-bold flex items-center gap-1 transition ${
                      historyViewMode === 'cards'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Tampilan Cards"
                  >
                    <LayoutGrid size={15} />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('table')}
                    className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md text-xs font-bold flex items-center gap-1 transition ${
                      historyViewMode === 'table'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Tampilan Tabel"
                  >
                    <List size={15} />
                    <span className="hidden sm:inline">Tabel</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLoadModalOpen(false)}
                  className="text-gray-400 hover:text-gray-700 hover:bg-slate-100 p-1.5 rounded-lg transition"
                  title="Tutup (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-3.5 sm:p-5 overflow-y-auto flex-1">
              {isLoadingSaved ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
                </div>
              ) : savedSimulations.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Belum ada simulasi yang disimpan.</div>
              ) : historyViewMode === 'cards' ? (
                /* Cards View (Default di tampilan HP) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {savedSimulations.map((sim) => (
                    <div
                      key={sim.id}
                      className="bg-white rounded-xl border-2 border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-md p-3.5 flex flex-col justify-between gap-3 transition"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2">
                            {sim.name}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0 mt-0.5">
                            {formatSimDate(sim.createdAt)}
                          </span>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5 text-xs border border-slate-100">
                          {sim.memberName && (
                            <div className="flex justify-between items-center text-slate-600">
                              <span className="text-slate-500 font-medium">Anggota:</span>
                              <span className="font-semibold text-slate-800 truncate max-w-[170px]">{sim.memberName}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-start gap-2 text-slate-600">
                            <span className="text-slate-500 font-medium shrink-0">Jaminan:</span>
                            <span className="font-medium text-slate-700 text-right line-clamp-2">{sim.itemMerk || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                            <span className="text-slate-500 font-semibold">Plafond:</span>
                            <span className="font-extrabold text-blue-700 text-xs sm:text-sm">
                              {sim.plafond ? `Rp ${parseInt(sim.plafond).toLocaleString('id-ID')}` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => applySimulation(sim.dataString)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-2 px-3 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <FolderOpen size={14} /> Muat Simulasi
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(sim.id)}
                          className="bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 p-2 rounded-lg transition border border-red-200 flex items-center justify-center cursor-pointer shrink-0"
                          title="Hapus Simulasi"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Table View */
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-gray-50 text-gray-700 border-b border-gray-200">
                        <th className="py-3 px-4 font-semibold">Nama Draft</th>
                        <th className="py-3 px-4 font-semibold">Nama Anggota</th>
                        <th className="py-3 px-4 font-semibold">Barang Jaminan</th>
                        <th className="py-3 px-4 font-semibold">Plafond Diambil</th>
                        <th className="py-3 px-4 font-semibold">Tgl Dibuat</th>
                        <th className="py-3 px-4 font-semibold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedSimulations.map((sim) => (
                        <tr key={sim.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 font-medium text-gray-900">{sim.name}</td>
                          <td className="py-3 px-4 text-gray-600">{sim.memberName || '-'}</td>
                          <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{sim.itemMerk || '-'}</td>
                          <td className="py-3 px-4 text-gray-600 font-semibold">
                            {sim.plafond ? `Rp ${parseInt(sim.plafond).toLocaleString('id-ID')}` : '-'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            {formatSimDate(sim.createdAt)}
                          </td>
                          <td className="py-3 px-4 flex gap-2 justify-center">
                            <button
                              onClick={() => applySimulation(sim.dataString)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                            >
                              Muat
                            </button>
                            <button
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
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
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
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-500 transition"
                >
                  Batal
                </button>
                <button
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
    </div>
  );
}
