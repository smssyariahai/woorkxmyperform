// WOORK ATTENDANCE — service engine (SATU engine untuk website + bot WA nanti).
// Semua aturan bisnis check in/out tinggal di sini; route API hanya memvalidasi
// input, memanggil service, dan memformat response. Bot WhatsApp (Fase 3)
// memanggil fungsi yang sama dengan method='WHATSAPP'.

import { prisma } from '../db';
import { audit } from '../audit';
import { dateKeyInTz, dbDateKey, getUserTimezone } from '../daily/helpers';
import { findNearestLocation, toLatLng, type GeofenceLocation } from './geo';
import {
  calculateWithWindow,
  dateTimeInTz,
  shiftWindowForDate,
  type ShiftWindow,
} from './calc';
import {
  isHoliday,
  isOnLeave,
  resolveShiftForCheckIn,
  resolveShiftForDate,
} from './schedule';
import { attachRecordUsers, recordInclude } from './serialize';

export class AttendanceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface AttendanceSettingResolved {
  requireGeofence: boolean;
  allowRemoteCheckIn: boolean;
  defaultLocationId: string | null;
  graceLateMinutes: number;
  workDays: number[];
}

export async function getSetting(organizationId: string): Promise<AttendanceSettingResolved> {
  const s = await prisma.attendanceSetting.findUnique({ where: { organizationId } });
  return {
    requireGeofence: s?.requireGeofence ?? true,
    allowRemoteCheckIn: s?.allowRemoteCheckIn ?? false,
    defaultLocationId: s?.defaultLocationId ?? null,
    graceLateMinutes: s?.graceLateMinutes ?? 15,
    workDays: Array.isArray(s?.workDays) ? (s!.workDays as number[]) : [1, 2, 3, 4, 5],
  };
}

export async function getActiveLocations(organizationId: string): Promise<GeofenceLocation[]> {
  const rows = await prisma.attendanceLocation.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows;
}

/** userId para pengelola absensi (punya ATTENDANCE_MANAGE) di organisasi ini. */
export async function getAttendanceManagerIds(organizationId: string): Promise<string[]> {
  const perm = await prisma.permission.findFirst({
    where: { key: 'ATTENDANCE_MANAGE' },
    select: { id: true },
  });
  if (!perm) return [];
  const rolePerms = await prisma.rolePermission.findMany({
    where: { permissionId: perm.id, role: { organizationId } },
    select: { roleId: true },
  });
  if (rolePerms.length === 0) return [];
  const members = await prisma.membership.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      roleId: { in: rolePerms.map((r) => r.roleId) },
    },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

export async function notifyUser(
  organizationId: string,
  userId: string,
  title: string,
  body: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { organizationId, userId, type: 'ATTENDANCE', title, body },
    });
  } catch (e) {
    console.error('[attendance] gagal buat notifikasi:', (e as Error).message);
  }
}

export async function notifyManagers(
  organizationId: string,
  title: string,
  body: string,
  excludeUserId?: string
): Promise<void> {
  try {
    const ids = (await getAttendanceManagerIds(organizationId)).filter((id) => id !== excludeUserId);
    if (ids.length === 0) return;
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ organizationId, userId, type: 'ATTENDANCE', title, body })),
      skipDuplicates: true,
    });
  } catch (e) {
    console.error('[attendance] gagal notifikasi manager:', (e as Error).message);
  }
}

export interface GeofenceCheck {
  locationId: string | null;
  locationName: string | null;
  distanceMeters: number | null;
  isRemote: boolean;
}

/**
 * Periksa posisi terhadap geofence. Melempar AttendanceError bila ditolak.
 * - requireGeofence=true + tanpa lokasi aktif -> 400 (HRD belum konfigurasi).
 * - Di luar semua lokasi -> 403, kecuali allowRemoteCheckIn + isRemote=true.
 * - requireGeofence=false -> terima posisi apa pun (lokasi dicatat bila di dalam).
 */
