'use client';

import { useState, useMemo } from 'react';
import { Calendar, Calculator, Coins, RefreshCw, Printer, AlertCircle, CheckCircle2, Clock, Sparkles } from 'lucide-react';

// Porting dari backup src/pages/KalkulatorPelunasanEmas.tsx (304 baris).
// Kalkulasi pelunasan / diskon ujrah dipertahankan apa adanya:
// periode 10 hari = ceil(selisiHari / 10), total mun'ah = periode x mun'ah
// per 10 hari, total pelunasan = uang pinjaman + total mun'ah
// (mun'ah akad TIDAK masuk total pelunasan, sesuai backup).
// Halaman ini murni kalkulasi client-side, tanpa API.

export default function KalkulatorPelunasanEmasPage() {
  const [activeTab, setActiveTab] = useState<'gadai' | 'cicil'>('gadai');

  // Form states for Gadai
  const [tglAkad, setTglAkad] = useState<string>('');
  const [tglLunas, setTglLunas] = useState<string>('');
  const [uangPinjaman, setUangPinjaman] = useState<string>('');
  const [munahAkad, setMunahAkad] = useState<string>('');
  const [munah10Hari, setMunah10Hari] = useState<string>('');
  const [calculated, setCalculated] = useState<boolean>(false);

  // Formatter helpers
  const formatRibuan = (val: number | string): string => {
    const num = typeof val === 'number' ? val : parseInt(val.toString().replace(/\D/g, '') || '0', 10);
    return new Intl.NumberFormat('id-ID').format(num);
  };

  const parseNumber = (val: string): number => {
    return parseInt(val.replace(/\D/g, '') || '0', 10);
  };

  const handleRupiahInput = (value: string, setter: (val: string) => void) => {
    const numeric = value.replace(/\D/g, '');
    if (!numeric) {
      setter('');
    } else {
      setter(formatRibuan(numeric));
    }
  };

  // Calculations
  const calculationResult = useMemo(() => {
    if (!tglAkad || !tglLunas || !uangPinjaman || !munah10Hari) {
      return { isError: true, errorMessage: 'Silakan lengkapi semua field data terlebih dahulu!' };
    }

    const dAkad = new Date(tglAkad);
    const dLunas = new Date(tglLunas);

    // Calculate difference in days
    const diffTime = dLunas.getTime() - dAkad.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (isNaN(diffDays) || diffDays < 0) {
      return { isError: true, errorMessage: 'Tanggal Rencana Pelunasan tidak boleh lebih awal dari Tanggal Akad!' };
    }

    // Periode 10 hari
    let periode10Hari = Math.ceil(diffDays / 10);
    if (diffDays > 0 && periode10Hari === 0) periode10Hari = 1;

    const pinjamanNum = parseNumber(uangPinjaman);
    const munahAkadNum = parseNumber(munahAkad);
    const munah10HariNum = parseNumber(munah10Hari);

    const totalMunah10Hari = periode10Hari * munah10HariNum;
    const totalPelunasan = pinjamanNum + totalMunah10Hari; // Exclude munahAkad from Total Pelunasan as requested

    return {
      isError: false,
      diffDays,
      periode10Hari,
      pinjamanNum,
      munahAkadNum,
      munah10HariNum,
      totalMunah10Hari,
      totalPelunasan,
    };
  }, [tglAkad, tglLunas, uangPinjaman, munahAkad, munah10Hari]);

  const handleReset = () => {
    setTglAkad('');
    setTglLunas('');
    setUangPinjaman('');
    setMunahAkad('');
    setMunah10Hari('');
    setCalculated(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 pb-12">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-print bg-white p-3.5 sm:p-4 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-sm sm:text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700 text-xs sm:text-sm">🪙</span> Kalkulator Pelunasan Emas
        </h1>
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 sm:flex-initial bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition"
          >
            <RefreshCw size={15} /> Reset
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition"
          >
            <Printer size={15} /> Cetak
          </button>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 sm:p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('gadai')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'gadai'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-100'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Coins size={16} className={activeTab === 'gadai' ? 'text-emerald-600' : 'text-slate-400'} />
            Pelunasan Gadai Emas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cicil')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'cicil'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-100'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles size={16} className={activeTab === 'cicil' ? 'text-amber-500' : 'text-slate-400'} />
            Pelunasan Cicil Emas
          </button>
        </div>

        {/* Tab Content: Gadai Emas */}
        {activeTab === 'gadai' && (
          <div className="p-4 sm:p-6 md:p-8 space-y-4 max-w-lg mx-auto">
            {/* Inputs Grid */}
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                    Tgl Akad
                  </label>
                  <input
                    type="date"
                    value={tglAkad}
                    onChange={(e) => {
                      setTglAkad(e.target.value);
                      setCalculated(false);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">
                    Tgl Rencana Pelunasan
                  </label>
                  <input
                    type="date"
                    value={tglLunas}
                    onChange={(e) => {
                      setTglLunas(e.target.value);
                      setCalculated(false);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">Uang Pinjaman (Rp)</label>
                <input
                  type="text"
                  value={uangPinjaman}
                  onChange={(e) => {
                    handleRupiahInput(e.target.value, setUangPinjaman);
                    setCalculated(false);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">Mun&apos;ah Akad (Rp)</label>
                <input
                  type="text"
                  value={munahAkad}
                  onChange={(e) => {
                    handleRupiahInput(e.target.value, setMunahAkad);
                    setCalculated(false);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1">Mun&apos;ah per 10 Hari (Rp)</label>
                <input
                  type="text"
                  value={munah10Hari}
                  onChange={(e) => {
                    handleRupiahInput(e.target.value, setMunah10Hari);
                    setCalculated(false);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={() => setCalculated(true)}
              className="w-full bg-[#10a34f] hover:bg-[#0e8f45] active:bg-[#0c7d3c] text-white py-3 px-4 rounded-lg font-bold text-xs sm:text-sm transition-colors shadow-xs cursor-pointer text-center"
            >
              Hitung Pelunasan
            </button>

            {/* Error state */}
            {calculationResult?.isError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3.5 text-xs sm:text-sm flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{calculationResult.errorMessage}</span>
              </div>
            )}

            {/* Calculation Output Card (Compact Receipt Style) */}
            {!calculationResult?.isError && calculationResult && calculated && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3 font-medium text-xs sm:text-sm text-slate-700 max-w-sm mx-auto shadow-sm">
                <div className="text-center pb-2 border-b border-dashed border-slate-300">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] sm:text-xs">
                    Rincian Pelunasan Gadai
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    No: REG-{Math.floor(100000 + Math.random() * 900000)}
                  </p>
                </div>

                <div className="space-y-2 py-1 font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Jumlah Hari Titip:</span>
                    <span className="font-bold text-slate-800">{calculationResult.diffDays} Hari</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Uang Pinjaman:</span>
                    <span className="font-bold text-slate-800">Rp {formatRibuan(calculationResult.pinjamanNum ?? 0)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Mun&apos;ah per 10 Hari:</span>
                    <span className="font-bold text-slate-800">Rp {formatRibuan(calculationResult.munah10HariNum ?? 0)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Faktor Pengali (Periode):</span>
                    <span className="font-bold text-slate-800">{calculationResult.periode10Hari}x (per 10 hr)</span>
                  </div>

                  <div className="flex justify-between items-center text-emerald-600 font-bold">
                    <span>Total Mun&apos;ah Titip:</span>
                    <span>Rp {formatRibuan(calculationResult.totalMunah10Hari ?? 0)}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 uppercase text-[11px] sm:text-xs">Total Pelunasan:</span>
                    <span className="text-base sm:text-lg font-black text-emerald-600">
                      Rp {formatRibuan(calculationResult.totalPelunasan ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Cicil Emas */}
        {activeTab === 'cicil' && (
          <div className="p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-600">
              <Sparkles size={28} />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-lg font-bold text-slate-800">Kalkulator Pelunasan Cicil Emas</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Fitur perhitungan pelunasan dipercepat untuk skema Pembiayaan Kepemilikan Emas (PKE) / Cicil Emas sedang disiapkan.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
