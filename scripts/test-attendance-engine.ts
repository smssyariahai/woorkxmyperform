// Tes unit engine Attendance (calc + geo + resolusi shift malam).
// Membaca DB live (jadwal/shift tes) tapi TIDAK menulis apa pun.
import { calculateWithWindow, shiftWindowForDate, parseHHMM } from '../lib/attendance/calc';
import { haversineMeters, isWithinGeofence, findNearestLocation } from '../lib/attendance/geo';
import { resolveShiftForCheckIn } from '../lib/attendance/schedule';

const ORG = 'cmuxmwvzl0000td0t7x9v10va';
const ADMIN = 'cmuxmwx8h001ntd0t9duhffwr';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra?: string) {
  if (cond) { console.log(`PASS: ${label}`); pass++; }
  else { console.log(`FAIL: ${label} ${extra ?? ''}`); fail++; }
}

async function main() {
  // --- 1. Kasus dari spesifikasi: check-in 08:20, check-out 16:30,
  // shift 08:00–17:00, grace 15, istirahat 60.
  const reguler = { startTime: '08:00', endTime: '17:00', isNightShift: false, breakMinutes: 60, graceLateMinutes: 15 };
  const w = shiftWindowForDate('2026-11-20', reguler);
  const r1 = calculateWithWindow({
    checkInAt: new Date('2026-11-20T01:20:00Z'), // 08:20 WIB
    checkOutAt: new Date('2026-11-20T09:30:00Z'), // 16:30 WIB
    window: w,
    graceLateMinutes: 15,
    breakMinutes: 60,
  });
  ok('08:20 -> lateMinutes 5', r1.lateMinutes === 5, `dapat ${r1.lateMinutes}`);
  ok('16:30 -> earlyMinutes 30', r1.earlyMinutes === 30, `dapat ${r1.earlyMinutes}`);
  ok('workMinutes 430 (490-60)', r1.workMinutes === 430, `dapat ${r1.workMinutes}`);
  ok('overtimeMinutes 0', r1.overtimeMinutes === 0, `dapat ${r1.overtimeMinutes}`);
  ok('status LATE', r1.status === 'LATE', `dapat ${r1.status}`);

  // --- 2. Tepat waktu: 07:55–17:00 -> PRESENT, late 0, early 0.
  const r2 = calculateWithWindow({
    checkInAt: new Date('2026-11-20T00:55:00Z'),
    checkOutAt: new Date('2026-11-20T10:00:00Z'),
    window: w,
    graceLateMinutes: 15,
    breakMinutes: 60,
  });
  ok('07:55 tepat waktu -> PRESENT', r2.status === 'PRESENT' && r2.lateMinutes === 0, `dapat ${r2.status}/${r2.lateMinutes}`);
  ok('07:55-17:00 work 485', r2.workMinutes === 485, `dapat ${r2.workMinutes}`);
  ok('07:55-17:00 overtime 5', r2.overtimeMinutes === 5, `dapat ${r2.overtimeMinutes}`);

  // --- 3. Belum check out -> INCOMPLETE.
  const r3 = calculateWithWindow({ checkInAt: new Date('2026-11-20T01:00:00Z'), checkOutAt: null, window: w, graceLateMinutes: 15, breakMinutes: 60 });
  ok('belum check out -> INCOMPLETE', r3.status === 'INCOMPLETE');

  // --- 4. Shift malam 22:00–06:00 lintas tengah malam.
  const malam = { startTime: '22:00', endTime: '06:00', isNightShift: true, breakMinutes: 60, graceLateMinutes: 15 };
  const wn = shiftWindowForDate('2026-11-20', malam);
  ok('jendela malam: start 22:00 WIB', wn.startAt.toISOString() === '2026-11-20T15:00:00.000Z', wn.startAt.toISOString());
  ok('jendela malam: end 06:00 WIB besok', wn.endAt.toISOString() === '2026-11-20T23:00:00.000Z', wn.endAt.toISOString());
  ok('jendela malam: scheduled 420', wn.scheduledMinutes === 420, `dapat ${wn.scheduledMinutes}`);
  const r4 = calculateWithWindow({
    checkInAt: new Date('2026-11-20T15:30:00Z'), // 22:30 WIB
    checkOutAt: new Date('2026-11-20T22:30:00Z'), // 05:30 WIB besok
    window: wn,
    graceLateMinutes: 15,
    breakMinutes: 60,
  });
  ok('malam 22:30 -> late 15', r4.lateMinutes === 15, `dapat ${r4.lateMinutes}`);
  ok('malam 05:30 -> early 30', r4.earlyMinutes === 30, `dapat ${r4.earlyMinutes}`);
  ok('malam work 360', r4.workMinutes === 360, `dapat ${r4.workMinutes}`);
  ok('malam status LATE', r4.status === 'LATE', `dapat ${r4.status}`);

  // --- 5. parseHHMM.
  ok('parseHHMM 08:00', JSON.stringify(parseHHMM('08:00')) === '{"h":8,"m":0}');
  ok('parseHHMM 24:00 invalid', parseHHMM('24:00') === null);
  ok('parseHHMM 8:00 invalid', parseHHMM('8:00') === null);

  // --- 6. Haversine / geofence.
  const kantor = { latitude: -6.2088, longitude: 106.8456 };
  const dekat = { latitude: -6.2084, longitude: 106.8456 };
  const jauh = { latitude: -6.9175, longitude: 107.6191 };
  const d1 = haversineMeters(kantor, dekat);
  ok('jarak ~44 m', d1 > 40 && d1 < 50, `dapat ${d1.toFixed(1)} m`);
  ok('dekat dalam radius 100', isWithinGeofence(dekat, { ...kantor, id: 'x', name: 'K', radiusMeters: 100 }));
  ok('Bandung di luar radius 100', !isWithinGeofence(jauh, { ...kantor, id: 'x', name: 'K', radiusMeters: 100 }));
  const d2 = haversineMeters(kantor, jauh);
  ok('jarak Bandung > 100 km', d2 > 100_000, `dapat ${(d2 / 1000).toFixed(1)} km`);
  const nearest = findNearestLocation(dekat, [
    { ...kantor, id: 'a', name: 'A', radiusMeters: 100 },
    { latitude: -6.21, longitude: 106.85, id: 'b', name: 'B', radiusMeters: 100 },
  ]);
  ok('lokasi terdekat = A', nearest?.location.id === 'a');

  // --- 7. Resolusi shift malam kemarin (jadwal tes: Jumat = shift Malam).
  // now = Sabtu 2026-11-21 01:30 WIB (masih dalam shift malam Jumat 22:00–06:00).
  const res1 = await resolveShiftForCheckIn(ORG, ADMIN, new Date('2026-11-20T18:30:00Z'));
  ok('check-in Sabtu 01:30 -> tanggal kerja Jumat', res1.workDateKey === '2026-11-20', `dapat ${res1.workDateKey}`);
  ok('check-in Sabtu 01:30 -> shift Malam', res1.shift?.name === 'Malam', `dapat ${res1.shift?.name}`);
  // now = Sabtu 12:00 WIB -> shift Reguler hari Sabtu.
  const res2 = await resolveShiftForCheckIn(ORG, ADMIN, new Date('2026-11-21T05:00:00Z'));
  ok('check-in Sabtu 12:00 -> tanggal kerja Sabtu', res2.workDateKey === '2026-11-21', `dapat ${res2.workDateKey}`);
  ok('check-in Sabtu 12:00 -> shift Reguler', res2.shift?.name === 'Reguler', `dapat ${res2.shift?.name}`);

  console.log(`\nRINGKASAN UNIT: PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