export async function checkGeofence(input: {
  organizationId: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  isRemote?: boolean;
}): Promise<GeofenceCheck> {
  const setting = await getSetting(input.organizationId);
  const lat = input.latitude;
  const lng = input.longitude;
  const point = toLatLng(lat, lng);
  if (setting.requireGeofence && !point) {
    throw new AttendanceError('Lokasi GPS wajib diisi untuk check in/out di kantor ini.', 400);
  }
  if (!point) {
    return { locationId: null, locationName: null, distanceMeters: null, isRemote: !!input.isRemote };
  }
  const locations = await getActiveLocations(input.organizationId);
  if (locations.length === 0) {
    if (setting.requireGeofence) {
      throw new AttendanceError('Belum ada lokasi kantor yang dikonfigurasi. Hubungi HRD.', 400);
    }
    return { locationId: null, locationName: null, distanceMeters: null, isRemote: !!input.isRemote };
  }
  const nearest = findNearestLocation(point, locations);
  if (nearest && nearest.within) {
    return {
      locationId: nearest.location.id,
      locationName: nearest.location.name,
      distanceMeters: Math.round(nearest.distanceMeters),
      isRemote: false,
    };
  }
  // Di luar semua lokasi.
  if (setting.allowRemoteCheckIn && input.isRemote) {
    return {
      locationId: null,
      locationName: null,
      distanceMeters: nearest ? Math.round(nearest.distanceMeters) : null,
      isRemote: true,
    };
  }
  const nearestName = nearest ? nearest.location.name : 'kantor';
  const dist = nearest ? Math.round(nearest.distanceMeters) : 0;
  throw new AttendanceError(
    `Anda berada di luar area kantor (jarak ${dist} m dari ${nearestName}). Pastikan GPS aktif dan Anda berada di lokasi kantor.`,
    403
  );
}

/** Menit lembur yang disetujui (overlap jam kerja aktual dengan jendela lembur). */
export async function approvedOvertimeMinutes(
  organizationId: string,
  userId: string,
  dateKey: string,
  checkInAt: Date | null,
  checkOutAt: Date | null
): Promise<number> {
  if (!checkInAt || !checkOutAt) return 0;
  const req = await prisma.overtimeRequest.findFirst({
    where: {
      organizationId,
      userId,
      date: new Date(`${dateKey}T00:00:00Z`),
      status: 'APPROVED',
    },
    orderBy: { createdAt: 'desc' },
    select: { startTime: true, endTime: true },
  });
  if (!req) return 0;
  const start = dateTimeInTz(dateKey, req.startTime);
  let end = dateTimeInTz(dateKey, req.endTime);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const overlapStart = Math.max(checkInAt.getTime(), start.getTime());
  const overlapEnd = Math.min(checkOutAt.getTime(), end.getTime());
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));
}

export interface CheckInInput {
  organizationId: string;
  userId: string;
  userName?: string | null;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  note?: string | null;
  isRemote?: boolean;
  method: 'WEB' | 'WHATSAPP' | 'MANUAL';
  now?: Date;
}

export interface CheckOutInput extends Omit<CheckInInput, 'method'> {
  method: 'WEB' | 'WHATSAPP' | 'MANUAL';
}

async function loadShiftWindow(
  organizationId: string,
  record: { date: Date; shiftId: string | null }
): Promise<ShiftWindow | null> {
  if (!record.shiftId) return null;
  const shift = await prisma.shift.findFirst({
    where: { id: record.shiftId, organizationId },
    select: { startTime: true, endTime: true, isNightShift: true, breakMinutes: true, graceLateMinutes: true },
  });
  if (!shift) return null;
  return shiftWindowForDate(dbDateKey(record.date)!, shift);
}

/** Record terbuka (sudah check in, belum check out) terbaru milik pengguna. */
export async function findOpenRecord(organizationId: string, userId: string) {
  return prisma.attendanceRecord.findFirst({
    where: { organizationId, userId, checkInAt: { not: null }, checkOutAt: null },
    orderBy: { date: 'desc' },
  });
}

