// Pengaturan absensi (MANAGE) — 4 sub-tab: Lokasi geofence, Shift, Jadwal
// mingguan, dan Pengaturan umum. Lokasi bisa diisi dari GPS browser
// ("Gunakan lokasi saya saat ini") — user akan menambahkan lokasi kantor
// sendiri lewat tombol itu setelah live.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Settings,
  MapPin,
  Navigation,
  Clock3,
  CalendarRange,
  SlidersHorizontal,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatHHMM,
  isValidHHMM,
  DAY_NAMES,
  type AttendanceLocation,
  type Shift,
  type WorkSchedule,
  type AttendanceSettings,
  type TeamApiMember,
} from '@/lib/attendance/client';

type SubTab = 'locations' | 'shifts' | 'schedules' | 'settings';

const SUB_TABS: Array<{ key: SubTab; label: string; icon: typeof MapPin }> = [
  { key: 'locations', label: 'Lokasi', icon: MapPin },
  { key: 'shifts', label: 'Shift', icon: Clock3 },
  { key: 'schedules', label: 'Jadwal', icon: CalendarRange },
  { key: 'settings', label: 'Pengaturan', icon: SlidersHorizontal },
];

const SHIFT_COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777'];

function inputCls(): string {
  return 'mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800';
}

function labelCls(): string {
  return 'text-[12px] text-muted';
}

