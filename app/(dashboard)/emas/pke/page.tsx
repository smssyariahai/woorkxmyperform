'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Save, FolderOpen, Loader2, Trash2, X, Plus, Edit, Printer,
  ChevronDown, ChevronUp, RefreshCw, CheckCircle2, LayoutGrid, List,
} from 'lucide-react';
import { defaultSettingsData, type SettingsData } from '@/lib/emas/defaultSettings';
import {
  fetchGoldHistory,
  fetchGoldSettings,
  fetchSimulations,
  saveSimulation,
  deleteSimulation,
  type SimulationItem,
} from '@/lib/emas/client';
import { getTodayWibDateString } from '@/lib/islami/logamMuliaApi';

// Pembiayaan Kepemilikan Emas (PKE) — porting dari backup
// src/pages/PembiayaanKepemilikanEmas.tsx (1742 baris).
// Perbedaan dari backup:
// - Panggilan pg backup ke endpoint gold/settings, gold/history, dan
//   simulations diganti helper lib/emas/client.ts (API /api/emas/*); session
//   dibaca server, tidak ada lagi auth context / client pg backup.
// - DEFER (dihapus, bukan di-porting): modal Kirim JSON + tombol "Bagikan"
//   (Kirim JSON = Gelombang 11) dan ekstraktor foto jaminan + tombol
//   "Tambah dari Foto" (OCR = Gelombang 10).
//   Input item jaminan manual tetap jalan penuh.
// - createdAt simulasi di WOORK berupa string ISO (bukan Firestore Timestamp).

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
  const parsed = typeof num === 'string' ? parseInt(num.replace(/\./g, ''), 10) || 0 : num;
  return new Intl.NumberFormat('id-ID').format(parsed);
};

const unformatRibuan = (str: string): number => {
  if (!str) return 0;
  return parseInt(str.toString().replace(/\./g, ''), 10) || 0;
};

const formatFriendlyDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${months[monthIndex]} ${year}`;
};

const formatSimDate = (iso: string | null | undefined) => {
  if (!iso) return 'Baru saja';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Baru saja';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface JaminanItem {
  id: number;
  nama: string;
  jenis: 'Logam Mulia' | 'Perhiasan';
  qty: number;
  gram: number;
  karatase: string;
  hargaNota: string;
  hargaTaksir: string;
  totalTaksiran: string;
  ltv: number;
}

export default function PKEPage() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData>(defaultSettingsData);

  // States for Calculator
  const [hargaTaksir24K, setHargaTaksir24K] = useState<string>('0');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadTarifAndHarga = async () => {
    try {
      const settingsData = await fetchGoldSettings();
      const tarifData = settingsData?.tarif_biaya;
      if (tarifData) {
        setSettings(tarifData);
      }
      const historyRes = await fetchGoldHistory();
      const historyData: { date: string; hargaTaksir24K: number }[] = [];
      (historyRes?.history || []).forEach((h) => {
        if (h.hargaTaksir24K) {
          historyData.push({ date: h.date, hargaTaksir24K: Number(h.hargaTaksir24K) });
        }
      });
      const localTodayStr = getTodayWibDateString();
      const todayEntry = historyData.find((h) => h.date === localTodayStr);
      if (todayEntry && todayEntry.hargaTaksir24K > 0) {
        setHargaTaksir24K(formatRibuan(todayEntry.hargaTaksir24K));
        setLastUpdated(todayEntry.date);
      } else {
        setHargaTaksir24K('0');
        setLastUpdated(localTodayStr);
      }
    } catch (err: unknown) {
      console.error('Gagal memperbarui harga taksir:', err);
    }
  };

  const handleRefreshHargaTaksir = async () => {
    setIsRefreshing(true);
    try {
      await loadTarifAndHarga();
    } finally {
      setIsRefreshing(false);
    }
  };

  const [jkw, setJkw] = useState<number | string>(12);
  const [isJkwDropdownOpen, setIsJkwDropdownOpen] = useState<boolean>(false);
  const jkwDropdownRef = useRef<HTMLDivElement>(null);
  const JKW_OPTIONS = [6, 12, 24, 36, 48, 60];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jkwDropdownRef.current && !jkwDropdownRef.current.contains(e.target as Node)) {
        setIsJkwDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [paymentOption, setPaymentOption] = useState<'denganUangMuka' | 'tanpaUangMuka' | 'tanpaUangMukaDenganAdmin'>('denganUangMuka');
  const [jumlahUangMukaLM, setJumlahUangMukaLM] = useState<string>('0');
  const [uangMukaPerhiasan, setUangMukaPerhiasan] = useState<string>('0');

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
  const [hargaNota, setHargaNota] = useState<string>('0');
  const [hargaNotaLM, setHargaNotaLM] = useState<string>('0');
  const [ltv, setLtv] = useState<number | string>(85);

  // Jaminan List State
  const [jaminanList, setJaminanList] = useState<JaminanItem[]>([]);

  // Persistence States
  const [savedSimulations, setSavedSimulations] = useState<SimulationItem[]>([]);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState<'cards' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table'
  );
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [namaDraft, setNamaDraft] = useState('');
  const [memberName, setMemberName] = useState('');

  // 1. Fetch settings + harga taksir dari API WOORK
  useEffect(() => {
    let isMounted = true;
    loadTarifAndHarga().catch(() => {
      if (isMounted) setSettings((prev) => (prev && Object.keys(prev).length > 0 ? prev : defaultSettingsData));
    });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Check if there is any 'Perhiasan' item in the list
  const containsJewelry = jaminanList.some((item) => item.jenis === 'Perhiasan');

  // Force 'denganUangMuka' payment option if jaminan list contains jewelry
  useEffect(() => {
    if (containsJewelry && paymentOption !== 'denganUangMuka') {
      setPaymentOption('denganUangMuka');
    }
  }, [containsJewelry, paymentOption]);

  // Calculations for adding jaminan item
  const goldRate = unformatRibuan(hargaTaksir24K);
  const kFactor = KARATASE_FACTORS[karatase] || 1.0;
  const computedHargaTaksirPerGram = Math.round(goldRate * kFactor);
  const numQty = qty === '' ? 0 : (parseInt(qty.toString(), 10) || 0);
  const numGram = gram === '' ? 0 : (parseFloat(gram.toString().replace(',', '.')) || 0);
  const numLtv = ltv === '' ? 0 : (parseFloat(ltv.toString().replace(',', '.')) || 0);

  const computedTotalTaksiranForm = numQty * numGram * computedHargaTaksirPerGram;
  const computedNilaiPlafondForm = jenisJaminan === 'Perhiasan'
    ? Math.round(computedTotalTaksiranForm * (numLtv / 100))
    : unformatRibuan(hargaNotaLM || '0');

  // Handler for adding jaminan to list
  const handleAddJaminan = () => {
    if (!namaJaminan) {
      alert('Harap isi nama jaminan!');
      return;
    }

    const finalQty = qty === '' || isNaN(parseInt(qty.toString(), 10)) || parseInt(qty.toString(), 10) < 1
      ? 1
      : Math.max(1, parseInt(qty.toString(), 10));
    const finalGram = gram === '' || isNaN(parseFloat(gram.toString().replace(',', '.'))) || parseFloat(gram.toString().replace(',', '.')) <= 0
      ? 0.01
      : parseFloat(gram.toString().replace(',', '.'));
    const finalLtv = ltv === '' || isNaN(parseFloat(ltv.toString().replace(',', '.')))
      ? 0
      : parseFloat(ltv.toString().replace(',', '.'));

    const calculatedTotalTaksiran = finalQty * finalGram * computedHargaTaksirPerGram;
    const calculatedNilaiPlafond = jenisJaminan === 'Perhiasan'
      ? Math.round(calculatedTotalTaksiran * (finalLtv / 100))
      : unformatRibuan(hargaNotaLM || '0');

    if (calculatedNilaiPlafond <= 0) {
      alert('Nilai plafond jaminan harus lebih besar dari 0!');
      return;
    }

    const newItem: JaminanItem = {
      id: Date.now(),
      nama: namaJaminan,
      jenis: jenisJaminan,
      qty: finalQty,
      gram: finalGram,
      karatase,
      hargaNota: jenisJaminan === 'Perhiasan' ? (hargaNota || '0') : (hargaNotaLM || '0'),
      hargaTaksir: formatRibuan(computedHargaTaksirPerGram),
      totalTaksiran: formatRibuan(calculatedTotalTaksiran),
      ltv: jenisJaminan === 'Perhiasan' ? finalLtv : 0,
    };

    setJaminanList([...jaminanList, newItem]);

    // Reset fields except gold rate and type
    setNamaJaminan('');
    setQty(1);
    setGram(1);
    setHargaNota('0');
    setHargaNotaLM('0');
    setLtv(85);
    setIsEditingMode(false);
  };

  const handleEditJaminan = (item: JaminanItem) => {
    setNamaJaminan(item.nama);
    setJenisJaminan(item.jenis);
    setQty(item.qty);
    setGram(item.gram);
    setKaratase(item.karatase);
    if (item.jenis === 'Perhiasan') {
      setHargaNota(item.hargaNota);
      setLtv(item.ltv);
    } else {
      setHargaNotaLM(item.hargaNota);
    }
    setJaminanList(jaminanList.filter((j) => j.id !== item.id));
    setIsJaminanFormOpen(true);
    setIsEditingMode(true);

    // Auto scroll ke formulir tambah barang jaminan dan fokuskan input nama
    setTimeout(() => {
      if (jaminanSectionRef.current) {
        jaminanSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const el = document.getElementById('section-tambah-jaminan');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      namaJaminanInputRef.current?.focus();
    }, 100);
  };

  const handleDeleteJaminan = (id: number) => {
    setJaminanList(jaminanList.filter((j) => j.id !== id));
  };

  // Helper calculation for lists
  const getListCalculations = () => {
    let totalPlafond = 0;
    let totalHargaNota = 0;
    let totalPlafondLM = 0;
    let totalPlafondPerhiasan = 0;
    let totalHargaNotaLM = 0;
    let totalHargaNotaPerhiasan = 0;

    jaminanList.forEach((item) => {
      const notaVal = unformatRibuan(item.hargaNota);
      const isLM = item.jenis === 'Logam Mulia';

      let plafondVal = 0;
      if (isLM) {
        plafondVal = notaVal;
        totalPlafondLM += plafondVal;
        totalHargaNotaLM += notaVal;
      } else {
        const itemTaksir = unformatRibuan(item.hargaTaksir);
        const itemTotalTaksiran = item.qty * item.gram * itemTaksir;
        plafondVal = Math.round(itemTotalTaksiran * (item.ltv / 100));
        totalPlafondPerhiasan += plafondVal;
        totalHargaNotaPerhiasan += notaVal;
      }

      totalPlafond += plafondVal;
      totalHargaNota += notaVal;
    });

    return {
      totalPlafond,
      totalHargaNota,
      totalPlafondLM,
      totalPlafondPerhiasan,
      totalHargaNotaLM,
      totalHargaNotaPerhiasan,
    };
  };

  const {
    totalPlafond,
    totalHargaNota,
    totalPlafondLM,
    totalPlafondPerhiasan,
    totalHargaNotaLM,
    totalHargaNotaPerhiasan,
  } = getListCalculations();

  // DP min & max calculations
  const minDPLM = Math.round(totalPlafondLM * 0.05);
  const maxDPLM = Math.round(totalPlafondLM * 0.5);

  const minDPPerhiasan = totalHargaNotaPerhiasan - totalPlafondPerhiasan;
  const maxDPPerhiasan = Math.round(totalPlafondPerhiasan * 0.5) + minDPPerhiasan;

  // Deriving real DP Values based on user input or minimum fallback
  const derivedUangMukaLM = paymentOption === 'denganUangMuka' && totalPlafondLM > 0
    ? (unformatRibuan(jumlahUangMukaLM) === 0 ? minDPLM : unformatRibuan(jumlahUangMukaLM))
    : 0;

  const derivedUangMukaPerhiasan = paymentOption === 'denganUangMuka' && totalHargaNotaPerhiasan > 0
    ? (unformatRibuan(uangMukaPerhiasan) === 0 ? minDPPerhiasan : unformatRibuan(uangMukaPerhiasan))
    : 0;

  const totalUangMuka = paymentOption === 'denganUangMuka' ? (derivedUangMukaLM + derivedUangMukaPerhiasan) : 0;

  // Sync state values with derived minimums when necessary
  useEffect(() => {
    if (paymentOption === 'denganUangMuka') {
      if (totalPlafondLM > 0 && unformatRibuan(jumlahUangMukaLM) === 0) {
        setJumlahUangMukaLM(formatRibuan(minDPLM));
      }
      if (totalHargaNotaPerhiasan > 0 && unformatRibuan(uangMukaPerhiasan) === 0) {
        setUangMukaPerhiasan(formatRibuan(minDPPerhiasan));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOption, totalPlafondLM, totalHargaNotaPerhiasan]);

  // Biaya Admin Tiers
  const hitungBiayaAdmin = (amount: number) => {
    if (settings && settings.biayaAdmin && settings.biayaAdmin.length > 0) {
      for (const tier of settings.biayaAdmin) {
        if (amount >= tier.min && (tier.max === null || amount <= tier.max)) {
          return tier.isPercentage ? amount * (tier.fee / 100) : tier.fee;
        }
      }
    }
    // Fallback
    if (amount <= 1000000) return 10000;
    if (amount <= 2500000) return 20000;
    if (amount <= 5000000) return 30000;
    if (amount <= 10000000) return 40000;
    if (amount <= 15000000) return 65000;
    if (amount <= 20000000) return 90000;
    if (amount <= 25000000) return 115000;
    if (amount <= 50000000) return 150000;
    if (amount <= 75000000) return 175000;
    if (amount <= 100000000) return 200000;
    if (amount <= 250000000) return 375000;
    return 1000000;
  };

  // Derive intermediate amount for admin fee calculation
  const getIntermediateAmountForAdmin = () => {
    if (paymentOption === 'tanpaUangMuka') {
      return totalPlafond;
    } else if (paymentOption === 'denganUangMuka') {
      return totalPlafond - totalUangMuka + (totalHargaNotaPerhiasan - totalPlafondPerhiasan);
    } else { // tanpaUangMukaDenganAdmin
      return totalPlafond;
    }
  };

  const intermediateAmount = getIntermediateAmountForAdmin();
  const biayaAdmin = hitungBiayaAdmin(intermediateAmount);

  // Derive pembiayaanDiambil and jumlahDiterima ("Yang harus disiapkan")
  const getPembiayaanAndYangDisiapkan = () => {
    let pembiayaanDiambil = 0;
    let yangDisiapkan = 0;

    if (paymentOption === 'denganUangMuka') {
      pembiayaanDiambil = totalPlafond - totalUangMuka + (totalHargaNotaPerhiasan - totalPlafondPerhiasan);
      yangDisiapkan = totalUangMuka + biayaAdmin;
    } else if (paymentOption === 'tanpaUangMuka') {
      pembiayaanDiambil = totalPlafond + biayaAdmin;
      yangDisiapkan = 0;
    } else { // tanpaUangMukaDenganAdmin
      pembiayaanDiambil = totalPlafond;
      yangDisiapkan = biayaAdmin;
    }

    return { pembiayaanDiambil, yangDisiapkan };
  };

  const { pembiayaanDiambil, yangDisiapkan } = getPembiayaanAndYangDisiapkan();

  // Effective JKW (ensure >= 1 for calculations)
  const parsedJkw = typeof jkw === 'number' ? jkw : parseInt(String(jkw), 10);
  const effectiveJkw = isNaN(parsedJkw) || parsedJkw <= 0 ? 1 : parsedJkw;

  // Jasa Titip per Year (%)
  const getJasaTitipPercent = () => {
    if (settings && settings.jasaTitip && settings.jasaTitip.pke && settings.jasaTitip.pke.length > 0) {
      for (const tier of settings.jasaTitip.pke) {
        if (pembiayaanDiambil >= tier.min && (tier.max === null || pembiayaanDiambil <= tier.max)) {
          return tier.standar;
        }
      }
    }
    // Fallback
    if (effectiveJkw < 6) {
      return 12;
    } else {
      if (pembiayaanDiambil <= 25000000) return 12;
      if (pembiayaanDiambil <= 50000000) return 11;
      if (pembiayaanDiambil <= 100000000) return 8.5;
      return 8;
    }
  };

  const jasaTitipPercent = getJasaTitipPercent();

  // Jasa Titip per Bulan (Rp)
  const jasaTitipFraction = jasaTitipPercent / 100;
  const totalInterest = pembiayaanDiambil * (jasaTitipFraction / 12) * effectiveJkw;
  const jasaTitipBulan = Math.round(totalInterest / effectiveJkw);

  // Angsuran per Bulan (Rp)
  const angsuranPerBulan = Math.round((pembiayaanDiambil + totalInterest) / effectiveJkw);

  // Handlers for Persistence
  const handleOpenSaveModal = () => {
    setNamaDraft(`Simulasi PKE ${new Date().toLocaleDateString('id-ID')}`);
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
        hargaTaksir24K,
        jkw: effectiveJkw,
        paymentOption,
        jumlahUangMukaLM: paymentOption === 'denganUangMuka' ? jumlahUangMukaLM : '0',
        uangMukaPerhiasan: paymentOption === 'denganUangMuka' ? uangMukaPerhiasan : '0',
        jaminan: jaminanList.map((j) => ({
          jenis: j.jenis,
          nama: j.nama,
          qty: j.qty,
          gram: j.gram,
          karatase: j.karatase,
          hargaNota: j.hargaNota,
          hargaTaksir: j.hargaTaksir,
          totalTaksiran: j.totalTaksiran,
          ltv: j.ltv,
        })),
      };

      const itemNames = jaminanList.map((j) => `${j.nama} (${j.gram}gr)`).join(', ');

      await saveSimulation({
        name: namaDraft,
        dataString: JSON.stringify(dataToSave),
        type: 'PKE',
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
        memberName: memberName,
        itemMerk: itemNames || 'PKE',
        itemImei: '',
        plafond: pembiayaanDiambil,
      });

      alert('Data berhasil disimpan ke Cloud!');
      setIsSaveModalOpen(false);
    } catch (error) {
      console.error('Gagal menyimpan ke Cloud:', error);
      alert('Gagal menyimpan ke Cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadSimulations = async () => {
    setIsLoadingSaved(true);
    try {
      const loaded = await fetchSimulations('PKE');
      loaded.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setSavedSimulations(loaded);
    } catch (error) {
      console.error('Gagal memuat simulasi:', error);
      alert('Gagal memuat simulasi dari Cloud.');
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
      if (parsed.hargaTaksir24K) setHargaTaksir24K(parsed.hargaTaksir24K);
      if (parsed.jkw) setJkw(parseInt(parsed.jkw, 10) || 12);
      if (parsed.paymentOption) setPaymentOption(parsed.paymentOption);
      if (parsed.jumlahUangMukaLM) setJumlahUangMukaLM(parsed.jumlahUangMukaLM);
      if (parsed.uangMukaPerhiasan) setUangMukaPerhiasan(parsed.uangMukaPerhiasan);

      if (parsed.jaminan && parsed.jaminan.length > 0) {
        const reconstructed = parsed.jaminan.map((item: Record<string, unknown>, idx: number) => {
          const hNota = (item.hargaNota as string) || (item.harganota as string) || '0';
          const hTaksir = (item.hargaTaksir as string) || (item.hargataksir as string) || '0';
          const tTaksiran = (item.totalTaksiran as string) || (item.totaltaksiran as string) || '0';
          const ltvVal = item.ltv !== undefined ? item.ltv : 85;

          return {
            id: Date.now() + idx,
            nama: (item.nama as string) || '',
            jenis: (item.jenis as 'Logam Mulia' | 'Perhiasan') || 'Logam Mulia',
            qty: parseInt(String(item.qty), 10) || 1,
            gram: parseFloat(String(item.gram)) || 1.0,
            karatase: (item.karatase as string) || '24',
            hargaNota: hNota.toString(),
            hargaTaksir: hTaksir.toString(),
            totalTaksiran: tTaksiran.toString(),
            ltv: parseFloat(String(ltvVal)) || 85,
          };
        });
        setJaminanList(reconstructed);
      } else {
        setJaminanList([]);
      }

      setIsLoadModalOpen(false);
    } catch (e) {
      alert('Data simulasi tidak valid.');
    }
  };

  const handleDeleteSimulation = async (id: string) => {
    try {
      await deleteSimulation(id);
      setSavedSimulations((prev) => prev.filter((sim) => sim.id !== id));
      alert('Simulasi berhasil dihapus!');
    } catch (error) {
      console.error('Gagal menghapus:', error);
      alert('Gagal menghapus simulasi. Silakan periksa koneksi Anda atau coba lagi.');
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 no-print bg-white p-3 sm:p-4 rounded-xl shadow-sm border-2 border-slate-200">
        <h1 className="text-sm sm:text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span className="p-1.5 bg-yellow-100 rounded-lg text-yellow-700 text-xs sm:text-sm">💎</span> Pembiayaan Kepemilikan Emas (PKE)
        </h1>
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleOpenLoadModal}
            className="flex-1 sm:flex-initial bg-white hover:bg-slate-50 text-blue-600 border-2 border-blue-200 px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition"
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
            <h2 className="text-lg sm:text-2xl font-bold tracking-tight">Formulir Simulasi Kepemilikan Emas (PKE)</h2>
            <p className="text-amber-100 text-xs sm:text-sm mt-0.5">Atur detail jaminan Logam Mulia / Perhiasan untuk melakukan penaksiran dan pembiayaan emas.</p>
          </div>
          <div className="hidden sm:block">
            <span className="bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-amber-50">
              V.1.10
            </span>
          </div>
        </div>

        <div className="p-3.5 sm:p-6 md:p-8 space-y-5 sm:space-y-8">
          {/* Section 1: Core Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-6">
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
                  <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-amber-600' : ''} />
                </button>
              </div>
              {lastUpdated && (
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold mt-1 ml-1">
                  Pembaruan: {formatFriendlyDate(lastUpdated)}
                </p>
              )}
            </div>

            <div className="relative" ref={jkwDropdownRef}>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Jangka Waktu (Bulan)</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  inputMode="numeric"
                  value={jkw}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    const cleanNum = rawVal.replace(/\D/g, '');
                    if (cleanNum === '') {
                      setJkw('');
                    } else {
                      setJkw(parseInt(cleanNum, 10));
                    }
                  }}
                  onBlur={() => {
                    if (jkw === '' || Number(jkw) < 1 || isNaN(Number(jkw))) {
                      setJkw(1);
                    } else {
                      setJkw(Math.max(1, Number(jkw)));
                    }
                  }}
                  placeholder="12"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pl-3 sm:pl-4 pr-10 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setIsJkwDropdownOpen((prev) => !prev)}
                  className="absolute right-2 sm:right-2.5 p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                  title="Pilih Jangka Waktu"
                >
                  <ChevronDown size={18} className={`transition-transform duration-200 ${isJkwDropdownOpen ? 'rotate-180 text-amber-600' : ''}`} />
                </button>
              </div>

              {/* Dropdown Menu Preset 6, 12, 24, 36, 48, 60 */}
              {isJkwDropdownOpen && (
                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white border-2 border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-1 max-h-56 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Pilihan Jangka Waktu
                    </div>
                    {JKW_OPTIONS.map((opt) => {
                      const isSelected = Number(jkw) === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setJkw(opt);
                            setIsJkwDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between transition cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-700 hover:bg-amber-50 hover:text-amber-900'
                          }`}
                        >
                          <span>{opt} Bulan {opt >= 12 && opt % 12 === 0 ? `(${opt / 12} Tahun)` : ''}</span>
                          {isSelected && <span className="text-[11px] font-extrabold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                      onChange={(e) => setJenisJaminan(e.target.value as 'Logam Mulia' | 'Perhiasan')}
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

                  {jenisJaminan === 'Logam Mulia' ? (
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 truncate">Harga Nota (LM)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3 text-slate-400 font-semibold text-xs sm:text-sm">Rp</span>
                        <input
                          type="text"
                          value={hargaNotaLM}
                          onChange={(e) => {
                            const numeric = e.target.value.replace(/\D/g, '');
                            setHargaNotaLM(numeric ? formatRibuan(numeric) : '');
                          }}
                          onBlur={() => {
                            if (!hargaNotaLM || hargaNotaLM.trim() === '') {
                              setHargaNotaLM('0');
                            }
                          }}
                          placeholder="0"
                          className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl pl-7 sm:pl-9 pr-2.5 sm:pr-3 py-2 sm:py-3 text-xs sm:text-sm text-slate-800 font-bold focus:outline-none transition"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 truncate">Harga Taksir (/gr)</label>
                      <input
                        type="text"
                        value={`Rp ${formatRibuan(computedHargaTaksirPerGram)}`}
                        disabled
                        className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-600 cursor-not-allowed truncate"
                      />
                    </div>
                  )}
                </div>

                {jenisJaminan === 'Perhiasan' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-6">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Harga Nota</label>
                      <div className="relative">
                        <span className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3 text-slate-400 font-semibold text-xs sm:text-sm">Rp</span>
                        <input
                          type="text"
                          value={hargaNota}
                          onChange={(e) => {
                            const numeric = e.target.value.replace(/\D/g, '');
                            setHargaNota(numeric ? formatRibuan(numeric) : '');
                          }}
                          onBlur={() => {
                            if (!hargaNota || hargaNota.trim() === '') {
                              setHargaNota('0');
                            }
                          }}
                          placeholder="0"
                          className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-xl pl-7 sm:pl-9 pr-2.5 sm:pr-3 py-2 sm:py-3 text-xs sm:text-sm text-slate-800 font-bold focus:outline-none transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Total Taksiran</label>
                      <input
                        type="text"
                        value={`Rp ${formatRibuan(computedTotalTaksiranForm)}`}
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
                        value={`Rp ${formatRibuan(computedNilaiPlafondForm)}`}
                        disabled
                        className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-extrabold text-slate-700 cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}

                {jenisJaminan === 'Logam Mulia' && (
                  <div className="grid grid-cols-1 gap-3.5 sm:gap-6">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Nilai Plafond (Sama dengan Harga Nota LM)</label>
                      <input
                        type="text"
                        value={`Rp ${formatRibuan(computedNilaiPlafondForm)}`}
                        disabled
                        className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-extrabold text-slate-700 cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}

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
                {jaminanList.map((item) => {
                  const isLM = item.jenis === 'Logam Mulia';
                  const itemPlafond = isLM ? unformatRibuan(item.hargaNota) : Math.round((item.qty * item.gram * unformatRibuan(item.hargaTaksir)) * (item.ltv / 100));

                  return (
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
                        {isLM ? (
                          <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Harga Nota: <span className="text-slate-900 font-semibold">Rp {formatRibuan(item.hargaNota)}</span></p>
                        ) : (
                          <>
                            <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Harga Taksir: <span className="text-slate-900 font-semibold">Rp {item.hargaTaksir}/gram</span></p>
                            <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Total Taksiran: <span className="text-slate-900 font-semibold">Rp {item.totalTaksiran}</span></p>
                            <p className="text-[11px] sm:text-xs text-slate-600 font-medium">Harga Nota: <span className="text-slate-900 font-semibold">Rp {formatRibuan(item.hargaNota)}</span></p>
                            <p className="text-[11px] sm:text-xs text-slate-600 font-medium">LTV: <span className="text-slate-900 font-semibold">{item.ltv}%</span></p>
                          </>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t-2 border-amber-200">
                        <p className="text-xs sm:text-sm text-slate-800 font-bold">
                          Plafond: <span className="text-amber-700 font-extrabold">Rp {formatRibuan(itemPlafond)}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t-2 border-slate-200 my-4 sm:my-6"></div>

          {/* Section 4: JKW and Payment Option */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 no-print">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Pilihan Pembayaran</label>
              <select
                value={paymentOption}
                onChange={(e) => setPaymentOption(e.target.value as 'denganUangMuka' | 'tanpaUangMuka' | 'tanpaUangMukaDenganAdmin')}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 font-medium focus:outline-none focus:border-amber-500 transition"
              >
                <option value="denganUangMuka">Dengan Uang Muka (Admin + DP di Muka)</option>
                <option value="tanpaUangMuka" disabled={containsJewelry}>
                  Tanpa Muka, Tanpa Admin (Biaya Admin ditambahkan ke Pembiayaan)
                </option>
                <option value="tanpaUangMukaDenganAdmin" disabled={containsJewelry}>
                  Tanpa Uang Muka (Hanya Admin di Muka)
                </option>
              </select>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5 italic font-medium">
                {paymentOption === 'denganUangMuka' && 'Biaya admin dan uang muka dibayarkan dimuka.'}
                {paymentOption === 'tanpaUangMuka' && 'Biaya admin akan ditambahkan ke pembiayaan.'}
                {paymentOption === 'tanpaUangMukaDenganAdmin' && 'Biaya Admin wajib dibayarkan dimuka.'}
                {containsJewelry && ' (Pilihan Tanpa Uang Muka dinonaktifkan karena terdapat jaminan Perhiasan)'}
              </p>
            </div>

            {paymentOption === 'denganUangMuka' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-100/70 p-3 sm:p-4 rounded-xl border-2 border-slate-300 shadow-sm">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">DP LM</label>
                  <input
                    type="text"
                    value={jumlahUangMukaLM}
                    onChange={(e) => {
                      const numeric = e.target.value.replace(/\D/g, '');
                      setJumlahUangMukaLM(numeric ? formatRibuan(numeric) : '');
                    }}
                    onBlur={() => {
                      if (!jumlahUangMukaLM || jumlahUangMukaLM.trim() === '') {
                        setJumlahUangMukaLM('0');
                      }
                    }}
                    placeholder="0"
                    className="w-full bg-white border-2 border-slate-300 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                  {totalPlafondLM > 0 && (
                    <span className="text-[10px] text-slate-600 block mt-1 font-medium">
                      Min: Rp {formatRibuan(minDPLM)} <br /> Max: Rp {formatRibuan(maxDPLM)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">DP Perhiasan</label>
                  <input
                    type="text"
                    value={uangMukaPerhiasan}
                    onChange={(e) => {
                      const numeric = e.target.value.replace(/\D/g, '');
                      setUangMukaPerhiasan(numeric ? formatRibuan(numeric) : '');
                    }}
                    onBlur={() => {
                      if (!uangMukaPerhiasan || uangMukaPerhiasan.trim() === '') {
                        setUangMukaPerhiasan('0');
                      }
                    }}
                    placeholder="0"
                    className="w-full bg-white border-2 border-slate-300 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                  {totalHargaNotaPerhiasan > 0 && (
                    <span className="text-[10px] text-slate-600 block mt-1 font-medium">
                      Min: Rp {formatRibuan(minDPPerhiasan)} <br /> Max: Rp {formatRibuan(maxDPPerhiasan)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total DP</label>
                  <input
                    type="text"
                    value={`Rp ${formatRibuan(totalUangMuka)}`}
                    disabled
                    className="w-full bg-amber-100/80 border-2 border-amber-300 text-amber-900 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-black"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Hasil Perhitungan */}
          <div className="bg-amber-50/40 rounded-xl sm:rounded-2xl border-2 border-amber-300 shadow-md p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2 border-b-2 border-amber-300 pb-2.5 sm:pb-3">
              📊 Hasil Perhitungan Pembiayaan (PKE)
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
              {/* Left Column inputs */}
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Total Harga Nota</label>
                  <input
                    type="text"
                    value={`Rp ${formatRibuan(totalHargaNota)}`}
                    disabled
                    className="w-full bg-slate-100 border-2 border-slate-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-extrabold text-slate-700 cursor-not-allowed"
                  />
                </div>

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
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 font-bold text-slate-800">
                    Pembiayaan Yang Diambil
                  </label>
                  <input
                    type="text"
                    value={`Rp ${formatRibuan(pembiayaanDiambil)}`}
                    disabled
                    className="w-full bg-amber-100 border-2 border-amber-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-extrabold text-amber-900 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Right Column details */}
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 truncate">Jasa Titip / Thn (%)</label>
                    <input
                      type="text"
                      value={`${jasaTitipPercent}%`}
                      disabled
                      className="w-full bg-slate-100 border-2 border-slate-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-semibold text-slate-700 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 truncate">Jasa Titip / Bln</label>
                    <input
                      type="text"
                      value={`Rp ${formatRibuan(jasaTitipBulan)}`}
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
                      Yang Harus Disiapkan Di Muka
                    </span>
                    <span className="text-base sm:text-xl font-black text-amber-800">
                      Rp {formatRibuan(yangDisiapkan)}
                    </span>
                  </div>

                  <div className="bg-emerald-100/60 p-3.5 sm:p-4 rounded-xl border-2 border-emerald-300 shadow-sm">
                    <span className="block text-[10px] sm:text-xs font-bold text-emerald-900 mb-0.5 uppercase tracking-wider">
                      Angsuran Bulanan ({effectiveJkw} Bulan)
                    </span>
                    <span className="text-base sm:text-xl font-black text-emerald-800">
                      Rp {formatRibuan(angsuranPerBulan)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 text-slate-400 py-4 text-center text-sm font-medium border-t border-slate-700">
          Kalkulator Simulasi Pembiayaan Kepemilikan Emas (PKE) v.1.10 (18/10/2025)
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
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2"><Save /> Simpan Draft PKE</h3>
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
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setIsLoadModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-3.5 sm:p-4 border-b border-gray-200 gap-2">
              <h2 className="text-base sm:text-lg md:text-xl font-bold flex items-center gap-2 text-slate-800 min-w-0">
                <FolderOpen className="text-blue-600 shrink-0" size={20} />
                <span className="truncate">Riwayat Simulasi PKE</span>
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
                          <h4 className="font-bold text-slate-800 text-sm leading-snug">
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
                            <span className="font-medium text-slate-700 text-right">{sim.itemMerk || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                            <span className="text-slate-500 font-semibold">Plafond:</span>
                            <span className="font-extrabold text-blue-700 text-xs sm:text-sm">
                              {sim.plafond ? `Rp ${Number(sim.plafond).toLocaleString('id-ID')}` : '-'}
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
                            {sim.plafond ? `Rp ${Number(sim.plafond).toLocaleString('id-ID')}` : '-'}
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
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