function formatTimeWib(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Check in. Aturan: satu record per (org, user, tanggal kerja); check-in
 * kedua -> 409; ada record terbuka dari shift sebelumnya -> 409 (minta
 * check out dulu); check-in >2 jam sebelum shift mulai -> 400.
 */
export async function checkIn(input: CheckInInput) {
  const now = input.now ?? new Date();
  const tz = await getUserTimezone(input.organizationId, input.userId);
  const setting = await getSetting(input.organizationId);

  const open = await findOpenRecord(input.organizationId, input.userId);
  if (open) {
    const openKey = dbDateKey(open.date)!;
    throw new AttendanceError(
      `Anda belum check out dari shift sebelumnya (tanggal ${openKey}). Silakan check out dulu sebelum check in lagi.`,
      409
    );
  }

  const resolved = await resolveShiftForCheckIn(input.organizationId, input.userId, now, tz);
  const workDateKey = resolved.workDateKey;

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      organizationId_userId_date: {
        organizationId: input.organizationId,
        userId: input.userId,
        date: new Date(`${workDateKey}T00:00:00Z`),
      },
    },
    select: { id: true, checkInAt: true },
  });
  if (existing?.checkInAt) {
    throw new AttendanceError('Anda sudah check in hari ini.', 409);
  }

  // Terlalu awal: lebih dari 2 jam sebelum shift mulai.
  if (resolved.window) {
    const earliest = new Date(resolved.window.startAt.getTime() - 2 * 60 * 60 * 1000);
    if (now < earliest) {
      throw new AttendanceError(
        `Terlalu awal untuk check in. Shift ${resolved.shift?.name ?? ''} mulai pukul ${formatTimeWib(resolved.window.startAt)} WIB.`,
        400
      );
    }
  }

  const geo = await checkGeofence({
    organizationId: input.organizationId,
    latitude: input.latitude,
    longitude: input.longitude,
    isRemote: input.isRemote,
  });

  const breakMinutes = resolved.shift ? resolved.shift.breakMinutes : 0;
  const grace = resolved.shift ? resolved.shift.graceLateMinutes : setting.graceLateMinutes;
  const calc = calculateWithWindow({
    checkInAt: now,
    checkOutAt: null,
    window: resolved.window,
    graceLateMinutes: grace,
    breakMinutes,
  });

  const record = await prisma.attendanceRecord.upsert({
    where: {
      organizationId_userId_date: {
        organizationId: input.organizationId,
        userId: input.userId,
        date: new Date(`${workDateKey}T00:00:00Z`),
      },
    },
    update: {
      checkInAt: now,
      checkInLat: input.latitude ?? null,
      checkInLng: input.longitude ?? null,
      checkInMethod: input.method,
      checkInNote: input.note?.trim() || null,
      shiftId: resolved.shiftId,
      scheduleId: resolved.schedule?.id ?? null,
      locationId: geo.locationId,
      isRemote: geo.isRemote,
      breakMinutes,
      lateMinutes: calc.lateMinutes,
      status: 'INCOMPLETE',
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      date: new Date(`${workDateKey}T00:00:00Z`),
      shiftId: resolved.shiftId,
      scheduleId: resolved.schedule?.id ?? null,
      locationId: geo.locationId,
      checkInAt: now,
      checkInLat: input.latitude ?? null,
      checkInLng: input.longitude ?? null,
      checkInMethod: input.method,
      checkInNote: input.note?.trim() || null,
      breakMinutes,
      lateMinutes: calc.lateMinutes,
      status: 'INCOMPLETE',
      isRemote: geo.isRemote,
    },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.userId,
    action: 'ATTENDANCE_CHECK_IN',
    module: 'ATTENDANCE',
    description: `Check in ${formatTimeWib(now)} WIB${geo.locationName ? ` di ${geo.locationName}` : ''}${calc.lateMinutes > 0 ? ` (terlambat ${calc.lateMinutes} menit)` : ''} via ${input.method}`,
  });

  if (calc.lateMinutes > 0) {
    const name = input.userName ?? 'Karyawan';
    await notifyUser(
      input.organizationId,
      input.userId,
      'Check in terlambat',
      `Anda check in terlambat ${calc.lateMinutes} menit hari ini (${formatTimeWib(now)} WIB).`
    );
    await notifyManagers(
      input.organizationId,
      'Karyawan terlambat check in',
      `${name} check in terlambat ${calc.lateMinutes} menit hari ini (${formatTimeWib(now)} WIB).`,
      input.userId
    );
  }

  const full = await prisma.attendanceRecord.findUnique({
    where: { id: record.id },
    include: recordInclude,
  });
  if (!full) throw new AttendanceError('Record absensi tidak ditemukan setelah check in.', 500);
  const [fullWithUser] = await attachRecordUsers([full]);
  return { record: fullWithUser, lateMinutes: calc.lateMinutes, geofence: geo, shift: resolved.shift, workDateKey };
}