export function SettingsSection() {
  const [subTab, setSubTab] = useState<SubTab>('locations');

  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [members, setMembers] = useState<TeamApiMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loc, sh, sc, st] = await Promise.all([
        apiJson<{ locations: AttendanceLocation[] }>('/api/absensi/locations'),
        apiJson<{ shifts: Shift[] }>('/api/absensi/shifts'),
        apiJson<{ schedules: WorkSchedule[] }>('/api/absensi/schedules'),
        apiJson<{ settings: AttendanceSettings }>('/api/absensi/settings'),
      ]);
      setLocations(loc.locations);
      setShifts(sh.shifts);
      setSchedules(sc.schedules);
      setSettings(st.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengaturan absensi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const res = await apiJson<{ members: TeamApiMember[] }>('/api/team');
      setMembers(res.members ?? []);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    void loadMembers();
  }, [loadAll, loadMembers]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.department?.id && m.department?.name) map.set(m.department.id, m.department.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [members]);

  if (loading) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <p className="text-[13px] text-warn">{error}</p>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="mt-3 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Settings className="h-4 w-4 text-brand" /> Pengaturan Absensi
      </h2>
      <div className="mt-3 flex flex-wrap gap-1">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                subTab === t.key
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        {subTab === 'locations' && (
          <LocationsManager locations={locations} onChanged={loadAll} />
        )}
        {subTab === 'shifts' && <ShiftsManager shifts={shifts} onChanged={loadAll} />}
        {subTab === 'schedules' && (
          <SchedulesManager
            schedules={schedules}
            shifts={shifts}
            members={members}
            departments={departments}
            onChanged={loadAll}
          />
        )}
        {subTab === 'settings' && settings && (
          <GeneralSettings settings={settings} locations={locations} onChanged={loadAll} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lokasi
// ---------------------------------------------------------------------------

function LocationsManager({
  locations,
  onChanged,
}: {
  locations: AttendanceLocation[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AttendanceLocation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('100');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setName('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setRadius('100');
    setIsDefault(locations.length === 0);
    setIsActive(true);
    setShowForm(true);
  }

  function openEdit(loc: AttendanceLocation) {
    setEditing(loc);
    setName(loc.name);
    setAddress(loc.address ?? '');
    setLatitude(String(loc.latitude));
    setLongitude(String(loc.longitude));
    setRadius(String(loc.radiusMeters));
    setIsDefault(loc.isDefault);
    setIsActive(loc.isActive);
    setShowForm(true);
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Browser ini tidak mendukung GPS.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        toast.success('Koordinat lokasi Anda sudah terisi.');
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Izin lokasi ditolak — aktifkan izin lokasi browser.'
            : 'Gagal mengambil lokasi. Coba lagi.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function save() {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const rad = Number(radius);
    if (!name.trim()) {
      toast.error('Nama lokasi wajib diisi.');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      toast.error('Latitude tidak valid (-90 sampai 90).');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      toast.error('Longitude tidak valid (-180 sampai 180).');
      return;
    }
    if (!Number.isInteger(rad) || rad < 10 || rad > 5000) {
      toast.error('Radius harus 10–5000 meter.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        address: address.trim() || null,
        latitude: lat,
        longitude: lng,
        radiusMeters: rad,
        isDefault,
        isActive,
      };
      if (editing) {
        await apiJson(`/api/absensi/locations?id=${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Lokasi diperbarui.');
      } else {
        await apiJson('/api/absensi/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Lokasi ditambahkan.');
      }
      setShowForm(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan lokasi.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(loc: AttendanceLocation) {
    if (!window.confirm(`Hapus lokasi "${loc.name}"?`)) return;
    setDeletingId(loc.id);
    try {
      await apiJson(`/api/absensi/locations?id=${loc.id}`, { method: 'DELETE' });
      toast.success('Lokasi dihapus.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus lokasi.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {locations.length === 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-btn border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[13px] text-amber-800 dark:text-amber-200">
            Belum ada lokasi kantor. Tambahkan lokasi dengan tombol di bawah — atau, bila Anda sedang berada
            di kantor, pakai tombol “Gunakan lokasi saya saat ini” di form agar koordinat terisi otomatis.
            Tanpa lokasi, check in dengan geofence tidak bisa dipakai.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={openAdd}
        className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah Lokasi
      </button>

      {locations.length === 0 ? (
        <p className="mt-3 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada lokasi.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {locations.map((loc) => (
            <li key={loc.id} className="flex flex-wrap items-start justify-between gap-2 rounded-btn border border-line p-3">
              <div>
                <p className="text-[13px] font-medium text-ink">
                  {loc.name}
                  {loc.isDefault && (
                    <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">Default</span>
                  )}
                  {!loc.isActive && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-slate-800">Nonaktif</span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {loc.address ?? '—'} · {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)} · radius {loc.radiusMeters} m
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(loc)}
                  className="rounded-btn border border-line p-1.5 text-muted hover:text-ink dark:hover:bg-slate-800"
                  aria-label={`Ubah ${loc.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(loc)}
                  disabled={deletingId === loc.id}
                  className="rounded-btn border border-line p-1.5 text-muted hover:text-red-600 disabled:opacity-50 dark:hover:bg-slate-800"
                  aria-label={`Hapus ${loc.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="mt-4 rounded-btn border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">{editing ? 'Ubah Lokasi' : 'Tambah Lokasi'}</p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-btn p-1 text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Tutup form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={labelCls()}>
              Nama lokasi *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Kantor Pusat" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Alamat
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat kantor" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Latitude *
              <input value={latitude} onChange={(e) => setLatitude(e.target.value)} inputMode="decimal" placeholder="-6.200000" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Longitude *
              <input value={longitude} onChange={(e) => setLongitude(e.target.value)} inputMode="decimal" placeholder="106.800000" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Radius geofence (meter) *
              <input value={radius} onChange={(e) => setRadius(e.target.value)} inputMode="numeric" placeholder="100" className={inputCls()} />
            </label>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-brand" />
                Lokasi default
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-brand" />
                Aktif
              </label>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={gpsLoading}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
              Gunakan lokasi saya saat ini
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-btn bg-brand px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Lokasi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shift
// ---------------------------------------------------------------------------

function ShiftsManager({ shifts, onChanged }: { shifts: Shift[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Shift | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState('60');
  const [grace, setGrace] = useState('15');
  const [color, setColor] = useState(SHIFT_COLORS[0]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setName('');
    setStartTime('08:00');
    setEndTime('17:00');
    setBreakMinutes('60');
    setGrace('15');
    setColor(SHIFT_COLORS[0]);
    setIsActive(true);
    setShowForm(true);
  }

  function openEdit(s: Shift) {
    setEditing(s);
    setName(s.name);
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    setBreakMinutes(String(s.breakMinutes));
    setGrace(String(s.graceLateMinutes));
    setColor(s.color ?? SHIFT_COLORS[0]);
    setIsActive(s.isActive);
    setShowForm(true);
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Nama shift wajib diisi.');
      return;
    }
    if (!isValidHHMM(startTime) || !isValidHHMM(endTime)) {
      toast.error('Jam harus format HH:MM (00:00–23:59).');
      return;
    }
    if (startTime === endTime) {
      toast.error('Jam selesai tidak boleh sama dengan jam mulai.');
      return;
    }
    const brk = Number(breakMinutes);
    const gr = Number(grace);
    if (!Number.isInteger(brk) || brk < 0 || brk > 480) {
      toast.error('Istirahat harus 0–480 menit.');
      return;
    }
    if (!Number.isInteger(gr) || gr < 0 || gr > 120) {
      toast.error('Toleransi terlambat harus 0–120 menit.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        startTime,
        endTime,
        breakMinutes: brk,
        graceLateMinutes: gr,
        color,
        isActive,
      };
      if (editing) {
        await apiJson(`/api/absensi/shifts?id=${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Shift diperbarui.');
      } else {
        await apiJson('/api/absensi/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Shift ditambahkan.');
      }
      setShowForm(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan shift.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Shift) {
    if (!window.confirm(`Hapus shift "${s.name}"?`)) return;
    setDeletingId(s.id);
    try {
      await apiJson(`/api/absensi/shifts?id=${s.id}`, { method: 'DELETE' });
      toast.success('Shift dihapus.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus shift. Shift yang dipakai jadwal tidak bisa dihapus.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openAdd}
        className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah Shift
      </button>
      <p className="mt-2 text-[12px] text-muted">
        Bila jam selesai lebih kecil dari jam mulai, otomatis dianggap shift malam (lintas tengah malam).
      </p>
      {shifts.length === 0 ? (
        <p className="mt-3 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada shift.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shifts.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 rounded-btn border border-line p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? '#2563EB' }} />
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {s.name}
                    {s.isNightShift && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Malam</span>}
                    {!s.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-slate-800">Nonaktif</span>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {formatHHMM(s.startTime)}–{formatHHMM(s.endTime)} WIB · istirahat {s.breakMinutes} mnt · toleransi {s.graceLateMinutes} mnt
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="rounded-btn border border-line p-1.5 text-muted hover:text-ink dark:hover:bg-slate-800"
                  aria-label={`Ubah ${s.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s)}
                  disabled={deletingId === s.id}
                  className="rounded-btn border border-line p-1.5 text-muted hover:text-red-600 disabled:opacity-50 dark:hover:bg-slate-800"
                  aria-label={`Hapus ${s.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="mt-4 rounded-btn border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">{editing ? 'Ubah Shift' : 'Tambah Shift'}</p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-btn p-1 text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Tutup form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={labelCls()}>
              Nama shift *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Reguler / Malam" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Warna
              <span className="mt-1 flex items-center gap-1.5">
                {SHIFT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn('h-6 w-6 rounded-full border-2', color === c ? 'border-ink' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                    aria-label={`Warna ${c}`}
                  />
                ))}
              </span>
            </label>
            <label className={labelCls()}>
              Jam mulai *
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Jam selesai *
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Istirahat (menit)
              <input value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} inputMode="numeric" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Toleransi terlambat (menit)
              <input value={grace} onChange={(e) => setGrace(e.target.value)} inputMode="numeric" className={inputCls()} />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-brand" />
              Aktif
            </label>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-3 rounded-btn bg-brand px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Shift'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jadwal
// ---------------------------------------------------------------------------

function SchedulesManager({
  schedules,
  shifts,
  members,
  departments,
  onChanged,
}: {
  schedules: WorkSchedule[];
  shifts: Shift[];
  members: TeamApiMember[];
  departments: Array<{ id: string; name: string }>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<'org' | 'user' | 'department'>('org');
  const [userId, setUserId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<Record<string, string | null>>({
    '0': null, '1': null, '2': null, '3': null, '4': null, '5': null, '6': null,
  });
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const defaultShiftId = shifts.find((s) => s.isActive)?.id ?? '';

  function openAdd() {
    setEditing(null);
    setName('');
    setScopeType('org');
    setUserId('');
    setDepartmentId('');
    setDaysOfWeek({
      '0': null,
      '1': defaultShiftId || null,
      '2': defaultShiftId || null,
      '3': defaultShiftId || null,
      '4': defaultShiftId || null,
      '5': defaultShiftId || null,
      '6': null,
    });
    setIsDefault(schedules.length === 0);
    setIsActive(true);
    setEffectiveFrom('');
    setEffectiveTo('');
    setShowForm(true);
  }

  function openEdit(s: WorkSchedule) {
    setEditing(s);
    setName(s.name);
    setScopeType(s.userId ? 'user' : s.departmentId ? 'department' : 'org');
    setUserId(s.userId ?? '');
    setDepartmentId(s.departmentId ?? '');
    const dow: Record<string, string | null> = { '0': null, '1': null, '2': null, '3': null, '4': null, '5': null, '6': null };
    for (const k of Object.keys(dow)) dow[k] = (s.daysOfWeek as Record<string, string | null>)[k] ?? null;
    setDaysOfWeek(dow);
    setIsDefault(s.isDefault);
    setIsActive(s.isActive);
    setEffectiveFrom(s.effectiveFrom ?? '');
    setEffectiveTo(s.effectiveTo ?? '');
    setShowForm(true);
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Nama jadwal wajib diisi.');
      return;
    }
    if (scopeType === 'user' && !userId) {
      toast.error('Pilih pengguna untuk jadwal personal.');
      return;
    }
    if (scopeType === 'department' && !departmentId) {
      toast.error('Pilih departemen untuk jadwal departemen.');
      return;
    }
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      toast.error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        userId: scopeType === 'user' ? userId : null,
        departmentId: scopeType === 'department' ? departmentId : null,
        daysOfWeek,
        isDefault,
        isActive,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null,
      };
      if (editing) {
        await apiJson(`/api/absensi/schedules?id=${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Jadwal diperbarui.');
      } else {
        await apiJson('/api/absensi/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast.success('Jadwal ditambahkan.');
      }
      setShowForm(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan jadwal.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: WorkSchedule) {
    if (!window.confirm(`Hapus jadwal "${s.name}"?`)) return;
    setDeletingId(s.id);
    try {
      await apiJson(`/api/absensi/schedules?id=${s.id}`, { method: 'DELETE' });
      toast.success('Jadwal dihapus.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus jadwal.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openAdd}
        className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah Jadwal
      </button>
      {shifts.length === 0 && (
        <p className="mt-2 text-[12px] text-warn">Belum ada shift — buat shift dulu di tab Shift agar bisa dipakai di jadwal.</p>
      )}
      {schedules.length === 0 ? (
        <p className="mt-3 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada jadwal.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {schedules.map((s) => (
            <li key={s.id} className="rounded-btn border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {s.name}
                    {s.isDefault && (
                      <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">Default</span>
                    )}
                    {!s.isActive && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-slate-800">Nonaktif</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {s.userName ? `Personal: ${s.userName}` : s.departmentName ? `Departemen: ${s.departmentName}` : 'Berlaku untuk seluruh organisasi'}
                    {s.effectiveFrom || s.effectiveTo ? ` · ${s.effectiveFrom ?? '…'} s.d. ${s.effectiveTo ?? '…'}` : ''}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {DAY_NAMES.map((day, idx) => {
                      const shiftId = (s.daysOfWeek as Record<string, string | null>)[String(idx)];
                      const sh = shifts.find((x) => x.id === shiftId);
                      return (
                        <span
                          key={idx}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-medium',
                            sh ? 'bg-slate-100 text-ink dark:bg-slate-800' : 'bg-slate-50 text-muted dark:bg-slate-800/40'
                          )}
                          title={`${day}: ${sh ? `${sh.name} (${sh.startTime}–${sh.endTime})` : 'Libur'}`}
                        >
                          {day.slice(0, 3)}: {sh ? sh.name : 'Libur'}
                        </span>
                      );
                    })}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="rounded-btn border border-line p-1.5 text-muted hover:text-ink dark:hover:bg-slate-800"
                    aria-label={`Ubah ${s.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(s)}
                    disabled={deletingId === s.id}
                    className="rounded-btn border border-line p-1.5 text-muted hover:text-red-600 disabled:opacity-50 dark:hover:bg-slate-800"
                    aria-label={`Hapus ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="mt-4 rounded-btn border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">{editing ? 'Ubah Jadwal' : 'Tambah Jadwal'}</p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-btn p-1 text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Tutup form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={labelCls()}>
              Nama jadwal *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Reguler Senin–Jumat" className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Berlaku untuk
              <select value={scopeType} onChange={(e) => setScopeType(e.target.value as 'org' | 'user' | 'department')} className={inputCls()}>
                <option value="org">Seluruh organisasi</option>
                <option value="department">Satu departemen</option>
                <option value="user">Satu pengguna (personal)</option>
              </select>
            </label>
            {scopeType === 'department' && (
              <label className={labelCls()}>
                Departemen *
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputCls()}>
                  <option value="">— Pilih departemen —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {scopeType === 'user' && (
              <label className={labelCls()}>
                Pengguna *
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls()}>
                  <option value="">— Pilih pengguna —</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name ?? m.user.email ?? m.user.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={labelCls()}>
              Berlaku dari (opsional)
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputCls()} />
            </label>
            <label className={labelCls()}>
              Berlaku sampai (opsional)
              <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className={inputCls()} />
            </label>
          </div>
          <div className="mt-3">
            <p className="text-[12px] font-medium text-ink">Shift per hari</p>
            <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {DAY_NAMES.map((day, idx) => (
                <label key={idx} className={labelCls()}>
                  {day}
                  <select
                    value={daysOfWeek[String(idx)] ?? ''}
                    onChange={(e) =>
                      setDaysOfWeek((prev) => ({ ...prev, [String(idx)]: e.target.value || null }))
                    }
                    className={inputCls()}
                  >
                    <option value="">Libur</option>
                    {shifts
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime}–{s.endTime})
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-brand" />
              Jadwal default organisasi
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-brand" />
              Aktif
            </label>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-3 rounded-btn bg-brand px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Jadwal'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pengaturan umum
// ---------------------------------------------------------------------------

function GeneralSettings({
  settings,
  locations,
  onChanged,
}: {
  settings: AttendanceSettings;
  locations: AttendanceLocation[];
  onChanged: () => void;
}) {
  const [requireGeofence, setRequireGeofence] = useState(settings.requireGeofence);
  const [allowRemote, setAllowRemote] = useState(settings.allowRemoteCheckIn);
  const [defaultLocationId, setDefaultLocationId] = useState(settings.defaultLocationId ?? '');
  const [grace, setGrace] = useState(String(settings.graceLateMinutes));
  const [workDays, setWorkDays] = useState<number[]>(settings.workDays ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  function toggleWorkDay(d: number) {
    setWorkDays((prev) => {
      if (prev.includes(d)) {
        const next = prev.filter((x) => x !== d);
        return next.length === 0 ? prev : next;
      }
      return [...prev, d].sort((a, b) => a - b);
    });
  }

  async function save() {
    const g = Number(grace);
    if (!Number.isInteger(g) || g < 0 || g > 120) {
      toast.error('Toleransi terlambat harus 0–120 menit.');
      return;
    }
    if (workDays.length === 0) {
      toast.error('Pilih minimal satu hari kerja.');
      return;
    }
    setSaving(true);
    try {
      await apiJson('/api/absensi/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireGeofence,
          allowRemoteCheckIn: allowRemote,
          defaultLocationId: defaultLocationId || null,
          graceLateMinutes: g,
          workDays,
        }),
      });
      toast.success('Pengaturan absensi disimpan.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={requireGeofence}
          onChange={(e) => setRequireGeofence(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <span className="font-medium">Geofence wajib</span>
          <span className="block text-[12px] text-muted">
            Check in/out hanya bisa dilakukan di dalam radius lokasi kantor.
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={allowRemote}
          onChange={(e) => setAllowRemote(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <span className="font-medium">Izinkan check in remote</span>
          <span className="block text-[12px] text-muted">
            Karyawan boleh menandai “Kerja remote” dan check in di luar lokasi kantor.
          </span>
        </span>
      </label>
      <label className={labelCls()}>
        Lokasi default
        <select value={defaultLocationId} onChange={(e) => setDefaultLocationId(e.target.value)} className={inputCls()}>
          <option value="">— Tidak ada —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls()}>
        Toleransi terlambat (menit)
        <input value={grace} onChange={(e) => setGrace(e.target.value)} inputMode="numeric" className={inputCls()} />
      </label>
      <div>
        <p className="text-[12px] text-muted">Hari kerja</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DAY_NAMES.map((day, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => toggleWorkDay(idx)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                workDays.includes(idx)
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-btn bg-brand px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
      </button>
    </div>
  );
}
