'use client';

import { useState, useEffect, useRef } from 'react';

// Guard SSR: localStorage hanya ada di browser.
const readStoredInt = (key: string, fallback: number, min = 0): number => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? Math.max(min, parseInt(saved, 10) || fallback) : fallback;
  } catch { return fallback; }
};
const readStoredBool = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === 'true' : fallback;
  } catch { return fallback; }
};
import { 
  Volume2, 
  VolumeX, 
  Vibrate, 
  Minus, 
  RotateCcw, 
  Edit3, 
  X, 
  Check, 
  Award, 
  Sparkles, 
  CheckCircle2, 
  ChevronRight,
  Info
} from 'lucide-react';

// Web Audio API Sound Synthesizer (Zero Latency, No external assets required)
class TasbihSoundEngine {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Soft wood bead / mechanical tally click
  playClick() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.04);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch (e) {
      console.warn('Audio click error:', e);
    }
  }

  // Melodic celebratory priority chime when target is reached
  playPriorityTargetChime() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.18 }, // C5
        { freq: 659.25, time: 0.08, dur: 0.22 }, // E5
        { freq: 783.99, time: 0.16, dur: 0.26 }, // G5
        { freq: 1046.50, time: 0.24, dur: 0.45 }, // C6
      ];

      notes.forEach(({ freq, time, dur }) => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime + time;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + dur);
      });
    } catch (e) {
      console.warn('Target chime error:', e);
    }
  }
}

const soundEngine = new TasbihSoundEngine();

const STORAGE_KEYS = {
  COUNT: 'tasbih_count_val',
  TARGET: 'tasbih_target_val',
  PUTARAN: 'tasbih_putaran_val',
  TOTAL_DZIKIR: 'tasbih_total_accumulated',
  AUDIO: 'tasbih_audio_enabled',
  VIBRATE: 'tasbih_vibrate_enabled',
};

const TARGET_PRESETS = [
  { value: 33, label: '33x', desc: 'Subhanallah / Tahmid / Takbir' },
  { value: 99, label: '99x', desc: 'Asmaul Husna' },
  { value: 100, label: '100x', desc: 'Istighfar / Shalawat' },
  { value: 142, label: '142x', desc: 'Target Khusus' },
  { value: 1000, label: '1.000x', desc: 'Dzikir Akbar' },
];