/**
 * Check out. Menutup record terbuka terbaru (bisa dari kemarin untuk shift
 * malam). Check-out kedua / tanpa check in -> 409; check-out sebelum
 * check-in -> 400.
 */
export async function checkOut(input: CheckOutInput) {
  const now = input.now ?? new Date();
  const open = await findOpenRecord(input.organizationId, input.userId);
  if (!open) {
    throw new AttendanceError('Belum ada check in yang bisa di-check out. Silakan check in dulu.', 409);
  }
  if (open.checkInAt && now < open.checkInAt) {
    throw new AttendanceError('Waktu check out tidak boleh sebelum waktu check in.', 400);
  }

  const geo = await checkGeofence({
    organizationId: input.organizationId,
    latitude: input.latitude,
    longitude: input.longitude,
    isRemote: input.isRemote,
  });

  const setting = await getSetting(input.organizationId);
  const window = await loadShiftWindow(input.organizationId, open);
  const shift = open.shiftId
    ? await prisma.shift.findFirst({
        where: { id: open.shiftId, organizationId: input.organizationId },
        select: { graceLateMinutes: true, breakMinutes: true },
      })
    : null;
  const approved = await approvedOvertimeMinutes(
    input.organizationId,
    input.userId,
    dbDateKey(open.date)!,
    open.checkInAt,
    now
  );
  const calc = calculateWithWindow({
    checkInAt: open.checkInAt,
    checkOutAt: now,
    window,
    graceLateMinutes: shift?.graceLateMinutes ?? setting.graceLateMinutes,
    breakMinutes: open.breakMinutes,
    approvedOvertimeMinutes: approved,
  });

  const record = await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: {
      checkOutAt: now,
      checkOutLat: input.latitude ?? null,
      checkOutLng: input.longitude ?? null,
      checkOutMethod: input.method,
      checkOutNote: input.note?.trim() || null,
      locationId: geo.locationId ?? open.locationId,
      isRemote: geo.isRemote || open.isRemote,
      lateMinutes: calc.lateMinutes,
      earlyMinutes: calc.earlyMinutes,
      workMinutes: calc.workMinutes,
      overtimeMinutes: calc.overtimeMinutes,
      status: calc.status,
    },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.userId,
    action: 'ATTENDANCE_CHECK_OUT',
    module: 'ATTENDANCE',
    description: `Check out ${formatTimeWib(now)} WIB (jam kerja ${calc.workMinutes} menit${calc.overtimeMinutes > 0 ? `, lembur ${calc.overtimeMinutes} menit` : ''}) via ${input.method}`,
  });

  if (calc.earlyMinutes > 0) {
    const name = input.userName ?? 'Karyawan';
    await notifyManagers(
      input.organizationId,
      'Karyawan pulang awal',
      `${name} check out lebih awal ${calc.earlyMinutes} menit hari ini (${formatTimeWib(now)} WIB).`,
      input.userId
    );
  }

  const full = await prisma.attendanceRecord.findUnique({
    where: { id: record.id },
    include: recordInclude,
  });
  if (!full) throw new AttendanceError('Record absensi tidak ditemukan setelah check out.', 500);
  const [fullWithUser] = await attachRecordUsers([full]);
  return { record: fullWithUser, ...calc, geofence: geo, workDateKey: dbDateKey(open.date)! };
}

