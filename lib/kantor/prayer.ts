/**
 * WOORK VIRTUAL OFFICE — Prayer Time Engine (Musala).
 *
 * Jadwal salat perusahaan: AlAdhan API method 20 (Kemenag RI) dengan
 * fallback rumus astronomis Kemenag (lib/islami/prayerTimeService.ts).
 * Jadwal harian di-cache ke tabel DailyPrayerSchedule (TANPA adjustment —
 * adjustmentMinutes diterapkan saat dibaca, jadi mengubah koreksi waktu
 * langsung menggeser jadwal tanpa perlu invalidasi cache).
 *
 * Zona waktu: server berjalan di UTC, jadi "hari ini" SELALU dihitung
 * dalam timezone perusahaan (settings.timezone, default Asia/Jakarta).
 * Semua waktu salat disimpan sebagai string "HH:MM" waktu lokal
 * perusahaan; konversi ke instants UTC dilakukan lewat
 * combineJakartaDateTime() (tanggal lokal + jam + offset zona).
 */
import { prisma } from '@/lib/db';
import {
  calculateKemenagAstronomicalTimes,
  getOfficialPrayerSchedule,
  type DailyPrayerSchedule as IslamiDailySchedule,
} from '@/lib/islami/prayerTimeService';

export type PrayerName = 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';

export const PRAYER_NAMES: PrayerName[] = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

export const PRAYER_LABELS: Record<PrayerName, string> = {
  subuh: 'Subuh',
  dzuhur: 'Zuhur',
  ashar: 'Asar',
  maghrib: 'Magrib',
  isya: 'Isya',
};

/** Kolom DailyPrayerSchedule untuk tiap waktu salat. */
const PRAYER_FIELD: Record<PrayerName, 'fajrTime' | 'dhuhrTime' | 'asrTime' | 'maghribTime' | 'ishaTime'> = {
  subuh: 'fajrTime',
  dzuhur: 'dhuhrTime',
  ashar: 'asrTime',
  maghrib: 'maghribTime',
  isya: 'ishaTime',
};

export interface PrayerScheduleDay {
  date: string; // "YYYY-MM-DD" (tanggal lokal perusahaan)
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  imsak: string | null;
  sunrise: string | null;
  source: 'kemenag_api' | 'kemenag_astronomical';
  cityName: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  /** Koreksi waktu (menit) yang diterapkan pada semua waktu di atas. */
  adjustmentMinutes: number;
}

export interface NextPrayer {
  prayerName: PrayerName;
  prayerLabel: string;
  /** "HH:MM" waktu lokal perusahaan. */
  time: string;
  /** Tanggal lokal perusahaan ("YYYY-MM-DD") dari waktu salat itu. */
  date: string;
  minutesUntil: number;
  countdownText: string;
  scheduledAt: string; // ISO UTC
}

// ---------------------------------------------------------------------------
// Zona waktu perusahaan
// ---------------------------------------------------------------------------

/** Offset jam untuk timezone perusahaan (WIB/WITA/WIT + alias umum). */
export function tzOffsetHours(timezone: string): number {
  const tz = (timezone || '').trim();
  if (tz === 'Asia/Makassar' || tz === 'WITA' || tz === 'Asia/Ujung_Pandang') return 8;
  if (tz === 'Asia/Jayapura' || tz === 'WIT') return 9;
  if (tz === 'Asia/Jakarta' || tz === 'WIB' || tz === 'Asia/Pontianak') return 7;
  // Fallback: zona Indonesia timur berdasarkan nama.
  if (/makassar|bali|denpasar|samarinda|balikpapan|manado|kupang|mataram/i.test(tz)) return 8;
  if (/jayapura|ambon|sorong|merauke|timika/i.test(tz)) return 9;
  return 7;
}

