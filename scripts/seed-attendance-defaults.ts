// Seed default Attendance untuk satu organisasi (idempotent).
// - Lokasi default dari Organization.latitude/longitude — bila org belum
//   punya lat/lng, lokasi TIDAK dibuat (jangan karang koordinat); HRD harus
//   mengisi lokasi lewat API/UI.
// - Shift "Reguler" 08:00–17:00 (istirahat 60, toleransi 15).
// - Jadwal default Senin–Jumat memakai shift Reguler.
// - AttendanceSetting default (geofence wajib, remote tidak diizinkan).
//
// Jalankan: npx tsx scripts/seed-attendance-defaults.ts [organizationId]
// Default org: WOORK.ID (cmuxmwvzl0000td0t7x9v10va).

import { prisma } from '../lib/db';

const DEFAULT_ORG_ID = 'cmuxmwvzl0000td0t7x9v10va';

async function main() {
  const organizationId = process.argv[2] ?? DEFAULT_ORG_ID;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  if (!org) {
    console.log(`Organisasi ${organizationId} tidak ditemukan.`);
    return;
  }
  console.log(`Seed Attendance untuk ${org.name} (${org.id})`);

  // 1. Lokasi default (hanya bila org punya lat/lng).
  let locationId: string | null = null;
  if (org.latitude !== null && org.longitude !== null) {
    const existing = await prisma.attendanceLocation.findFirst({
      where: { organizationId, isDefault: true },
      select: { id: true, name: true },
    });
    if (existing) {
      locationId = existing.id;
      console.log(`- Lokasi default sudah ada: ${existing.name} (${existing.id})`);
    } else {
      const loc = await prisma.attendanceLocation.create({
        data: {
          organizationId,
          name: `Kantor ${org.name}`,
          latitude: org.latitude,
          longitude: org.longitude,
          radiusMeters: 100,
          isDefault: true,
          isActive: true,
        },
      });
      locationId = loc.id;
      console.log(`- Lokasi default dibuat: ${loc.name} (${loc.latitude}, ${loc.longitude}) radius 100 m`);
    }
  } else {
    console.log('- SKIP lokasi default: organisasi belum punya latitude/longitude. Isi lewat Manajemen Perusahaan / API lokasi.');
  }

  // 2. Shift Reguler 08:00–17:00.
  let shift = await prisma.shift.findFirst({
    where: { organizationId, name: 'Reguler' },
    select: { id: true, name: true },
  });
  if (!shift) {
    shift = await prisma.shift.create({
      data: {
        organizationId,
        name: 'Reguler',
        startTime: '08:00',
        endTime: '17:00',
        isNightShift: false,
        breakMinutes: 60,
        graceLateMinutes: 15,
        color: '#2563eb',
        isActive: true,
      },
      select: { id: true, name: true },
    });
    console.log(`- Shift dibuat: Reguler 08:00–17:00 (istirahat 60 mnt, toleransi 15 mnt)`);
  } else {
    console.log(`- Shift sudah ada: ${shift.name} (${shift.id})`);
  }

  // 3. Jadwal default Senin–Jumat.
  const daysOfWeek: Record<string, string | null> = {
    '0': null,
    '1': shift.id,
    '2': shift.id,
    '3': shift.id,
    '4': shift.id,
    '5': shift.id,
    '6': null,
  };
  let schedule = await prisma.workSchedule.findFirst({
    where: { organizationId, isDefault: true, userId: null, departmentId: null },
    select: { id: true, name: true },
  });
  if (!schedule) {
    schedule = await prisma.workSchedule.create({
      data: {
        organizationId,
        name: 'Jadwal Reguler',
        daysOfWeek,
        isDefault: true,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    console.log(`- Jadwal default dibuat: Jadwal Reguler (Senin–Jumat)`);
  } else {
    console.log(`- Jadwal default sudah ada: ${schedule.name} (${schedule.id})`);
  }

  // 4. Setting default.
  const setting = await prisma.attendanceSetting.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      requireGeofence: true,
      allowRemoteCheckIn: false,
      defaultLocationId: locationId,
      graceLateMinutes: 15,
      workDays: [1, 2, 3, 4, 5],
    },
  });
  console.log(
    `- Setting: geofence ${setting.requireGeofence ? 'wajib' : 'tidak wajib'}, remote ${setting.allowRemoteCheckIn ? 'diizinkan' : 'tidak diizinkan'}, toleransi ${setting.graceLateMinutes} mnt, lokasi default ${setting.defaultLocationId ?? '(belum ada)'}`
  );
  console.log('Selesai.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