export default function TasbihPage() {
  // State initialization with localStorage fallback
  const [count, setCount] = useState<number>(() => readStoredInt(STORAGE_KEYS.COUNT, 0));

  const [target, setTarget] = useState<number>(() => readStoredInt(STORAGE_KEYS.TARGET, 33, 1));

  const [putaran, setPutaran] = useState<number>(() => readStoredInt(STORAGE_KEYS.PUTARAN, 0));

  const [totalDzikir, setTotalDzikir] = useState<number>(() => readStoredInt(STORAGE_KEYS.TOTAL_DZIKIR, 0));

  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(() => readStoredBool(STORAGE_KEYS.AUDIO, true));

  const [isVibrateEnabled, setIsVibrateEnabled] = useState<boolean>(() => readStoredBool(STORAGE_KEYS.VIBRATE, true));

  // Modal states
  const [isTargetModalOpen, setIsTargetModalOpen] = useState<boolean>(false);
  const [tempTargetInput, setTempTargetInput] = useState<string>(target.toString());
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [resetIncludePutaran, setResetIncludePutaran] = useState<boolean>(false);

  // Animation / Visual feedback states
  const [isPressed, setIsPressed] = useState<boolean>(false);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COUNT, count.toString());
  }, [count]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TARGET, target.toString());
  }, [target]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PUTARAN, putaran.toString());
  }, [putaran]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TOTAL_DZIKIR, totalDzikir.toString());
  }, [totalDzikir]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIO, isAudioEnabled.toString());
  }, [isAudioEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VIBRATE, isVibrateEnabled.toString());
  }, [isVibrateEnabled]);

  // Handle Haptic Vibration
  const triggerVibration = (isTargetReached: boolean) => {
    if (!isVibrateEnabled) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        if (isTargetReached) {
          // Longer pattern when target reached
          navigator.vibrate([120, 80, 240]);
        } else {
          // Single crisp tap
          navigator.vibrate(35);
        }
      } catch (e) {
        console.warn('Vibration API error:', e);
      }
    }
  };

  // Main Increment Action (Tap on center circle)
  const handleIncrement = () => {
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 120);

    const nextCount = count + 1;
    const isTargetReached = nextCount >= target;

    if (isTargetReached) {
      // Reached Target!
      // Hitungan kembali nol & tanda bukti 1 putaran
      setCount(0);
      const nextPutaran = putaran + 1;
      setPutaran(nextPutaran);
      setTotalDzikir(prev => prev + 1);

      // Priority Sound & Long Vibration
      if (isAudioEnabled) {
        soundEngine.playPriorityTargetChime();
      }
      triggerVibration(true);
    } else {
      // Normal increment
      setCount(nextCount);
      setTotalDzikir(prev => prev + 1);

      // Normal Sound & Single Vibration
      if (isAudioEnabled) {
        soundEngine.playClick();
      }
      triggerVibration(false);
    }
  };

  // Decrement Action (Minus button)
  const handleDecrement = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (count > 0) {
      setCount(prev => prev - 1);
      setTotalDzikir(prev => Math.max(0, prev - 1));
      if (isAudioEnabled) soundEngine.playClick();
      if (isVibrateEnabled && navigator.vibrate) navigator.vibrate(25);
    }
  };

  // Reset Confirmation Handler
  const handleConfirmReset = () => {
    setCount(0);
    if (resetIncludePutaran) {
      setPutaran(0);
      setTotalDzikir(0);
    }
    setIsResetModalOpen(false);
    if (isAudioEnabled) soundEngine.playClick();
    if (isVibrateEnabled && navigator.vibrate) navigator.vibrate([40, 40, 40]);
  };

  // Save Target Handler
  const handleSaveTarget = () => {
    const val = parseInt(tempTargetInput.replace(/\D/g, ''), 10);
    if (val && val > 0) {
      setTarget(val);
      // If current count is already above new target, reset count to 0
      if (count >= val) {
        setCount(0);
      }
      setIsTargetModalOpen(false);
    }
  };

  // Keyboard accessibility:
  // - Spasi / ArrowUp: Tambah hitungan (+1)
  // - Minus (-) / ArrowDown: Kurangi hitungan (-1)
  // - R / r: Buka pop-up konfirmasi reset
  // - A / a: Toggle Suara / Audio
  // - V / v: Toggle Getar / Vibration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or modal is open
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const key = e.key.toLowerCase();

      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleIncrement();
      } else if (e.key === '-' || e.key === 'ArrowDown' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        handleDecrement();
      } else if (key === 'r') {
        e.preventDefault();
        setIsResetModalOpen(true);
      } else if (key === 'a') {
        e.preventDefault();
        setIsAudioEnabled(prev => !prev);
      } else if (key === 'v') {
        e.preventDefault();
        setIsVibrateEnabled(prev => {
          const next = !prev;
          if (next && typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(40);
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [count, target, putaran, isAudioEnabled, isVibrateEnabled]);

  // Progress Calculation for Circular Ring
  const progressPercent = Math.min(100, Math.max(0, (count / target) * 100));
  
  // SVG Ring Geometry
  const size = 320; // internal coordinate system
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="w-full flex flex-col bg-white text-slate-900 select-none pb-6 -mx-4 sm:-mx-6 lg:-mx-8 -my-6 min-h-[calc(100dvh-4rem)]">
      {/* Top Bar: Badges on left & Atur Target button on top-right */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:pt-5 w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 text-teal-800 rounded-full text-xs sm:text-sm font-bold shadow-xs">
            <Award size={16} className="text-[#00897b]" />
            <span>Putaran: <strong className="text-slate-900">{putaran}</strong></span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-full text-xs sm:text-sm font-semibold shadow-xs">
            <Sparkles size={14} className="text-amber-500" />
            <span>Total: <strong className="text-slate-900">{totalDzikir}</strong></span>
          </div>
        </div>

        {/* Pojok Kanan Atas: Tombol Atur Target */}
        <button
          type="button"
          onClick={() => {
            setTempTargetInput(target.toString());
            setIsTargetModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white hover:bg-teal-50 active:bg-teal-100 border border-slate-200 hover:border-teal-300 text-slate-700 hover:text-teal-800 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
          title="Atur Target Hitungan Tasbih"
          aria-label="Atur Target Tasbih"
        >
          <Edit3 size={15} className="text-[#00897b]" />
          <span>Target: <strong className="text-slate-900">{target}</strong></span>
        </button>
      </div>

      {/* Main Center Area: Large Circular Tasbih Tap Button with Progress Ring */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 my-auto">
        <div className="relative flex items-center justify-center">
          {/* Outer Interactive Tap Area Button */}
          <button
            type="button"
            onClick={handleIncrement}
            className={`relative rounded-full focus:outline-none transition-all duration-150 touch-manipulation cursor-pointer select-none group ${
              isPressed ? 'scale-95' : 'hover:scale-[1.01]'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label={`Tambah hitungan tasbih. Sekarang ${count} dari ${target}`}
          >
            {/* SVG Circular Progress Track and Fill */}
            <svg
              className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 -rotate-90 transform drop-shadow-xs"
              viewBox={`0 0 ${size} ${size}`}
            >
              {/* Background Track Circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                className="stroke-slate-100"
                strokeWidth={strokeWidth}
                fill="transparent"
              />

              {/* Active Foreground Progress Arc */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#00897b"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-200 ease-out"
              />
            </svg>

            {/* Inner Content Area (Count, Target, & Touch Ripple) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {/* Current Count (Large Black Bold Number) */}
              <span className="text-7xl sm:text-8xl md:text-9xl font-black text-slate-950 tracking-tighter leading-none transition-transform">
                {count}
              </span>

              {/* Target Indicator (/ 142) */}
              <div className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-600 mt-2 sm:mt-3 tracking-tight">
                / {target}
              </div>

              {/* Progress Percentage Subtle Indicator */}
              <span className="text-[11px] sm:text-xs font-semibold text-slate-400 mt-1">
                {Math.round(progressPercent)}%
              </span>
            </div>
          </button>
        </div>
      </main>

      {/* Bottom Control Bar with 4 Icons in a Row (Matching user's UI: Audio, Vibrate, Minus, Reset) */}
      <footer className="w-full max-w-md mx-auto px-6 pt-3 pb-2">
        <div className="flex items-center justify-between gap-4 py-2">
          {/* 1. Toggle Audio (Pintasan: A) */}
          <button
            type="button"
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className={`w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer ${
              isAudioEnabled 
                ? 'text-[#00897b] bg-teal-50 hover:bg-teal-100 ring-2 ring-[#00897b]/30' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
            title={`Suara: ${isAudioEnabled ? 'Aktif' : 'Nonaktif'} (Pintasan Keyboard: A)`}
            aria-label="Toggle Audio"
          >
            {isAudioEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
            <span className="text-[9px] font-bold mt-0.5 tracking-tight">
              {isAudioEnabled ? 'Suara (A)' : 'Mute (A)'}
            </span>
          </button>

          {/* 2. Toggle Getar (Pintasan: V) */}
          <button
            type="button"
            onClick={() => {
              const next = !isVibrateEnabled;
              setIsVibrateEnabled(next);
              if (next && typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(40);
              }
            }}
            className={`w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer ${
              isVibrateEnabled 
                ? 'text-[#00897b] bg-teal-50 hover:bg-teal-100 ring-2 ring-[#00897b]/30' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
            title={`Getar: ${isVibrateEnabled ? 'Aktif' : 'Nonaktif'} (Pintasan Keyboard: V)`}
            aria-label="Toggle Getar"
          >
            <Vibrate size={24} />
            <span className="text-[9px] font-bold mt-0.5 tracking-tight">
              {isVibrateEnabled ? 'Getar (V)' : 'Off (V)'}
            </span>
          </button>

          {/* 3. Tombol Minus (Pintasan: -) */}
          <button
            type="button"
            onClick={handleDecrement}
            disabled={count === 0}
            className={`w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center transition-all ${
              count > 0 
                ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:scale-95 cursor-pointer' 
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Kurangi Hitungan (-1) (Pintasan Keyboard: -)"
            aria-label="Kurangi Hitungan"
          >
            <Minus size={24} />
            <span className="text-[9px] font-bold mt-0.5 tracking-tight">Minus (-)</span>
          </button>

          {/* 4. Tombol Reset (Pintasan: R) */}
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center text-slate-700 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer"
            title="Reset Hitungan Tasbih (Pintasan Keyboard: R)"
            aria-label="Reset Hitungan"
          >
            <RotateCcw size={24} />
            <span className="text-[9px] font-bold mt-0.5 tracking-tight">Reset (R)</span>
          </button>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* MODAL 1: PENGATURAN TARGET TASBIH (DIBUKA DARI POJOK KANAN ATAS)           */}
      {/* ========================================================================= */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#00897b] p-5 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Edit3 size={20} />
                <h3 className="text-lg font-bold">Atur Target Tasbih</h3>
              </div>
              <button 
                onClick={() => setIsTargetModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/20 text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Jumlah Target Hitungan
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    autoFocus
                    value={tempTargetInput}
                    onChange={(e) => setTempTargetInput(e.target.value)}
                    placeholder="Contoh: 33, 99, 142..."
                    className="w-full text-2xl font-black text-slate-900 border-2 border-slate-200 focus:border-[#00897b] rounded-2xl p-3 pl-4 focus:outline-none transition"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    kali
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Saat hitungan mencapai target, tasbih akan kembali ke nol dan mencatat 1 putaran.
                </p>
              </div>

              {/* Target Quick Presets */}
              <div>
                <span className="block text-xs font-bold text-slate-600 mb-2">
                  Pilihan Cepat:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setTempTargetInput(preset.value.toString())}
                      className={`p-2 rounded-xl text-center border font-bold text-xs transition cursor-pointer ${
                        tempTargetInput === preset.value.toString()
                          ? 'bg-[#00897b] text-white border-[#00897b] shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <div>{preset.label}</div>
                      <div className="text-[9px] font-normal opacity-80 truncate">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTargetModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveTarget}
                  disabled={!tempTargetInput || parseInt(tempTargetInput, 10) <= 0}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  Simpan Target
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: KONFIRMASI RESET PERHITUNGAN TASBIH (YA / TIDAK)                   */}
      {/* ========================================================================= */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 p-6 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <RotateCcw size={24} />
            </div>

            <h3 className="text-lg font-bold text-slate-900 text-center mb-1">
              Reset Perhitungan Tasbih?
            </h3>
            
            <p className="text-xs text-slate-500 text-center mb-5">
              Apakah Anda ingin mereset perhitungan tasbih ke angka nol?
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={resetIncludePutaran}
                  onChange={(e) => setResetIncludePutaran(e.target.checked)}
                  className="rounded border-slate-300 text-[#00897b] focus:ring-[#00897b]"
                />
                <span>Reset juga riwayat putaran & total dzikir ({putaran} putaran)</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Tidak
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
              >
                Ya, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

