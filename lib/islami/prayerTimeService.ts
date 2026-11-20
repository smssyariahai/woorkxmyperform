/**
 * Service for fetching and calculating official prayer times based on 
 * Kementerian Agama Republik Indonesia (Kemenag RI) standards & device GPS coordinates.
 */

export interface PrayerTimeItem {
  id: 'imsak' | 'subuh' | 'terbit' | 'dhuha' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';
  name: string;
  time: string; // "HH:mm" format
  formattedTime: string;
  description: string;
  isPrayerFardhu: boolean;
}

export interface DailyPrayerSchedule {
  dateStr: string;
  hijriDate: string;
  cityName: string;
  latitude: number;
  longitude: number;
  source: 'kemenag_api' | 'kemenag_astronomical';
  timings: PrayerTimeItem[];
  nextPrayer: {
    item: PrayerTimeItem;
    minutesRemaining: number;
    hoursRemaining: number;
    timeRemainingFormatted: string;
    isPreAlarm: boolean;
  };
}

export interface CityOption {
  id: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
}

export const INDONESIAN_CITIES: CityOption[] = [
  { id: 'jakarta', name: 'DKI Jakarta & Sekitarnya', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 },
  { id: 'bandung', name: 'Kota Bandung', province: 'Jawa Barat', lat: -6.9175, lng: 107.6191 },
  { id: 'surabaya', name: 'Kota Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521 },
  { id: 'semarang', name: 'Kota Semarang', province: 'Jawa Tengah', lat: -6.9667, lng: 110.4167 },
  { id: 'yogyakarta', name: 'Kota Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695 },
  { id: 'medan', name: 'Kota Medan', province: 'Sumatera Utara', lat: 3.5952, lng: 98.6722 },
  { id: 'palembang', name: 'Kota Palembang', province: 'Sumatera Selatan', lat: -2.9761, lng: 104.7754 },
  { id: 'padang', name: 'Kota Padang', province: 'Sumatera Barat', lat: -0.9471, lng: 100.4172 },
  { id: 'pekanbaru', name: 'Kota Pekanbaru', province: 'Riau', lat: 0.5071, lng: 101.4478 },
  { id: 'bandar_lampung', name: 'Kota Bandar Lampung', province: 'Lampung', lat: -5.4500, lng: 105.2667 },
  { id: 'makassar', name: 'Kota Makassar', province: 'Sulawesi Selatan', lat: -5.1477, lng: 119.4327 },
  { id: 'manado', name: 'Kota Manado', province: 'Sulawesi Utara', lat: 1.4748, lng: 124.8421 },
  { id: 'banjarmasin', name: 'Kota Banjarmasin', province: 'Kalimantan Selatan', lat: -3.3167, lng: 114.5900 },
  { id: 'balikpapan', name: 'Kota Balikpapan', province: 'Kalimantan Timur', lat: -1.2379, lng: 116.8529 },
  { id: 'samarinda', name: 'Kota Samarinda', province: 'Kalimantan Timur', lat: -0.5022, lng: 117.1536 },
  { id: 'pontianak', name: 'Kota Pontianak', province: 'Kalimantan Barat', lat: -0.0263, lng: 109.3425 },
  { id: 'denpasar', name: 'Kota Denpasar', province: 'Bali', lat: -8.6705, lng: 115.2126 },
  { id: 'mataram', name: 'Kota Mataram / Lombok', province: 'Nusa Tenggara Barat', lat: -8.5833, lng: 116.1167 },
  { id: 'kupang', name: 'Kota Kupang', province: 'Nusa Tenggara Timur', lat: -10.1772, lng: 123.6070 },
  { id: 'ambon', name: 'Kota Ambon', province: 'Maluku', lat: -3.6547, lng: 128.1906 },
  { id: 'jayapura', name: 'Kota Jayapura', province: 'Papua', lat: -2.5337, lng: 140.7181 },
  { id: 'banda_aceh', name: 'Kota Banda Aceh', province: 'Aceh', lat: 5.5483, lng: 95.3238 },
  { id: 'serang', name: 'Kota Serang / Cilegon', province: 'Banten', lat: -6.1104, lng: 106.1640 },
  { id: 'bogor', name: 'Kota & Kab. Bogor', province: 'Jawa Barat', lat: -6.5950, lng: 106.8166 },
  { id: 'tangerang', name: 'Kota Tangerang & Tangsel', province: 'Banten', lat: -6.1783, lng: 106.6319 },
  { id: 'bekasi', name: 'Kota & Kab. Bekasi', province: 'Jawa Barat', lat: -6.2383, lng: 106.9756 },
  { id: 'cirebon', name: 'Kota Cirebon', province: 'Jawa Barat', lat: -6.7320, lng: 108.5523 },
  { id: 'malang', name: 'Kota Malang', province: 'Jawa Timur', lat: -7.9666, lng: 112.6326 },
  { id: 'solo', name: 'Kota Surakarta (Solo)', province: 'Jawa Tengah', lat: -7.5755, lng: 110.8243 },
];

const LOCATION_STORAGE_KEY = 'myperform_prayer_user_location_v1';

export interface UserSavedLocation {
  useGps: boolean;
  cityId?: string;
  customCityName?: string;
  lat: number;
  lng: number;
}

export function getSavedLocation(): UserSavedLocation {
  try {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to parse saved location', e);
  }
  // Default to Jakarta
  return {
    useGps: true,
    cityId: 'jakarta',
    customCityName: 'DKI Jakarta & Sekitarnya (Standar WIB)',
    lat: -6.2088,
    lng: 106.8456
  };
}

export function saveUserLocation(location: UserSavedLocation): void {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    window.dispatchEvent(new CustomEvent('prayer_location_changed', { detail: location }));
  } catch (e) {
    console.warn('Failed to save location', e);
  }
}

/**
 * Astronomical Calculation following Kemenag RI Ephemeris Formula
 * - Subuh: -20°
 * - Isya: -18°
 * - Imsak: Subuh - 10 Menit
 * - Ihtiyath (faktor kehati-hatian): +2 Menit (Kemenag standard)
 */
export function calculateKemenagAstronomicalTimes(
  date: Date,
  lat: number,
  lng: number,
  timezoneOffsetHours?: number
): {
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
} {
  const tz = timezoneOffsetHours ?? (lng > 120 ? 9 : lng > 105 ? 8 : 7); // Default auto WIB / WITA / WIT
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  
  // Solar Declination & Equation of Time
  const B = (2 * Math.PI * (dayOfYear - 81)) / 365;
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // Equation of Time in minutes
  const declination = 23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365) * (Math.PI / 180); // in radians
  const latRad = lat * (Math.PI / 180);

  // Solar Transit / Solar Noon in UTC hours
  const solarNoonUTC = 12 + (tz * 60 - lng * 4 - EoT) / 60;

  // Helper for Hour Angle
  const calculateHourAngle = (altitudeDeg: number) => {
    const altRad = altitudeDeg * (Math.PI / 180);
    const cosHA = (Math.sin(altRad) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    if (cosHA > 1 || cosHA < -1) return null;
    return Math.acos(cosHA) * (180 / Math.PI) / 15; // in hours
  };

  // Kemenag Angle Parameters
  const subuhHA = calculateHourAngle(-20) || 6.2;
  const sunriseHA = calculateHourAngle(-0.833) || 6.0;
  const isyaHA = calculateHourAngle(-18) || 6.1;

  // Ashar calculation (Shafi'i shadow length = 1)
  const shadowLength = 1;
  const asharAltRad = Math.atan(1 / (shadowLength + Math.tan(Math.abs(latRad - declination))));
  const asharHA = (Math.acos((Math.sin(asharAltRad) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination))) * (180 / Math.PI)) / 15;

  // Compute times with Kemenag +2 mins Ihtiyath
  const toTimeString = (decimalHours: number, addMinutes = 2): string => {
    const totalMinutes = Math.round(decimalHours * 60 + addMinutes);
    const h = Math.floor(((totalMinutes % 1440) + 1440) % 1440 / 60);
    const m = Math.floor(((totalMinutes % 1440) + 1440) % 1440 % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const dzuhurDec = solarNoonUTC;
  const subuhDec = solarNoonUTC - subuhHA;
  const terbitDec = solarNoonUTC - sunriseHA;
  const dhuhaDec = terbitDec + 0.45; // ~25-30 mins after sunrise
  const asharDec = solarNoonUTC + (asharHA || 3.1);
  const maghribDec = solarNoonUTC + sunriseHA;
  const isyaDec = solarNoonUTC + isyaHA;

  const subuhStr = toTimeString(subuhDec, 2);
  const [sH, sM] = subuhStr.split(':').map(Number);
  const subuhTotalMin = sH * 60 + sM;
  const imsakTotalMin = subuhTotalMin - 10; // Imsak 10 mins before Subuh
  const imsakH = Math.floor(imsakTotalMin / 60);
  const imsakM = imsakTotalMin % 60;
  const imsakStr = `${String(imsakH).padStart(2, '0')}:${String(imsakM).padStart(2, '0')}`;

  return {
    imsak: imsakStr,
    subuh: subuhStr,
    terbit: toTimeString(terbitDec, -2), // Sunrise without extra ihtiyath
    dhuha: toTimeString(dhuhaDec, 2),
    dzuhur: toTimeString(dzuhurDec, 2),
    ashar: toTimeString(asharDec, 2),
    maghrib: toTimeString(maghribDec, 2),
    isya: toTimeString(isyaDec, 2),
  };
}

/**
 * Fetch official Kemenag RI schedule using online API (with reliable fallback)
 */
export async function getOfficialPrayerSchedule(
  location: UserSavedLocation,
  date = new Date()
): Promise<DailyPrayerSchedule> {
  const dateFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let rawTimes: { [key: string]: string } | null = null;
  let source: 'kemenag_api' | 'kemenag_astronomical' = 'kemenag_astronomical';
  let hijriString = 'Kalender Hijriah Kemenag RI';

  try {
    // Method 20 = Kemenag RI (Kementerian Agama RI) on AlAdhan Official Engine
    const res = await fetch(
      `https://api.aladhan.com/v1/timings/${Math.floor(date.getTime() / 1000)}?latitude=${location.lat}&longitude=${location.lng}&method=20`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.timings) {
        const t = data.data.timings;
        rawTimes = {
          imsak: t.Imsak ? t.Imsak.slice(0, 5) : '',
          subuh: t.Fajr ? t.Fajr.slice(0, 5) : '',
          terbit: t.Sunrise ? t.Sunrise.slice(0, 5) : '',
          dhuha: '', // dihitung dari Sunrise + 27 mnt di bawah (AlAdhan tak punya Dhuha)
          dzuhur: t.Dhuhr ? t.Dhuhr.slice(0, 5) : '',
          ashar: t.Asr ? t.Asr.slice(0, 5) : '',
          maghrib: t.Maghrib ? t.Maghrib.slice(0, 5) : '',
          isya: t.Isha ? t.Isha.slice(0, 5) : '',
        };
        source = 'kemenag_api';

        // Dhuha tidak disediakan AlAdhan: pakai Terbit + 27 menit (seperti fallback astronomis).
        if (rawTimes.terbit) {
          const [th, tm] = rawTimes.terbit.split(':').map(Number);
          const tot = th * 60 + tm + 27;
          rawTimes.dhuha = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
        }

        if (data.data.date?.hijri) {
          const h = data.data.date.hijri;
          hijriString = `${h.day} ${h.month.en} ${h.year} H`;
        }
      }
    }
  } catch (err) {
    console.warn('Online Kemenag API failed, switching to Kemenag Ephemeris Algorithm:', err);
  }

  // Fallback to high-precision Kemenag astronomical formula
  if (!rawTimes || !rawTimes.subuh) {
    rawTimes = calculateKemenagAstronomicalTimes(date, location.lat, location.lng);
    source = 'kemenag_astronomical';
  }

  // Build the list of prayer time items
  const timings: PrayerTimeItem[] = [
    {
      id: 'imsak',
      name: 'Imsak',
      time: rawTimes.imsak || '04:28',
      formattedTime: `${rawTimes.imsak || '04:28'} WIB`,
      description: 'Batas akhir santap sahur (10 menit menjelang adzan Subuh)',
      isPrayerFardhu: false,
    },
    {
      id: 'subuh',
      name: 'Subuh',
      time: rawTimes.subuh || '04:38',
      formattedTime: `${rawTimes.subuh || '04:38'} WIB`,
      description: 'Waktu shalat fardhu Subuh (Fajar Shadiq)',
      isPrayerFardhu: true,
    },
    {
      id: 'terbit',
      name: 'Terbit (Syuruq)',
      time: rawTimes.terbit || '05:50',
      formattedTime: `${rawTimes.terbit || '05:50'} WIB`,
      description: 'Matahari mulai terbit, batas akhir shalat Subuh',
      isPrayerFardhu: false,
    },
    {
      id: 'dhuha',
      name: 'Dhuha',
      time: rawTimes.dhuha || '06:15',
      formattedTime: `${rawTimes.dhuha || '06:15'} WIB`,
      description: 'Awal waktu shalat sunnah Dhuha (matahari setinggi tombak)',
      isPrayerFardhu: false,
    },
    {
      id: 'dzuhur',
      name: 'Dzuhur',
      time: rawTimes.dzuhur || '11:58',
      formattedTime: `${rawTimes.dzuhur || '11:58'} WIB`,
      description: 'Matahari tergelincir dari zenit ke arah barat',
      isPrayerFardhu: true,
    },
    {
      id: 'ashar',
      name: 'Ashar',
      time: rawTimes.ashar || '15:15',
      formattedTime: `${rawTimes.ashar || '15:15'} WIB`,
      description: 'Panjang bayangan benda sama dengan tinggi aslinya',
      isPrayerFardhu: true,
    },
    {
      id: 'maghrib',
      name: 'Maghrib',
      time: rawTimes.maghrib || '18:01',
      formattedTime: `${rawTimes.maghrib || '18:01'} WIB`,
      description: 'Matahari terbenam sempurna & waktu berbuka puasa',
      isPrayerFardhu: true,
    },
    {
      id: 'isya',
      name: 'Isya',
      time: rawTimes.isya || '19:10',
      formattedTime: `${rawTimes.isya || '19:10'} WIB`,
      description: 'Hilangnya mega merah di ufuk barat',
      isPrayerFardhu: true,
    },
  ];

  // Adjust time format suffix based on longitude (WIB / WITA / WIT)
  const tzSuffix = location.lng > 120 ? 'WIT' : location.lng > 105 ? 'WITA' : 'WIB';
  timings.forEach(t => {
    t.formattedTime = `${t.time} ${tzSuffix}`;
  });

  // Calculate next prayer countdown
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Find next upcoming item (from Subuh to Isya + Imsak)
  const fardhuAndImsakList = timings.filter(t => t.id !== 'terbit' && t.id !== 'dhuha');
  let nextPrayerItem = fardhuAndImsakList[0]; // default Imsak / Subuh
  let minDiff = 24 * 60;

  for (const item of fardhuAndImsakList) {
    const [h, m] = item.time.split(':').map(Number);
    const pMinutes = h * 60 + m;
    let diff = pMinutes - currentMinutes;
    if (diff < 0) diff += 24 * 60; // next day
    if (diff < minDiff && diff > 0) {
      minDiff = diff;
      nextPrayerItem = item;
    }
  }

  // If exact matching or passed all today, next is tomorrow's first item
  if (minDiff === 24 * 60) {
    nextPrayerItem = fardhuAndImsakList[0];
    const [h, m] = nextPrayerItem.time.split(':').map(Number);
    minDiff = (h * 60 + m) + (24 * 60 - currentMinutes);
  }

  const hoursRemaining = Math.floor(minDiff / 60);
  const minutesRemaining = minDiff % 60;
  const timeRemainingFormatted = hoursRemaining > 0 
    ? `${hoursRemaining}j ${minutesRemaining}m` 
    : `${minutesRemaining}m`;

  return {
    dateStr: dateFormatted,
    hijriDate: hijriString,
    cityName: location.customCityName || location.cityId || 'Indonesia',
    latitude: location.lat,
    longitude: location.lng,
    source,
    timings,
    nextPrayer: {
      item: nextPrayerItem,
      minutesRemaining: minDiff,
      hoursRemaining,
      timeRemainingFormatted,
      isPreAlarm: minDiff <= 10,
    }
  };
}

/**
 * Request device GPS coordinates and reverse find city name
 */
export async function requestDeviceGPS(): Promise<UserSavedLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung oleh browser Anda'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let detectedCity = 'Lokasi GPS Perangkat';

        // Find closest known city from database
        let minDistance = Infinity;
        let closestCity = INDONESIAN_CITIES[0];

        for (const c of INDONESIAN_CITIES) {
          const d = Math.hypot(c.lat - lat, c.lng - lng);
          if (d < minDistance) {
            minDistance = d;
            closestCity = c;
          }
        }

        if (minDistance < 0.4) {
          detectedCity = `${closestCity.name} (GPS)`;
        } else {
          detectedCity = `GPS (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
        }

        const newLoc: UserSavedLocation = {
          useGps: true,
          cityId: closestCity.id,
          customCityName: detectedCity,
          lat,
          lng
        };

        saveUserLocation(newLoc);
        resolve(newLoc);
      },
      (err) => {
        reject(err);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}
