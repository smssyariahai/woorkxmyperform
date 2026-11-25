/**
 * Verifikasi lift-only (skrip, bukan UI): SEMUA pindah lantai pakai lift
 * (antre FIFO, satu agent per trip, kabin 1,0 m/dtk + pintu 1 dtk) +
 * regresi rute satu lantai walkPath3.
 *
 * Menggantikan verifikasi Fase 5b lama (rute tangga + lift L1<->L3):
 * tangga DIHAPUS total 2026-11-23 (geometri + flight() + konstanta
 * STAIRS*) — walkPath3 lintas lantai kini hanya mengembalikan path ke
 * kepala antrean (slot 0) di lantai asal; kaki lift (masuk kabin, naik,
 * keluar) urusan liftController + Character, BUKAN waypoint.
 *
 * Dijalankan: `npx tsx scripts/verify-fase5b.ts` — exit 0 bila semua cek
 * lolos, exit 1 bila ada yang gagal. TIDAK mengubah data / DB / file lain.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  FLOOR_HEIGHT,
  LIFT,
  LIFT_APPROACH,
  LIFT_CABIN_Z,
  LIFT_DOOR_Z,
  LIFT_QUEUE_SLOTS,
  chairForDesk,
  createLayout,
  floor3Rooms,
  floorOf,
  musalaSafPositions,
  needsLift,
  walkPath3,
  type LayoutAgent,
  type OfficeLayout,
  type Vec3,
} from '../components/kantor/scene/office3d-layout'
import { LiftController } from '../components/kantor/scene/lift-controller'
import { demoRooms, roomOf } from '../components/kantor/scene/demo-tour'

let failures = 0
let total = 0
const check = (name: string, ok: boolean, detail = '') => {
  total += 1
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// Agent WOORK.ID (pemetaan Fase 3a) supaya layout = layout produksi.
const AGENTS: LayoutAgent[] = [
  { seat: 1, department: { name: 'Executive', floor: 3, zone: 'CEO Office' } },
  { seat: 2, department: { name: 'Strategy & Business Development', floor: 3, zone: 'Strategy & PM' } },
  { seat: 3, department: { name: 'IT', floor: 1, zone: null } },
  { seat: 4, department: { name: 'Finance', floor: 1, zone: null } },
  { seat: 5, department: { name: 'Backend Engineering', floor: 2, zone: null } },
  { seat: 6, department: { name: 'Project Management', floor: 3, zone: 'Project Management' } },
  { seat: 7, department: { name: 'DevOps & Infrastructure', floor: 2, zone: null } },
]
const layout: OfficeLayout = createLayout(AGENTS)
const rooms3 = floor3Rooms(layout.building)
const FLOOR_Y = [0, FLOOR_HEIGHT, 2 * FLOOR_HEIGHT]
const eq = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const samePoint = (a: Vec3, b: Vec3) => dist3(a, b) < 0.01
const SLOT0: Vec3 = [LIFT_QUEUE_SLOTS[0][0], 0, LIFT_QUEUE_SLOTS[0][1]]

// ── Geometri tabrakan (dari environment.tsx + props.tsx, bukan karangan) ──
interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
/** Liang-Barsky 2D: segmen (x,z) menyentuh rect? */
function segHitsRect(a: Vec3, b: Vec3, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const axes: [number, number, number, number][] = [
    [a[0], b[0] - a[0], r.minX, r.maxX],
    [a[2], b[2] - a[2], r.minZ, r.maxZ],
  ]
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false } else {
      let ta = (lo - p) / d
      let tb = (hi - p) / d
      if (ta > tb) { const t = ta; ta = tb; tb = t }
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) return false
    }
  }
  return true
}
/** Meja: WorkDesk 1,9 x 0,95 (props.tsx), diperlebar 0,24 (setengah lebar
 *  badan agent) — jalur samping kursi (1,3 m) tetap lolos (celah 0,35). */
function deskRects(): { rect: Rect; y: number }[] {
  const out: { rect: Rect; y: number }[] = []
  const E = 0.24
  const add = (x: number, y: number, z: number, rot: number) => {
    const wideX = Math.abs(Math.cos(rot)) > 0.5
    const hx = (wideX ? 0.95 : 0.475) + E
    const hz = (wideX ? 0.475 : 0.95) + E
    out.push({ rect: { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }, y })
  }
  for (const [x, y, z] of layout.desks) add(x, y, z, 0)
  for (const c of layout.techClusters) for (const d of c.desks) add(d.desk[0], d.desk[1], d.desk[2], d.rotation)
  for (const d of layout.execDesks) add(d.desk[0], d.desk[1], d.desk[2], d.rotation)
  return out
}
/** Perabot pantry lantai 1 (environment.tsx + props.tsx, rotasi -PI/2):
 *  kulkas 0,75x0,7 di (9,0, 0,6); counter 2,0x0,6 di (9,05, 2,6);
 *  galon 0,42x0,42 di (9,05, -0,4). */
const PANTRY_RECTS: Rect[] = [
  { minX: 8.65, maxX: 9.35, minZ: 0.225, maxZ: 0.975 },
  { minX: 8.75, maxX: 9.35, minZ: 1.6, maxZ: 3.6 },
  { minX: 8.84, maxX: 9.26, minZ: -0.61, maxZ: -0.19 },
]
/** Meja rapat lantai 1: LongTable, panjang x1..x2, lebar 1,1 di z 2,75. */
const MEETING_TABLE: Rect = {
  minX: layout.meetingRoom.table.x1, maxX: layout.meetingRoom.table.x2,
  minZ: layout.meetingRoom.table.z - 0.55, maxZ: layout.meetingRoom.table.z + 0.55,
}
const DESKS = deskRects()

/** Koordinat x tempat segmen memotong garis (axis 'x'/'z' = nilai), null bila tidak memotong. */
function segCrosses(a: Vec3, b: Vec3, axis: 'x' | 'z', value: number): number | null {
  const a1 = axis === 'x' ? a[0] : a[2]
  const b1 = axis === 'x' ? b[0] : b[2]
  if ((a1 < value && b1 > value) || (a1 > value && b1 < value)) {
    const t = (value - a1) / (b1 - a1)
    return axis === 'x' ? a[2] + (b[2] - a[2]) * t : a[0] + (b[0] - a[0]) * t
  }
  return null
}
/** Dinding ruangan eksekutif lantai 3 (TopFloor): dinding utara z 0,4 +
 *  pintu tiap ruangan; dinding selatan z 2,95 (Legal + Meeting, tanpa
 *  pintu); dinding pemisah antar ruangan (x = cc/ceo/spm maxX, z 0,4–4,2);
 *  dinding barat Meeting x 5,4 + timur Legal x 4,2 (z 0,4–2,95).
 *  Plus dinding depan z 4,2: lantai 1 hanya lewat pintu masuk (x 4,9–6,7);
 *  lantai 3 hanya lewat pintu balkon (x 6,2–7,4); lantai 2 TIDAK BOLEH
 *  menyeberang sama sekali (balkon lantai 2 dihapus — dinding depan
 *  ditutup kaca). */