/** Status absensi saya hari ini (dipakai tombol Check In/Out di UI). */
export async function getTodayStatus(organizationId: string, userId: string) {
  const tz = await getUserTimezone(organizationId, userId);
  const now = new Date();
  const todayKey = dateKeyInTz(now, tz);
  const setting = await getSetting(organizationId);
  const [record, resolved, holiday, onLeave, locations] = await Promise.all([
    prisma.attendanceRecord.findUnique({
      where: {
        organizationId_userId_date: {
          organizationId,
          userId,
          date: new Date(`${todayKey}T00:00:00Z`),
        },
      },
      include: recordInclude,
    }),
    resolveShiftForDate(organizationId, userId, todayKey, tz),
    isHoliday(organizationId, todayKey),
    isOnLeave(organizationId, userId, todayKey),
    prisma.attendanceLocation.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, address: true, latitude: true, longitude: true, radiusMeters: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
  ]);
  const openOther = !record?.checkInAt
    ? await findOpenRecord(organizationId, userId)
    : null;
  const [recordWithUser] = await attachRecordUsers(record ? [record] : []);
  const canCheckIn = !record?.checkInAt && !openOther;
  const canCheckOut = !!(record?.checkInAt && !record?.checkOutAt) || !!openOther;
  return {
    date: todayKey,
    timezone: tz,
    record: recordWithUser ?? null,
    shift: resolved.shift,
    shiftId: resolved.shiftId,
    schedule: resolved.schedule,
    scheduleSource: resolved.scheduleSource,
    window: resolved.window
      ? { startAt: resolved.window.startAt.toISOString(), endAt: resolved.window.endAt.toISOString(), isNight: resolved.window.isNight, scheduledMinutes: resolved.window.scheduledMinutes }
      : null,
    isHoliday: holiday.isHoliday,
    holidayName: holiday.name,
    isOnLeave: onLeave,
    setting,
    locations,
    canCheckIn,
    canCheckOut,
    openRecordDate: openOther ? dbDateKey(openOther.date) : null,
  };
}

/**
 * Hitung ulang record (dipakai setelah koreksi disetujui / shift berubah).
 * Status hanya dihitung bila sudah check out; bila belum, INCOMPLETE.
 */
export async function recalcRecord(recordId: string) {
  const record = await prisma.attendanceRecord.findUnique({ where: { id: recordId } });
  if (!record) throw new AttendanceError('Record absensi tidak ditemukan.', 404);
  const setting = await getSetting(record.organizationId);
  const window = await loadShiftWindow(record.organizationId, record);
  const shift = record.shiftId
    ? await prisma.shift.findFirst({
        where: { id: record.shiftId, organizationId: record.organizationId },
        select: { graceLateMinutes: true, breakMinutes: true },
      })
    : null;
  const approved = await approvedOvertimeMinutes(
    record.organizationId,
    record.userId,
    dbDateKey(record.date)!,
    record.checkInAt,
    record.checkOutAt
  );
  const calc = calculateWithWindow({
    checkInAt: record.checkInAt,
    checkOutAt: record.checkOutAt,
    window,
    graceLateMinutes: shift?.graceLateMinutes ?? setting.graceLateMinutes,
    breakMinutes: record.breakMinutes,
    approvedOvertimeMinutes: approved,
  });
  return prisma.attendanceRecord.update({
    where: { id: recordId },
    data: {
      lateMinutes: calc.lateMinutes,
      earlyMinutes: calc.earlyMinutes,
      workMinutes: calc.workMinutes,
      overtimeMinutes: calc.overtimeMinutes,
      status: calc.status,
    },
  });
}
