import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Volume2, 
  VolumeX, RotateCcw, X, Sparkles, Music2 
} from 'lucide-react';
import { KitabMaulidInfo, FashlMaulid } from '@/lib/islami/types/maulid';

interface MaulidAudioPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  kitab: KitabMaulidInfo;
  currentFashl: FashlMaulid;
  onSelectFashl: (index: number) => void;
}

export const MaulidAudioPlayer: React.FC<MaulidAudioPlayerProps> = ({
  isOpen,
  onClose,
  kitab,
  currentFashl,
  onSelectFashl
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(180); // mock duration seconds
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / playbackRate);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, duration, playbackRate]);

  if (!isOpen) return null;

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:w-96 z-50 bg-slate-900/95 dark:bg-slate-900/95 text-white border border-teal-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
            <Music2 className="w-4 h-4 animate-pulse" />
          </div>
          <div className="truncate">
            <div className="text-xs font-semibold truncate text-white">{kitab.nama}</div>
            <div className="text-[11px] text-teal-300/80 truncate">{currentFashl.judul}</div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={(e) => setCurrentTime(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-2">
        {/* Playback speed toggle */}
        <button
          onClick={() => {
            const speeds = [0.75, 1.0, 1.25, 1.5];
            const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
            setPlaybackRate(speeds[nextIdx]);
          }}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-mono rounded text-slate-300 transition"
        >
          {playbackRate}x
        </button>

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const prevIdx = Math.max(0, currentFashl.nomor - 2);
              onSelectFashl(prevIdx);
              setCurrentTime(0);
            }}
            disabled={currentFashl.nomor <= 1}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 transition"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center shadow-lg transition transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => {
              const nextIdx = Math.min(kitab.fashls.length - 1, currentFashl.nomor);
              onSelectFashl(nextIdx);
              setCurrentTime(0);
            }}
            disabled={currentFashl.nomor >= kitab.fashls.length}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 transition"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Mute button */}
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 text-slate-400 hover:text-white transition"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Reciter attribution */}
      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <span>Lantunan:</span>
        <span className="text-teal-300 font-medium">{kitab.audioReciter || 'Majelis Sholawat'}</span>
      </div>
    </div>
  );
};