function wallViolation(path: Vec3[]): string | null {
  const doors: { minX: number; maxX: number; doorX: number }[] = [
    { minX: rooms3.commandCenter.minX, maxX: rooms3.commandCenter.maxX, doorX: (rooms3.commandCenter.minX + rooms3.commandCenter.maxX) / 2 },
    { minX: rooms3.ceoOffice.minX, maxX: rooms3.ceoOffice.maxX, doorX: (rooms3.ceoOffice.minX + rooms3.ceoOffice.maxX) / 2 },
    { minX: rooms3.strategyPm.minX, maxX: rooms3.strategyPm.maxX, doorX: (rooms3.strategyPm.minX + rooms3.strategyPm.maxX) / 2 },
    { minX: rooms3.legal.minX, maxX: rooms3.legal.maxX, doorX: 2.3 },
    { minX: rooms3.execMeeting.minX, maxX: rooms3.execMeeting.maxX, doorX: 6.95 },
  ]
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    if (Math.abs(a[1] - b[1]) > 0.01) continue
    // Dinding depan z=4,2 (semua lantai; hanya di dalam lebar gedung).
    const crossFront = segCrosses(a, b, 'z', 4.2)
    if (crossFront !== null && crossFront > layout.building.minX && crossFront < layout.building.maxX) {
      if (eq(a[1], 0)) {
        if (crossFront < 4.9 || crossFront > 6.7) return `seg ${i} menembus dinding depan z=4,2 di x=${crossFront.toFixed(2)} (bukan pintu masuk)`
      } else if (eq(a[1], 2 * FLOOR_HEIGHT)) {
        if (crossFront < 6.2 || crossFront > 7.4) return `seg ${i} menembus dinding depan z=4,2 di x=${crossFront.toFixed(2)} (bukan pintu balkon L3)`
      } else {
        return `seg ${i} menyeberang dinding depan L2 z=4,2 di x=${crossFront.toFixed(2)} (balkon L2 dihapus — dinding ditutup)`
      }
    }
    if (!eq(a[1], 2 * FLOOR_HEIGHT) || !eq(b[1], 2 * FLOOR_HEIGHT)) continue
    const crossNorth = segCrosses(a, b, 'z', 0.4)
    if (crossNorth !== null) {
      const room = doors.find((d) => crossNorth > d.minX && crossNorth < d.maxX)
      if (room && Math.abs(crossNorth - room.doorX) > 0.5) return `seg ${i} menembus dinding utara z=0,4 di x=${crossNorth.toFixed(2)} (bukan pintu)`
      if (!room) return `seg ${i} menembus dinding utara z=0,4 di x=${crossNorth.toFixed(2)}`
    }
    const crossSouth = segCrosses(a, b, 'z', 2.95)
    if (crossSouth !== null && ((crossSouth > rooms3.legal.minX && crossSouth < rooms3.legal.maxX) || (crossSouth > rooms3.execMeeting.minX && crossSouth < rooms3.execMeeting.maxX))) {
      return `seg ${i} menembus dinding selatan z=2,95 di x=${crossSouth.toFixed(2)}`
    }
    for (const wallX of [rooms3.commandCenter.maxX, rooms3.ceoOffice.maxX, rooms3.strategyPm.maxX]) {
      const cross = segCrosses(a, b, 'x', wallX)
      if (cross !== null && cross > 0.4 && cross < 4.2) return `seg ${i} menembus dinding pemisah x=${wallX.toFixed(2)} di z=${cross.toFixed(2)}`
    }
    const crossWest = segCrosses(a, b, 'x', rooms3.execMeeting.minX)
    if (crossWest !== null && crossWest > 0.4 && crossWest < 2.95) return `seg ${i} menembus dinding barat Meeting x=5,4 di z=${crossWest.toFixed(2)}`
    const crossEast = segCrosses(a, b, 'x', rooms3.legal.maxX)
    if (crossEast !== null && crossEast > 0.4 && crossEast < 2.95) return `seg ${i} menembus dinding timur Legal x=4,2 di z=${crossEast.toFixed(2)}`
  }
  return null
}
/** Tabrakan meja/perabot pada segmen DATAR. Diterapkan ke SEMUA rute
 *  (lift-only: tidak ada lagi segmen naik/turun di path — y konstan). */
function collisionViolation(path: Vec3[]): string | null {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    if (Math.abs(a[1] - b[1]) > 0.01) continue
    for (const { rect, y } of DESKS) {
      if (eq(a[1], y) && segHitsRect(a, b, rect)) return `seg ${i} menabrak meja (${((rect.minX + rect.maxX) / 2).toFixed(2)}, ${((rect.minZ + rect.maxZ) / 2).toFixed(2)})`
    }
    if (eq(a[1], 0)) {
      for (const r of PANTRY_RECTS) if (segHitsRect(a, b, r)) return `seg ${i} menabrak perabot pantry x ${r.minX}–${r.maxX}`
      if (segHitsRect(a, b, MEETING_TABLE)) return `seg ${i} menabrak meja rapat`
    }
  }
  return null
}

