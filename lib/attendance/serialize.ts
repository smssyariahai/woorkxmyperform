// WOORK ATTENDANCE — serialisasi record untuk API.
// Jabatan/departemen dibaca dari HrEmployee (dicocokkan via email user);
// alasan cuti TIDAK PERNAH disertakan di sini.

import { prisma } from '../db';
import { dbDateKey } from '../daily/helpers';

export interface SerializedAttendanceRecord {
  id: string;
  date: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  position: string | null;
  department: string | null;
  shiftId: string | null;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  scheduleId: string | null;
  scheduleName: string | null;
  locationId: string | null;
  locationName: string | null;
  checkInAt: string | null;
  checkInMethod: string | null;
  checkInNote: string | null;
  checkOutAt: string | null;
  checkOutMethod: string | null;
  checkOutNote: string | null;
  status: string;
  statusLabel: string;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  workMinutes: number;
  breakMinutes: number;
  isRemote: boolean;
  createdAt: string;
  updatedAt: string;
}

export const RECORD_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  EARLY_LEAVE: 'Pulang Awal',
  ABSENT: 'Alpha',
  ON_LEAVE: 'Cuti',
  HOLIDAY: 'Libur',
  INCOMPLETE: 'Belum Check Out',
};

export function recordStatusLabel(status: string): string {
  return RECORD_STATUS_LABELS[status] ?? status;
}

type RecordWithRelations = {
  id: string;
  date: Date;
  userId: string;
  shiftId: string | null;
  scheduleId: string | null;
  locationId: string | null;
  checkInAt: Date | null;
  checkInMethod: string | null;
  checkInNote: string | null;
  checkOutAt: Date | null;
  checkOutMethod: string | null;
  checkOutNote: string | null;
  status: string;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  workMinutes: number;
  breakMinutes: number;
  isRemote: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string | null; email: string | null };
  shift: { name: string; startTime: string; endTime: string } | null;
  schedule: { name: string } | null;
  location: { name: string } | null;
};

/** Peta HrEmployee per email (sekali jalan, hindari N+1). */
export async function loadHrByEmail(
  organizationId: string,
  emails: string[]
): Promise<Map<string, { position: string; department: string | null }>> {
  const uniq = [...new Set(emails.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const rows = await prisma.hrEmployee.findMany({
    where: { organizationId, email: { in: uniq } },
    select: { email: true, position: true, department: true },
  });
  return new Map(
    rows
      .filter((r) => r.email)
      .map((r) => [r.email as string, { position: r.position, department: r.department }])
  );
}

export function serializeRecord(
  row: RecordWithRelations,
  hr?: { position: string; department: string | null } | null
): SerializedAttendanceRecord {
  return {
    id: row.id,
    date: dbDateKey(row.date)!,
    userId: row.userId,
    userName: row.user.name,
    userEmail: row.user.email,
    position: hr?.position ?? null,
    department: hr?.department ?? null,
    shiftId: row.shiftId,
    shiftName: row.shift?.name ?? null,
    shiftStartTime: row.shift?.startTime ?? null,
    shiftEndTime: row.shift?.endTime ?? null,
    scheduleId: row.scheduleId,
    scheduleName: row.schedule?.name ?? null,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    checkInAt: row.checkInAt?.toISOString() ?? null,
    checkInMethod: row.checkInMethod,
    checkInNote: row.checkInNote,
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    checkOutMethod: row.checkOutMethod,
    checkOutNote: row.checkOutNote,
    status: row.status,
    statusLabel: recordStatusLabel(row.status),
    lateMinutes: row.lateMinutes,
    earlyMinutes: row.earlyMinutes,
    overtimeMinutes: row.overtimeMinutes,
    workMinutes: row.workMinutes,
    breakMinutes: row.breakMinutes,
    isRemote: row.isRemote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const recordInclude = {
  shift: { select: { name: true, startTime: true, endTime: true } },
  schedule: { select: { name: true } },
  location: { select: { name: true } },
} as const;

/**
 * Gabungkan user ke baris AttendanceRecord (Lapisan F). AttendanceRecord
 * TIDAK punya relasi `user` di tenant client — nama/email diambil dari
 * mirror User (bentuk RecordWithRelations sama).
 */
export async function attachRecordUsers<T extends { userId: string }>(
  rows: T[]
): Promise<Array<T & { user: { name: string | null; email: string | null } }>> {
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    user: byId.get(r.userId) ?? { name: null, email: null },
  }));
}

/** Serialisasi banyak record sekaligus (HR dimuat sekali jalan). */
export async function serializeRecords(
  organizationId: string,
  rows: Array<Omit<RecordWithRelations, 'user'>>
): Promise<SerializedAttendanceRecord[]> {
  const withUsers = await attachRecordUsers(rows);
  const hrMap = await loadHrByEmail(
    organizationId,
    withUsers.map((r) => r.user.email).filter((e): e is string => !!e)
  );
  return withUsers.map((r) => serializeRecord(r, r.user.email ? hrMap.get(r.user.email) ?? null : null));
}