/** Bagian tanggal/jam dalam zona perusahaan (offset tetap, tanpa DST). */
export function partsInZone(now: Date, offsetHours: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const shifted = new Date(now.getTime() + offsetHours * 3600 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** "YYYY-MM-DD" — tanggal lokal perusahaan untuk `now`. */
export function dateKeyInZone(now: Date, offsetHours: number): string {
  const p = partsInZone(now, offsetHours);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Tengah malam UTC untuk tanggal lokal "YYYY-MM-DD" (dipakai @db.Date). */
export function dateKeyToMidnightUTC(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Instants UTC dari "HH:MM" pada tanggal lokal perusahaan.
 * Contoh: combine("2026-11-21", "11:48", 7) = 2026-11-21T04:48:00Z.
 */
export function combineDateTime(dateKey: string, hhmm: string, offsetHours: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - offsetHours, mi));
}

/** Geser "HH:MM" sebanyak `minutes` (bisa negatif); hasil "HH:MM". */
export function shiftTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "1 jam 23 mnt" / "45 mnt" / "30 dtk" dari selisih menit. */
export function countdownText(minutesUntil: number): string {
  const totalSec = Math.max(0, Math.round(minutesUntil * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} jam ${m} mnt`;
  if (m > 0) return `${m} mnt ${s} dtk`;
  return `${s} dtk`;
}

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

export type PrayerSettingsRow = NonNullable<
  Awaited<ReturnType<typeof prisma.prayerTimeSettings.findUnique>>
>;

/** Baca pengaturan salat org; buat default Jakarta bila belum ada. */
export async function getPrayerSettings(organizationId: string): Promise<PrayerSettingsRow> {
  const existing = await prisma.prayerTimeSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return prisma.prayerTimeSettings.create({
    data: {
      organizationId,
      isEnabled: true,
      latitude: -6.2088,
      longitude: 106.8456,
      cityName: 'DKI Jakarta',
      timezone: 'Asia/Jakarta',
      calculationMethod: 'kemenag',
      asrMethod: 'shafii',
      adjustmentMinutes: 0,
      sessionDurationMinutes: 10,
      enableAnimation: true,
      autoReturn: true,
      excludedAgentIds: [],
    },
  });
}

// ---------------------------------------------------------------------------
// Jadwal harian (cache DailyPrayerSchedule)
// ---------------------------------------------------------------------------

function timingOf(sched: IslamiDailySchedule, id: string): string | null {
  return sched.timings.find((t) => t.id === id)?.time ?? null;
}

/**
 * Jadwal salat untuk tanggal lokal perusahaan `dateKey` (default: hari ini).
 * Baca cache DailyPrayerSchedule dulu; bila belum ada, hitung lewat
 * AlAdhan (method 20 Kemenag) dengan fallback rumus astronomis Kemenag,
 * lalu simpan ke cache. adjustmentMinutes diterapkan saat dibaca.
 */
export async function getTodaySchedule(
  organizationId: string,
  dateKey?: string,
  now: Date = new Date()
): Promise<PrayerScheduleDay> {
  const settings = await getPrayerSettings(organizationId);
  const offset = tzOffsetHours(settings.timezone);
  const key = dateKey ?? dateKeyInZone(now, offset);
  const prayerDate = dateKeyToMidnightUTC(key);

  const cached = await prisma.dailyPrayerSchedule.findUnique({
    where: { organizationId_prayerDate: { organizationId, prayerDate } },
  });

  let raw: {
    fajr: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    imsak: string | null;
    sunrise: string | null;
    source: 'kemenag_api' | 'kemenag_astronomical';
  };

  if (cached) {
    raw = {
      fajr: cached.fajrTime,
      dhuhr: cached.dhuhrTime,
      asr: cached.asrTime,
      maghrib: cached.maghribTime,
      isha: cached.ishaTime,
      imsak: cached.imsakTime,
      sunrise: cached.sunriseTime,
      source: cached.source === 'kemenag_api' ? 'kemenag_api' : 'kemenag_astronomical',
    };
  } else {
    // Tanggal untuk service: tengah hari UTC tanggal lokal itu, supaya
    // getter lokal service (server UTC) menghasilkan tanggal yang sama.
    const [y, m, d] = key.split('-').map(Number);
    const serviceDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const location = {
      useGps: false,
      cityId: undefined,
      customCityName: settings.cityName ?? undefined,
      lat: settings.latitude,
      lng: settings.longitude,
    };

    let sched: IslamiDailySchedule;
    if (settings.calculationMethod === 'astronomical') {
      // Langsung rumus lokal (tanpa jaringan) — berguna saat AlAdhan down.
      const t = calculateKemenagAstronomicalTimes(
        serviceDate,
        settings.latitude,
        settings.longitude,
        offset,
        settings.asrMethod === 'hanafi' ? 2 : 1
      );
      sched = {
        dateStr: key,
        hijriDate: '',
        cityName: settings.cityName ?? 'Jakarta',
        latitude: settings.latitude,
        longitude: settings.longitude,
        source: 'kemenag_astronomical',
        timings: [
          { id: 'imsak', name: 'Imsak', time: t.imsak, formattedTime: t.imsak, description: '', isPrayerFardhu: false },
          { id: 'subuh', name: 'Subuh', time: t.subuh, formattedTime: t.subuh, description: '', isPrayerFardhu: true },
          { id: 'terbit', name: 'Terbit', time: t.terbit, formattedTime: t.terbit, description: '', isPrayerFardhu: false },
          { id: 'dhuha', name: 'Dhuha', time: t.dhuha, formattedTime: t.dhuha, description: '', isPrayerFardhu: false },
          { id: 'dzuhur', name: 'Zuhur', time: t.dzuhur, formattedTime: t.dzuhur, description: '', isPrayerFardhu: true },
          { id: 'ashar', name: 'Asar', time: t.ashar, formattedTime: t.ashar, description: '', isPrayerFardhu: true },
          { id: 'maghrib', name: 'Magrib', time: t.maghrib, formattedTime: t.maghrib, description: '', isPrayerFardhu: true },
          { id: 'isya', name: 'Isya', time: t.isya, formattedTime: t.isya, description: '', isPrayerFardhu: true },
        ],
        nextPrayer: {
          item: { id: 'subuh', name: 'Subuh', time: t.subuh, formattedTime: t.subuh, description: '', isPrayerFardhu: true },
          minutesRemaining: 0,
          hoursRemaining: 0,
          timeRemainingFormatted: '',
          isPreAlarm: false,
        },
      };
    } else {
      sched = await getOfficialPrayerSchedule(location, serviceDate, {
        asrMethod: settings.asrMethod === 'hanafi' ? 'hanafi' : 'shafii',
        timezoneOffsetHours: offset,
      });
    }

    const fajr = timingOf(sched, 'subuh');
    const dhuhr = timingOf(sched, 'dzuhur');
    const asr = timingOf(sched, 'ashar');
    const maghrib = timingOf(sched, 'maghrib');
    const isha = timingOf(sched, 'isya');
    if (!fajr || !dhuhr || !asr || !maghrib || !isha) {
      throw new Error('Jadwal salat tidak lengkap dari sumber (AlAdhan/astronomis).');
    }
    raw = {
      fajr,
      dhuhr,
      asr,
      maghrib,
      isha,
      imsak: timingOf(sched, 'imsak'),
      sunrise: timingOf(sched, 'terbit'),
      source: sched.source,
    };

    await prisma.dailyPrayerSchedule.upsert({
      where: { organizationId_prayerDate: { organizationId, prayerDate } },
      create: {
        organizationId,
        prayerDate,
        fajrTime: raw.fajr,
        dhuhrTime: raw.dhuhr,
        asrTime: raw.asr,
        maghribTime: raw.maghrib,
        ishaTime: raw.isha,
        imsakTime: raw.imsak,
        sunriseTime: raw.sunrise,
        source: raw.source,
        cityName: settings.cityName,
        latitude: settings.latitude,
        longitude: settings.longitude,
      },
      update: {
        fajrTime: raw.fajr,
        dhuhrTime: raw.dhuhr,
        asrTime: raw.asr,
        maghribTime: raw.maghrib,
        ishaTime: raw.isha,
        imsakTime: raw.imsak,
        sunriseTime: raw.sunrise,
        source: raw.source,
        cityName: settings.cityName,
        latitude: settings.latitude,
        longitude: settings.longitude,
      },
    });
  }

  const adj = settings.adjustmentMinutes;
  return {
    date: key,
    fajr: shiftTime(raw.fajr, adj),
    dhuhr: shiftTime(raw.dhuhr, adj),
    asr: shiftTime(raw.asr, adj),
    maghrib: shiftTime(raw.maghrib, adj),
    isha: shiftTime(raw.isha, adj),
    imsak: raw.imsak ? shiftTime(raw.imsak, adj) : null,
    sunrise: raw.sunrise ? shiftTime(raw.sunrise, adj) : null,
    source: raw.source,
    cityName: settings.cityName,
    latitude: settings.latitude,
    longitude: settings.longitude,
    timezone: settings.timezone,
    adjustmentMinutes: adj,
  };
}

/** Waktu "HH:MM" tiap salat dari jadwal hari itu. */
function timesOf(day: PrayerScheduleDay): Record<PrayerName, string> {
  return { subuh: day.fajr, dzuhur: day.dhuhr, ashar: day.asr, maghrib: day.maghrib, isya: day.isha };
}

// ---------------------------------------------------------------------------
// Waktu salat berikutnya + jendela sesi
// ---------------------------------------------------------------------------

/**
 * Waktu salat berikutnya dari `now` (bila semua hari ini sudah lewat,
 * pakai Subuh besok). Kembalikan null hanya bila jadwal gagal dihitung.
 */
export async function getNextPrayer(
  organizationId: string,
  now: Date = new Date()
): Promise<NextPrayer | null> {
  const settings = await getPrayerSettings(organizationId);
  const offset = tzOffsetHours(settings.timezone);
  const todayKey = dateKeyInZone(now, offset);
  const today = await getTodaySchedule(organizationId, todayKey, now);
  const nowMin = partsInZone(now, offset).hour * 60 + partsInZone(now, offset).minute;

  for (const name of PRAYER_NAMES) {
    const [h, m] = timesOf(today)[name].split(':').map(Number);
    const tMin = h * 60 + m;
    if (tMin > nowMin) {
      const scheduledAt = combineDateTime(todayKey, timesOf(today)[name], offset);
      const minutesUntil = Math.max(0, (scheduledAt.getTime() - now.getTime()) / 60000);
      return {
        prayerName: name,
        prayerLabel: PRAYER_LABELS[name],
        time: timesOf(today)[name],
        date: todayKey,
        minutesUntil,
        countdownText: countdownText(minutesUntil),
        scheduledAt: scheduledAt.toISOString(),
      };
    }
  }

  // Semua sudah lewat — Subuh besok.
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const tomorrowKey = dateKeyInZone(new Date(Date.UTC(ty, tm - 1, td + 1, 12)), offset);
  const tomorrowDay = await getTodaySchedule(organizationId, tomorrowKey, now);
  const scheduledAt = combineDateTime(tomorrowKey, tomorrowDay.fajr, offset);
  const minutesUntil = Math.max(0, (scheduledAt.getTime() - now.getTime()) / 60000);
  return {
    prayerName: 'subuh',
    prayerLabel: PRAYER_LABELS.subuh,
    time: tomorrowDay.fajr,
    date: tomorrowKey,
    minutesUntil,
    countdownText: countdownText(minutesUntil),
    scheduledAt: scheduledAt.toISOString(),
  };
}

/**
 * Apakah `now` berada dalam jendela sesi salat (waktu salat s.d.
 * waktu salat + durasi sesi)? Dipakai scheduler + API preview.
 */
export async function isPrayerTimeNow(
  organizationId: string,
  now: Date = new Date()
): Promise<{ inWindow: boolean; prayerName: PrayerName | null; endsAt: Date | null }> {
  const settings = await getPrayerSettings(organizationId);
  const offset = tzOffsetHours(settings.timezone);
  const todayKey = dateKeyInZone(now, offset);
  const today = await getTodaySchedule(organizationId, todayKey, now);
  const durationMs = settings.sessionDurationMinutes * 60 * 1000;
  for (const name of PRAYER_NAMES) {
    const start = combineDateTime(todayKey, timesOf(today)[name], offset);
    const end = new Date(start.getTime() + durationMs);
    if (now >= start && now < end) return { inWindow: true, prayerName: name, endsAt: end };
  }
  return { inWindow: false, prayerName: null, endsAt: null };
}

// ---------------------------------------------------------------------------
// Arah kiblat
// ---------------------------------------------------------------------------

/**
 * Arah kiblat (derajat dari utara, 0-360) dari koordinat perusahaan
 * menuju Ka'bah (21.4225, 39.8262), rumus great-circle standar.
 * Jakarta ≈ 295°.
 */
export function qiblaBearing(latitude: number, longitude: number): number {
  const kaabaLat = (21.4225 * Math.PI) / 180;
  const kaabaLng = (39.8262 * Math.PI) / 180;
  const latR = (latitude * Math.PI) / 180;
  const lngR = (longitude * Math.PI) / 180;
  const dLng = kaabaLng - lngR;
  const y = Math.sin(dLng);
  const x = Math.cos(latR) * Math.tan(kaabaLat) - Math.sin(latR) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return ((bearing % 360) + 360) % 360;
}
