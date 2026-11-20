'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Coins, Calculator, BookOpen, Users, CheckCircle2, 
  HelpCircle, Info, Sparkles, Scale, RefreshCw, X
} from 'lucide-react';
import { 
  fetchGoldPricesFromApi, 
  parsePrimaryPriceFromItems, 
  getTodayWibDateString 
} from '@/lib/islami/logamMuliaApi';

interface ZakatRecipient {
  id: string;
  order: number;
  title: { id?: string; en?: string } | string;
  description: { id?: string; en?: string } | string;
  sources?: string[];
}

const getText = (val: any, fallback = ''): string => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.id || val.en || Object.values(val)[0] || fallback;
  }
  return String(val);
};

const formatRibuan = (num: number | string): string => {
  if (num === '' || num === null || num === undefined) return '';
  const clean = String(num).replace(/\D/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('id-ID').format(parseInt(clean, 10));
};

const unformatRibuan = (str: string): number => {
  if (!str) return 0;
  const clean = String(str).replace(/\D/g, '');
  return clean ? parseInt(clean, 10) : 0;
};

const KalkulatorZakat: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kalkulator' | 'asnaf'>('kalkulator');
  const [zakatType, setZakatType] = useState<'penghasilan' | 'emas' | 'fitrah'>('penghasilan');

  // Gold reference price states
  const [goldPriceInput, setGoldPriceInput] = useState<string>('1.400.000');
  const [goldLastUpdated, setGoldLastUpdated] = useState<string>(getTodayWibDateString());
  const [isRefreshingGold, setIsRefreshingGold] = useState<boolean>(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Penghasilan inputs (formatted with thousand separator)
  const [incomeMonthly, setIncomeMonthly] = useState<string>('10.000.000');
  const [otherIncome, setOtherIncome] = useState<string>('0');
  const [basicExpenses, setBasicExpenses] = useState<string>('2.000.000');

  // Emas / Tabungan inputs
  const [savingsAmount, setSavingsAmount] = useState<string>('50.000.000');
  const [goldGrams, setGoldGrams] = useState<string>('50');
  const [shortTermDebt, setShortTermDebt] = useState<string>('0');

  // Fitrah inputs
  const [fitrahSouls, setFitrahSouls] = useState<number>(4);
  const [fitrahRateInput, setFitrahRateInput] = useState<string>('45.000');

  // Asnaf data
  const [recipients, setRecipients] = useState<ZakatRecipient[]>([]);

  // Harga acuan emas: ambil live dari upstream publik logam-mulia-api.
  // (Langkah lama: riwayat harga dari database backup /api/pg/gold — TIDAK
  // ada di woork, di-defer. Perhitungan tetap jalan client-side; harga
  // juga bisa diedit manual di kolom input.)
  const fetchDatabaseGoldPrice = async (showFeedback = false) => {
    setIsRefreshingGold(true);
    try {
      const todayStr = getTodayWibDateString();
      let foundPrice = 0;
      let fetchedDate = todayStr;
      try {
        const liveItems = await fetchGoldPricesFromApi('logammulia');
        if (liveItems && liveItems.length > 0) {
          const parsed = parsePrimaryPriceFromItems(liveItems, 'logammulia');
          if (parsed.sellPrice && parsed.sellPrice > 0) {
            foundPrice = parsed.sellPrice;
            fetchedDate = liveItems[0]?.recordedDate || todayStr;
          }
        }
      } catch (apiErr) {
        console.warn('Live API fetch failed:', apiErr);
      }
      if (foundPrice > 0) {
        setGoldPriceInput(formatRibuan(foundPrice));
        setGoldLastUpdated(fetchedDate);
        if (showFeedback) {
          setRefreshNotice(`Berhasil memuat harga Antam (Logam Mulia): Rp ${formatRibuan(foundPrice)}/gr (${fetchedDate})`);
          setTimeout(() => setRefreshNotice(null), 3500);
        }
      } else if (showFeedback) {
        setRefreshNotice('Data harga emas terkini belum tersedia. Tetap menggunakan nilai saat ini.');
        setTimeout(() => setRefreshNotice(null), 3500);
      }
    } catch (err) {
      console.error('Error fetching gold price for zakat:', err);
      if (showFeedback) {
        setRefreshNotice('Gagal memuat harga emas. Anda tetap dapat memasukkan nominal secara manual.');
        setTimeout(() => setRefreshNotice(null), 3500);
      }
    } finally {
      setIsRefreshingGold(false);
    }
  };

  useEffect(() => {
    fetchDatabaseGoldPrice(false);
    fetch('/data/islamic/zakat/recipients.json')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecipients(data);
      })
      .catch((err) => console.error('Failed to load asnaf:', err));
  }, []);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const goldPricePerGram = unformatRibuan(goldPriceInput) || 1400000;

  // 1. Zakat Penghasilan calculations
  const totalIncome = unformatRibuan(incomeMonthly) + unformatRibuan(otherIncome);
  const netIncome = Math.max(0, totalIncome - unformatRibuan(basicExpenses));
  const nisabMonthlyIncome = (85 * goldPricePerGram) / 12;
  const isEligiblePenghasilan = netIncome >= nisabMonthlyIncome;
  const zakatPenghasilanAmount = isEligiblePenghasilan ? netIncome * 0.025 : 0;

  // 2. Zakat Emas / Tabungan calculations
  const totalAssets = unformatRibuan(savingsAmount) + ((parseFloat(goldGrams) || 0) * goldPricePerGram);
  const netAssets = Math.max(0, totalAssets - unformatRibuan(shortTermDebt));
  const nisabEmasAnnual = 85 * goldPricePerGram;
  const isEligibleEmas = netAssets >= nisabEmasAnnual;
  const zakatEmasAmount = isEligibleEmas ? netAssets * 0.025 : 0;

  // 3. Zakat Fitrah calculations
  const fitrahRatePerPerson = unformatRibuan(fitrahRateInput) || 45000;
  const totalFitrahNominal = fitrahSouls * fitrahRatePerPerson;
  const totalFitrahRiceKg = fitrahSouls * 2.5;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <Link
              href="/islami"
              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                <Coins size={16} />
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Kalkulator & Panduan Zakat
              </h1>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3">
          <div className="bg-slate-100/90 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setActiveTab('kalkulator')}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'kalkulator'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kalkulator Hitung Zakat
            </button>
            <button
              onClick={() => setActiveTab('asnaf')}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'asnaf'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8 Asnaf Penerima Zakat
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 space-y-5">
        {activeTab === 'kalkulator' ? (
          <>
            {/* Zakat Type Selector */}
            <div className="flex gap-2 p-1.5 bg-slate-200/80 rounded-2xl">
              <button
                onClick={() => setZakatType('penghasilan')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  zakatType === 'penghasilan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zakat Penghasilan (Profesi)
              </button>
              <button
                onClick={() => setZakatType('emas')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  zakatType === 'emas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zakat Maal (Tabungan / Emas)
              </button>
              <button
                onClick={() => setZakatType('fitrah')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  zakatType === 'fitrah' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zakat Fitrah
              </button>
            </div>

            {/* Price reference info banner */}
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="p-2 bg-emerald-100/80 text-emerald-800 rounded-xl shrink-0">
                  <Scale size={18} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-900">
                    <span>Standar Nisab Emas: 85 Gram</span>
                    <span className="text-emerald-700 font-extrabold">&bull; Estimasi Acuan: {formatRupiah(goldPricePerGram)}/gr</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Tabel Harga Emas: <strong>Antam (Logam Mulia)</strong> &bull; Sumber: <span className="font-semibold">logam-mulia-api</span> &bull; Kat: <span className="font-semibold">Logam Mulia</span> ({goldLastUpdated})
                  </p>
                </div>
              </div>

              <div className="w-full md:w-auto flex items-center gap-2 pt-2.5 md:pt-0 border-t md:border-t-0 border-emerald-200/60">
                <div className="flex-1 md:flex-initial flex items-center gap-1.5 bg-white px-3 py-2 md:py-1.5 rounded-xl border border-emerald-300 shadow-sm">
                  <span className="text-xs font-bold text-slate-600 shrink-0">Rp</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={goldPriceInput}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '');
                      setGoldPriceInput(clean ? formatRibuan(clean) : '');
                    }}
                    placeholder="0"
                    className="flex-1 w-full md:w-28 bg-transparent font-bold text-slate-900 text-right focus:outline-none text-sm md:text-xs"
                  />
                  <span className="text-xs md:text-[11px] text-slate-500 font-medium shrink-0">/gr</span>
                </div>

                <button
                  type="button"
                  onClick={() => fetchDatabaseGoldPrice(true)}
                  disabled={isRefreshingGold}
                  className="p-2.5 md:p-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl transition cursor-pointer shadow-sm shrink-0 flex items-center justify-center"
                  title="Refresh acuan harga emas dari database"
                  aria-label="Refresh acuan harga emas"
                >
                  <RefreshCw size={16} className={isRefreshingGold ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Refresh Notification Banner */}
            {refreshNotice && (
              <div className="p-3 bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-300 text-xs font-medium flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                  <span>{refreshNotice}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setRefreshNotice(null)} 
                  className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
                  title="Tutup pesan"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* FORM: ZAKAT PENGHASILAN */}
            {zakatType === 'penghasilan' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 text-base">Pendapatan & Pengeluaran Bulanan</h3>
                  
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Gaji / Penghasilan Pokok (per Bulan)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={incomeMonthly}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          setIncomeMonthly(clean ? formatRibuan(clean) : '');
                        }}
                        placeholder="0"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Penghasilan Tambahan / Bonus
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={otherIncome}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          setOtherIncome(clean ? formatRibuan(clean) : '');
                        }}
                        placeholder="0"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Kebutuhan Pokok / Hutang Jatuh Tempo Bulanan
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={basicExpenses}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          setBasicExpenses(clean ? formatRibuan(clean) : '');
                        }}
                        placeholder="0"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* RESULT CARD */}
                <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl flex flex-col justify-between border border-emerald-700/50 space-y-4">
                  <div className="space-y-3">
                    <span className="text-xs uppercase font-bold tracking-widest text-emerald-300">
                      Hasil Perhitungan Zakat Profesi
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-200">Nisab Bulanan (85 gr Emas / 12 bln):</p>
                      <p className="text-sm font-bold text-white">{formatRupiah(nisabMonthlyIncome)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-200">Penghasilan Bersih (Setelah Pengeluaran):</p>
                      <p className="text-lg font-bold text-emerald-100">{formatRupiah(netIncome)}</p>
                    </div>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm space-y-2 border border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-emerald-200">Status Kewajiban:</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        isEligiblePenghasilan ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {isEligiblePenghasilan ? 'Wajib Zakat (2.5%)' : 'Belum Mencapai Nisab'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <span className="text-xs text-emerald-200">Zakat yang Harus Ditunaikan:</span>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-300">
                        {formatRupiah(zakatPenghasilanAmount)}
                        <span className="text-xs font-normal text-emerald-200"> / bulan</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FORM: ZAKAT EMAS & TABUNGAN */}
            {zakatType === 'emas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 text-base">Harta Simpanan & Tabungan (Haul 1 Tahun)</h3>
                  
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Saldo Tabungan / Deposito / Giro (Rp)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={savingsAmount}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          setSavingsAmount(clean ? formatRibuan(clean) : '');
                        }}
                        placeholder="0"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Simpanan Emas Batangan / Perhiasan Simpanan (Gram)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={goldGrams}
                        onChange={(e) => setGoldGrams(e.target.value)}
                        placeholder="0"
                        className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Gram</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Hutang Jatuh Tempo yang Mengurangi Harta (Rp)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={shortTermDebt}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          setShortTermDebt(clean ? formatRibuan(clean) : '');
                        }}
                        placeholder="0"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* RESULT CARD */}
                <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl flex flex-col justify-between border border-emerald-700/50 space-y-4">
                  <div className="space-y-3">
                    <span className="text-xs uppercase font-bold tracking-widest text-emerald-300">
                      Hasil Perhitungan Zakat Maal
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-200">Nisab Tahunan (85 gr Emas):</p>
                      <p className="text-sm font-bold text-white">{formatRupiah(nisabEmasAnnual)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-200">Total Harta Bersih:</p>
                      <p className="text-lg font-bold text-emerald-100">{formatRupiah(netAssets)}</p>
                    </div>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm space-y-2 border border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-emerald-200">Status Kewajiban:</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        isEligibleEmas ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {isEligibleEmas ? 'Wajib Zakat (2.5%)' : 'Belum Mencapai Nisab'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <span className="text-xs text-emerald-200">Zakat Maal yang Harus Dikeluarkan:</span>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-300">
                        {formatRupiah(zakatEmasAmount)}
                        <span className="text-xs font-normal text-emerald-200"> / tahun</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FORM: ZAKAT FITRAH */}
            {zakatType === 'fitrah' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 text-base">Zakat Fitrah Akhir Ramadhan</h3>
                  
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Jumlah Anggota Jiwa yang Ditanggung
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        value={fitrahSouls}
                        onChange={(e) => setFitrahSouls(parseInt(e.target.value) || 1)}
                        placeholder="1"
                        className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Jiwa</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Nominal Uang per Jiwa (Standar BAZNAS / Setempat)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={fitrahRateInput}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '');
                          setFitrahRateInput(clean ? formatRibuan(clean) : '');
                        }}
                        placeholder="0"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* RESULT CARD */}
                <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl flex flex-col justify-between border border-emerald-700/50 space-y-4">
                  <div className="space-y-3">
                    <span className="text-xs uppercase font-bold tracking-widest text-emerald-300">
                      Total Zakat Fitrah ({fitrahSouls} Jiwa)
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-200">Jika Diberikan Beras (2.5 kg / jiwa):</p>
                      <p className="text-2xl font-black text-white">{totalFitrahRiceKg} Kg Beras</p>
                    </div>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm space-y-2 border border-white/10">
                    <span className="text-xs text-emerald-200">Jika Diberikan Setara Uang:</span>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-300">
                      {formatRupiah(totalFitrahNominal)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ASNAF RECIPIENTS TAB */
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm">
              <h3 className="font-bold text-slate-900 text-lg mb-1">
                8 Golongan yang Berhak Menerima Zakat (Mustahiq)
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 italic">
                Sesuai firman Allah SWT dalam Surah At-Taubah ayat 60
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recipients.map((asnaf, idx) => (
                <div
                  key={asnaf.id || idx}
                  className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0">
                      {asnaf.order || idx + 1}
                    </div>
                    <h4 className="font-bold text-slate-900 text-base">
                      {getText(asnaf.title)}
                    </h4>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pl-11">
                    {getText(asnaf.description)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KalkulatorZakat;