// ── Invarian umum (rekonstruksi Fase 3b, disesuaikan lift-only) ──
/** Rute satu lantai: ujung tepat di tujuan, y konstan di lantai itu. */
function checkFlatPath(label: string, from: Vec3, path: Vec3[], to: Vec3) {
  check(`${label}: ujung tepat di tujuan`, path.length > 0 && samePoint(path[path.length - 1], to), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check(`${label}: tanpa NaN (${path.length} waypoint)`, !path.some((p) => p.some((v) => Number.isNaN(v))))
  const yFrom = FLOOR_Y[floorOf(from) - 1]
  check(`${label}: y konstan di lantai asal`, path.every((p) => eq(p[1], yFrom)), `y!=${yFrom}`)
  const hole = collisionViolation(path)
  check(`${label}: tanpa tabrakan meja/perabot`, hole === null, hole ?? '')
  const wall = wallViolation(path)
  check(`${label}: tidak menembus dinding eksekutif L3`, wall === null, wall ?? '')
  check(`${label}: deterministik`, JSON.stringify(walkPath3(from, to, layout)) === JSON.stringify(path), '')
}
/** Rute lintas lantai (lift-only): ujung di kepala antrean (slot 0)
 *  lantai asal, y konstan di lantai asal — TIDAK ADA waypoint naik/
 *  turun (kaki lift urusan controller, bukan path). */
function checkCrossFloorPath(label: string, from: Vec3, path: Vec3[], to: Vec3) {
  const yFrom = FLOOR_Y[floorOf(from) - 1]
  const slot0: Vec3 = [LIFT_QUEUE_SLOTS[0][0], yFrom, LIFT_QUEUE_SLOTS[0][1]]
  check(`${label}: ujung di kepala antrean (slot 0) lantai asal`, path.length > 0 && samePoint(path[path.length - 1], slot0), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check(`${label}: tanpa NaN (${path.length} waypoint)`, !path.some((p) => p.some((v) => Number.isNaN(v))))
  const yBad = path.find((p) => !eq(p[1], yFrom))
  check(`${label}: y konstan ${yFrom} (tidak ada waypoint naik/turun)`, yBad === undefined, yBad ? `y=${yBad[1]}` : '')
  const stairZ = path.some((p) => eq(p[2], 3.45))
  check(`${label}: tanpa waypoint tangga (z=3,45)`, !stairZ)
  const hole = collisionViolation(path)
  check(`${label}: tanpa tabrakan meja/perabot`, hole === null, hole ?? '')
  const wall = wallViolation(path)
  check(`${label}: tidak menembus dinding eksekutif L3`, wall === null, wall ?? '')
  check(`${label}: deterministik`, JSON.stringify(walkPath3(from, to, layout)) === JSON.stringify(path), '')
}

// ── Titik-titik representatif ──
const l1Desk = chairForDesk(layout.desks[0], 0).position
const l1Desk2 = chairForDesk(layout.desks[1], 0).position
const l1Lounge: Vec3 = [4, 0, -1.8]
const l1Meeting = layout.meetingRoom.seats[1].position
const l1Musala = musalaSafPositions(layout)[0].position
const l1Dapur: Vec3 = [7.9, 0, 3.3]
const l1Game: Vec3 = [12.6 - 1.75, 0, -1.4]
const l1Outside: Vec3 = [16.4 - 0.8, 0, 2.6 + 0.3]
const l2FrontChair = chairForDesk(layout.techClusters.find((c) => c.row === 'front')!.desks[0].desk, 0).position
const l2BackChair = chairForDesk(layout.techClusters.find((c) => c.row === 'back')!.desks[0].desk, 0).position
const l2FrontStrip: Vec3 = [6.8, FLOOR_HEIGHT, LIFT_DOOR_Z]
const execDesk = (id: string) => {
  const d = layout.execDesks.find((x) => x.id === id)!
  return chairForDesk(d.desk, d.rotation).position
}
const l3Ceo = execDesk('exec:ceo:0')
const l3Command = execDesk('exec:command:0')
const l3Strategy = execDesk('exec:strategy:0')
const l3Legal = execDesk('exec:legal:0')
const l3Rest: Vec3 = [layout.restSpots[0][0], 2 * FLOOR_HEIGHT, layout.restSpots[0][2] + 0.95]
const l3Lesehan: Vec3 = [4.3 - 1, 2 * FLOOR_HEIGHT, -3]
const l3Balcony: Vec3 = [0.6 - 0.85, 2 * FLOOR_HEIGHT, 5.5]

// ── 0. Aturan pemilihan lift (lift-only): lantai berbeda -> lift ──
check('aturan: L1->L3 pakai lift', needsLift([0, 0, 0], [0, 5.6, 0]))
check('aturan: L3->L1 pakai lift', needsLift([0, 5.6, 0], [0, 0, 0]))
check('aturan: L1->L2 pakai lift (tangga dihapus)', needsLift([0, 0, 0], [0, 2.8, 0]))
check('aturan: L2->L3 pakai lift (tangga dihapus)', needsLift([0, 2.8, 0], [0, 5.6, 0]))
check('aturan: satu lantai tidak pakai lift', !needsLift([0, 0, 0], [1, 0, 1]))

// ── 1. Lintas lantai: ke kepala antrean, tanpa waypoint naik/turun ──
const crossFloor: [string, Vec3, Vec3][] = [
  ['lift L1 meja -> L3 CEO', l1Desk, l3Ceo],
  ['lift L1 meeting -> L3 Command', l1Meeting, l3Command],
  ['lift L1 musala -> L3 lounge', l1Musala, l3Rest],
  ['lift L1 luar -> L3 balkon', l1Outside, l3Balcony],
  ['lift L1 lounge -> L3 lesehan', l1Lounge, l3Lesehan],
  ['lift L1 dapur -> L3 Legal', l1Dapur, l3Legal],
  ['lift L1 game -> L3 Strategy', l1Game, l3Strategy],
  ['lift L3 CEO -> L1 meja', l3Ceo, l1Desk2],
  ['lift L3 lounge -> L1 lounge', l3Rest, l1Lounge],
  ['lift L3 balkon -> L1 dapur', l3Balcony, l1Dapur],
  ['lift L3 lesehan -> L1 meeting', l3Lesehan, l1Meeting],
  ['lift L3 Command -> L1 luar', l3Command, l1Outside],
  ['lift L3 Legal -> L1 musala', l3Legal, l1Musala],
  ['lift L1 meja -> L2 depan', l1Desk, l2FrontChair],
  ['lift L1 lounge -> L2 belakang', l1Lounge, l2BackChair],
  ['lift L2 depan -> L1 meja', l2FrontChair, l1Desk2],
  ['lift L2 belakang -> L1 lounge', l2BackChair, l1Lounge],
  ['lift L2 depan -> L3 CEO', l2FrontChair, l3Ceo],
  ['lift L2 belakang -> L3 lounge', l2BackChair, l3Rest],
  ['lift L3 CEO -> L2 depan', l3Ceo, l2FrontChair],
  ['lift L3 lounge -> L2 belakang', l3Rest, l2BackChair],
  ['lift L3 balkon -> L2 depan', l3Balcony, l2FrontChair],
  ['lift L3 Legal -> L2 depan', l3Legal, l2FrontChair],
  ['lift L2 strip depan -> L1 meja', l2FrontStrip, l1Desk2],
]
for (const [label, from, to] of crossFloor) {
  checkCrossFloorPath(label, from, walkPath3(from, to, layout), to)
}
// Rute ke slot antre dari ruangan eksekutif L3 TIDAK memotong ruang
// rapat (koridor lift x=5,2 — perbaikan toAisle lift-only).
{
  const path = walkPath3(l3Ceo, l1Desk2, layout)
  check('lift L3 CEO -> slot: lewat koridor lift x=5,2', path.some((p) => eq(p[0], 5.2) && eq(p[1], 2 * FLOOR_HEIGHT)), JSON.stringify(path))
  check('lift L3 CEO -> slot: tidak lurus di x=7,0 (menembus rapat)', !path.some((p, i) => i > 0 && eq(p[0], 7.0) && eq(p[1], 2 * FLOOR_HEIGHT) && eq(path[i - 1][2], 0.4)))
}

// ── 2. Satu lantai (byte-identik dengan sebelum lift-only) ──
const flatPaths: [string, Vec3, Vec3][] = [
  ['datar L1 meja -> lounge', l1Desk, l1Lounge],
  ['datar L1 meeting -> musala', l1Meeting, l1Musala],
  ['datar L2 depan -> belakang', l2FrontChair, l2BackChair],
  ['datar L2 depan -> strip depan', l2FrontChair, l2FrontStrip],
  ['datar L3 CEO -> Legal', l3Ceo, l3Legal],
  ['datar L3 lounge -> lesehan', l3Rest, l3Lesehan],
]
for (const [label, from, to] of flatPaths) {
  checkFlatPath(label, from, walkPath3(from, to, layout), to)
}

// ── 3. Stop idle (Fase 3b): lantai 3 di y=5,6 + antre lift ke sana ──
for (const stop of layout.idleStops) {
  const ok = stop.spots.every((s) => FLOOR_Y.some((y) => eq(s.position[1], y)))
  check(`idle '${stop.key}': semua spot di level lantai`, ok)
}
for (const key of ['tidur', 'balkon', 'lesehan'] as const) {
  const stop = layout.idleStops.find((s) => s.key === key)!
  check(`idle '${key}': di lantai 3 (y=5,6)`, stop.spots.every((s) => eq(s.position[1], 2 * FLOOR_HEIGHT)))
  const path = walkPath3(l1Desk, stop.spots[0].position, layout)
  const endsAtSlot = samePoint(path[path.length - 1], [LIFT_QUEUE_SLOTS[0][0], 0, LIFT_QUEUE_SLOTS[0][1]])
  check(`idle '${key}': dari L1 berakhir di antrean lift (bukan shaft)`, endsAtSlot, `ujung=${JSON.stringify(path[path.length - 1])}`)
}

// ── 4. Slot antre: distinct, di jalur lift, bebas meja/ruangan ──
{
  const slots = LIFT_QUEUE_SLOTS
  const distinct = new Set(slots.map(([x, z]) => `${x},${z}`)).size === slots.length
  check('antre: 6 slot distinct', distinct, `ada ${slots.length}`)
  check('antre: semua slot di jalur lift (z=3,55)', slots.every(([, z]) => eq(z, LIFT_DOOR_Z)))
  check('antre: slot 0 paling dekat pintu (x=7,0)', eq(slots[0][0], 7.0) && slots.every(([x], i) => i === 0 || x < slots[i - 1][0]))
  check('antre: slot di dalam gedung', slots.every(([x, z]) => x > layout.building.minX && x < LIFT.minX && z > 2.95 && z < 4.2))
  let blocked = ''
  for (const [x, z] of slots) {
    for (let f = 1; f <= 3 && blocked === ''; f += 1) {
      const y = FLOOR_Y[f - 1]
      const point: Vec3 = [x, y, z]
      for (const { rect, y: dy } of DESKS) {
        if (eq(y, dy) && segHitsRect(point, point, rect)) { blocked = `slot (${x}, ${z}) di atas meja lantai ${f}`; break }
      }
      if (blocked === '') {
        for (const r of PANTRY_RECTS) if (f === 1 && segHitsRect(point, point, r)) { blocked = `slot (${x}, ${z}) di perabot pantry`; break }
        if (blocked === '' && f === 1 && segHitsRect(point, point, MEETING_TABLE)) blocked = `slot (${x}, ${z}) di meja rapat`
      }
      if (blocked === '' && f === 3) {
        for (const room of [rooms3.commandCenter, rooms3.ceoOffice, rooms3.strategyPm, rooms3.legal, rooms3.execMeeting]) {
          if (x > room.minX && x < room.maxX && z > 0.4 && z < 2.95) { blocked = `slot (${x}, ${z}) di dalam ruangan eksekutif L3`; break }
        }
      }
    }
    if (blocked !== '') break
  }
  check('antre: semua slot bebas meja/ruangan (3 lantai)', blocked === '', blocked)
  // Jalur tiap slot ke pintu lift bebas: segmen slot -> approach lurus di z=3,55.
  let laneBlocked = ''
  for (const [x] of slots) {
    const a: Vec3 = [x, 0, LIFT_DOOR_Z]
    const b: Vec3 = [LIFT_APPROACH[0], 0, LIFT_DOOR_Z]
    for (const r of PANTRY_RECTS) if (segHitsRect(a, b, r)) { laneBlocked = `slot x=${x} -> pintu menabrak pantry`; break }
    if (laneBlocked !== '') break
  }
  check('antre: jalur slot -> pintu lift bebas (lantai 1)', laneBlocked === '', laneBlocked)
}

// ── 5. Reroute di tengah ride / di jalur lift ──
{
  const path = walkPath3([9.0, 1.4, LIFT_CABIN_Z], l1Desk2, layout)
  check('reroute kabin y=1,4 -> L1: keluar di pintu L1', path.some((p) => samePoint(p, [8.5, 0, LIFT_CABIN_Z])) && path.some((p) => samePoint(p, [8.0, 0, LIFT_DOOR_Z])))
  check('reroute kabin y=1,4 -> L1: ujung tepat', samePoint(path[path.length - 1], l1Desk2))
  check('reroute kabin y=1,4 -> L1: y hanya 0', path.every((p) => eq(p[1], 0)))
}
{
  const path = walkPath3([9.0, 4.0, LIFT_CABIN_Z], l3Ceo, layout)
  check('reroute kabin y=4,0 -> L3: keluar di pintu L2', path.some((p) => samePoint(p, [9.0, 2.8, LIFT_CABIN_Z])) && path.some((p) => samePoint(p, [8.5, 2.8, LIFT_CABIN_Z])))
  check('reroute kabin y=4,0 -> L3: berakhir di antrean L2 (bukan L3)', samePoint(path[path.length - 1], [7.0, 2.8, LIFT_DOOR_Z]))
  check('reroute kabin y=4,0 -> L3: y hanya 2,8', path.every((p) => eq(p[1], FLOOR_HEIGHT)))
}
{
  const path = walkPath3([9.0, 5.0, LIFT_CABIN_Z], l1Desk2, layout)
  check('reroute kabin y=5,0 -> L1: keluar di pintu L3', path.some((p) => samePoint(p, [9.0, 5.6, LIFT_CABIN_Z])) && path.some((p) => samePoint(p, [8.5, 5.6, LIFT_CABIN_Z])))
  check('reroute kabin y=5,0 -> L1: berakhir di antrean L3', samePoint(path[path.length - 1], [7.0, 5.6, LIFT_DOOR_Z]))
  check('reroute kabin y=5,0 -> L1: y hanya 5,6', path.every((p) => eq(p[1], 2 * FLOOR_HEIGHT)))
}
{
  const path = walkPath3([6.5, 2 * FLOOR_HEIGHT, LIFT_DOOR_Z], l1Desk2, layout)
  check('reroute jalur L3 (6,5, 3,55) -> L1: keluar via x=5,2', samePoint(path[0], [5.2, 2 * FLOOR_HEIGHT, LIFT_DOOR_Z]))
  check('reroute jalur L3 -> L1: berakhir di antrean L3', samePoint(path[path.length - 1], [7.0, 5.6, LIFT_DOOR_Z]))
  check('reroute jalur L3 -> L1: ujung tepat', path.every((p) => eq(p[1], 2 * FLOOR_HEIGHT)))
}
{
  const path = walkPath3([8.0, 2 * FLOOR_HEIGHT, LIFT_DOOR_Z], l3Ceo, layout)
  check('reroute approach L3 -> CEO: via x=5,2 (tidak potong rapat)', samePoint(path[0], [5.2, 2 * FLOOR_HEIGHT, LIFT_DOOR_Z]))
  const wall = wallViolation(path)
  check('reroute approach L3 -> CEO: dinding utuh', wall === null, wall ?? '')
  check('reroute approach L3 -> CEO: ujung tepat', samePoint(path[path.length - 1], l3Ceo))
}

// ── 6. Tur demo (Fase 7a2 + Fase 6b + AI Campus Fase 3): 22 ruangan, 7 di lantai 3, 4 di lantai 2, 11 di lantai 1 ──
{
  const rooms = demoRooms(layout)
  check('demo: 22 ruangan (15 kantor + 5 mess + 2 outdoor)', rooms.length === 22, `ada ${rooms.length}`)
  check('demo: 7 ruangan lantai 3', rooms.filter((r) => r.floor === 3).length === 7, `ada ${rooms.filter((r) => r.floor === 3).length}`)
  check('demo: 4 ruangan lantai 2 (klaster Tech + kamar mess)', rooms.filter((r) => r.floor === 2).length === 4, `ada ${rooms.filter((r) => r.floor === 2).length}`)
  check('demo: 11 ruangan lantai 1 (5 kantor + 4 mess + 2 outdoor)', rooms.filter((r) => r.floor === 1).length === 11, `ada ${rooms.filter((r) => r.floor === 1).length}`)
  check('demo: 16 ruangan kantor+taman (building office)', rooms.filter((r) => r.building === 'office').length === 16, `ada ${rooms.filter((r) => r.building === 'office').length}`)
  check('demo: 6 ruangan mess+jalur (building residence)', rooms.filter((r) => r.building === 'residence').length === 6, `ada ${rooms.filter((r) => r.building === 'residence').length}`)
  let selfOk = true
  for (const room of rooms) {
    // mess-exterior dikecualikan: center-nya fasad (z = 2), bukan posisi
    // agent — titik interior mana pun di mess dimiliki ruangan mess yang
    // lebih kecil, jadi roomOf(center) tidak bisa mengembalikannya.
    if (room.key === 'mess-exterior') continue
    if (roomOf(room.center, rooms)?.key !== room.key) { selfOk = false; break }
  }
  check('demo: roomOf(pusat) = ruangan itu sendiri (kecuali mess-exterior)', selfOk)
  for (const key of ['tech-frontend', 'tech-backend', 'tech-qa', 'strategy', 'execMeeting'] as const) {
    const room = rooms.find((r) => r.key === key)
    check(`demo: ruangan baru '${key}' ada`, room !== undefined)
    if (room) {
      check(`demo: '${key}' kamera dari depan-atas (offset +y/+z)`, room.offset[1] > 0 && room.offset[2] > 0, `offset=${JSON.stringify(room.offset)}`)
    }
  }
  // 2 stop outdoor AI Campus Fase 3 (disisipkan setelah mess-exterior).
  for (const key of ['taman', 'jalur'] as const) {
    const room = rooms.find((r) => r.key === key)
    check(`demo: stop outdoor '${key}' ada`, room !== undefined)
    if (room) {
      check(`demo: '${key}' kamera dari depan-atas (offset +y/+z)`, room.offset[1] > 0 && room.offset[2] > 0, `offset=${JSON.stringify(room.offset)}`)
      check(`demo: '${key}' lantai 1 (level tanah)`, room.floor === 1, `floor=${room.floor}`)
    }
  }
  const taman = rooms.find((r) => r.key === 'taman')
  const jalur = rooms.find((r) => r.key === 'jalur')
  check(`demo: 'taman' building office (taman bukan gedung)`, taman?.building === 'office', `building=${taman?.building}`)
  check(`demo: 'jalur' building residence (pintu mess)`, jalur?.building === 'residence', `building=${jalur?.building}`)
  check(`demo: 'taman' & 'jalur' setelah 'mess-exterior' di daftar`, rooms.findIndex((r) => r.key === 'taman') === rooms.findIndex((r) => r.key === 'mess-exterior') + 1 && rooms.findIndex((r) => r.key === 'jalur') === rooms.findIndex((r) => r.key === 'mess-exterior') + 2, `urutan=${rooms.map((r) => r.key).join(',')}`)
}

// ── 7. Perbaikan rute QA (Fase 7a2, lift-only) ──
{
  const qaRect: Rect = { minX: 2.12 - 0.95 - 0.24, maxX: 2.12 + 0.95 + 0.24, minZ: 1.8 - 0.475 - 0.24, maxZ: 1.8 + 0.475 + 0.24 }
  const hitsRectOnL2 = (path: Vec3[], rect: Rect) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]
      const b = path[i + 1]
      if (Math.abs(a[1] - b[1]) > 0.01 || !eq(a[1], FLOOR_HEIGHT)) continue
      if (segHitsRect(a, b, rect)) return true
    }
    return false
  }
  const usesCrossLane = (path: Vec3[]) => path.some((p) => eq(p[1], FLOOR_HEIGHT) && eq(p[2], 2.7))
  // Rute lintas lantai walkPath3 BERAKHIR di slot antre lantai asal —
  // kaki L2-nya (setelah turun dari lift) adalah rute satu lantai dari
  // slot 0 L2 ke kursi, yang diuji di bawah ini. Rute yang BERANGKAT
  // dari L2 (ke L1/L3) tetap melintasi L2 dan diuji langsung.
  const qaPaths: [string, Vec3, Vec3][] = [
    ['QA L2 depan -> L1 meja', l2FrontChair, l1Desk2],
    ['QA L2 strip depan -> L1 dapur', l2FrontStrip, l1Dapur],
    ['QA L2 depan -> L3 CEO', l2FrontChair, l3Ceo],
    ['QA L3 CEO -> L2 depan', l3Ceo, l2FrontChair],
  ]
  for (const [label, from, to] of qaPaths) {
    const path = walkPath3(from, to, layout)
    check(`${label}: tidak menembus meja QA (2,12, 1,8)`, !hitsRectOnL2(path, qaRect))
    if (eq(from[1], FLOOR_HEIGHT)) {
      check(`${label}: lewat lorong penyeberangan z=2,7`, usesCrossLane(path))
    }
  }
  // Kaki setelah turun dari lift di L2: slot 0 L2 -> kursi depan.
  const l2Slot0: Vec3 = [LIFT_QUEUE_SLOTS[0][0], FLOOR_HEIGHT, LIFT_QUEUE_SLOTS[0][1]]
  const afterLiftL2 = walkPath3(l2Slot0, l2FrontChair, layout)
  check('QA turun lift L2 -> kursi depan: tidak menembus meja QA (2,12, 1,8)', !hitsRectOnL2(afterLiftL2, qaRect))
  check('QA turun lift L2 -> kursi depan: lewat lorong penyeberangan z=2,7', usesCrossLane(afterLiftL2))
  const collabRect: Rect = { minX: 7.49 - 0.95 - 0.24, maxX: 7.49 + 0.95 + 0.24, minZ: 1.8 - 0.475 - 0.24, maxZ: 1.8 + 0.475 + 0.24 }
  const stripPath = walkPath3(l2FrontStrip, l1Desk2, layout)
  check('QA strip depan L2 -> L1: tidak menembus meja Collaboration (7,49, 1,8)', !hitsRectOnL2(stripPath, collabRect))
  check('QA strip depan L2 -> L1: lewat lorong penyeberangan z=2,7', usesCrossLane(stripPath))
}

