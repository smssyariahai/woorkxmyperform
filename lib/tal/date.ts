// lib/tal/date.ts — porting src/utils/talDateUtils.ts backup (MyPerform) ke WOORK.
// Logika tanggal TAL: minggu Minggu–Sabtu, Week 1 = minggu berisi 1 Januari,
// hari kerja WIB (lewati Minggu, libur, cuti), skor laporan, deadline kunci/
// lapor, kunci bulanan otomatis. Satu-satunya perubahan: impor tipe dari ./types.
/**
 * TAL (To Achieve List) Date Utilities
 * Follows Indonesia standard:
 * - Start of week: Minggu (Sunday)
 * - End of week: Sabtu (Saturday)
 * - Week numbering: Week 1 of Year Y is the week containing January 1st of Year Y (Sunday on or before Jan 1st).
 * - Week-to-Month: Allocated by week position and majority days in month.
 */

import { TalTaskType, TalTaskItem, TalMonthLockRecord } from './types';

export const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const INDONESIAN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

export const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const INDONESIAN_DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * Format Date to YYYY-MM-DD
 */
export function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD to Date object at local midnight
 */
export function parseDateKey(str: string): Date {
  const parts = str.split('-');
  if (parts.length !== 3) return new Date();
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Get Sunday (start of week) for a given date
 */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
  d.setDate(d.getDate() - dayOfWeek);
  return d;
}

/**
 * Get Saturday (end of week) for a given date
 */
export function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Get Wednesday (4th / middle day) of the Sunday-Saturday week.
 */
export function getWednesdayOfWeek(date: Date): Date {
  const sunday = getStartOfWeek(date);
  const wed = new Date(sunday);
  wed.setDate(sunday.getDate() + 3);
  return wed;
}

/**
 * Get the Sunday of Week 1 for a given year.
 * Week 1 is the Sunday-to-Saturday week that contains January 1st of that year.
 */
export function getWeek1Sunday(year: number): Date {
  const jan1 = new Date(year, 0, 1, 0, 0, 0, 0);
  return getStartOfWeek(jan1);
}

/**
 * Calculate the Week Number and Week Year:
 * - Week 1 of Year Y contains January 1st of Year Y.
 * - Any week spanning across Dec/Jan with Saturday >= Jan 1 belongs to the new Year's Week 1.
 */
export function getWeekNumberAndYear(date: Date): { weekNumber: number; weekYear: number; majorityMonth: number } {
  const sunday = getStartOfWeek(date);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  let weekYear: number;
  let weekNumber: number;

  if (saturday.getFullYear() > sunday.getFullYear()) {
    // Week spans year boundary (contains Jan 1 of next year) -> Week 1 of next year
    weekYear = saturday.getFullYear();
    weekNumber = 1;
  } else {
    weekYear = sunday.getFullYear();
    const week1Sunday = getWeek1Sunday(weekYear);
    const diffMs = sunday.getTime() - week1Sunday.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    weekNumber = Math.floor(diffDays / 7) + 1;
  }

  // Determine majority month
  let majorityMonth: number;
  if (weekNumber === 1) {
    majorityMonth = 1; // Always January for Week 1
  } else {
    const wed = new Date(sunday);
    wed.setDate(sunday.getDate() + 3);
    if (wed.getFullYear() > weekYear) {
      majorityMonth = 12;
    } else if (wed.getFullYear() < weekYear) {
      majorityMonth = 1;
    } else {
      majorityMonth = wed.getMonth() + 1;
    }
  }

  return { weekNumber, weekYear, majorityMonth };
}

export interface DayInfo {
  dateStr: string; // YYYY-MM-DD
  dateObj: Date;
  dayIndex: number; // 0=Sunday, 1=Monday...
  dayName: string; // "Min", "Sen", ...
  fullDayName: string; // "Minggu", "Senin", ...
  dayNumber: number; // 1 - 31
  isSunday: boolean;
  isToday: boolean;
  month: number;
  year: number;
}

export interface WeekDetails {
  weekNumber: number;
  weekYear: number;
  majorityMonth: number;
  majorityYear: number;
  startDateStr: string; // Sunday
  endDateStr: string; // Saturday
  days: DayInfo[];
  label: string; // "Sep 2026 - Week 37"
  shortLabel: string; // "Week 37"
}

/**
 * Get complete details for the week of a specific date
 */
export function getWeekDetails(dateInput: Date | string): WeekDetails {
  const date = typeof dateInput === 'string' ? parseDateKey(dateInput) : new Date(dateInput);
  const sunday = getStartOfWeek(date);
  const { weekNumber, weekYear, majorityMonth } = getWeekNumberAndYear(date);
  
  const todayStr = formatDateKey(new Date());
  
  const days: DayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dateStr = formatDateKey(d);
    
    days.push({
      dateStr,
      dateObj: d,
      dayIndex: i,
      dayName: INDONESIAN_DAYS_SHORT[i],
      fullDayName: INDONESIAN_DAYS[i],
      dayNumber: d.getDate(),
      isSunday: i === 0,
      isToday: dateStr === todayStr,
      month: d.getMonth() + 1,
      year: d.getFullYear()
    });
  }
  
  const monthShort = INDONESIAN_MONTHS_SHORT[majorityMonth - 1];
  const label = `${monthShort} ${weekYear} - Week ${weekNumber}`;
  const shortLabel = `Week ${weekNumber}`;
  
  return {
    weekNumber,
    weekYear,
    majorityMonth,
    majorityYear: weekYear,
    startDateStr: days[0].dateStr,
    endDateStr: days[6].dateStr,
    days,
    label,
    shortLabel
  };
}

