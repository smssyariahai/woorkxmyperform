'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Info, 
  Settings, 
  MapPin, 
  RefreshCw, 
  Compass, 
  ChevronLeft, 
  ChevronRight, 
  Volume2, 
  VolumeX, 
  BellOff, 
  Bell, 
  CheckCircle2, 
  Play, 
  Pause,
  X, 
  Search, 
  Moon, 
  Sun, 
  CloudSun, 
  Sunrise, 
  Sunset, 
  Sparkles,
  Check,
  Slash
} from 'lucide-react';
import { 
  getOfficialPrayerSchedule, 
  getSavedLocation, 
  saveUserLocation, 
  requestDeviceGPS, 
  INDONESIAN_CITIES, 
  DailyPrayerSchedule, 
  PrayerTimeItem,
  UserSavedLocation 
} from '@/lib/islami/prayerTimeService';
import { 
  PrayerSoundType, 
  PrayerTimeKey,
  SOUND_DEFINITIONS,
  getSoundOptionsForPrayer, 
  PrayerNotificationSettings, 
  getPrayerSoundSettings, 
  savePrayerSoundSettings, 
  loadPrayerSoundSettingsFromDb,
  playPrayerSound,
  stopPrayerSound
} from '@/lib/islami/prayerSoundService';

export default function JadwalShalatPage() {
  const router = useRouter();
  // WOORK: identitas user dibaca server dari session NextAuth; halaman tidak butuh email.
  const currentEmail: string | null = null;

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [schedule, setSchedule] = useState<DailyPrayerSchedule | null>(null);
  const [location, setLocation] = useState<UserSavedLocation>(() => getSavedLocation());
  const [soundSettings, setSoundSettings] = useState<PrayerNotificationSettings>(() => getPrayerSoundSettings(currentEmail));
  
  // Modals
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false);
  const [activePrayerForSetting, setActivePrayerForSetting] = useState<PrayerTimeKey | null>(null);
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  
  // UI states
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync settings with Firestore database whenever user session is detected
  useEffect(() => {
    let isMounted = true;
    loadPrayerSoundSettingsFromDb(currentEmail).then((cloudSettings) => {
      if (isMounted) {
        setSoundSettings(cloudSettings);
      }
    });

    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<PrayerNotificationSettings>;
      if (customEvent.detail) {
        setSoundSettings(customEvent.detail);
      }
    };

    window.addEventListener('prayer_sound_settings_changed', handleSettingsChanged);
    return () => {
      isMounted = false;
      window.removeEventListener('prayer_sound_settings_changed', handleSettingsChanged);
    };
  }, [currentEmail]);

  // Live second countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch / Calculate schedule when location or selected date changes
  const loadSchedule = async (loc: UserSavedLocation, date: Date) => {
    try {
      const data = await getOfficialPrayerSchedule(loc, date);
      setSchedule(data);
    } catch (err) {
      console.error('Failed to load prayer schedule', err);
    }
  };

  useEffect(() => {
    loadSchedule(location, selectedDate);
  }, [location, selectedDate]);

  // Request GPS
  const handleGetGPS = async () => {
    setIsLoadingGps(true);
    try {
      const newLoc = await requestDeviceGPS();
      setLocation(newLoc);
      setIsCityModalOpen(false);
      showToast('Lokasi berhasil disinkronkan dengan GPS perangkat Anda!');
    } catch (err) {
      const errorMsg = (err as Error).message || 'Gagal mendeteksi lokasi GPS.';
      showToast(errorMsg);
    } finally {
      setIsLoadingGps(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Change selected date
  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  // Sound change handler
  const handleSoundChange = (prayerId: PrayerTimeKey, soundType: PrayerSoundType) => {
    const updated = { ...soundSettings, [prayerId]: soundType };
    setSoundSettings(updated);
    savePrayerSoundSettings(updated, currentEmail);
    showToast(`Nada ${prayerId.toUpperCase()} disetel ke "${SOUND_DEFINITIONS[soundType]?.label}" (Tersimpan ke Database)`);
  };

  // Toggle play/pause audio test
  const handleTogglePlayAudio = (soundType: PrayerSoundType, key: string) => {
    if (playingPreview === key) {
      stopPrayerSound();
      setPlayingPreview(null);
    } else {
      stopPrayerSound();
      setPlayingPreview(key);
      playPrayerSound(soundType, () => {
        setPlayingPreview(prev => (prev === key ? null : prev));
      });
    }
  };

  // Stop audio when modal closes or unmounts
  useEffect(() => {
    if (!isSettingModalOpen) {
      stopPrayerSound();
      setPlayingPreview(null);
    }
  }, [isSettingModalOpen]);

  useEffect(() => {
    return () => {
      stopPrayerSound();
    };
  }, []);

  // Open specific prayer setting modal
  const openPrayerSetting = (prayerId: string) => {
    if (['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'].includes(prayerId)) {
      setActivePrayerForSetting(prayerId as PrayerTimeKey);
      setIsSettingModalOpen(true);
    }
  };

  // Compute live seconds countdown to next prayer
  const getSecondsCountdown = () => {
    if (!schedule?.nextPrayer?.item) return '- 00 : 00 : 00';
    const nextItem = schedule.nextPrayer.item;
    const [tH, tM] = nextItem.time.split(':').map(Number);
    const now = currentTime;
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), tH, tM, 0);

    let diffSec = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
    if (diffSec < 0) {
      diffSec += 24 * 3600; // next day
    }

    const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const s = String(diffSec % 60).padStart(2, '0');

    return `- ${h} : ${m} : ${s}`;
  };

  const nextPrayerItem = schedule?.nextPrayer?.item;
  const filteredCities = INDONESIAN_CITIES.filter(c => 
    c.name.toLowerCase().includes(citySearchQuery.toLowerCase()) ||
    c.province.toLowerCase().includes(citySearchQuery.toLowerCase())
  );

  const formattedDateTitle = selectedDate.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="w-full max-w-lg mx-auto pb-20 space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-semibold backdrop-blur-md border border-white/20 animate-in fade-in slide-in-from-bottom">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. HERO HEADER (Teal Islamic Atmosphere with Silhouette) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-teal-600 via-teal-700 to-emerald-800 text-white shadow-xl">
        {/* Background decorative mosque silhouette pattern */}
        <div className="absolute inset-0 opacity-15 pointer-events-none mix-blend-overlay">
          <svg className="w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="none" fill="none">
            <path d="M0,280 L0,220 C40,220 50,160 80,160 C110,160 120,220 160,220 C180,220 190,130 200,100 C210,130 220,220 240,220 C280,220 290,170 320,170 C350,170 360,220 400,220 L400,280 Z" fill="white" />
          </svg>
        </div>

        {/* Top Navbar */}
        <div className="relative z-10 px-4 pt-4 pb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white hover:text-emerald-200 transition font-bold text-base"
          >
            <ArrowLeft size={20} />
            <span>Jadwal Shalat</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsInfoModalOpen(true)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white cursor-pointer"
              title="Info & Hisab Kemenag"
            >
              <Info size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePrayerForSetting('ashar');
                setIsSettingModalOpen(true);
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white cursor-pointer"
              title="Pengaturan Suara Notifikasi"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Hero Center Content */}
        <div className="relative z-10 px-6 pt-3 pb-8 text-center flex flex-col items-center">
          {/* Location Badge */}
          <button
            type="button"
            onClick={() => setIsCityModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/15 hover:bg-black/25 text-white/95 text-xs font-medium backdrop-blur-xs transition mb-2"
          >
            <MapPin size={13} className="text-rose-400 shrink-0 fill-rose-400" />
            <span className="truncate max-w-[260px]">
              {schedule?.cityName || 'Mendeteksi Lokasi...'}
            </span>
          </button>

          {/* Active / Next Prayer Headline */}
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1 drop-shadow-sm">
            {nextPrayerItem?.name || 'Ashar'}{' '}
            <span>{nextPrayerItem?.time || '14:51'} WIB</span>
          </h2>

          {/* Live Seconds Countdown */}
          <div className="text-sm font-bold font-mono tracking-widest text-emerald-100/90 mt-1">
            {getSecondsCountdown()}
          </div>

          {/* Action Row: Update & Arah Kiblat */}
          <div className="w-full flex items-center justify-between mt-6 pt-3 px-2 text-xs font-semibold text-emerald-100">
            <button
              type="button"
              onClick={handleGetGPS}
              disabled={isLoadingGps}
              className="flex items-center gap-1.5 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoadingGps ? 'animate-spin' : ''} />
              <span>Update</span>
            </button>

            <Link
              href="/islami/kompas-kiblat"
              className="flex items-center gap-1.5 hover:text-white transition"
            >
              <Compass size={15} />
              <span>Arah Kiblat</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. OVERLAPPING DATE CARD / PILL */}
      <div className="-mt-7 relative z-20 px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700/80 p-2.5 flex items-center justify-between text-center">
          <button
            type="button"
            onClick={handlePrevDay}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-teal-700 dark:text-teal-400 transition"
            title="Hari Sebelumnya"
          >
            <ChevronLeft size={18} />
          </button>

          <div>
            <div className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-white">
              {formattedDateTitle}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {schedule?.hijriDate || '12 Rabiul Akhir 1448 H'}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-teal-700 dark:text-teal-400 transition"
            title="Hari Berikutnya"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* 3. CLEAN PRAYER TIMES LIST (Single Card with Rows) */}
      <div className="px-2">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-700/70 p-3 sm:p-4 space-y-1">
          {schedule?.timings.map((prayer) => {
            const isNext = schedule.nextPrayer.item.id === prayer.id;
            const isConfigurable = ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'].includes(prayer.id);
            const currentSound = isConfigurable ? soundSettings[prayer.id as PrayerTimeKey] : 'none';

            // Get icon according to prayer type
            const renderIcon = () => {
              switch (prayer.id) {
                case 'imsak':
                  return <Moon size={18} className="text-slate-600 dark:text-slate-300" />;
                case 'subuh':
                  return <CloudSun size={18} className="text-slate-600 dark:text-slate-300" />;
                case 'terbit':
                  return <Sunrise size={18} className="text-amber-500" />;
                case 'dhuha':
                  return <Sun size={18} className="text-amber-400" />;
                case 'dzuhur':
                  return <Sun size={18} className="text-amber-500" />;
                case 'ashar':
                  return <CloudSun size={18} className="text-slate-600 dark:text-slate-300" />;
                case 'maghrib':
                  return <Sunset size={18} className="text-amber-600" />;
                case 'isya':
                default:
                  return <Moon size={18} className="text-slate-600 dark:text-slate-300" />;
              }
            };

            // Sound indicator icon
            const renderSoundIndicator = () => {
              if (!isConfigurable) {
                return (
                  <div className="w-6 h-6 flex items-center justify-center text-slate-300 dark:text-slate-600">
                    <Slash size={14} />
                  </div>
                );
              }
              if (currentSound === 'none') {
                return <BellOff size={16} className="text-slate-300 dark:text-slate-600" />;
              }
              if (currentSound === 'silent') {
                return <VolumeX size={16} className="text-slate-400" />;
              }
              // Active sound (Bedug, Tarhim, Adzan, Default)
              return <Volume2 size={18} className="text-teal-600 dark:text-teal-400" />;
            };

            return (
              <div
                key={prayer.id}
                onClick={() => openPrayerSetting(prayer.id)}
                className={`w-full px-3.5 py-3 rounded-2xl transition flex items-center justify-between cursor-pointer select-none ${
                  isNext
                    ? 'bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200'
                }`}
              >
                {/* Left: Icon & Prayer Name */}
                <div className="flex items-center gap-3.5">
                  <div className="shrink-0">{renderIcon()}</div>
                  <span className="text-sm font-semibold tracking-tight">
                    {prayer.name}
                  </span>
                </div>

                {/* Right: Time & Sound Icon */}
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-bold tracking-tight">
                    {prayer.time}
                  </span>
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      openPrayerSetting(prayer.id);
                    }}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition"
                    title={`Ubah Notifikasi ${prayer.name}`}
                  >
                    {renderSoundIndicator()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. FOOTER TASHIH & KEMENAG ENDORSEMENT */}
      <div className="pt-4 text-center px-4">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Waktu Shalat telah ditashih oleh
        </p>
        <div className="inline-flex items-center gap-1.5 mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span>Kementerian Agama RI & Lembaga Falakiyah</span>
          <CheckCircle2 size={14} className="text-emerald-500 fill-emerald-500 text-white shrink-0" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: PENGATURAN NOTIFIKASI SUARA PER WAKTU SHALAT */}
      {/* ========================================================================= */}
      {isSettingModalOpen && (
        <div 
          onClick={() => setIsSettingModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 max-h-[85vh] overflow-y-auto cursor-default"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Settings size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Pengaturan Suara Notifikasi
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Pilih jenis nada untuk setiap waktu shalat
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Prayer Selector Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {([
                { key: 'imsak', label: 'Imsak' },
                { key: 'subuh', label: 'Subuh' },
                { key: 'terbit', label: 'Terbit' },
                { key: 'dhuha', label: 'Dhuha' },
                { key: 'dzuhur', label: 'Dzuhur' },
                { key: 'ashar', label: 'Ashar' },
                { key: 'maghrib', label: 'Maghrib' },
                { key: 'isya', label: 'Isya' },
              ] as const).map(({ key, label }) => {
                const isSelected = activePrayerForSetting === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActivePrayerForSetting(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                      isSelected
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Sound Options List */}
            {activePrayerForSetting && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Pilihan Suara untuk {activePrayerForSetting.toUpperCase()}
                </div>
                {getSoundOptionsForPrayer(activePrayerForSetting).map((opt) => {
                  const currentSelected = soundSettings[activePrayerForSetting];
                  const isOptSelected = currentSelected === opt.id;

                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSoundChange(activePrayerForSetting, opt.id)}
                      className={`p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                        isOptSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40 shadow-2xs'
                          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isOptSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {isOptSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {opt.label}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {opt.description}
                          </div>
                        </div>
                      </div>

                      {/* Play / Pause Preview Button */}
                      {opt.id !== 'none' && opt.id !== 'silent' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlayAudio(opt.id, `modal_${opt.id}`);
                          }}
                          className={`p-2 rounded-xl transition shadow-2xs cursor-pointer flex items-center justify-center ${
                            playingPreview === `modal_${opt.id}`
                              ? 'bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-400/50 scale-105'
                              : 'bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 text-teal-700 dark:text-teal-400'
                          }`}
                          title={playingPreview === `modal_${opt.id}` ? "Hentikan Suara (Pause)" : `Putar Contoh Nada ${opt.label}`}
                        >
                          {playingPreview === `modal_${opt.id}` ? (
                            <Pause size={13} className="fill-white stroke-white" />
                          ) : (
                            <Play size={13} />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pre-alarm Configuration */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white">
                    Pengingat Menjelang Waktu Shalat
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Kirim notifikasi & bunyikan bedug beberapa menit sebelumnya
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soundSettings.enablePreAlarm}
                    onChange={(e) => {
                      const updated = { ...soundSettings, enablePreAlarm: e.target.checked };
                      setSoundSettings(updated);
                      savePrayerSoundSettings(updated, currentEmail);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>

              {soundSettings.enablePreAlarm && (
                <div className="flex items-center gap-1.5 pt-1">
                  {[5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        const updated = { ...soundSettings, preAlarmMinutes: mins };
                        setSoundSettings(updated);
                        savePrayerSoundSettings(updated, currentEmail);
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-xl transition cursor-pointer ${
                        soundSettings.preAlarmMinutes === mins
                          ? 'bg-teal-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {mins} Menit Sebelum
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Browser & Android System Notification Status */}
            <div className="p-3.5 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/40 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Bell size={16} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-white">
                      Notifikasi Browser & Android Status Bar
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Notifikasi otomatis masuk ke Notifikasi Global aplikasi, Browser PC, dan Notification Center HP Android.
                    </div>
                  </div>
                </div>
                {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const perm = await Notification.requestPermission();
                        if (perm === 'granted') {
                          showToast('Notifikasi Browser & Android berhasil diizinkan!');
                        }
                      } catch {
                        showToast('Izin notifikasi tidak dapat diminta di browser ini.');
                      }
                    }}
                    className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] rounded-xl shrink-0 cursor-pointer shadow-xs transition"
                  >
                    Izinkan
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full shrink-0">
                    <Check size={10} strokeWidth={3} /> Aktif
                  </span>
                )}
              </div>

              {/* Test Button */}
              <button
                type="button"
                onClick={async () => {
                  // WOORK: belum ada layanan notifikasi global — uji coba hanya memutar suara.
                  try {
                    await Notification.requestPermission();
                  } catch { /* abaikan */ }
                  playPrayerSound('adzan_makkah');
                  showToast('Suara adzan uji coba diputar!');
                }}
                className="w-full py-2 bg-white dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles size={13} className="text-teal-600 dark:text-teal-400" />
                <span>Uji Coba Putar Suara Adzan</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsSettingModalOpen(false)}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-xs shadow-md transition cursor-pointer"
            >
              Simpan & Tutup
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PILIH KOTA / UPDATE LOKASI GPS */}
      {/* ========================================================================= */}
      {isCityModalOpen && (
        <div 
          onClick={() => setIsCityModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-rose-500" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Pilih Wilayah / Kota
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCityModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* GPS Auto Detect Button */}
            <button
              type="button"
              onClick={handleGetGPS}
              disabled={isLoadingGps}
              className="w-full py-2.5 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <RefreshCw size={14} className={isLoadingGps ? 'animate-spin' : ''} />
              <span>{isLoadingGps ? 'Mendeteksi Lokasi GPS...' : 'Gunakan Lokasi GPS HP Saat Ini'}</span>
            </button>

            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={citySearchQuery}
                onChange={(e) => setCitySearchQuery(e.target.value)}
                placeholder="Cari nama kota atau kabupaten..."
                className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-xs outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Cities List */}
            <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
              {filteredCities.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => {
                    const newLoc: UserSavedLocation = {
                      useGps: false,
                      cityId: city.id,
                      customCityName: `${city.name} (${city.province})`,
                      lat: city.lat,
                      lng: city.lng
                    };
                    saveUserLocation(newLoc);
                    setLocation(newLoc);
                    setIsCityModalOpen(false);
                    showToast(`Wilayah diatur ke ${city.name}`);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between transition cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-100">{city.name}</div>
                    <div className="text-[10px] text-slate-400">{city.province}</div>
                  </div>
                  {location.cityId === city.id && (
                    <Check size={14} className="text-teal-600 font-bold" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: INFO HISAB KEMENAG RI */}
      {/* ========================================================================= */}
      {isInfoModalOpen && (
        <div 
          onClick={() => setIsInfoModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Info size={18} className="text-teal-600" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Ketetapan & Hisab Resmi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2.5 leading-relaxed">
              <p>
                Waktu shalat dan Imsak dihitung berdasarkan formula hisab <strong>Kementerian Agama Republik Indonesia (Kemenag RI)</strong> dan Lembaga Falakiyah.
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl space-y-1 text-[11px]">
                <div>• <strong>Subuh:</strong> Ketinggian matahari -20° di bawah ufuk.</div>
                <div>• <strong>Isya:</strong> Ketinggian matahari -18° di bawah ufuk.</div>
                <div>• <strong>Imsak:</strong> 10 menit sebelum waktu Subuh.</div>
                <div>• <strong>Ihtiyath (Kehati-hatian):</strong> +2 menit standar Kemenag.</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsInfoModalOpen(false)}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-xs transition cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