// ── 8. Celah antar meja dihitung dari layout (Fase 7a2, lift-only) ──
{
  const deskRectsFor = (lay: OfficeLayout) => {
    const out: { rect: Rect; y: number }[] = []
    const E2 = 0.24
    const add = (x: number, y: number, z: number, rot: number) => {
      const wideX = Math.abs(Math.cos(rot)) > 0.5
      out.push({ rect: { minX: x - (wideX ? 0.95 : 0.475) - E2, maxX: x + (wideX ? 0.95 : 0.475) + E2, minZ: z - (wideX ? 0.475 : 0.95) - E2, maxZ: z + (wideX ? 0.475 : 0.95) + E2 }, y })
    }
    for (const c of lay.techClusters) for (const d of c.desks) add(d.desk[0], d.desk[1], d.desk[2], d.rotation)
    for (const d of lay.execDesks) add(d.desk[0], d.desk[1], d.desk[2], d.rotation)
    return out
  }
  for (const n of [7, 8, 10]) {
    const lay = createLayout(n)
    const rects = deskRectsFor(lay)
    const d1 = chairForDesk(lay.desks[0], 0).position
    const f2 = chairForDesk(lay.techClusters.find((c) => c.row === 'front')!.desks[0].desk, 0).position
    const b2: Vec3 = [-0.25, FLOOR_HEIGHT, 5.5]
    const c3 = chairForDesk(lay.execDesks.find((d) => d.id === 'exec:ceo:0')!.desk, 0).position
    let bad = ''
    for (const [label, from, to] of [['dpn->L1', f2, d1], ['L1->dpn', d1, f2], ['blk->L1', b2, d1], ['dpn->L3', f2, c3]] as [string, Vec3, Vec3][]) {
      const path = walkPath3(from, to, lay)
      for (let i = 0; i < path.length - 1 && bad === ''; i += 1) {
        const a = path[i]
        const b = path[i + 1]
        if (Math.abs(a[1] - b[1]) > 0.01) continue
        for (const { rect, y } of rects) {
          if (eq(a[1], y) && segHitsRect(a, b, rect)) { bad = `${label} seg${i}`; break }
        }
      }
    }
    check(`lebar gedung agent=${n}: rute L2 tanpa tabrakan meja`, bad === '', bad)
  }
}