export const getISOWeekDetails = getWeekDetails;

/**
 * Get total number of weeks in a year
 */
export function getTotalWeeksInYear(year: number): number {
  const week1ThisYear = getWeek1Sunday(year);
  const week1NextYear = getWeek1Sunday(year + 1);
  const diffDays = Math.round((week1NextYear.getTime() - week1ThisYear.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

/**
 * Get list of all weeks that belong to a specific month
 */
export function getWeeksInMonth(year: number, month: number): WeekDetails[] {
  const totalWeeks = getTotalWeeksInYear(year);
  const weeks: WeekDetails[] = [];

  for (let wNum = 1; wNum <= totalWeeks; wNum++) {
    const sunday = getSundayFromWeekNumber(year, wNum);
    const details = getWeekDetails(sunday);
    let m = details.majorityMonth;
    if (wNum === 1) m = 1;
    if (m === month) {
      weeks.push(details);
    }
  }

  return weeks;
}

/**
 * Group all weeks of a year by 12 months for matrix/table view
 */
export interface MonthWeeksGrouping {
  monthNumber: number; // 1 - 12
  monthName: string; // "Januari"
  monthShort: string; // "Jan"
  weeks: WeekDetails[];
}

export function getYearlyMonthWeeksGrouping(year: number): MonthWeeksGrouping[] {
  const totalWeeks = getTotalWeeksInYear(year);
  const groupings: MonthWeeksGrouping[] = INDONESIAN_MONTHS.map((name, idx) => ({
    monthNumber: idx + 1,
    monthName: name,
    monthShort: INDONESIAN_MONTHS_SHORT[idx],
    weeks: []
  }));

  for (let wNum = 1; wNum <= totalWeeks; wNum++) {
    const sunday = getSundayFromWeekNumber(year, wNum);
    const details = getWeekDetails(sunday);
    let m = details.majorityMonth;
    if (wNum === 1) m = 1;
    if (m < 1) m = 1;
    if (m > 12) m = 12;
    groupings[m - 1].weeks.push(details);
  }

  return groupings;
}

/**
 * Get Sunday date from week number and year
 */
export function getSundayFromWeekNumber(year: number, weekNumber: number): Date {
  const week1Sunday = getWeek1Sunday(year);
  const targetSunday = new Date(week1Sunday);
  targetSunday.setDate(week1Sunday.getDate() + (weekNumber - 1) * 7);
  return targetSunday;
}

/**
 * Get the 7 days of the week (Sunday - Saturday) for a given date
 */
export function getDaysOfWeek(dateInput: Date | string): DayInfo[] {
  return getWeekDetails(dateInput).days;
}

/**
 * Format a timestamp into Indonesian date-time format (e.g., "07 Sep 2026, 16:00:23 WIB")
 */
export function formatFullTimestamp(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    
    const day = d.getDate();
    const month = INDONESIAN_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    
    return `${day} ${month} ${year}, ${hours}:${mins}:${secs} WIB`;
  } catch {
    return isoString;
  }
}

/**
 * Format IDR currency
 */
export function formatCurrencyIDR(amount?: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format a timestamp into "DD/MM/YY HH:MM" format (e.g., "08/09/26 14:30")
 */
export function formatLockDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return '';
  }
}

export interface TalScoreDetail {
  scorePercent: number;
  totalMain: number;
  totalAdditional: number;
  mainDone: number;
  mainPending: number;
  additionalDone: number;
  additionalPending: number;
  totalDone: number;
  totalPending: number;
  totalTasks: number;
  formulaText: string;
  formulaCalculation: string;
}

/**
 * Calculates score for TAL report:
 * Daily: =(Task Utama Done + Task Tambahan Done) / Total Task Utama
 * Weekly & Monthly: =(Task Utama Done) / Total Task Utama
 */
export function calculateTalReportScore(type: TalTaskType, tasks: TalTaskItem[]): TalScoreDetail {
  const mainTasks = tasks.filter(t => !t.isAdditional);
  const additionalTasks = tasks.filter(t => !!t.isAdditional);
  const mainDone = mainTasks.filter(t => t.status === 'done').length;
  const mainPending = mainTasks.filter(t => t.status !== 'done').length;
  const additionalDone = additionalTasks.filter(t => t.status === 'done').length;
  const additionalPending = additionalTasks.filter(t => t.status !== 'done').length;
  const totalMain = mainTasks.length;
  const totalAdditional = additionalTasks.length;
  const totalDone = tasks.filter(t => t.status === 'done').length;
  const totalPending = tasks.filter(t => t.status !== 'done').length;
  const totalTasks = tasks.length;

  let scorePercent = 0;
  let formulaText = '';
  let formulaCalculation = '';

  if (type === 'daily') {
    if (totalMain > 0) {
      const rawPercent = Math.round(((mainDone + additionalDone) / totalMain) * 100);
      scorePercent = Math.min(100, Math.max(0, rawPercent));
      formulaText = '=(Task Utama Done + Task Tambahan Done) / Total Task Utama (Maks. 100%)';
      formulaCalculation = rawPercent > 100
        ? `= (${mainDone} + ${additionalDone}) / ${totalMain} = ${rawPercent}% → 100% (Maks. 100%)`
        : `= (${mainDone} + ${additionalDone}) / ${totalMain} = ${scorePercent}%`;
    } else if (totalTasks > 0) {
      const rawPercent = Math.round((totalDone / totalTasks) * 100);
      scorePercent = Math.min(100, Math.max(0, rawPercent));
      formulaText = '=Total Task Done / Total Task (Maks. 100%)';
      formulaCalculation = rawPercent > 100
        ? `= ${totalDone} / ${totalTasks} = ${rawPercent}% → 100%`
        : `= ${totalDone} / ${totalTasks} = ${scorePercent}%`;
    } else {
      scorePercent = 0;
      formulaText = 'Tidak ada tugas utama';
      formulaCalculation = '0%';
    }
  } else {
    // Weekly & Monthly: no additional tasks
    const effectiveTotalMain = totalMain > 0 ? totalMain : totalTasks;
    const effectiveDone = totalMain > 0 ? mainDone : totalDone;
    if (effectiveTotalMain > 0) {
      const rawPercent = Math.round((effectiveDone / effectiveTotalMain) * 100);
      scorePercent = Math.min(100, Math.max(0, rawPercent));
      formulaText = '=Task Utama Done / Total Task Utama (Maks. 100%)';
      formulaCalculation = rawPercent > 100
        ? `= ${effectiveDone} / ${effectiveTotalMain} = ${rawPercent}% → 100%`
        : `= ${effectiveDone} / ${effectiveTotalMain} = ${scorePercent}%`;
    } else {
      scorePercent = 0;
      formulaText = 'Tidak ada tugas';
      formulaCalculation = '0%';
    }
  }

  return {
    scorePercent,
    totalMain,
    totalAdditional,
    mainDone,
    mainPending,
    additionalDone,
    additionalPending,
    totalDone,
    totalPending,
    totalTasks,
    formulaText,
    formulaCalculation
  };
}

/**
 * Default Indonesian Public Holidays (2025 - 2027)
 */
export const DEFAULT_INDONESIAN_HOLIDAYS = [
  // 2025
  { id: 'hol_2025_01_01', date: '2025-01-01', title: 'Tahun Baru 2025 Masehi', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2025_01_27', date: '2025-01-27', title: "Isra Mi'raj Nabi Muhammad SAW", category: 'nasional' as const },
  { id: 'hol_2025_01_29', date: '2025-01-29', title: 'Tahun Baru Imlek 2576 Kongzili', category: 'nasional' as const },
  { id: 'hol_2025_03_29', date: '2025-03-29', title: 'Hari Suci Nyepi (Tahun Baru Saka 1947)', category: 'nasional' as const },
  { id: 'hol_2025_03_31', date: '2025-03-31', title: 'Hari Raya Idul Fitri 1446 H (Hari ke-1)', category: 'nasional' as const },
  { id: 'hol_2025_04_01', date: '2025-04-01', title: 'Hari Raya Idul Fitri 1446 H (Hari ke-2)', category: 'nasional' as const },
  { id: 'hol_2025_04_18', date: '2025-04-18', title: 'Wafat Yesus Kristus', category: 'nasional' as const },
  { id: 'hol_2025_05_01', date: '2025-05-01', title: 'Hari Buruh Internasional', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2025_05_12', date: '2025-05-12', title: 'Hari Raya Waisak 2569 BE', category: 'nasional' as const },
  { id: 'hol_2025_05_29', date: '2025-05-29', title: 'Kenaikan Yesus Kristus', category: 'nasional' as const },
  { id: 'hol_2025_06_01', date: '2025-06-01', title: 'Hari Lahir Pancasila', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2025_06_07', date: '2025-06-07', title: 'Hari Raya Idul Adha 1446 H', category: 'nasional' as const },
  { id: 'hol_2025_06_27', date: '2025-06-27', title: '1 Muharram / Tahun Baru Islam 1447 H', category: 'nasional' as const },
  { id: 'hol_2025_08_17', date: '2025-08-17', title: 'Hari Kemerdekaan Republik Indonesia', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2025_09_05', date: '2025-09-05', title: 'Maulid Nabi Muhammad SAW', category: 'nasional' as const },
  { id: 'hol_2025_12_25', date: '2025-12-25', title: 'Hari Raya Natal', category: 'nasional' as const, isRecurringYearly: true },

  // 2026
  { id: 'hol_2026_01_01', date: '2026-01-01', title: 'Tahun Baru 2026 Masehi', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2026_01_16', date: '2026-01-16', title: "Isra Mi'raj Nabi Muhammad SAW", category: 'nasional' as const },
  { id: 'hol_2026_02_17', date: '2026-02-17', title: 'Tahun Baru Imlek 2577 Kongzili', category: 'nasional' as const },
  { id: 'hol_2026_03_19', date: '2026-03-19', title: 'Hari Suci Nyepi (Tahun Baru Saka 1948)', category: 'nasional' as const },
  { id: 'hol_2026_03_20', date: '2026-03-20', title: 'Hari Raya Idul Fitri 1447 H (Hari ke-1)', category: 'nasional' as const },
  { id: 'hol_2026_03_21', date: '2026-03-21', title: 'Hari Raya Idul Fitri 1447 H (Hari ke-2)', category: 'nasional' as const },
  { id: 'hol_2026_04_03', date: '2026-04-03', title: 'Wafat Yesus Kristus', category: 'nasional' as const },
  { id: 'hol_2026_05_01', date: '2026-05-01', title: 'Hari Buruh Internasional', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2026_05_14', date: '2026-05-14', title: 'Kenaikan Yesus Kristus', category: 'nasional' as const },
  { id: 'hol_2026_05_27', date: '2026-05-27', title: 'Hari Raya Idul Adha 1447 H', category: 'nasional' as const },
  { id: 'hol_2026_05_31', date: '2026-05-31', title: 'Hari Raya Waisak 2570 BE', category: 'nasional' as const },
  { id: 'hol_2026_06_01', date: '2026-06-01', title: 'Hari Lahir Pancasila', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2026_06_16', date: '2026-06-16', title: 'Tahun Baru Islam 1448 H', category: 'nasional' as const },
  { id: 'hol_2026_08_17', date: '2026-08-17', title: 'Hari Kemerdekaan Republik Indonesia', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2026_08_25', date: '2026-08-25', title: 'Maulid Nabi Muhammad SAW', category: 'nasional' as const },
  { id: 'hol_2026_12_25', date: '2026-12-25', title: 'Hari Raya Natal', category: 'nasional' as const, isRecurringYearly: true },

  // 2027
  { id: 'hol_2027_01_01', date: '2027-01-01', title: 'Tahun Baru 2027 Masehi', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2027_02_06', date: '2027-02-06', title: 'Tahun Baru Imlek 2578 Kongzili', category: 'nasional' as const },
  { id: 'hol_2027_03_10', date: '2027-03-10', title: 'Hari Raya Idul Fitri 1448 H', category: 'nasional' as const },
  { id: 'hol_2027_05_01', date: '2027-05-01', title: 'Hari Buruh Internasional', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2027_06_01', date: '2027-06-01', title: 'Hari Lahir Pancasila', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2027_08_17', date: '2027-08-17', title: 'Hari Kemerdekaan Republik Indonesia', category: 'nasional' as const, isRecurringYearly: true },
  { id: 'hol_2027_12_25', date: '2027-12-25', title: 'Hari Raya Natal', category: 'nasional' as const, isRecurringYearly: true },
];

/**
 * Check if a date is a public holiday
 */
export function checkIsHoliday(
  dateStr: string,
  holidays?: Array<{ id?: string; date: string; title: string; isRecurringYearly?: boolean; [key: string]: any }>
): { isHoliday: boolean; holidayTitle?: string; holidayItem?: any } {
  const [y, m, d] = dateStr.split('-');
  const mmdd = `${m}-${d}`;

  // 1. If holidays array was provided (even if empty, as loaded by caller), use it as authoritative source
  if (holidays !== undefined) {
    const found = holidays.find(h => {
      if (h.date === dateStr) return true;
      if (h.isRecurringYearly && h.date.endsWith(`-${mmdd}`)) return true;
      return false;
    });

    if (found) {
      return { isHoliday: true, holidayTitle: found.title, holidayItem: found };
    }

    return { isHoliday: false };
  }

  // 2. Only if holidays argument was omitted / undefined, fall back to default Indonesian holidays
  const defaultFound = DEFAULT_INDONESIAN_HOLIDAYS.find(h => {
    if (h.date === dateStr) return true;
    if (h.isRecurringYearly && h.date.endsWith(`-${mmdd}`)) return true;
    return false;
  });

  if (defaultFound) {
    return { isHoliday: true, holidayTitle: defaultFound.title, holidayItem: defaultFound };
  }

  return { isHoliday: false };
}

export type TalCutiInput = Array<string | { date: string; isCuti?: boolean; reason?: string }> | Set<string> | Record<string, any>;

/**
 * Normalize date string to YYYY-MM-DD
 */
function normalizeDateStr(dateInput: string | Date): string {
  if (dateInput instanceof Date) return formatDateKey(dateInput);
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (trimmed.includes('T')) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return formatDateKey(d);
    }
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const y = match[1];
      const m = String(match[2]).padStart(2, '0');
      const d = String(match[3]).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return trimmed;
  }
  return '';
}

/**
 * Check if a date string is in the cuti dates list/set
 */
export function isCutiDay(
  dateStr: string,
  cutiDates: TalCutiInput = []
): { isCuti: boolean; reason?: string } {
  if (!cutiDates) return { isCuti: false };

  const targetDateKey = normalizeDateStr(dateStr);
  if (!targetDateKey) return { isCuti: false };

  if (cutiDates instanceof Set) {
    if (cutiDates.has(targetDateKey) || cutiDates.has(dateStr)) {
      return { isCuti: true, reason: 'Cuti Terencana' };
    }
    // Also check normalized elements inside the set if needed
    for (const item of cutiDates) {
      if (normalizeDateStr(item) === targetDateKey) {
        return { isCuti: true, reason: 'Cuti Terencana' };
      }
    }
    return { isCuti: false };
  }

  if (Array.isArray(cutiDates)) {
    const found = cutiDates.find(c => {
      if (!c) return false;
      if (typeof c === 'string') {
        return normalizeDateStr(c) === targetDateKey || c === targetDateKey || c === dateStr;
      }
      if (typeof c === 'object' && c.date) {
        const itemKey = normalizeDateStr(c.date);
        return (itemKey === targetDateKey || c.date === targetDateKey) && c.isCuti !== false;
      }
      return false;
    });
    if (found) {
      return { 
        isCuti: true, 
        reason: typeof found === 'object' && found.reason ? found.reason : 'Cuti Terencana' 
      };
    }
  }

  if (typeof cutiDates === 'object' && cutiDates !== null) {
    const val = (cutiDates as any)[targetDateKey] || (cutiDates as any)[dateStr];
    if (val && val.isCuti !== false) {
      return {
        isCuti: true,
        reason: typeof val === 'object' && val.reason ? val.reason : 'Cuti Terencana'
      };
    }
  }

  return { isCuti: false };
}

/**
 * Check if a date is a working day (Hari Kerja)
 * Rule: Not a Sunday (day 0), Not a Public Holiday / Tanggal Merah, and Not a Cuti (planned leave)
 */
export function isWorkingDay(
  dateInput: string | Date,
  holidays: Array<{ date: string; title: string; isRecurringYearly?: boolean }> = [],
  cutiDates: TalCutiInput = []
): boolean {
  const d = typeof dateInput === 'string' ? parseDateKey(dateInput) : new Date(dateInput);
  const dateStr = formatDateKey(d);

  // Sunday check (0 is Sunday in JS Date)
  if (d.getDay() === 0) {
    return false;
  }

  // Holiday check
  const holidayResult = checkIsHoliday(dateStr, holidays);
  if (holidayResult.isHoliday) {
    return false;
  }

  // Cuti check
  const cutiResult = isCutiDay(dateStr, cutiDates);
  if (cutiResult.isCuti) {
    return false;
  }

  return true;
}

/**
 * Calculate H+X working days from a starting date
 * Excludes Sundays, Tanggal Merah (Holidays), and Cuti (Planned Leave)
 */
export function addWorkingDays(
  startDateInput: string | Date,
  workingDaysToAdd: number,
  holidays: Array<{ date: string; title: string; isRecurringYearly?: boolean }> = [],
  cutiDates: TalCutiInput = []
): { deadlineDate: Date; deadlineDateStr: string; skippedHolidays: string[]; skippedCuti: string[] } {
  const current = typeof startDateInput === 'string' ? parseDateKey(startDateInput) : new Date(startDateInput);
  current.setHours(0, 0, 0, 0);

  let added = 0;
  const skippedHolidays: string[] = [];
  const skippedCuti: string[] = [];

  while (added < workingDaysToAdd) {
    current.setDate(current.getDate() + 1);
    const dateStr = formatDateKey(current);

    if (current.getDay() === 0) {
      // Sunday - skip
      continue;
    }

    const holidayCheck = checkIsHoliday(dateStr, holidays);
    if (holidayCheck.isHoliday) {
      skippedHolidays.push(`${dateStr} (${holidayCheck.holidayTitle})`);
      continue;
    }

    const cutiCheck = isCutiDay(dateStr, cutiDates);
    if (cutiCheck.isCuti) {
      skippedCuti.push(`${dateStr} (${cutiCheck.reason || 'Cuti'})`);
      continue;
    }

    added++;
  }

  return {
    deadlineDate: current,
    deadlineDateStr: formatDateKey(current),
    skippedHolidays,
    skippedCuti
  };
}

/**
 * Check if the task's assignees are only the current user (diri sendiri).
 * Returns true if the task is only assigned to self (or has no specific external assignee),
 * meaning the assignee badge/section should be HIDDEN.
 * Returns false if the task is assigned to other people or multiple people including others.
 */
export function isOnlySelfAssigned(
  task: TalTaskItem,
  currentUserId?: string,
  currentUserEmail?: string,
  currentUserName?: string
): boolean {
  const currentEmailLower = (currentUserEmail || '').toLowerCase().trim();
  const currentNameLower = (currentUserName || '').toLowerCase().trim();
  const currentUid = (currentUserId || '').trim();
  const creatorUid = (task.userId || '').trim();
  const creatorEmailLower = (task.userEmail || '').toLowerCase().trim();
  const creatorNameLower = (task.userName || '').toLowerCase().trim();

  const isUserSelf = (email?: string, name?: string, id?: string) => {
    const e = (email || '').toLowerCase().trim();
    const n = (name || '').toLowerCase().trim();
    const i = (id || '').trim();

    // Check generic Indonesian / English self keywords
    if (
      n === 'diri sendiri' || 
      n === 'saya' || 
      n === 'me' || 
      n === 'self' || 
      n === 'myself' ||
      n === 'pribadi'
    ) {
      return true;
    }

    // Check match email
    if (e && currentEmailLower && e === currentEmailLower) return true;
    if (e && creatorEmailLower && e === creatorEmailLower) return true;

    // Check match user ID
    if (i && currentUid && i === currentUid) return true;
    if (i && creatorUid && i === creatorUid) return true;

    // Check match nama
    if (n && currentNameLower && (n === currentNameLower || currentNameLower.includes(n) || n.includes(currentNameLower))) return true;
    if (n && creatorNameLower && (n === creatorNameLower || creatorNameLower.includes(n) || n.includes(creatorNameLower))) return true;

    return false;
  };

  // 1. Check assignedUsers list
  if (task.assignedUsers && task.assignedUsers.length > 0) {
    const nonSelfUsers = task.assignedUsers.filter(
      u => !isUserSelf(u.email, u.name || u.username, u.id)
    );
    return nonSelfUsers.length === 0;
  }

  // 2. Check assignedTo strings list
  if (task.assignedTo && task.assignedTo.length > 0) {
    const nonSelfNames = task.assignedTo.filter(
      (name, idx) => {
        const email = task.assignedUserEmails?.[idx];
        return !isUserSelf(email, name);
      }
    );
    return nonSelfNames.length === 0;
  }

  // 3. If empty, default is self
  return true;
}

/**
 * Format TalScope / Period label into unified, elegant Indonesian text
 * Standardizes:
 * - "daily_2026-09-10" or "2026-09-10" or "9 September 2026"
 *   -> "10 September 2026" / "9 September 2026" (always "DD MMMM YYYY")
 * - "weekly_2026_W37" or "2026-W37"
 *   -> "Week 37, Tahun 2026"
 * - "monthly_2026_M09" or "monthly_2026_M9" or "2026-09"
 *   -> "September 2026"
 */
export function formatTalScopePeriod(
  scope: 'daily' | 'weekly' | 'monthly' | string,
  scopeKey?: string,
  infoTglTask?: string,
  extra?: { weekNumber?: number; weekYear?: number; month?: number; year?: number }
): string {
  const raw = (scopeKey || '').trim();
  const info = (infoTglTask || '').trim();

  if (scope === 'daily') {
    // 1. If raw has daily_YYYY-MM-DD or YYYY-MM-DD
    const matchYMD = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (matchYMD) {
      const year = parseInt(matchYMD[1], 10);
      const monthIdx = parseInt(matchYMD[2], 10) - 1;
      const day = parseInt(matchYMD[3], 10);
      const monthName = INDONESIAN_MONTHS[monthIdx] || matchYMD[2];
      return `${day} ${monthName} ${year}`;
    }

    // 2. If info has YYYY-MM-DD
    const matchInfoYMD = info.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (matchInfoYMD) {
      const year = parseInt(matchInfoYMD[1], 10);
      const monthIdx = parseInt(matchInfoYMD[2], 10) - 1;
      const day = parseInt(matchInfoYMD[3], 10);
      const monthName = INDONESIAN_MONTHS[monthIdx] || matchInfoYMD[2];
      return `${day} ${monthName} ${year}`;
    }

    // 3. If info is already clean text without daily_ prefix
    if (info && !info.startsWith('daily_')) {
      return info;
    }

    return raw || '-';
  }

  if (scope === 'weekly') {
    if (extra?.weekNumber && extra?.weekYear) {
      return `Week ${extra.weekNumber}, Tahun ${extra.weekYear}`;
    }

    const matchWeek = raw.match(/(\d{4})[_-]W?(\d{1,2})/i);
    if (matchWeek) {
      const year = matchWeek[1];
      const weekNum = parseInt(matchWeek[2], 10);
      return `Week ${weekNum}, Tahun ${year}`;
    }

    if (info && !info.startsWith('weekly_')) {
      return info;
    }

    return raw || '-';
  }

  if (scope === 'monthly') {
    if (extra?.month && extra?.year) {
      const mName = INDONESIAN_MONTHS[extra.month - 1] || `Bulan ${extra.month}`;
      return `${mName} ${extra.year}`;
    }

    const matchMonth = raw.match(/(\d{4})[_-]M?(\d{1,2})/i);
    if (matchMonth) {
      const year = matchMonth[1];
      const monthIdx = parseInt(matchMonth[2], 10) - 1;
      const mName = INDONESIAN_MONTHS[monthIdx] || matchMonth[2];
      return `${mName} ${year}`;
    }

    if (info && !info.startsWith('monthly_')) {
      return info;
    }

    return raw || '-';
  }

  return info || raw || '-';
}

/**
 * Interface for deadline settings needed by deadline calculations
 */
export interface TalDeadlineSettingsInput {
  planLockWeeklyDays: number;
  planLockWeeklyTime?: string;
  planLockMonthlyDays: number;
  planLockMonthlyTime?: string;
  reportDailyDays: number;
  reportDailyTime?: string;
  reportWeeklyDays: number;
  reportWeeklyTime?: string;
  reportMonthlyDays: number;
  reportMonthlyTime?: string;
  systemLockMonthlyDays?: number;
  systemLockMonthlyTime?: string;
  systemLockEnabled?: boolean;
}

/**
 * Calculate the Plan Deadline Date object for a given scope
 * (excludes Sundays, Holidays, and Cuti)
 */
export function calculatePlanDeadline(
  scope: TalTaskType,
  params: {
    weekYear?: number;
    weekNumber?: number;
    month?: number;
    year?: number;
    dateStr?: string;
  },
  settings: TalDeadlineSettingsInput,
  holidays: Array<{ date: string; title: string; isRecurringYearly?: boolean }> = [],
  cutiDates: TalCutiInput = []
): Date | null {
  if (scope === 'weekly') {
    const year = params.weekYear || new Date().getFullYear();
    const weekNum = params.weekNumber || 1;
    // Sunday (start of week)
    const sunday = getSundayFromWeekNumber(year, weekNum);
    const daysToAdd = settings.planLockWeeklyDays || 2;
    const { deadlineDate } = addWorkingDays(sunday, daysToAdd, holidays, cutiDates);
    
    // Set time
    const timeStr = settings.planLockWeeklyTime || '23:59';
    const [h, m] = timeStr.split(':').map(Number);
    deadlineDate.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
    return deadlineDate;
  }

  if (scope === 'monthly') {
    const year = params.year || new Date().getFullYear();
    const month = params.month || (new Date().getMonth() + 1);
    // 1st of the month
    const firstDay = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const daysToAdd = settings.planLockMonthlyDays || 3;
    const { deadlineDate } = addWorkingDays(firstDay, daysToAdd, holidays, cutiDates);
    
    // Set time
    const timeStr = settings.planLockMonthlyTime || '23:59';
    const [h, m] = timeStr.split(':').map(Number);
    deadlineDate.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
    return deadlineDate;
  }

  return null;
}

/**
 * Calculate the Report Deadline Date object for a given scope
 * (excludes Sundays, Holidays, and Cuti)
 */
export function calculateReportDeadline(
  scope: TalTaskType,
  params: {
    dateStr?: string;
    weekYear?: number;
    weekNumber?: number;
    month?: number;
    year?: number;
  },
  settings: TalDeadlineSettingsInput,
  holidays: Array<{ date: string; title: string; isRecurringYearly?: boolean }> = [],
  cutiDates: TalCutiInput = []
): Date | null {
  if (scope === 'daily') {
    if (!params.dateStr) return null;
    const taskDate = parseDateKey(params.dateStr);
    const daysToAdd = settings.reportDailyDays || 1;
    const { deadlineDate } = addWorkingDays(taskDate, daysToAdd, holidays, cutiDates);
    
    const timeStr = settings.reportDailyTime || '23:59';
    const [h, m] = timeStr.split(':').map(Number);
    deadlineDate.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
    return deadlineDate;
  }

  if (scope === 'weekly') {
    const year = params.weekYear || new Date().getFullYear();
    const weekNum = params.weekNumber || 1;
    const sunday = getSundayFromWeekNumber(year, weekNum);
    // Saturday (end of week)
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    
    const daysToAdd = settings.reportWeeklyDays || 2;
    const { deadlineDate } = addWorkingDays(saturday, daysToAdd, holidays, cutiDates);
    
    const timeStr = settings.reportWeeklyTime || '23:59';
    const [h, m] = timeStr.split(':').map(Number);
    deadlineDate.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
    return deadlineDate;
  }

  if (scope === 'monthly') {
    const year = params.year || new Date().getFullYear();
    const month = params.month || (new Date().getMonth() + 1);
    // Last day of month
    const lastDay = new Date(year, month, 0, 0, 0, 0, 0);
    const daysToAdd = settings.reportMonthlyDays || 3;
    const { deadlineDate } = addWorkingDays(lastDay, daysToAdd, holidays, cutiDates);
    
    const timeStr = settings.reportMonthlyTime || '23:59';
    const [h, m] = timeStr.split(':').map(Number);
    deadlineDate.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
    return deadlineDate;
  }

  return null;
}

/**
 * Determine Plan Score (100 if on-time, 50 if late)
 */
export function determinePlanScore(
  lockedAtDate: Date | string,
  deadlineDate: Date | string | null
): number {
  if (!deadlineDate) return 100;
  const lockedTime = typeof lockedAtDate === 'string' ? new Date(lockedAtDate).getTime() : lockedAtDate.getTime();
  const deadlineTime = typeof deadlineDate === 'string' ? new Date(deadlineDate).getTime() : deadlineDate.getTime();
  return lockedTime <= deadlineTime ? 100 : 50;
}

/**
 * Determine Report Score (100 if on-time, 50 if late or if weekly plan score is 50 for daily reports)
 */
export function determineReportScore(
  reportedAtDate: Date | string,
  deadlineDate: Date | string | null,
  options?: {
    scope?: TalTaskType;
    weeklyPlanScore?: number;
  }
): number {
  // Aturan: Jika Nilai Perencanaan (Planing) Week bersangkutan = 50,
  // maka Semua Nilai Report harian di Week bersangkutan = 50.
  if (options?.scope === 'daily' && options?.weeklyPlanScore === 50) {
    return 50;
  }

  if (!deadlineDate) return 100;
  const reportedTime = typeof reportedAtDate === 'string' ? new Date(reportedAtDate).getTime() : reportedAtDate.getTime();
  const deadlineTime = typeof deadlineDate === 'string' ? new Date(deadlineDate).getTime() : deadlineDate.getTime();
  return reportedTime <= deadlineTime ? 100 : 50;
}

/**
 * Determine if current time (Today) has passed 16:00 WIB of the task's cutoff date:
 * - Daily: Today > Task Date at 16:00 WIB
 * - Weekly: Today > Saturday (last day of the week) at 16:00 WIB
 * - Monthly: Today > Last day of the month at 16:00 WIB
 */
export function isReportingPeriodStarted(
  scope: TalTaskType,
  params: {
    dateStr?: string;
    weekYear?: number;
    weekNumber?: number;
    month?: number;
    year?: number;
  },
  now: Date = new Date()
): boolean {
  if (scope === 'daily') {
    if (!params.dateStr) return false;
    const taskDate = parseDateKey(params.dateStr);
    taskDate.setHours(16, 0, 0, 0);
    return now.getTime() >= taskDate.getTime();
  }

  if (scope === 'weekly') {
    const year = params.weekYear || now.getFullYear();
    const weekNum = params.weekNumber || 1;
    const sunday = getSundayFromWeekNumber(year, weekNum);
    // Saturday = Sunday + 6 days
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(16, 0, 0, 0);
    return now.getTime() >= saturday.getTime();
  }

  if (scope === 'monthly') {
    const year = params.year || now.getFullYear();
    const month = params.month || (now.getMonth() + 1);
    // Last day of month
    const lastDay = new Date(year, month, 0, 16, 0, 0, 0);
    return now.getTime() >= lastDay.getTime();
  }

  return false;
}

/**
 * Format YYYY-MM-DD to Indonesian human readable date (e.g. 19 September 2026)
 */
export function formatIndonesianDate(dateStr: string): string {
  const d = parseDateKey(dateStr);
  return `${d.getDate()} ${INDONESIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface MonthLockStatusResult {
  isLocked: boolean;
  isAutoLocked?: boolean;
  isManualOverride?: boolean;
  manualOverrideLocked?: boolean;
  monthKey: string; // "2026-09"
  year: number;
  month: number;
  monthName: string;
  deadlineDate: Date;
  deadlineDateStr: string;
  deadlineTimeStr: string;
  reason?: string;
  lockedBy?: string;
  lockedAt?: string;
}

/**
 * Calculate the System Lock Deadline Date object for a given month
 * (e.g. H+5 Hari Kerja Jam 16:00 dari akhir bulan kalender, mengecualikan Hari Libur & Cuti)
 */
export function calculateMonthSystemLockDeadline(
  year: number,
  month: number,
  settings?: TalDeadlineSettingsInput | null,
  holidays: Array<{ date: string; title: string; isRecurringYearly?: boolean }> = [],
  cutiDates: TalCutiInput = []
): Date {
  // Last calendar day of month (e.g. 30 September 2026)
  const lastDay = new Date(year, month, 0, 0, 0, 0, 0);
  const daysToAdd = settings?.systemLockMonthlyDays !== undefined ? settings.systemLockMonthlyDays : 5;
  const { deadlineDate } = addWorkingDays(lastDay, daysToAdd, holidays, cutiDates);
  
  const timeStr = settings?.systemLockMonthlyTime || '16:00';
  const [h, m] = timeStr.split(':').map(Number);
  deadlineDate.setHours(h !== undefined && !isNaN(h) ? h : 16, m !== undefined && !isNaN(m) ? m : 0, 0, 0);
  return deadlineDate;
}

/**
 * Check whether a given TAL Month (year, month) is locked:
 * 1. Checks manual override record from admin (if exists, manual override takes precedence)
 * 2. If no manual override, checks whether current time has passed the auto system lock deadline
 */
export function checkIsTalMonthLocked(
  year: number,
  month: number,
  holidays: Array<{ date: string; title: string; isRecurringYearly?: boolean }> = [],
  settings?: TalDeadlineSettingsInput | null,
  monthLockRecords?: TalMonthLockRecord[] | Record<string, TalMonthLockRecord>,
  now: Date = new Date(),
  cutiDates: TalCutiInput = []
): MonthLockStatusResult {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthName = INDONESIAN_MONTHS[month - 1] || `Bulan ${month}`;

  // Find manual override if present
  let manualRecord: TalMonthLockRecord | undefined;
  if (Array.isArray(monthLockRecords)) {
    manualRecord = monthLockRecords.find(r => r.monthKey === monthKey || (r.year === year && r.month === month));
  } else if (monthLockRecords && typeof monthLockRecords === 'object') {
    manualRecord = monthLockRecords[monthKey];
  }

  const deadlineDate = calculateMonthSystemLockDeadline(year, month, settings, holidays, cutiDates);
  const deadlineDateStr = formatDateKey(deadlineDate);
  const deadlineTimeStr = settings?.systemLockMonthlyTime || '16:00';

  if (manualRecord && manualRecord.manualOverride) {
    return {
      isLocked: !!manualRecord.isLocked,
      isManualOverride: true,
      manualOverrideLocked: !!manualRecord.isLocked,
      monthKey,
      year,
      month,
      monthName,
      deadlineDate,
      deadlineDateStr,
      deadlineTimeStr,
      reason: manualRecord.reason,
      lockedBy: manualRecord.lockedBy || manualRecord.unlockedBy,
      lockedAt: manualRecord.lockedAt || manualRecord.unlockedAt
    };
  }

  // Automatic lock check
  const isEnabled = settings?.systemLockEnabled !== false;
  const isAutoLocked = isEnabled && now.getTime() >= deadlineDate.getTime();

  return {
    isLocked: isAutoLocked,
    isAutoLocked,
    isManualOverride: false,
    monthKey,
    year,
    month,
    monthName,
    deadlineDate,
    deadlineDateStr,
    deadlineTimeStr
  };
}


// ---------------------------------------------------------------------------
// Scope key kanonik WOORK (beda dari backup yang memakai prefix
// daily_/weekly_/monthly_): daily "2026-11-12", weekly "2026-W46",
// monthly "2026-11". Dipakai client + server.
// ---------------------------------------------------------------------------
export function scopeKeyFor(
  scope: TalTaskType,
  p: { dateStr?: string; weekNumber?: number; weekYear?: number; month?: number; year?: number }
): string {
  if (scope === 'daily') return p.dateStr ?? formatDateKey(new Date());
  if (scope === 'weekly')
    return `${p.weekYear ?? new Date().getFullYear()}-W${String(p.weekNumber ?? 1).padStart(2, '0')}`;
  return `${p.year ?? new Date().getFullYear()}-${String(p.month ?? 1).padStart(2, '0')}`;
}

export function parseScopeKey(
  scope: TalTaskType,
  scopeKey: string
): { dateStr?: string; weekNumber?: number; weekYear?: number; month?: number; year?: number } {
  if (scope === 'daily') {
    const m = scopeKey.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? { dateStr: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` } : {};
  }
  if (scope === 'weekly') {
    const m = scopeKey.match(/(\d{4})[_-]W?(\d{1,2})/i);
    return m ? { weekYear: Number(m[1]), weekNumber: Number(m[2]) } : {};
  }
  const m = scopeKey.match(/(\d{4})[_-]M?(\d{1,2})/i);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : {};
}
