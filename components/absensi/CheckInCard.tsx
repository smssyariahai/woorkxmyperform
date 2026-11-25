// Kartu Check In/Out hari ini — status, GPS browser, geofence, tombol besar.
// Bila belum ada lokasi kantor aktif: tampilkan peringatan yang membantu
// (bukan sekadar error) + tautan ke Pengaturan > Lokasi.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  AlertTriangle,
  CalendarDays,
  Moon,
  Loader2,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatTimeSecondsId,
  formatDateLongId,
  formatMinutes,
  formatDistance,
  haversineMeters,
  recordStatusLabel,
  recordStatusBadge,
  type TodayStatus,
} from '@/lib/attendance/client';

interface GpsState {
  status: 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'error';
  latitude: number | null;
  longitude: number | null;
  message: string | null;
}

const IDLE_GPS: GpsState = { status: 'idle', latitude: null, longitude: null, message: null };

export function CheckInCard({
  canCheckIn,
  onGoToSettings,
}: {
  canCheckIn: boolean;
  onGoToSettings: () => void;
}) {
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsState>(IDLE_GPS);
  const [note, setNote] = useState('');
  const [isRemote, setIsRemote] = useState(false);
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  // Jam berjalan (WIB, dengan detik) — diperbarui tiap detik.
  const [now, setNow] = useState(() => new Date());
  const gpsRequestedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<TodayStatus>('/api/absensi/status');
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat status absensi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const requestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGps({ status: 'unavailable', latitude: null, longitude: null, message: 'Browser ini tidak mendukung GPS.' });
      return;
    }
    setGps((g) => ({ ...g, status: 'locating', message: 'Mengambil lokasi…' }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          status: 'ready',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          message: null,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGps({
            status: 'denied',
            latitude: null,
            longitude: null,
            message: 'Izin lokasi ditolak — aktifkan izin lokasi browser agar bisa check in.',
          });
        } else if (err.code === err.TIMEOUT) {
          setGps({ status: 'error', latitude: null, longitude: null, message: 'Waktu pengambilan lokasi habis. Coba lagi.' });
        } else {
          setGps({ status: 'error', latitude: null, longitude: null, message: 'Lokasi tidak tersedia. Coba lagi.' });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  // Ambil GPS sekali saat kartu pertama dimuat (bila diizinkan).
  useEffect(() => {
    if (!gpsRequestedRef.current) {
      gpsRequestedRef.current = true;
      requestGps();
    }
  }, [requestGps]);

  const nearest =
    status && gps.status === 'ready' && gps.latitude !== null && gps.longitude !== null && status.locations.length > 0
      ? status.locations
          .map((loc) => {
            const distance = haversineMeters(
              { latitude: gps.latitude as number, longitude: gps.longitude as number },
              { latitude: loc.latitude, longitude: loc.longitude }
            );
            return { loc, distance, within: distance <= loc.radiusMeters };
          })
          .sort((a, b) => a.distance - b.distance)[0]
      : null;

  const noLocation = !!status && status.setting.requireGeofence && status.locations.length === 0;

  async function submit(kind: 'in' | 'out') {
    if (!status) return;
    if (!canCheckIn) {
      toast.error('Anda tidak memiliki izin check in.');
      return;
    }
    // Geofence wajib + belum ada lokasi -> jangan kirim, arahkan ke pengaturan.
    if (noLocation && !isRemote) {
      toast.error('Belum ada lokasi kantor. Minta admin/HRD membuat lokasi dulu di Pengaturan > Lokasi.');
      return;
    }
    // Bila geofence wajib dan GPS belum siap (dan bukan remote), minta GPS dulu.
    if (status.setting.requireGeofence && !status.setting.allowRemoteCheckIn && gps.status !== 'ready') {
      toast.error('Lokasi GPS belum didapat. Aktifkan izin lokasi lalu coba lagi.');
      requestGps();
      return;
    }
    setSubmitting(kind);
    setResultMsg(null);
    try {
      const body: Record<string, unknown> = {
        latitude: gps.latitude,
        longitude: gps.longitude,
        note: note.trim() || null,
        isRemote: status.setting.allowRemoteCheckIn ? isRemote : false,
      };
      const data = await apiJson<{ message: string; record?: unknown }>(
        kind === 'in' ? '/api/absensi/check-in' : '/api/absensi/check-out',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      toast.success(data.message || (kind === 'in' ? 'Check in berhasil.' : 'Check out berhasil.'));
      setResultMsg(data.message ?? null);
      setNote('');
      await loadStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memproses absensi.';
      toast.error(msg);
      setResultMsg(msg);
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="mt-4 h-24 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
        <div className="mt-3 h-11 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
      </section>
    );
  }

  if (error || !status) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <p className="text-[13px] text-warn">{error ?? 'Status absensi tidak tersedia.'}</p>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="mt-3 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  const rec = status.record;
  const shift = status.shift;

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Clock className="h-4 w-4 text-brand" />
            Absensi Hari Ini
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {formatDateLongId(new Date(`${status.date}T00:00:00Z`))}
            {' — '}
            <span className="font-mono font-semibold text-ink">{formatTimeSecondsId(now)} WIB</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
          title="Muat ulang status"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Peringatan: belum ada lokasi kantor */}
      {noLocation && (
        <div className="mt-3 flex items-start gap-2 rounded-btn border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-[13px]">
            <p className="font-semibold text-amber-800 dark:text-amber-200">Belum ada lokasi kantor</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              Check in memakai geofence, tapi belum ada lokasi kantor yang dibuat. Minta admin/HRD membuat
              lokasi dulu di Pengaturan &gt; Lokasi.
            </p>
            <button
              type="button"
              onClick={onGoToSettings}
              className="mt-2 inline-flex items-center gap-1 rounded-btn bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
            >
              <Settings2 className="h-3.5 w-3.5" /> Buka Pengaturan Lokasi
            </button>
          </div>
        </div>
      )}

      {/* Info hari libur / cuti */}
      {(status.isHoliday || status.isOnLeave) && (
        <div className="mt-3 flex items-start gap-2 rounded-btn bg-slate-50 p-3 text-[13px] text-muted dark:bg-slate-800/60">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {status.isHoliday
              ? `Hari ini libur: ${status.holidayName ?? 'Hari libur'}.`
              : 'Anda sedang cuti hari ini.'}{' '}
            Kehadiran tetap bisa dicatat bila Anda masuk.
          </p>
        </div>
      )}

      {/* Record terbuka dari hari sebelumnya (shift malam) */}
      {status.openRecordDate && (
        <div className="mt-3 flex items-start gap-2 rounded-btn bg-violet-50 p-3 text-[13px] text-violet-800 dark:bg-violet-900/20 dark:text-violet-200">
          <Moon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Masih ada absensi terbuka dari tanggal {status.openRecordDate} (shift malam). Silakan check out dulu
            sebelum check in hari ini.
          </p>
        </div>
      )}

      {/* Ringkasan shift */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-btn bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Shift</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">
            {shift ? shift.name : 'Tanpa shift'}
            {shift?.isNightShift ? ' (Malam)' : ''}
          </p>
          <p className="text-[12px] text-muted">
            {shift ? `${shift.startTime.replace(':', '.')}–${shift.endTime.replace(':', '.')} WIB` : 'Kerja lepas'}
          </p>
        </div>
        <div className="rounded-btn bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Jam Masuk</p>
          <p className="mt-1 font-mono text-[14px] font-semibold text-ink">
            {rec?.checkInAt ? `${formatTimeSecondsId(rec.checkInAt)} WIB` : '—'}
          </p>
          <p className="text-[12px] text-muted">
            {rec ? `${rec.locationName ?? 'Tanpa lokasi'}${rec.isRemote ? ' (Remote)' : ''}` : status.schedule?.name ?? '—'}
          </p>
        </div>
        <div className="rounded-btn bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Jam Pulang</p>
          <p className="mt-1 font-mono text-[14px] font-semibold text-ink">
            {rec?.checkOutAt ? `${formatTimeSecondsId(rec.checkOutAt)} WIB` : '—'}
          </p>
          <p className="text-[12px] text-muted">
            {rec?.checkOutAt ? `Kerja ${formatMinutes(rec.workMinutes)}` : rec?.checkInAt ? 'Belum check out' : '—'}
          </p>
        </div>
        <div className="rounded-btn bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Status</p>
          {rec ? (
            <>
              <p className="mt-1">
                <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold', recordStatusBadge(rec.status))}>
                  {recordStatusLabel(rec.status)}
                </span>
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {rec.lateMinutes > 0
                  ? `Terlambat ${formatMinutes(rec.lateMinutes)}`
                  : rec.earlyMinutes > 0
                    ? `Pulang awal ${formatMinutes(rec.earlyMinutes)}`
                    : rec.overtimeMinutes > 0
                      ? `Lembur ${formatMinutes(rec.overtimeMinutes)}`
                      : 'Tepat waktu'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[14px] font-semibold text-ink">Belum check in</p>
          )}
        </div>
      </div>

      {/* GPS */}
      <div className="mt-4 rounded-btn border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <MapPin className="h-4 w-4 text-brand" /> Lokasi saya
          </p>
          <button
            type="button"
            onClick={requestGps}
            disabled={gps.status === 'locating'}
            className="inline-flex items-center gap-1 rounded-btn border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            {gps.status === 'locating' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {gps.status === 'locating' ? 'Mengambil…' : 'Perbarui lokasi'}
          </button>
        </div>
        {gps.status === 'locating' && <p className="mt-2 text-[12px] text-muted">Mengambil lokasi…</p>}
        {gps.status === 'ready' && gps.latitude !== null && gps.longitude !== null && (
          <p className="mt-2 text-[12px] text-muted">
            {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
            {nearest && (
              <>
                {' — '}Lokasi terdekat: <span className="font-medium text-ink">{nearest.loc.name}</span> (
                {formatDistance(nearest.distance)}
                {nearest.within ? ', di dalam area' : ', di luar area'})
              </>
            )}
            {!nearest && status.locations.length === 0 && ' — belum ada lokasi kantor.'}
          </p>
        )}
        {(gps.status === 'denied' || gps.status === 'unavailable' || gps.status === 'error') && (
          <p className="mt-2 text-[12px] text-warn">{gps.message}</p>
        )}
        {gps.status === 'idle' && <p className="mt-2 text-[12px] text-muted">Lokasi belum diambil.</p>}
      </div>

      {/* Catatan + remote + tombol */}
      {canCheckIn && (
        <div className="mt-4">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan (opsional, mis. dinas luar)"
            maxLength={500}
            className="w-full rounded-btn border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          />
          {status.setting.allowRemoteCheckIn && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={isRemote}
                onChange={(e) => setIsRemote(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Kerja remote (di luar lokasi kantor)
            </label>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void submit('in')}
              disabled={!status.canCheckIn || submitting !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-brand px-4 py-3 text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {submitting === 'in' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Check In
            </button>
            <button
              type="button"
              onClick={() => void submit('out')}
              disabled={!status.canCheckOut || submitting !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-line bg-white px-4 py-3 text-[14px] font-semibold text-ink hover:bg-slate-50 disabled:opacity-40 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              {submitting === 'out' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Check Out
            </button>
          </div>
          {!status.canCheckIn && !status.canCheckOut && rec?.checkOutAt && (
            <p className="mt-2 text-center text-[12px] text-muted">Absensi hari ini sudah lengkap. Selamat beristirahat.</p>
          )}
          {!status.canCheckIn && status.canCheckOut && (
            <p className="mt-2 text-center text-[12px] text-muted">
              Anda sudah check in{rec?.checkInAt ? ` pukul ${formatTimeSecondsId(rec.checkInAt)} WIB` : ''}. Jangan lupa check out.
            </p>
          )}
        </div>
      )}
      {!canCheckIn && (
        <p className="mt-4 rounded-btn bg-slate-50 px-3 py-2 text-center text-[12px] text-muted dark:bg-slate-800/60">
          Anda tidak memiliki izin check in.
        </p>
      )}

      {resultMsg && (
        <p className="mt-3 rounded-btn bg-slate-50 px-3 py-2 text-[13px] text-ink dark:bg-slate-800/60">{resultMsg}</p>
      )}
    </section>
  );
}