// ── 9. FSM liftController: FIFO ketat, kapasitas 1, kecepatan + pintu ──
/** Simulasi pengemudi: agent naik saat boardReady, turun saat pintu
 *  terbuka di lantai tujuan. Mengembalikan jejak perjalanan. */
function simulate(ctrl: LiftController, requests: { id: string; from: 1 | 2 | 3; to: 1 | 2 | 3; at: number }[], maxS = 180): {
  events: { id: string; kind: 'board' | 'alight'; t: number }[]
  maxOnboard: number
  maxSpeed: number
  doorRangeOk: boolean
  cabinMovedOnlyWhileTravelling: boolean
  endState: string
} {
  const dt = 0.05
  const events: { id: string; kind: 'board' | 'alight'; t: number }[] = []
  let maxOnboard = 0
  let maxSpeed = 0
  let doorRangeOk = true
  let cabinMovedOnlyWhileTravelling = true
  let prevY = ctrl.getSnapshot().cabinY
  let prevState = ctrl.getSnapshot().state
  const requested = new Set<number>()
  // boardReady tetap true selama jeda 0,5 dtk setelah notifyBoarded
  // (state masih 'boarding') — catat sekali per agent supaya urutan
  // FIFO tidak terhitung ganda.
  const boarded = new Set<string>()
  const alighted = new Set<string>()
  for (let step = 0; step * dt < maxS; step += 1) {
    const t = step * dt
    for (let i = 0; i < requests.length; i += 1) {
      if (!requested.has(i) && t >= requests[i].at) {
        requested.add(i)
        ctrl.requestRide(requests[i].id, requests[i].from, requests[i].to)
      }
    }
    const snap = ctrl.getSnapshot()
    if (snap.doorOpen < -1e-9 || snap.doorOpen > 1 + 1e-9) doorRangeOk = false
    // Pengemudi: naik / turun tepat waktu.
    for (const r of requests) {
      if (!boarded.has(r.id) && ctrl.boardReady(r.id)) {
        boarded.add(r.id)
        ctrl.notifyBoarded(r.id)
        events.push({ id: r.id, kind: 'board', t })
      }
      if (!alighted.has(r.id) && ctrl.riderPosition(r.id) !== null && snap.state === 'alighting') {
        alighted.add(r.id)
        ctrl.notifyAlighted(r.id)
        events.push({ id: r.id, kind: 'alight', t })
      }
    }
    let onboard = 0
    for (const r of requests) if (ctrl.riderPosition(r.id) !== null) onboard += 1
    maxOnboard = Math.max(maxOnboard, onboard)
    ctrl.update(dt)
    const after = ctrl.getSnapshot()
    const dy = Math.abs(after.cabinY - prevY)
    if (dy > 0) {
      maxSpeed = Math.max(maxSpeed, dy / dt)
      if (prevState !== 'toCaller' && prevState !== 'travelling') cabinMovedOnlyWhileTravelling = false
    }
    prevY = after.cabinY
    prevState = after.state
    const done = events.filter((e) => e.kind === 'alight').length === requests.length
    if (done && after.state === 'idle' && requested.size === requests.length) {
      return { events, maxOnboard, maxSpeed, doorRangeOk, cabinMovedOnlyWhileTravelling, endState: after.state }
    }
  }
  return { events, maxOnboard, maxSpeed, doorRangeOk, cabinMovedOnlyWhileTravelling, endState: ctrl.getSnapshot().state }
}
{
  // Dua agent antre FIFO L1->L3: B naik HANYA setelah A turun; kabin
  // tidak pernah berisi 2.
  const ctrl = new LiftController()
  const run = simulate(ctrl, [
    { id: 'A', from: 1, to: 3, at: 0 },
    { id: 'B', from: 1, to: 3, at: 0.5 },
  ])
  const aBoard = run.events.find((e) => e.id === 'A' && e.kind === 'board')?.t
  const aAlight = run.events.find((e) => e.id === 'A' && e.kind === 'alight')?.t
  const bBoard = run.events.find((e) => e.id === 'B' && e.kind === 'board')?.t
  const bAlight = run.events.find((e) => e.id === 'B' && e.kind === 'alight')?.t
  check('FSM: A naik dulu (FIFO)', aBoard !== undefined && bBoard !== undefined && aBoard < bBoard, `A naik ${aBoard}, B naik ${bBoard}`)
  check('FSM: B naik HANYA setelah A turun', aAlight !== undefined && bBoard !== undefined && bBoard > aAlight, `A turun ${aAlight}, B naik ${bBoard}`)
  check('FSM: kabin tidak pernah berisi 2 agent', run.maxOnboard <= 1, `maks ${run.maxOnboard}`)
  check('FSM: kedua agent selesai + idle', bAlight !== undefined && run.endState === 'idle', `akhir=${run.endState}`)
  if (aBoard !== undefined && aAlight !== undefined) {
    // L1->L3: travel 5,6 m / 1,0 m/dtk = 5,6 dtk + 2× pintu 1 dtk.
    const tripS = aAlight - 0
    check('FSM: trip L1->L3 >= 7,6 dtk (5,6 travel + 2× pintu 1 dtk)', tripS >= 7.6, `${tripS.toFixed(2)} dtk`)
    // eslint-disable-next-line no-console
    console.log(`INFO  FSM: trip A L1->L3 ${tripS.toFixed(2)} dtk (naik ${aBoard.toFixed(2)}, turun ${aAlight.toFixed(2)})`)
  } else {
    check('FSM: trip L1->L3 >= 7,6 dtk (5,6 travel + 2× pintu 1 dtk)', false, 'A tidak selesai')
  }
  check('FSM: kecepatan kabin <= 1,0 m/dtk (tidak pernah lebih cepat)', run.maxSpeed <= 1.0 + 1e-6, `${run.maxSpeed.toFixed(3)} m/dtk`)
  check('FSM: doorOpen selalu 0..1', run.doorRangeOk)
  check('FSM: kabin hanya bergerak saat toCaller/travelling', run.cabinMovedOnlyWhileTravelling)
}
{
  // FIFO global lintas lantai: C (L3->L1) antre setelah A,B — dilayani
  // terakhir meski dari lantai lain.
  const ctrl = new LiftController()
  const run = simulate(ctrl, [
    { id: 'A', from: 1, to: 3, at: 0 },
    { id: 'B', from: 1, to: 2, at: 0.2 },
    { id: 'C', from: 3, to: 1, at: 0.4 },
  ])
  const order = run.events.filter((e) => e.kind === 'board').map((e) => e.id).join(',')
  check('FSM: urutan naik A,B,C (FIFO global)', order === 'A,B,C', `urutan=${order}`)
  check('FSM: kabin tidak pernah berisi 2 (3 agent)', run.maxOnboard <= 1, `maks ${run.maxOnboard}`)
}
{
  // Request ulang saat menunggu = ganti tujuan, posisi antre TETAP.
  // (Dikemudikan manual: simulate() dengan daftar kosong langsung
  // selesai — request sudah antre di controller sebelum simulasi.)
  const ctrl = new LiftController()
  ctrl.requestRide('A', 1, 2)
  ctrl.requestRide('B', 1, 3)
  const before = ctrl.queuePosition('A')
  ctrl.requestRide('A', 1, 3)
  check('FSM: retarget saat menunggu — posisi antre tetap', ctrl.queuePosition('A') === before && before === 0, `sebelum=${before}, sesudah=${ctrl.queuePosition('A')}`)
  const dt = 0.05
  let aBoarded = false
  let aAlightedFloor: number | null = null
  for (let step = 0; step * dt < 60; step += 1) {
    if (ctrl.boardReady('A')) { ctrl.notifyBoarded('A'); aBoarded = true }
    if (aBoarded && aAlightedFloor === null && ctrl.riderPosition('A') !== null && ctrl.getSnapshot().state === 'alighting') {
      aAlightedFloor = ctrl.getSnapshot().cabinFloor
      ctrl.notifyAlighted('A')
      break
    }
    ctrl.update(dt)
  }
  check('FSM: retarget saat menunggu — A turun di L3 (bukan L2)', aBoarded && aAlightedFloor === 3, `turun di L${aAlightedFloor}`)
}
{
  // Request ulang saat riding: selesaikan trip ini, baru antre lagi.
  const ctrl = new LiftController()
  ctrl.requestRide('A', 1, 2)
  const dt = 0.05
  let alightedAtL2 = false
  let requeued = false
  for (let step = 0; step * dt < 60; step += 1) {
    if (ctrl.boardReady('A')) ctrl.notifyBoarded('A')
    if (ctrl.riderPosition('A') !== null && ctrl.getSnapshot().state === 'alighting') ctrl.notifyAlighted('A')
    // Di tengah ride (kabin naik), minta tujuan baru L3.
    if (ctrl.getSnapshot().state === 'travelling') ctrl.requestRide('A', 1, 3)
    const snap = ctrl.getSnapshot()
    if (snap.state === 'idle' && snap.cabinFloor === 2 && !alightedAtL2) {
      alightedAtL2 = true
      requeued = ctrl.queuePosition('A') >= 0
    }
    ctrl.update(dt)
    if (alightedAtL2 && snap.state === 'idle') break
  }
  check('FSM: retarget saat riding — turun dulu di L2', alightedAtL2)
  check('FSM: retarget saat riding — antre lagi L2->L3 setelah turun', requeued)
}
{
  // Kamera: antre di belakang agent, tidak merebut kabin, tidak makan
  // kapasitas — trip kamera jalan SETELAH trip agent selesai.
  const ctrl = new LiftController()
  ctrl.requestRide('A', 1, 3)
  ctrl.requestCameraRide(1, 2)
  const dt = 0.05
  let cameraStartedWhileAgentActive = false
  let cameraCompleted = false
  let agentDoneFirst = false
  for (let step = 0; step * dt < 120; step += 1) {
    const snap = ctrl.getSnapshot()
    if (snap.cameraActive && (snap.servingFloor === 3 || ctrl.queuePosition('A') >= 0)) cameraStartedWhileAgentActive = true
    if (ctrl.boardReady('A')) ctrl.notifyBoarded('A')
    if (ctrl.riderPosition('A') !== null && snap.state === 'alighting') {
      ctrl.notifyAlighted('A')
      agentDoneFirst = true
    }
    ctrl.update(dt)
    const after = ctrl.getSnapshot()
    if (agentDoneFirst && !after.cameraActive && after.cabinFloor === 2 && after.state === 'idle') { cameraCompleted = true; break }
  }
  check('FSM: kamera tidak merebut kabin dari agent', !cameraStartedWhileAgentActive)
  check('FSM: trip kamera selesai setelah agent (kabin di L2, idle)', cameraCompleted)
}
{
  // queuePosition per lantai: A aktif L1 (0), B antre L1 (1), C antre L3 (0).
  const ctrl = new LiftController()
  ctrl.requestRide('A', 1, 3)
  ctrl.requestRide('B', 1, 3)
  ctrl.requestRide('C', 3, 1)
  ctrl.update(0.05) // A jadi trip aktif
  check('FSM: slot A (aktif, L1) = 0', ctrl.queuePosition('A') === 0, `${ctrl.queuePosition('A')}`)
  check('FSM: slot B (antre, L1) = 1', ctrl.queuePosition('B') === 1, `${ctrl.queuePosition('B')}`)
  check('FSM: slot C (antre, L3) = 0', ctrl.queuePosition('C') === 0, `${ctrl.queuePosition('C')}`)
  check('FSM: queueLength = 2 (B + C menunggu)', ctrl.getSnapshot().queueLength === 2, `${ctrl.getSnapshot().queueLength}`)
  check('FSM: agent tak dikenal = -1', ctrl.queuePosition('Z') === -1)
  // Batal antrean: B keluar, C tetap.
  ctrl.cancelRide('B')
  check('FSM: cancelRide — B hilang, C tetap antre', ctrl.queuePosition('B') === -1 && ctrl.queuePosition('C') === 0)
}
{
  // Snapshot awal: kabin di L1, pintu tertutup, idle.
  const ctrl = new LiftController()
  const snap = ctrl.getSnapshot()
  check('FSM: snapshot awal idle, kabin L1, pintu tertutup', snap.state === 'idle' && snap.cabinFloor === 1 && snap.cabinY === 0 && snap.doorOpen === 0 && snap.servingFloor === null && snap.queueLength === 0)
}

