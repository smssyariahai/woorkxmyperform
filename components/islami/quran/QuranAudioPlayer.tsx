import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Volume2, 
  RotateCcw, X, DownloadCloud, CheckCircle2, ChevronUp, ChevronDown
} from 'lucide-react';
import { AudioReciter, AyahData, SurahInfo } from '@/lib/islami/types/quran';
import { 
  AUDIO_RECITERS, 
  getAyahAudioUrl, 
  getOrCacheAudioBlobUrl, 
  isAudioCached 
} from '@/lib/islami/quranStorage';

interface QuranAudioPlayerProps {
  currentSurah: SurahInfo;
  ayahs: AyahData[];
  currentAyahNumber: number;
  isPlaying: boolean;
  reciterId: string;
  autoPlayNext: boolean;
  playbackSpeed: number;
  onAyahChange: (ayahNumber: number) => void;
  onPlayPauseToggle: () => void;
  onClosePlayer: () => void;
  onReciterChange: (reciterId: string) => void;
  onAutoPlayToggle: () => void;
  onSpeedChange: (speed: number) => void;
}

export const QuranAudioPlayer: React.FC<QuranAudioPlayerProps> = ({
  currentSurah,
  ayahs,
  currentAyahNumber,
  isPlaying,
  reciterId,
  autoPlayNext,
  playbackSpeed,
  onAyahChange,
  onPlayPauseToggle,
  onClosePlayer,
  onReciterChange,
  onAutoPlayToggle,
  onSpeedChange,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'single' | 'surah'>('off');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const selectedReciter = AUDIO_RECITERS.find((r) => r.id === reciterId) || AUDIO_RECITERS[0];
  const currentAyah = ayahs.find((a) => a.ayah === currentAyahNumber) || ayahs[0];

  // Load and play audio when ayah or reciter changes
  useEffect(() => {
    let isCancelled = false;

    async function prepareAudio() {
      if (!currentAyah || !audioRef.current) return;

      setIsLoadingAudio(true);
      const directUrl = getAyahAudioUrl(selectedReciter.urlPrefix, currentSurah.id, currentAyahNumber);

      // Check if already in cache
      const cached = await isAudioCached(directUrl);
      if (!isCancelled) setIsCached(cached);

      try {
        // Fetch or get from cache
        const playableUrl = await getOrCacheAudioBlobUrl(directUrl);
        if (isCancelled || !audioRef.current) return;

        audioRef.current.src = playableUrl;
        audioRef.current.playbackRate = playbackSpeed;
        setIsCached(true);

        if (isPlaying) {
          audioRef.current.play().catch((err) => {
            console.warn('Playback error / Autoplay prevented:', err);
          });
        }
      } catch (err) {
        console.error('Audio load error:', err);
      } finally {
        if (!isCancelled) setIsLoadingAudio(false);
      }
    }

    prepareAudio();

    return () => {
      isCancelled = true;
    };
  }, [currentSurah.id, currentAyahNumber, reciterId]);

  // Handle play/pause toggle from props
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch((err) => console.warn('Play interrupted:', err));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Update playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Handle track end
  const handleAudioEnded = () => {
    if (repeatMode === 'single') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    const currentIndex = ayahs.findIndex((a) => a.ayah === currentAyahNumber);
    if (currentIndex < ayahs.length - 1) {
      // Advance to next verse
      if (autoPlayNext) {
        onAyahChange(ayahs[currentIndex + 1].ayah);
      } else {
        onPlayPauseToggle();
      }
    } else {
      // Reached end of surah
      if (repeatMode === 'surah') {
        onAyahChange(ayahs[0].ayah);
      } else {
        onPlayPauseToggle();
      }
    }
  };

  const handleNextAyah = () => {
    const currentIndex = ayahs.findIndex((a) => a.ayah === currentAyahNumber);
    if (currentIndex < ayahs.length - 1) {
      onAyahChange(ayahs[currentIndex + 1].ayah);
    }
  };

  const handlePrevAyah = () => {
    const currentIndex = ayahs.findIndex((a) => a.ayah === currentAyahNumber);
    if (currentIndex > 0) {
      onAyahChange(ayahs[currentIndex - 1].ayah);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-2xl transition-all">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onEnded={handleAudioEnded}
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* Progress bar line */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2 cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration > 0) {
              audioRef.current.currentTime = clickPos * duration;
            }
          }}
        >
          <div 
            className="bg-emerald-600 h-full transition-all duration-100 rounded-full"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Surah & Ayah Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {currentAyahNumber}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-800 text-sm truncate">
                  QS. {currentSurah.latin} : {currentAyahNumber}
                </span>
                {isCached ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" title="Tersimpan di cache offline">
                    <CheckCircle2 size={10} /> Cache
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                    <DownloadCloud size={10} /> Stream
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">
                Qari: {selectedReciter.name}
              </p>
            </div>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrevAyah}
              disabled={currentAyahNumber <= 1}
              className="p-1.5 sm:p-2 text-slate-600 hover:text-emerald-700 disabled:opacity-30 transition cursor-pointer"
              title="Ayat Sebelumnya"
            >
              <SkipBack size={18} />
            </button>

            <button
              type="button"
              onClick={onPlayPauseToggle}
              disabled={isLoadingAudio}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-md shadow-emerald-600/30 transition transform active:scale-95 cursor-pointer"
              title={isPlaying ? 'Jeda' : 'Putar'}
            >
              {isLoadingAudio ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} />
              ) : (
                <Play size={18} className="translate-x-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleNextAyah}
              disabled={currentAyahNumber >= currentSurah.num_ayah}
              className="p-1.5 sm:p-2 text-slate-600 hover:text-emerald-700 disabled:opacity-30 transition cursor-pointer"
              title="Ayat Selanjutnya"
            >
              <SkipForward size={18} />
            </button>
          </div>

          {/* Right: Auxiliary Toggles & Close */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 rounded-lg transition cursor-pointer"
              title={isExpanded ? 'Tutup Pengaturan Audio' : 'Buka Pengaturan Audio'}
            >
              {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>

            <button
              type="button"
              onClick={onClosePlayer}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
              title="Tutup Pemutar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Expanded Controls Drawer */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Reciter selector */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Qari:</span>
              <select
                value={reciterId}
                onChange={(e) => onReciterChange(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald-500"
              >
                {AUDIO_RECITERS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.bitrate})
                  </option>
                ))}
              </select>
            </div>

            {/* Speed & Repeat & Auto-Next */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Playback Speed */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {[0.75, 1, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => onSpeedChange(speed)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                      playbackSpeed === speed
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              {/* Repeat Button */}
              <button
                type="button"
                onClick={() => {
                  if (repeatMode === 'off') setRepeatMode('single');
                  else if (repeatMode === 'single') setRepeatMode('surah');
                  else setRepeatMode('off');
                }}
                className={`px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                  repeatMode !== 'off'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <RotateCcw size={12} />
                {repeatMode === 'off' ? 'Ulang: Mati' : repeatMode === 'single' ? 'Ulang: 1 Ayat' : 'Ulang: 1 Surah'}
              </button>

              {/* Auto Next Verse Toggle */}
              <button
                type="button"
                onClick={onAutoPlayToggle}
                className={`px-2 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                  autoPlayNext
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Auto-Next: {autoPlayNext ? 'Aktif' : 'Mati'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