// ── 10. Tidak ada referensi tangga di kode scene/demo ──
{
  const here = dirname(fileURLToPath(import.meta.url))
  const files = [
    '../components/kantor/scene/office3d-layout.ts',
    '../components/kantor/scene/environment.tsx',
    '../components/kantor/Office3D.tsx',
    '../components/kantor/scene/demo-tour.ts',
    '../components/kantor/scene/lift-controller.ts',
  ]
  for (const rel of files) {
    const src = readFileSync(join(here, rel), 'utf8')
    // 'Upstairs' adalah label ruangan (Lesehan Upstairs), bukan tangga.
    // Fase 4b: tangga MESS dikecualikan — mess adalah gedung terpisah di
    // timur kantor dan desain Residence memang memakai tangga di dalam
    // mess (bukan lift); larangan tangga di sini hanya berlaku untuk
    // gedung KANTOR (lift-only, keputusan 2026-11-23). Baris kode/komentar
    // mess dikenali dari kata mess/RES_/residence/kasur/Fase 4/spine —
    // kode kantor tidak memakai kata-kata itu (semua 40 kemunculan
    // tangga/stair di office3d-layout.ts adalah mess; diverifikasi
    // 2026-11-23 sebelum pengecualian ini ditulis).
    const cleaned = src
      .replace(/Upstairs/g, '')
      .replace(/upstairs/g, '')
      .split('\n')
      .filter((line) => !/mess|RES_|residence|kasur|Fase 4|spine/i.test(line))
      .join('\n')
    const hit = cleaned.match(/tangga|stair/i)
    check(`referensi: ${rel.split('/').pop()} tanpa kata tangga/stair`, hit === null, hit ? `"...${cleaned.slice(Math.max(0, (hit.index ?? 0) - 30), (hit.index ?? 0) + 30)}..."` : '')
  }
}

// eslint-disable-next-line no-console
console.log(failures === 0 ? `\nSemua ${total} cek Fase 5b lolos.` : `\n${failures} dari ${total} cek GAGAL.`)
process.exit(failures === 0 ? 0 : 1)
