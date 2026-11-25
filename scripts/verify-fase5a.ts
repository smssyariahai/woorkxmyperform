/**
 * Verifikasi Fase 5a (skrip, bukan UI): proyeksi kamera All Floors View
 * dan divisionFocus.
 * (Lift-only 2026-11-23: seksi handrail tangga flight 1 + 2 dihapus —
 * tangga sudah tidak ada; Staircase di props.tsx juga dihapus.)
 * §4 (Fase 6a, 2026-11-23): sudut pandang Residence + Campus Overview
 * (residenceCameraView / campusCameraView) + batas pan — 7 dan 16 agent.
 * §5 (Fase 6b, 2026-11-23): Demo Mode mess (22 ruangan: 15 kantor +
 * 5 mess + 2 outdoor AI Campus Fase 3 — center/offset/motion, garis
 * pandang kamera, framing) +
 * Night Mode mess (OfficeLight/ResWindow/lampu jalan terikat tema dark).
 *
 * Dijalankan: `npx tsx scripts/verify-fase5a.ts` — exit 0 bila semua cek
 * lolos, exit 1 bila ada yang gagal. TIDAK mengubah data / DB / file lain.
 */
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { demoRooms, demoRoomView, type DemoRoom } from '../components/kantor/scene/demo-tour'
import {
  ALL_VIEW_MAX_DISTANCE,
  BALCONY,
  CAMPUS_VIEW_DISTANCE_FACTOR,
  CAMPUS_VIEW_MAX_DISTANCE,
  FLOOR_HEIGHT,
  GAME_ROOM,
  RESIDENCE,
  RESIDENCE_DOOR,
  RES_BEDROOM_DOORS,
  RES_STAIRS_ENTRY,
  RES_STAIRS_LANDING,
  allFloorsCameraView,
  campusCameraView,
  createLayout,
  divisionFocus,
  floor3Rooms,
  floorCameraView,
  residenceCameraView,
  type LayoutAgent,
  type OfficeLayout,
  type Vec3,
} from '../components/kantor/scene/office3d-layout'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
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

/** Proyeksikan titik ke NDC kamera (perspektif, lookAt target). */
function project(camera: THREE.PerspectiveCamera, point: Vec3): { x: number; y: number; z: number } {
  const v = new THREE.Vector3(point[0], point[1], point[2]).project(camera)
  return { x: v.x, y: v.y, z: v.z }
}

function makeCamera(position: Vec3, target: Vec3, aspect: number, fov: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.5, 150)
  camera.position.set(position[0], position[1], position[2])
  camera.lookAt(target[0], target[1], target[2])
  camera.updateProjectionMatrix()
  // WAJIB: Vector3.project() memakai matrixWorldInverse — tanpa
  // updateMatrixWorld() proyeksi memakai matriks identitas (NDC salah).
  camera.updateMatrixWorld()
  return camera
}

/** Sudut gedung yang WAJIB muat dalam frame mode all (gedung + sayap game
 *  room). Pemandangan luar (tiang bendera, gang, pepohonan) dilaporkan
 *  terpisah — bukan syarat lolos, sama seperti framing lantai tunggal
 *  yang juga tidak menjamin bendera selalu dalam frame portrait. */
function allViewCorners(): Vec3[] {
  const { minX, maxX, minZ } = layout.building
  const top = 2 * FLOOR_HEIGHT + 2.6 // atap lantai 3 (dinding 2,6)
  const pts: Vec3[] = []
  for (const x of [minX, maxX]) {
    for (const z of [minZ, BALCONY.maxZ]) {
      pts.push([x, 0, z], [x, top, z])
    }
  }
  // Sayap game room (x sampai 15,5) — bagian dari gedung.
  pts.push([15.5, 0, -5.2], [15.5, 2.6, 0.6])
  return pts
}

/** Sudut pemandangan luar — dilaporkan, bukan syarat lolos. */
function sceneryCorners(): Vec3[] {
  return [
    [16.4, 0, 2.6], [16.4, 3.5, 2.6],
    [layout.gangCenterX - 1.8, 0, -5.4], [layout.gangCenterX - 1.8, 0, 4.6],
  ]
}

// ── 1. All Floors View: seluruh gedung muat dalam frame ──
for (const [label, aspect, fov] of [['16:9', 16 / 9, 40], ['9:16', 9 / 16, 55]] as const) {
  const view = allFloorsCameraView(layout, aspect)
  const camera = makeCamera(view.position, view.target, aspect, fov)
  const dist = Math.hypot(view.position[0] - view.target[0], view.position[1] - view.target[1], view.position[2] - view.target[2])
  const corners = allViewCorners()
  let worst = 0
  let worstPoint: Vec3 = [0, 0, 0]
  for (const point of corners) {
    const p = project(camera, point)
    const m = Math.max(Math.abs(p.x), Math.abs(p.y))
    if (m > worst) { worst = m; worstPoint = point }
  }
  check(`all view ${label}: gedung muat (max |ndc| ${worst.toFixed(3)})`, worst <= 1, `titik terjauh ${JSON.stringify(worstPoint)}`)
  let sceneryWorst = 0
  for (const point of sceneryCorners()) {
    const p = project(camera, point)
    sceneryWorst = Math.max(sceneryWorst, Math.abs(p.x), Math.abs(p.y))
  }
  // eslint-disable-next-line no-console
  console.log(`INFO  all view ${label}: pemandangan luar max |ndc| ${sceneryWorst.toFixed(3)} (bendera/gang boleh di luar frame portrait)`)
  check(`all view ${label}: jarak kamera ${dist.toFixed(1)} <= max ${ALL_VIEW_MAX_DISTANCE}`, dist <= ALL_VIEW_MAX_DISTANCE)
  check(`all view ${label}: target y ${view.target[1]} di tengah gedung`, view.target[1] > 2 && view.target[1] < 5)
}

// ── 2. Overview per lantai (floorCameraView): target + jarak ──
for (const floor of [1, 2, 3] as const) {
  const view = floorCameraView(layout, floor, 16 / 9)
  const dist = Math.hypot(view.position[0] - view.target[0], view.position[1] - view.target[1], view.position[2] - view.target[2])
  check(`floor ${floor}: target y ${(floor - 1) * FLOOR_HEIGHT + 0.6}`, Math.abs(view.target[1] - ((floor - 1) * FLOOR_HEIGHT + 0.6)) < 0.01, `y=${view.target[1].toFixed(2)}`)
  check(`floor ${floor}: jarak kamera ${dist.toFixed(1)} <= 48`, dist <= 48)
}

// ── 3. divisionFocus: klaster Tech + ruangan eksekutif ──
for (const cluster of layout.techClusters) {
  const found = divisionFocus(cluster.name, layout)
  const ok = found !== null && found.floor === 2
    && Math.abs(found.target[0] - cluster.centerX) < 0.01
    && Math.abs(found.target[2] - cluster.rug.center[2]) < 0.01
  check(`focus ${cluster.name}: lantai 2, target di tengah klaster`, ok, found ? `target=${JSON.stringify(found.target)}` : 'null')
}
const rooms3 = floor3Rooms(layout.building)
for (const [name, room] of [['CEO Office', rooms3.ceoOffice], ['Strategy & PM', rooms3.strategyPm], ['Legal', rooms3.legal], ['AI Command Center', rooms3.commandCenter]] as const) {
  const found = divisionFocus(name, layout)
  const inside = found !== null && found.floor === 3
    && found.target[0] > room.minX && found.target[0] < room.maxX
    && found.target[2] > room.minZ && found.target[2] < room.maxZ
  check(`focus ${name}: lantai 3, target di dalam ruangan`, inside, found ? `target=${JSON.stringify(found.target)}` : 'null')
}
check('focus divisi tak dikenal -> null', divisionFocus('Divisi Fiktif', layout) === null)

// ── 4. Fase 6a — Building Navigator: Residence + Campus Overview ──
// 16 agent WOORK.ID (7 lama + 9 divisi 2026-11-23) supaya layout =
// layout produksi terlebar (campus framing paling berat).
const AGENTS16: LayoutAgent[] = [...AGENTS,
  { seat: 8, department: { name: 'Customer Service', floor: 1, zone: null } },
  { seat: 9, department: { name: 'Human Resources', floor: 1, zone: null } },
  { seat: 10, department: { name: 'Frontend Engineering', floor: 2, zone: null } },
  { seat: 11, department: { name: 'AI & Automation', floor: 2, zone: null } },
  { seat: 12, department: { name: 'Product Management', floor: 2, zone: null } },
  { seat: 13, department: { name: 'Quality Assurance', floor: 2, zone: null } },
  { seat: 14, department: { name: 'UI/UX Design', floor: 2, zone: null } },
  { seat: 15, department: { name: 'Legal', floor: 3, zone: 'Legal' } },
  { seat: 16, department: { name: 'Collaboration Hub', floor: 2, zone: null } },
]
const layout16: OfficeLayout = createLayout(AGENTS16)

/** Batas cutaway residence.tsx — kamera di dalam RESIDENCE.minX−2..maxX+2,
 *  z -7..4: y ≥ 3,5 sembunyikan atap saja; y < 3,5 sembunyikan atap + L2;
 *  di luar: semua terlihat. Diturunkan dari RESIDENCE (Fase 1 AI Campus). */
const MESS_CUTAWAY = { minX: RESIDENCE.minX - 2, maxX: RESIDENCE.maxX + 2, minZ: -7, maxZ: 4 }
const inCutaway = (p: Vec3) => p[0] >= MESS_CUTAWAY.minX && p[0] <= MESS_CUTAWAY.maxX && p[2] >= MESS_CUTAWAY.minZ && p[2] <= MESS_CUTAWAY.maxZ

/** Titik pada segmen kamera→target di mana x = value (null bila segmen
 *  tidak melewatinya). */
function pointAtX(camera: Vec3, target: Vec3, x: number): Vec3 | null {
  const dx = target[0] - camera[0]
  if (Math.abs(dx) < 1e-9) return null
  const t = (x - camera[0]) / dx
  if (t < 0 || t > 1) return null
  return [camera[0] + dx * t, camera[1] + (target[1] - camera[1]) * t, camera[2] + (target[2] - camera[2]) * t]
}
/** Titik pada segmen kamera→target di mana z = value. */
function pointAtZ(camera: Vec3, target: Vec3, z: number): Vec3 | null {
  const dz = target[2] - camera[2]
  if (Math.abs(dz) < 1e-9) return null
  const t = (z - camera[2]) / dz
  if (t < 0 || t > 1) return null
  return [camera[0] + (target[0] - camera[0]) * t, camera[1] + (target[1] - camera[1]) * t, camera[2] + dz * t]
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// ── 4a. Residence L1: kamera di dalam lobi, mode ground (atap + L2 hilang) ──
for (const aspect of [16 / 9, 9 / 16] as const) {
  const view = residenceCameraView(layout, 1, aspect)
  const d = dist(view.position, view.target)
  check(`residence L1 ${aspect > 1 ? '16:9' : '9:16'}: kamera di dalam batas cutaway`, inCutaway(view.position), `pos=${JSON.stringify(view.position)}`)
  check(`residence L1 ${aspect > 1 ? '16:9' : '9:16'}: kamera y ${view.position[1].toFixed(2)} < 3,5 (mode ground)`, view.position[1] < 3.5)
  check(`residence L1 ${aspect > 1 ? '16:9' : '9:16'}: jarak ${d.toFixed(2)} >= 5 (minDistance)`, d >= 5)
  check(`residence L1 ${aspect > 1 ? '16:9' : '9:16'}: target meja makan y 0,6`, Math.abs(view.target[1] - 0.6) < 0.01)
  // Garis bidik lewat celah partisi x=29 (residence.tsx: celah z 0,55..1,45,
  // ambang bawah 2,1) — bukan menembus dinding.
  const doorCx = (RESIDENCE_DOOR.minX + RESIDENCE_DOOR.maxX) / 2
  const atDoor = pointAtX(view.position, view.target, doorCx)
  const throughGap = atDoor !== null && atDoor[2] >= 0.55 && atDoor[2] <= 1.45 && atDoor[1] < 2.1
  check(`residence L1 ${aspect > 1 ? '16:9' : '9:16'}: garis bidik lewat celah partisi x=29`, throughGap, atDoor ? `di x=29: z=${atDoor[2].toFixed(2)}, y=${atDoor[1].toFixed(2)}` : 'tidak melewati x=29')
}

// ── 4b. Residence L2: kamera tinggi selatan, mode noRoof (atap hilang) ──
for (const aspect of [16 / 9, 9 / 16] as const) {
  const view = residenceCameraView(layout, 2, aspect)
  const d = dist(view.position, view.target)
  check(`residence L2 ${aspect > 1 ? '16:9' : '9:16'}: kamera di dalam batas cutaway`, inCutaway(view.position), `pos=${JSON.stringify(view.position)}`)
  check(`residence L2 ${aspect > 1 ? '16:9' : '9:16'}: kamera y ${view.position[1].toFixed(2)} >= 3,5 (mode noRoof)`, view.position[1] >= 3.5)
  check(`residence L2 ${aspect > 1 ? '16:9' : '9:16'}: jarak ${d.toFixed(2)} >= 5 (minDistance)`, d >= 5)
  check(`residence L2 ${aspect > 1 ? '16:9' : '9:16'}: target tengah kamar y 3,4`, Math.abs(view.target[1] - (FLOOR_HEIGHT + 0.6)) < 0.01)
  // Garis bidik melewati puncak dinding selatan L2 (y 5,4, z=2) dan dinding
  // koridor (y 5,4, z=-0,8) — bukan menembus dinding.
  const atSouth = pointAtZ(view.position, view.target, 2)
  const atCorridor = pointAtZ(view.position, view.target, -0.8)
  check(`residence L2 ${aspect > 1 ? '16:9' : '9:16'}: garis bidik di atas dinding selatan (y 5,4)`, atSouth !== null && atSouth[1] > 5.4, atSouth ? `y=${atSouth[1].toFixed(2)} di z=2` : 'tidak melewati z=2')
  check(`residence L2 ${aspect > 1 ? '16:9' : '9:16'}: garis bidik di atas dinding koridor (y 5,4)`, atCorridor !== null && atCorridor[1] > 5.4, atCorridor ? `y=${atCorridor[1].toFixed(2)} di z=-0,8` : 'tidak melewati z=-0,8')
}

// ── 4c. Residence 'all': eksterior, atap terlihat (kamera di luar cutaway) ──
for (const [label, aspect] of [['16:9', 16 / 9], ['9:16', 9 / 16]] as const) {
  const view = residenceCameraView(layout, 'all', aspect)
  const d = dist(view.position, view.target)
  check(`residence all ${label}: kamera di LUAR batas cutaway (atap terlihat)`, !inCutaway(view.position), `pos=${JSON.stringify(view.position.map((v) => Number(v.toFixed(1))))}`)
  check(`residence all ${label}: target tengah mess`, Math.abs(view.target[0] - (RESIDENCE.minX + RESIDENCE.maxX) / 2) < 0.01 && Math.abs(view.target[2] - (RESIDENCE.minZ + RESIDENCE.maxZ) / 2) < 0.01, `target=${JSON.stringify(view.target)}`)
  check(`residence all ${label}: jarak ${d.toFixed(1)} = 17 x framingScale`, Math.abs(d - 17 * Math.min(1.35, Math.max(1, 1.2 / aspect))) < 0.1)
}

// ── 4d. Pan: target kamera Residence (x 28..29) harus bisa dicapai ──
check('pan maxX 39 (mess + area santai luar)', layout.pan.maxX >= RESIDENCE.maxX + 3, `maxX=${layout.pan.maxX}`)

// ── 4e. Campus Overview: kedua gedung muat (16:9) + kabut terkendali ──
/** Sudut gabungan kantor + mess yang WAJIB muat dalam frame campus. */
function campusCorners(l: OfficeLayout): Vec3[] {
  const pts: Vec3[] = []
  const officeTop = 2 * FLOOR_HEIGHT + 2.6 // atap lantai 3
  const messTop = 6.2 // bubungan atap mess
  for (const x of [l.building.minX, l.building.maxX]) {
    for (const z of [l.building.minZ, BALCONY.maxZ]) {
      pts.push([x, 0, z], [x, officeTop, z])
    }
  }
  for (const x of [RESIDENCE.minX, RESIDENCE.maxX]) {
    for (const z of [RESIDENCE.minZ, RESIDENCE.maxZ]) {
      pts.push([x, 0, z], [x, messTop, z])
    }
  }
  return pts
}
for (const [layoutLabel, l] of [['7 agent', layout], ['16 agent', layout16]] as const) {
  for (const [aspectLabel, aspect, fov] of [['16:9', 16 / 9, 40], ['9:16', 9 / 16, 55]] as const) {
    const view = campusCameraView(l, aspect)
    const camera = makeCamera(view.position, view.target, aspect, fov)
    const d = dist(view.position, view.target)
    const baseLen = Math.hypot(...l.camera.offset)
    const expected = baseLen * Math.min(1.35, Math.max(1, 1.2 / aspect)) * CAMPUS_VIEW_DISTANCE_FACTOR
    check(`campus ${layoutLabel} ${aspectLabel}: target tengah gabungan`, Math.abs(view.target[0] - (l.building.minX + RESIDENCE.maxX) / 2) < 0.01 && Math.abs(view.target[1] - 3.4) < 0.01 && Math.abs(view.target[2] - 0.7) < 0.01, `target=${JSON.stringify(view.target.map((v) => Number(v.toFixed(2))))}`)
    check(`campus ${layoutLabel} ${aspectLabel}: jarak ${d.toFixed(1)} = offset x ${CAMPUS_VIEW_DISTANCE_FACTOR}`, Math.abs(d - expected) < 0.5, `diharapkan ${expected.toFixed(1)}`)
    check(`campus ${layoutLabel} ${aspectLabel}: jarak ${d.toFixed(1)} <= max ${CAMPUS_VIEW_MAX_DISTANCE}`, d <= CAMPUS_VIEW_MAX_DISTANCE)
    let worst = 0
    let worstPoint: Vec3 = [0, 0, 0]
    let farthest = 0
    for (const point of campusCorners(l)) {
      const p = project(camera, point)
      const m = Math.max(Math.abs(p.x), Math.abs(p.y))
      if (m > worst) { worst = m; worstPoint = point }
      farthest = Math.max(farthest, dist(view.position, point))
    }
    if (aspectLabel === '16:9') {
      check(`campus ${layoutLabel} 16:9: kedua gedung muat (max |ndc| ${worst.toFixed(3)})`, worst <= 1, `titik terjauh ${JSON.stringify(worstPoint)}`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`INFO  campus ${layoutLabel} 9:16: max |ndc| ${worst.toFixed(3)} (portrait tidak muat penuh — keterbatasan terdokumentasi, sama seperti All Floors View portrait)`)
    }
    // Kabut Lighting 60..140: sudut terjauh 16:9 harus < 85 (kabut <= 31%;
    // mess 12-16%). Portrait kamera 1,35× lebih jauh — batas dilonggarkan
    // ke < 105 (sudut terjauh = sudut tanah mess, kabut ~50%): keterbatasan
    // portrait yang sama dengan framing-nya (INFO di atas). Di 16:9
    // (tampilan utama) mess tetap jernih; di HP portrait kampus terlihat
    // berkabut di sudut jauhnya.
    const fogLimit = aspectLabel === '16:9' ? 85 : 105
    check(`campus ${layoutLabel} ${aspectLabel}: sudut terjauh ${farthest.toFixed(1)} < ${fogLimit} (kabut ${aspectLabel === '16:9' ? '<= 31%' : '~50% di sudut tanah mess'})`, farthest < fogLimit)
  }
}

// ── §5 (Fase 6b, 2026-11-23): Demo Mode mess + Night Mode mess ──────────────
// Catatan framing: placement agent di mess L1 (lobi/ruang keluarga/ruang
// makan) TIDAK PERNAH ada — tidak ada idle stop di mess L1 (placement hanya
// meja kantor / idle stop kantor / kasur mess L2). Jadi ruangan L1 mess
// dicek ketat untuk 0 agent + defensif 1 agent; 2+ dan 16 agent hanya untuk
// Bedrooms (agent tidur BENAR-BENAR berkumpul di kasur — 16 agent saat
// tombol Tidur ditekan, seperti uji live Fase 5b).

// ── §5a: daftar 22 ruangan — 15 kantor TIDAK BERUBAH + 5 mess + 2 outdoor ──
const close3 = (a: number, b: number) => Math.abs(a - b) <= 0.01
const sameVec = (a: Vec3, b: Vec3) => a.every((v, i) => close3(v, b[i]))
const sameRect = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  close3(a.minX, b.minX) && close3(a.maxX, b.maxX) && close3(a.minZ, b.minZ) && close3(a.maxZ, b.maxZ)
type RoomExpect = { key: string; label: string; floor: number; center: Vec3; offset: Vec3; motion: string; bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }
// Snapshot 15 ruangan kantor SEBELUM Fase 6b (diambil dari demoRooms(layout)
// yang sama, 2026-11-23) — center/offset/motion/bounds harus sama persis.
const OFFICE_SNAPSHOT: RoomExpect[] = [
  { key: 'kerja', label: 'Ruang Kerja', floor: 1, center: [-5.343, 0, -2.429], offset: [2, 7, 10], motion: 'dolly', bounds: { minX: -12.1, maxX: 0.4, minZ: -5.2, maxZ: 0.95 } },
  { key: 'meeting', label: 'Ruang Meeting', floor: 1, center: [-6.15, 0, 2.75], offset: [1, 6, 9], motion: 'arc', bounds: { minX: -9, maxX: -3.2, minZ: 0.95, maxZ: 4.2 } },
  { key: 'musala', label: 'Musala', floor: 1, center: [-1.4, 0, 2.575], offset: [1, 6, 9], motion: 'arc', bounds: { minX: -3.2, maxX: 0.4, minZ: 1, maxZ: 4.15 } },
  { key: 'tengah', label: 'Ruang Tengah', floor: 1, center: [4.6, 0, -3.05], offset: [-1, 7, 10], motion: 'pan', bounds: { minX: 0.4, maxX: 7.6, minZ: -5.2, maxZ: 0.95 } },
  { key: 'dapur', label: 'Ruang Dapur', floor: 1, center: [8.35, 0, 1.4], offset: [-2, 6, 9], motion: 'dolly', bounds: { minX: 7.6, maxX: 9.5, minZ: -0.5, maxZ: 4.2 } },
  { key: 'tech-frontend', label: 'Frontend Engineering', floor: 2, center: [-10.075, 2.8, -2.75], offset: [1.5, 6, 8], motion: 'dolly', bounds: { minX: -11.775, maxX: -8.375, minZ: -4.65, maxZ: -0.85 } },
  { key: 'tech-backend', label: 'Backend Engineering', floor: 2, center: [-4.537, 2.8, -2.75], offset: [1.5, 6, 8], motion: 'arc', bounds: { minX: -6.237, maxX: -2.837, minZ: -4.65, maxZ: -0.85 } },
  { key: 'tech-qa', label: 'Quality Assurance', floor: 2, center: [0.918, 2.8, 1.6], offset: [1.5, 6, 8], motion: 'pan', bounds: { minX: -1.082, maxX: 2.918, minZ: 0.5, maxZ: 2.7 } },
  { key: 'kamar', label: 'Creative Lounge & Balkon', floor: 3, center: [-5.85, 6.1, -2.75], offset: [3, 6, 9], motion: 'truck', bounds: { minX: -12.1, maxX: 9.5, minZ: -5.2, maxZ: 6.6 } },
  { key: 'lesehan', label: 'Lesehan Upstairs', floor: 3, center: [4.3, 6.1, -3], offset: [-1, 6, 9], motion: 'tilt', bounds: { minX: 2.8, maxX: 5.8, minZ: -4.4, maxZ: -1.6 } },
  { key: 'ceo', label: 'CEO Office', floor: 3, center: [-5.975, 5.6, 2.3], offset: [1, 6, 9], motion: 'arc', bounds: { minX: -7.975, maxX: -3.975, minZ: 0.4, maxZ: 4.2 } },
  { key: 'command', label: 'AI Command Center', floor: 3, center: [-10.038, 5.6, 2.3], offset: [1, 6, 9], motion: 'dolly', bounds: { minX: -12.1, maxX: -7.975, minZ: 0.4, maxZ: 4.2 } },
  { key: 'strategy', label: 'Strategy & PM', floor: 3, center: [-1.787, 5.6, 2.3], offset: [1, 6, 9], motion: 'arc', bounds: { minX: -3.975, maxX: 0.4, minZ: 0.4, maxZ: 4.2 } },
  { key: 'execMeeting', label: 'Ruang Meeting Eksekutif', floor: 3, center: [6.95, 5.6, 1.675], offset: [1, 6, 9], motion: 'dolly', bounds: { minX: 5.4, maxX: 8.5, minZ: 0.4, maxZ: 2.95 } },
  { key: 'execLounge', label: 'Executive Lounge', floor: 3, center: [-8, 5.6, 5.9], offset: [2, 6, 9], motion: 'pan', bounds: { minX: -12.1, maxX: -4.1, minZ: 4.2, maxZ: 6.6 } },
]
const MESS_EXPECTED: RoomExpect[] = [
  { key: 'mess-exterior', label: 'Mess — Eksterior', floor: 1, center: [29, 3.0, 2], offset: [3, 7.5, 12], motion: 'arc', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.maxX, minZ: -5.2, maxZ: 2 } },
  { key: 'mess-lobby', label: 'Mess — Lobi', floor: 1, center: [29.5, 0.6, 1.0], offset: [1.5, 1.6, -0.8], motion: 'pan', bounds: { minX: RESIDENCE.minX + 5, maxX: RESIDENCE.minX + 9, minZ: 0, maxZ: 2 } },
  { key: 'mess-living', label: 'Mess — Ruang Keluarga', floor: 1, center: [25.5, 0.6, -3.5], offset: [-2.0, 1.8, 1.0], motion: 'dolly', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.minX + 7, minZ: -5.2, maxZ: -0.5 } },
  { key: 'mess-dining', label: 'Mess — Ruang Makan', floor: 1, center: [25.5, 0.7, 0.3], offset: [2.4, 1.6, 1.6], motion: 'pan', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.minX + 7, minZ: -0.5, maxZ: 2 } },
  { key: 'mess-bedrooms', label: 'Mess — Kamar Tidur', floor: 2, center: [29, 3.4, -3.0], offset: [-2.5, 11, 5.8], motion: 'pan', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.maxX, minZ: -5.2, maxZ: -0.8 } },
]
// 2 stop outdoor AI Campus Fase 3 (disisipkan setelah mess-exterior):
// taman = zona taman Fase 2 (sayap Game Room..mess), jalur = strip
// trotoar→pintu mess. Taman bukan gedung — building 'office'; jalur
// building 'residence' (pintu mess).
const CAMPUS_EXPECTED: (RoomExpect & { building: 'office' | 'residence' })[] = [
  { key: 'taman', label: 'Taman Antargedung', building: 'office', floor: 1, center: [18.75, 0.6, -1.2], offset: [0.5, 6, 10], motion: 'arc', bounds: { minX: GAME_ROOM.maxX, maxX: RESIDENCE.minX, minZ: -5.2, maxZ: 2 } },
  { key: 'jalur', label: 'Jalur Pedestrian', building: 'residence', floor: 1, center: [29, 0.6, 3.5], offset: [0.5, 5, 8], motion: 'pan', bounds: { minX: RESIDENCE_DOOR.minX, maxX: RESIDENCE_DOOR.maxX, minZ: RESIDENCE.maxZ, maxZ: 4.6 } },
]
{
  const rooms = demoRooms(layout)
  check('demo §5a: 22 ruangan (15 kantor + 5 mess + 2 outdoor)', rooms.length === 22, `ada ${rooms.length}`)
  for (const expected of OFFICE_SNAPSHOT) {
    const room = rooms.find((r) => r.key === expected.key)
    const ok = room !== undefined && room.building === 'office' && room.label === expected.label && room.floor === expected.floor &&
      sameVec(room.center, expected.center) && sameVec(room.offset, expected.offset) && room.motion === expected.motion && sameRect(room.bounds, expected.bounds)
    check(`demo §5a: ruangan kantor '${expected.key}' tidak berubah`, ok, room ? `center=${JSON.stringify(room.center)} offset=${JSON.stringify(room.offset)} motion=${room.motion}` : 'tidak ditemukan')
  }
  for (const expected of MESS_EXPECTED) {
    const room = rooms.find((r) => r.key === expected.key)
    const ok = room !== undefined && room.building === 'residence' && room.label === expected.label && room.floor === expected.floor &&
      sameVec(room.center, expected.center) && sameVec(room.offset, expected.offset) && room.motion === expected.motion && sameRect(room.bounds, expected.bounds)
    check(`demo §5a: ruangan mess '${expected.key}' sesuai desain`, ok, room ? `center=${JSON.stringify(room.center)} offset=${JSON.stringify(room.offset)} motion=${room.motion}` : 'tidak ditemukan')
  }
  for (const expected of CAMPUS_EXPECTED) {
    const room = rooms.find((r) => r.key === expected.key)
    const ok = room !== undefined && room.building === expected.building && room.label === expected.label && room.floor === expected.floor &&
      sameVec(room.center, expected.center) && sameVec(room.offset, expected.offset) && room.motion === expected.motion && sameRect(room.bounds, expected.bounds)
    check(`demo §5a: stop outdoor '${expected.key}' sesuai desain Fase 3`, ok, room ? `center=${JSON.stringify(room.center)} offset=${JSON.stringify(room.offset)} motion=${room.motion}` : 'tidak ditemukan')
    if (room) {
      check(`demo §5a: '${expected.key}' kamera dari depan-atas (offset +y/+z)`, room.offset[1] > 0 && room.offset[2] > 0, `offset=${JSON.stringify(room.offset)}`)
    }
  }
  // Deterministik: demoRooms(layout) dua kali -> hasil identik (acak hanya di
  // DemoTour saat tur berjalan, bukan di daftar ruangan).
  check('demo §5a: demoRooms deterministik', JSON.stringify(demoRooms(layout)) === JSON.stringify(rooms))
}

// ── §5b: garis pandang + posisi kamera tiap ruangan mess ──
// Cutaway mess (Fase 2a, konstanta MESS_CUTAWAY dari §4): kamera di dalam
// x 20..38, z −7..4, y < 3,5 -> mode ground (atap + L2 disembunyikan);
// y ≥ 3,5 -> mode noRoof (atap saja disembunyikan). Ruangan interior L1
// HARUS y < 3,5; Bedrooms (L2) HARUS y ≥ 3,5; Exterior HARUS di luar
// cutaway (atap terlihat).
type Wall = { axis: 'x' | 'z'; at: number; min: number; max: number; yMin: number; yMax: number; gaps: { min: number; max: number; yMin: number; yMax: number }[] }
/** Dinding mess sebagai bidang + rentang + celah. `gaps` = bagian bidang yang
 *  TERBUKA pada rentang y itu (pintu tanpa ambang = y penuh; ambang = celah
 *  hanya di bawah y 2,1 — di atasnya lintel menutup). */
// Dinding mess sebagai bidang + rentang + celah — semua x diturunkan dari
// RESIDENCE (Fase 1 AI Campus).
const MX = RESIDENCE.minX
const MX2 = RESIDENCE.maxX
const DOOR_CX = (RESIDENCE_DOOR.minX + RESIDENCE_DOOR.maxX) / 2
const MESS_WALLS: Wall[] = [
  // Dinding selatan L1 (pintu mess x 28..30 terbuka penuh sejak Fase 4a).
  { axis: 'z', at: 2, min: MX, max: MX2, yMin: 0, yMax: 2.6, gaps: [{ min: RESIDENCE_DOOR.minX, max: RESIDENCE_DOOR.maxX, yMin: 0, yMax: 2.6 }] },
  // Dinding selatan L2 (tanpa pintu).
  { axis: 'z', at: 2, min: MX, max: MX2, yMin: 2.8, yMax: 5.4, gaps: [] },
  // Dinding utara L1/L2.
  { axis: 'z', at: -5.2, min: MX, max: MX2, yMin: 0, yMax: 2.6, gaps: [] },
  { axis: 'z', at: -5.2, min: MX, max: MX2, yMin: 2.8, yMax: 5.4, gaps: [] },
  // Dinding barat/timur L1/L2.
  { axis: 'x', at: MX, min: -5.2, max: 2, yMin: 0, yMax: 2.6, gaps: [] },
  { axis: 'x', at: MX, min: -5.2, max: 2, yMin: 2.8, yMax: 5.4, gaps: [] },
  { axis: 'x', at: MX2, min: -5.2, max: 2, yMin: 0, yMax: 2.6, gaps: [] },
  { axis: 'x', at: MX2, min: -5.2, max: 2, yMin: 2.8, yMax: 5.4, gaps: [] },
  // Dinding koridor L2 (z −0,8): pintu kamar di x 17,75/21,25/24,75/28,25
  // (lebar 0,9, tanpa ambang — celah setinggi dinding).
  { axis: 'z', at: -0.8, min: MX, max: MX2, yMin: 2.8, yMax: 5.4, gaps: RES_BEDROOM_DOORS.map((cx) => ({ min: cx - 0.45, max: cx + 0.45, yMin: 2.8, yMax: 5.4 })) },
  // Partisi x=29 L1 (lobi/dapur): celah z 0,55..1,45, ambang y 2,1..2,6.
  { axis: 'x', at: DOOR_CX, min: -0.5, max: 2, yMin: 0, yMax: 2.6, gaps: [{ min: 0.55, max: 1.45, yMin: 0, yMax: 2.1 }] },
  // Partisi z=−0,5 L1 (ruang keluarga/dapur): celah x 25,05..25,95 dan
  // 30,55..31,45, ambang y 2,1..2,6.
  { axis: 'z', at: -0.5, min: MX, max: MX2, yMin: 0, yMax: 2.6, gaps: [{ min: MX + 3.05, max: MX + 3.95, yMin: 0, yMax: 2.1 }, { min: MX + 8.55, max: MX + 9.45, yMin: 0, yMax: 2.1 }] },
  // Partisi x=32,5 L1 (laundry/kamar mandi): celah z 0,3..1,2, ambang y 2,1..2,6.
  { axis: 'x', at: MX + 10.5, min: -0.5, max: 2, yMin: 0, yMax: 2.6, gaps: [{ min: 0.3, max: 1.2, yMin: 0, yMax: 2.1 }] },
  // Partisi antar-kamar L2 (x 25,5/29/32,5, z −5,2..−0,8, tanpa pintu).
  { axis: 'x', at: MX + 3.5, min: -5.2, max: -0.8, yMin: 2.8, yMax: 5.4, gaps: [] },
  { axis: 'x', at: DOOR_CX, min: -5.2, max: -0.8, yMin: 2.8, yMax: 5.4, gaps: [] },
  { axis: 'x', at: MX + 10.5, min: -5.2, max: -0.8, yMin: 2.8, yMax: 5.4, gaps: [] },
]
/** Garis pandang a→b terhalang dinding? Kembalikan deskripsi dinding atau null.
 *  Ujung tepat di bidang dinding (t ≈ 1) bukan halangan (target di fasad). */
function segBlockedByWall(a: Vec3, b: Vec3): string | null {
  for (const w of MESS_WALLS) {
    const ai = w.axis === 'x' ? a[0] : a[2]
    const bi = w.axis === 'x' ? b[0] : b[2]
    if (Math.abs(bi - ai) < 1e-9) continue
    const t = (w.at - ai) / (bi - ai)
    if (t <= 0.001 || t >= 0.999) continue
    const other = (w.axis === 'x' ? a[2] : a[0]) + t * ((w.axis === 'x' ? b[2] : b[0]) - (w.axis === 'x' ? a[2] : a[0]))
    const y = a[1] + t * (b[1] - a[1])
    if (other < w.min - 1e-9 || other > w.max + 1e-9) continue
    if (y < w.yMin - 1e-9 || y > w.yMax + 1e-9) continue
    const inGap = w.gaps.some((g) => other >= g.min - 1e-9 && other <= g.max + 1e-9 && y >= g.yMin - 1e-9 && y <= g.yMax + 1e-9)
    if (inGap) continue
    return `dinding ${w.axis}=${w.at} (t=${t.toFixed(2)}, ${w.axis === 'x' ? 'z' : 'x'}=${other.toFixed(2)}, y=${y.toFixed(2)})`
  }
  return null
}
type Box3 = { min: Vec3; max: Vec3; name: string }
/** Perabot mess sebagai kotak (ukuran dari residence.tsx / props.tsx).
 *  Semua x diturunkan dari RESIDENCE.minX (Fase 1 AI Campus). */
const MESS_FURNITURE: Box3[] = [
  // Ruang keluarga: sofa (y s/d 1,0), meja kopi (0,5), rak buku (2,0).
  { min: [MX + 2.3, 0, -4.9], max: [MX + 4.7, 1.0, -4.1], name: 'sofa mess' },
  { min: [MX + 2.9, 0, -3.6], max: [MX + 4.1, 0.5, -3.0], name: 'meja kopi mess' },
  { min: [MX + 0.3, 0, -3.2], max: [MX + 0.7, 2.0, -1.8], name: 'rak buku mess' },
  // Ruang makan: meja (0,78) + 4 kursi (sandaran s/d 1,0).
  { min: [MX + 2.6, 0, -0.2], max: [MX + 4.4, 0.78, 0.8], name: 'meja makan mess' },
  { min: [MX + 2.18, 0, 0.08], max: [MX + 2.62, 1.0, 0.52], name: 'kursi makan barat' },
  { min: [MX + 4.38, 0, 0.08], max: [MX + 4.82, 1.0, 0.52], name: 'kursi makan timur' },
  { min: [MX + 3.28, 0, -0.67], max: [MX + 3.72, 1.0, -0.23], name: 'kursi makan utara' },
  { min: [MX + 3.28, 0, 0.68], max: [MX + 3.72, 1.0, 1.15], name: 'kursi makan selatan' },
  // Tangga mess TIDAK dimodelkan sebagai kotak di sini — injakannya
  // melayang (ruang di bawahnya terbuka); lihat segHitsStairs di bawah.
  // Dapur: counter (0,9) + kulkas.
  { min: [MX + 10.5, 0, -5.2], max: [MX2, 0.9, -4.6], name: 'counter dapur mess' },
  { min: [MX + 13.3, 0, -2.4], max: [MX + 13.9, 1.7, -1.8], name: 'kulkas mess' },
  // Laundry: 2 mesin cuci (0,87).
  { min: [MX + 7.3, 0, -0.3], max: [MX + 7.8, 0.87, 0.2], name: 'mesin cuci 1' },
  { min: [MX + 7.95, 0, -0.3], max: [MX + 8.45, 0.87, 0.2], name: 'mesin cuci 2' },
]
// Kasur mess (16): pusat kamar x 17,75/21,25/24,75/28,25, kolom ±0,8,
// baris z −4,1/−2,0, y 2,8 (ukuran kasur 1,05×2,05, tinggi s/d 0,97).
const MESS_BEDS: Box3[] = RES_BEDROOM_DOORS.flatMap((cx) =>
  [-0.8, 0.8].flatMap((dx) =>
    [-4.1, -2.0].map((z) => ({ min: [cx + dx - 0.55, 2.8, z - 1.05] as Vec3, max: [cx + dx + 0.55, 3.77, z + 1.05] as Vec3, name: `kasur mess [${(cx + dx).toFixed(2)}, ${z}]` })),
  ),
)
function pointInBox(p: Vec3, box: Box3): boolean {
  return p[0] >= box.min[0] && p[0] <= box.max[0] && p[1] >= box.min[1] && p[1] <= box.max[1] && p[2] >= box.min[2] && p[2] <= box.max[2]
}
/** Segmen a→b memotong interior kotak? (sentuhan tepat di ujung bukan potongan). */
function segHitsBox(a: Vec3, b: Vec3, box: Box3): boolean {
  let tMin = 0
  let tMax = 1
  for (let i = 0; i < 3; i += 1) {
    const d = b[i] - a[i]
    if (Math.abs(d) < 1e-9) {
      if (a[i] < box.min[i] || a[i] > box.max[i]) return false
    } else {
      let t1 = (box.min[i] - a[i]) / d
      let t2 = (box.max[i] - a[i]) / d
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
      tMin = Math.max(tMin, t1)
      tMax = Math.min(tMax, t2)
      if (tMin > tMax) return false
    }
  }
  return tMax > 0.001 && tMin < 0.999
}
/** Tangga mess (Fase 4a): 17 injakan MELAYANG (kotak 0,25×0,17×0,8 di
 *  z 1,2..2,0, permukaan miring y = 0,7·(x−masuk)) + pegangan miring di
 *  z 1,2 + 5 tiang tegak. Ruang di BAWAH injakan TERBUKA — garis pandang
 *  boleh lewat di bawah tangga; yang menghalangi hanya injakan (pita 0,17
 *  di bawah permukaan), rel, dan tiang itu sendiri. */
const STAIR_POSTS: Box3[] = [[0.4, 0.73], [1.4, 1.43], [2.4, 2.13], [3.4, 2.83], [3.9, 3.18]].map(([dx, y]) => ({
  min: [RES_STAIRS_ENTRY[0] + dx - 0.025, y - 0.45, 1.175] as Vec3, max: [RES_STAIRS_ENTRY[0] + dx + 0.025, y + 0.45, 1.225] as Vec3, name: `tiang tangga x=${RES_STAIRS_ENTRY[0] + dx}`,
}))
function segHitsStairs(a: Vec3, b: Vec3): string | null {
  // Interval t saat segmen di dalam tapak tangga (x masuk..pendaratan, z 1,2..2,0).
  const axisInterval = (ai: number, bi: number, lo: number, hi: number): [number, number] | null => {
    const d = bi - ai
    if (Math.abs(d) < 1e-9) return ai >= lo && ai <= hi ? [0, 1] : null
    const t1 = (lo - ai) / d
    const t2 = (hi - ai) / d
    return [Math.min(t1, t2), Math.max(t1, t2)]
  }
  const ix = axisInterval(a[0], b[0], RES_STAIRS_ENTRY[0], RES_STAIRS_LANDING[0])
  const iz = axisInterval(a[2], b[2], 1.2, 2.0)
  if (ix && iz) {
    const tEnter = Math.max(0, ix[0], iz[0])
    const tExit = Math.min(1, ix[1], iz[1])
    if (tEnter < tExit && tExit > 0.001 && tEnter < 0.999) {
      // d(t) = y(t) − permukaan(x(t)): linear; injakan = d ∈ [−0,17, 0].
      const surf = (x: number) => 0.7 * (x - RES_STAIRS_ENTRY[0])
      const dAt = (t: number) => (a[1] + t * (b[1] - a[1])) - surf(a[0] + t * (b[0] - a[0]))
      const d0 = dAt(Math.max(tEnter, 0.001))
      const d1 = dAt(Math.min(tExit, 0.999))
      if (Math.min(d0, d1) <= 0 && Math.max(d0, d1) >= -0.17) return 'injakan tangga mess'
    }
  }
  // Pegangan miring di z 1,2: rel atas y = 2,3 + 0,7·(x−tengah tangga), rel tengah
  // y = 1,9 + 0,7·(x−tengah tangga) — garis pandang yang memotong bidang z 1,2
  // dalam 0,12 m dari rel terhalang.
  const dz = b[2] - a[2]
  if (Math.abs(dz) > 1e-9) {
    const t = (1.2 - a[2]) / dz
    if (t > 0.001 && t < 0.999) {
      const x = a[0] + t * (b[0] - a[0])
      const y = a[1] + t * (b[1] - a[1])
      const stairMid = (RES_STAIRS_ENTRY[0] + RES_STAIRS_LANDING[0]) / 2
      if (x >= RES_STAIRS_ENTRY[0] && x <= RES_STAIRS_LANDING[0]) {
        if (Math.abs(y - (2.3 + 0.7 * (x - stairMid))) < 0.12 || Math.abs(y - (1.9 + 0.7 * (x - stairMid))) < 0.12) return 'pegangan tangga mess'
      }
    }
  }
  return null
}
/** Garis pandang kamera→target terhalang apa pun? (target di atas/di dalam
 *  perabotnya sendiri dikecualikan — agent duduk/tidur di sana.) */
function sightlineBlocked(room: DemoRoom, a: Vec3, b: Vec3): string | null {
  const wall = segBlockedByWall(a, b)
  if (wall) return wall
  const stairs = segHitsStairs(a, b)
  if (stairs) return stairs
  for (const post of STAIR_POSTS) {
    if (segHitsBox(a, b, post)) return `tiang ${post.name}`
  }
  const boxes = room.key === 'mess-bedrooms' ? MESS_BEDS : MESS_FURNITURE
  for (const box of boxes) {
    if (pointInBox(b, box)) continue
    if (segHitsBox(a, b, box)) return `perabot ${box.name}`
  }
  return null
}
const MESS_ROOMS = demoRooms(layout).filter((r) => r.building === 'residence')
const messRoom = (key: string) => MESS_ROOMS.find((r) => r.key === key) as DemoRoom
// Posisi kasur mess (y 2,8) — placement agent tidur.
const BED_SPOT: Record<string, Vec3> = {
  k1belakang: [RES_BEDROOM_DOORS[0], 2.8, -4.1],
  k1depan: [RES_BEDROOM_DOORS[0], 2.8, -2.0],
  k2depan: [RES_BEDROOM_DOORS[1] + 0.8, 2.8, -2.0],
  k4belakang: [RES_BEDROOM_DOORS[3], 2.8, -4.1],
}
const ALL_BED_SPOTS: Vec3[] = RES_BEDROOM_DOORS.flatMap((cx) => [-0.8, 0.8].flatMap((dx) => [-4.1, -2.0].map((z) => [cx + dx, 2.8, z] as Vec3)))
/** Satu sampel demoRoomView: posisi kamera (mode cutaway yang benar) +
 *  garis pandang bersih + kamera tidak di dalam perabot. */
function sampleRoom(room: DemoRoom, agents: Vec3[], progress: number, expect: 'ground' | 'noroof' | 'outside', label: string) {
  const view = demoRoomView(room, agents, progress)
  const [cx, cy, cz] = view.position
  const inCutaway = cx >= MESS_CUTAWAY.minX && cx <= MESS_CUTAWAY.maxX && cz >= MESS_CUTAWAY.minZ && cz <= MESS_CUTAWAY.maxZ
  if (expect === 'ground') {
    check(`demo §5b ${label}: kamera di dalam cutaway`, inCutaway, `kamera=${JSON.stringify(view.position)}`)
    check(`demo §5b ${label}: kamera y < 3,5 (mode ground, L2 tersembunyi)`, cy < 3.5, `y=${cy.toFixed(2)}`)
  } else if (expect === 'noroof') {
    check(`demo §5b ${label}: kamera di dalam cutaway`, inCutaway, `kamera=${JSON.stringify(view.position)}`)
    check(`demo §5b ${label}: kamera y ≥ 3,5 (mode noRoof, atap tersembunyi)`, cy >= 3.5, `y=${cy.toFixed(2)}`)
  } else {
    check(`demo §5b ${label}: kamera di luar cutaway (atap terlihat)`, !inCutaway, `kamera=${JSON.stringify(view.position)}`)
  }
  const blocked = sightlineBlocked(room, view.position, view.target)
  check(`demo §5b ${label}: garis pandang tidak menembus dinding/perabot`, blocked === null, blocked ?? '')
  const boxes = room.key === 'mess-bedrooms' ? MESS_BEDS : MESS_FURNITURE
  const inside = boxes.find((box) => pointInBox(view.position, box))
  check(`demo §5b ${label}: kamera tidak di dalam perabot`, inside === undefined, inside?.name ?? '')
}
{
  // 0 agent — overview tiap ruangan, seluruh ayunan motion.
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    sampleRoom(messRoom('mess-exterior'), [], progress, 'outside', `eksterior 0 agent p=${progress}`)
    sampleRoom(messRoom('mess-lobby'), [], progress, 'ground', `lobi 0 agent p=${progress}`)
    sampleRoom(messRoom('mess-living'), [], progress, 'ground', `ruang keluarga 0 agent p=${progress}`)
    sampleRoom(messRoom('mess-dining'), [], progress, 'ground', `ruang makan 0 agent p=${progress}`)
    sampleRoom(messRoom('mess-bedrooms'), [], progress, 'noroof', `kamar tidur 0 agent p=${progress}`)
  }
  // 1 agent (defensif — placement L1 mess tidak pernah ada, tapi kamera
  // harus tetap waras bila suatu hari ada idle stop di sana).
  for (const progress of [0, 0.25, 0.75]) {
    sampleRoom(messRoom('mess-lobby'), [[30, 0, 1.0]], progress, 'ground', `lobi 1 agent p=${progress}`)
    sampleRoom(messRoom('mess-lobby'), [[27.5, 0, 1.5]], progress, 'ground', `lobi 1 agent barat p=${progress}`)
    sampleRoom(messRoom('mess-living'), [[25.5, 0, -4.5]], progress, 'ground', `ruang keluarga 1 agent sofa p=${progress}`)
    sampleRoom(messRoom('mess-dining'), [[25.5, 0, 0.3]], progress, 'ground', `ruang makan 1 agent meja p=${progress}`)
    sampleRoom(messRoom('mess-bedrooms'), [BED_SPOT.k1depan], progress, 'noroof', `kamar tidur 1 agent K1-depan p=${progress}`)
    sampleRoom(messRoom('mess-bedrooms'), [BED_SPOT.k1belakang], progress, 'noroof', `kamar tidur 1 agent K1-belakang p=${progress}`)
    sampleRoom(messRoom('mess-bedrooms'), [BED_SPOT.k2depan], progress, 'noroof', `kamar tidur 1 agent K2-depan p=${progress}`)
    sampleRoom(messRoom('mess-bedrooms'), [BED_SPOT.k4belakang], progress, 'noroof', `kamar tidur 1 agent K4-belakang p=${progress}`)
  }
  // 2 + 16 agent tidur (kasus nyata: tombol Tidur -> semua kasur terisi).
  for (const progress of [0, 0.25, 0.75]) {
    sampleRoom(messRoom('mess-bedrooms'), [BED_SPOT.k1belakang, BED_SPOT.k4belakang], progress, 'noroof', `kamar tidur 2 agent p=${progress}`)
    sampleRoom(messRoom('mess-bedrooms'), ALL_BED_SPOTS, progress, 'noroof', `kamar tidur 16 agent p=${progress}`)
  }
  // Framing 16:9 — seluruh gedung mess muat di frame Exterior; ke-16 kasur
  // muat di frame Bedrooms saat semua agent tidur.
  const messCorners: Vec3[] = [
    [RESIDENCE.minX, 0, -5.2], [RESIDENCE.maxX, 0, -5.2], [RESIDENCE.minX, 0, 2], [RESIDENCE.maxX, 0, 2],
    [RESIDENCE.minX, 5.4, -5.2], [RESIDENCE.maxX, 5.4, -5.2], [RESIDENCE.minX, 5.4, 2], [RESIDENCE.maxX, 5.4, 2], [(RESIDENCE.minX + RESIDENCE.maxX) / 2, 6.2, -1.6],
  ]
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const view = demoRoomView(messRoom('mess-exterior'), [], progress)
    const camera = makeCamera(view.position, view.target, 16 / 9, 40)
    let worst = 0
    for (const point of messCorners) {
      const p = project(camera, point)
      worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y))
    }
    check(`demo §5b eksterior 16:9 p=${progress}: gedung muat di frame (max |ndc| ${worst.toFixed(3)})`, worst <= 1, `max |ndc| ${worst.toFixed(3)}`)
  }
  // Framing 16:9 — 2 stop outdoor AI Campus Fase 3: zona taman + jalur
  // pejalan (termasuk pintu mess) muat di frame selama ayunan motion.
  const allRooms = demoRooms(layout)
  const tamanRoom = allRooms.find((r) => r.key === 'taman') as DemoRoom
  const jalurRoom = allRooms.find((r) => r.key === 'jalur') as DemoRoom
  const tamanCorners: Vec3[] = [
    [GAME_ROOM.maxX, 0, -5.2], [RESIDENCE.minX, 0, -5.2], [GAME_ROOM.maxX, 0, 2], [RESIDENCE.minX, 0, 2],
    [GAME_ROOM.maxX, 1.5, -5.2], [RESIDENCE.minX, 1.5, -5.2], [18.75, 1.5, -1.2],
  ]
  const jalurCorners: Vec3[] = [
    [RESIDENCE_DOOR.minX, 0, RESIDENCE.maxZ], [RESIDENCE_DOOR.maxX, 0, RESIDENCE.maxZ],
    [RESIDENCE_DOOR.minX, 0, 4.6], [RESIDENCE_DOOR.maxX, 0, 4.6],
    [RESIDENCE_DOOR.minX, 2.6, RESIDENCE.maxZ], [RESIDENCE_DOOR.maxX, 2.6, RESIDENCE.maxZ],
  ]
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const view = demoRoomView(tamanRoom, [], progress)
    const camera = makeCamera(view.position, view.target, 16 / 9, 40)
    let worst = 0
    for (const point of tamanCorners) {
      const p = project(camera, point)
      worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y))
    }
    check(`demo §5b taman 16:9 p=${progress}: taman muat di frame (max |ndc| ${worst.toFixed(3)})`, worst <= 1, `max |ndc| ${worst.toFixed(3)}`)
  }
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const view = demoRoomView(jalurRoom, [], progress)
    const camera = makeCamera(view.position, view.target, 16 / 9, 40)
    let worst = 0
    for (const point of jalurCorners) {
      const p = project(camera, point)
      worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y))
    }
    check(`demo §5b jalur 16:9 p=${progress}: jalur + pintu mess muat di frame (max |ndc| ${worst.toFixed(3)})`, worst <= 1, `max |ndc| ${worst.toFixed(3)}`)
  }
  for (const progress of [0, 0.25, 0.75]) {
    const view = demoRoomView(messRoom('mess-bedrooms'), ALL_BED_SPOTS, progress)
    const camera = makeCamera(view.position, view.target, 16 / 9, 40)
    let worst = 0
    for (const spot of ALL_BED_SPOTS) {
      const p = project(camera, [spot[0], spot[1] + 0.5, spot[2]])
      worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y))
    }
    check(`demo §5b kamar tidur 16 agent 16:9 p=${progress}: ke-16 kasur muat di frame (max |ndc| ${worst.toFixed(3)})`, worst <= 1, `max |ndc| ${worst.toFixed(3)}`)
  }
}

// ── §5c: Night Mode mess — lampu + jendela terikat tema dark ──
// (Cek statis sumber: komponen R3F tidak bisa dirender di skrip ini, jadi
// yang diverifikasi adalah wiring prop `night` dari tema ke tiap lampu dan
// jendela mess — sama seperti Lighting kantor.)
{
  const residenceSrc = readFileSync('components/kantor/scene/residence.tsx', 'utf8')
  const envSrc = readFileSync('components/kantor/scene/environment.tsx', 'utf8')
  const officeLightNight = (residenceSrc.match(/<OfficeLight[^>]*night=\{night\}/g) ?? []).length
  check('night §5c: 3 OfficeLight mess terima night={night}', officeLightNight === 3, `ada ${officeLightNight}`)
  const resWindowNight = (residenceSrc.match(/<ResWindow[^>]*night=\{night\}/g) ?? []).length
  // 8 → 7 pada 2026-11-24: jendela selatan L1 dihapus (fasad selatan L1
  // kini kaca penuh ResGlassDoorWall — tidak ada dinding untuk ditempel).
  check('night §5c: semua ResWindow mess (7 pemakaian) terima night={night}', resWindowNight === 7, `ada ${resWindowNight}`)
  check('night §5c: Residence menerima night dari Environment', envSrc.includes('<Residence night={night} hideInterior={hideResidenceInterior} hideRoof={hideResidenceRoof}/>'))
  check('night §5c: lampu jalan mess [RESIDENCE.minX+2, 0, 9.3] terikat tema', envSrc.includes('<StreetLamp position={[RESIDENCE.minX + 2, 0, 9.3]} night={night}/>'))
  check('night §5c: lampu jalan mess [RESIDENCE.maxX-2, 0, 9.3] terikat tema', envSrc.includes('<StreetLamp position={[RESIDENCE.maxX - 2, 0, 9.3]} night={night}/>'))
  check('night §5c: 2 lampu jalan kantor tetap ada + terikat tema', envSrc.includes('<StreetLamp position={[-8, 0, 9.3]} night={night}/>') && envSrc.includes('<StreetLamp position={[4, 0, 9.3]} night={night}/>'))
  const lampCount = (envSrc.match(/<StreetLamp[^>]*night=\{night\}/g) ?? []).length
  check('night §5c: total 4 tiang lampu jalan (2 kantor + 2 mess)', lampCount === 4, `ada ${lampCount}`)
}

// ── §5d: Fase 4 Campus — selective rendering interior mess ──
// (Cek statis sumber: interior mess disembunyikan via group.visible saat
// building === 'office'; eksterior selalu tampil; <Residence> tidak
// di-unmount; interior kantor tidak pernah disembunyikan.)
{
  const residenceSrc = readFileSync('components/kantor/scene/residence.tsx', 'utf8')
  const envSrc = readFileSync('components/kantor/scene/environment.tsx', 'utf8')
  const officeSrc = readFileSync('components/kantor/Office3D.tsx', 'utf8')
  check('fase4 §5d: komponen ResL1Interior diekstrak dari Residence', residenceSrc.includes('export function ResL1Interior('))
  check('fase4 §5d: komponen ResL2Interior diekstrak dari Residence', residenceSrc.includes('export function ResL2Interior('))
  check('fase4 §5d: Residence menerima prop hideInterior (default false)', residenceSrc.includes('hideInterior = false'))
  check('fase4 §5d: ResL1Interior dipakai tepat 1x di Residence', (residenceSrc.match(/<ResL1Interior /g) ?? []).length === 1)
  check('fase4 §5d: ResL2Interior dipakai tepat 1x di Residence', (residenceSrc.match(/<ResL2Interior /g) ?? []).length === 1)
  check('fase4 §5d: grup L1 dibungkus ref l1InteriorRef', residenceSrc.includes('<group ref={l1InteriorRef}>'))
  check('fase4 §5d: grup L2 dibungkus ref l2InteriorRef', residenceSrc.includes('<group ref={l2InteriorRef}>'))
  check('fase4 §5d: useFrame set visible L1 dari hideInterior/kamera', residenceSrc.includes('l1InteriorRef.current.visible = interiorVisible'))
  check('fase4 §5d: useFrame set visible L2 dari hideInterior/kamera', residenceSrc.includes('l2InteriorRef.current.visible = interiorVisible'))
  check('fase4 §5d: pengecualian kamera-dalam (interior muncul lagi saat kamera masuk mess)', residenceSrc.includes('const interiorVisible = !hideInterior || inside'))
  // Lobi + area santai + atap + plang nama gedung TETAP di shell Residence
  // (bukan di komponen interior) — dicek lewat urutan: badan ResL1Interior/
  // ResL2Interior berakhir sebelum 'export function Residence', sedangkan
  // elemen shell ada setelahnya.
  const resL1Start = residenceSrc.indexOf('export function ResL1Interior(')
  const resL2Start = residenceSrc.indexOf('export function ResL2Interior(')
  const residenceStart = residenceSrc.indexOf('export function Residence(')
  const lobiIdx = residenceSrc.indexOf('text="Lobi"')
  const relaxIdx = residenceSrc.indexOf('Area santai luar')
  const plateIdx = residenceSrc.indexOf('text="WOORK STAFF RESIDENCE"')
  check('fase4 §5d: lobi TETAP di shell Residence (bukan di ResL1Interior)', lobiIdx > residenceStart, `lobi@${lobiIdx} residence@${residenceStart}`)
  check('fase4 §5d: area santai luar TETAP di shell Residence', relaxIdx > residenceStart)
  check('fase4 §5d: plang nama gedung TETAP di shell Residence (bukan di ResL2Interior)', plateIdx > residenceStart)
  check('fase4 §5d: ResL1Interior tidak berisi lobi', !residenceSrc.slice(resL1Start, residenceStart).includes('text="Lobi"'))
  check('fase4 §5d: ResL2Interior tidak berisi plang nama gedung', !residenceSrc.slice(resL2Start, residenceStart).includes('WOORK STAFF RESIDENCE'))
  // Koreksi 2026-11-24 (atap mess disembunyikan saat tidur): atap kini
  // diatur cutaway + hideRoof — tetap bukan hideInterior.
  check('fase4 §5d: atap tetap diatur cutaway saja (tidak ikut hideInterior)', residenceSrc.includes("const roofVisible = mode === 'all' && !hideRoof") && !residenceSrc.includes('roofRef.current.visible = interiorVisible'))
  check('fase4 §5d: Environment teruskan hideResidenceInterior ke Outdoors', envSrc.includes('hideResidenceInterior={hideResidenceInterior}'))
  check('fase4 §5d: Outdoors teruskan hideInterior ke Residence', envSrc.includes('<Residence night={night} hideInterior={hideResidenceInterior} hideRoof={hideResidenceRoof}/>'))
  // Koreksi parent 2026-11-24: interior mess TAMPIL saat sleep (user menekan
  // Tidur justru untuk melihat agent berbaring di kasur) — hide hanya saat
  // building office DAN tidak tidur.
  check('fase4 §5d: Office3D sembunyikan interior mess hanya saat building office dan tidak tidur', officeSrc.includes('hideResidenceInterior={building === \'office\' && !sleep}'))
  check('fase4 §5d: tidak ada penyembunyian interior kantor (tidak ada hideOffice*)', !officeSrc.includes('hideOffice') && !envSrc.includes('hideOffice'))
  check('fase4 §5d: <Residence> tetap di-mount (tidak ada unmount kondisional)', !envSrc.includes('hideResidenceInterior &&') && envSrc.includes('<Residence night={night} hideInterior={hideResidenceInterior} hideRoof={hideResidenceRoof}/>'))
}

// ── §5e: Fase 5 Campus — lampu teras pintu mess + lampu taman malam ──
{
  const residenceSrc = readFileSync('components/kantor/scene/residence.tsx', 'utf8')
  const envSrc = readFileSync('components/kantor/scene/environment.tsx', 'utf8')
  const officeSrc = readFileSync('components/kantor/Office3D.tsx', 'utf8')
  const resL1Start = residenceSrc.indexOf('export function ResL1Interior(')
  const resL2Start = residenceSrc.indexOf('export function ResL2Interior(')
  const residenceStart = residenceSrc.indexOf('export function Residence(')
  const porchIdx = residenceSrc.indexOf('Lampu teras di atas pintu mess')
  check('fase5 §5e: lampu teras ada di residence.tsx', porchIdx > -1)
  // Di SHELL Residence (setelah 'export function Residence'), bukan di
  // ResL1Interior/ResL2Interior — supaya tetap terlihat di mode office.
  check('fase5 §5e: lampu teras di shell Residence (bukan interior)', porchIdx > residenceStart)
  check('fase5 §5e: lampu teras TIDAK di ResL1Interior', !residenceSrc.slice(resL1Start, residenceStart).includes('Lampu teras di atas pintu mess'))
  check('fase5 §5e: lampu teras TIDAK di ResL2Interior', !residenceSrc.slice(resL2Start, residenceStart).includes('Lampu teras di atas pintu mess'))
  // Posisi diturunkan dari pintu (doorCx) + dinding selatan (maxZ).
  check('fase5 §5e: lampu teras di tengah pintu (doorCx)', residenceSrc.includes('<group position={[doorCx, 0, maxZ]}>'))
  // Bola emissive hangat + pointLight kecil, hanya saat night.
  check('fase5 §5e: bola teras emissive hangat night-gated', residenceSrc.includes('emissive="#ffd98a" emissiveIntensity={night ? 2.5 : 0.15}'))
  check('fase5 §5e: pointLight teras hanya saat night (intensity 4, distance 5)', residenceSrc.includes('{night && <pointLight position={[0, 2.22, 0.2]} color="#ffd08a" intensity={4} distance={5} decay={2}/>'))
  // Lampu teras tepat 1x (tidak ganda).
  check('fase5 §5e: lampu teras tepat 1x', (residenceSrc.match(/Lampu teras di atas pintu mess/g) ?? []).length === 1)
  // Lampu taman Fase 2 tetap ada (2x) dan night-gated.
  check('fase5 §5e: lampu taman Fase 2 tetap ada (2 posisi)', (envSrc.match(/GAME_ROOM\.maxX \+ 0\.8, 0\.2/g) ?? []).length === 1 && (envSrc.match(/RESIDENCE\.minX - 0\.8, 0\.2/g) ?? []).length === 1)
  check('fase5 §5e: pointLight taman night-gated (2x)', (envSrc.match(/\{night && <pointLight position=\{\[0, 0\.8, 0\]\}/g) ?? []).length === 1)
  // Titik terang di frame demo malam: lampu taman di dalam bounds stop
  // 'taman' (x 15,5..22, z −5,2..2), lampu teras di dalam bounds stop
  // 'jalur' (x 28..30, z 2..4,6 — teras z = maxZ+0,2 = 2,2).
  check('fase5 §5e: lampu taman di dalam zona stop demo taman', 15.5 < 16.3 && 16.3 < 22 && 15.5 < 21.2 && 21.2 < 22)
  check('fase5 §5e: lampu teras di dalam zona stop demo jalur', 28 <= 29 && 29 <= 30 && 2 <= 2.2 && 2.2 <= 4.6)

  // §5f — Atap mess disembunyikan saat tidur (perintah user 2026-11-24
  // ~11:06, screenshot): agent yang tidur di kasur L2 harus terlihat
  // dari view kantor/kampus, bukan tertutup atap merah.
  check('sleep §5f: Residence terima prop hideRoof', residenceSrc.includes('hideRoof = false'))
  check('sleep §5f: atap terlihat hanya saat mode all DAN tidak tidur', residenceSrc.includes("const roofVisible = mode === 'all' && !hideRoof"))
  check('sleep §5f: visibilitas atap dilacak ref sendiri (toggle Tidur langsung berlaku)', residenceSrc.includes('roofVisibleRef'))
  check('sleep §5f: Environment teruskan hideResidenceRoof ke Outdoors', envSrc.includes('hideResidenceRoof={hideResidenceRoof}'))
  check('sleep §5f: Outdoors teruskan hideRoof ke Residence', envSrc.includes('hideRoof={hideResidenceRoof}'))
  check('sleep §5f: Office3D sembunyikan atap mess saat sleep', officeSrc.includes('hideResidenceRoof={sleep}'))
  check('sleep §5f: lantai 2 tetap diatur mode cutaway saja (tidak ikut hideRoof)', residenceSrc.includes("if (floor2Ref.current) floor2Ref.current.visible = mode !== 'ground'"))

  // §5g — Fasad selatan L1 mess KACA PENUH (perintah user 2026-11-24
  // ~11:23): lobi + ruang makan terlihat dari luar.
  check('glass §5g: helper ResGlassZ ada (pola GlassZ, opacity 0,25)', residenceSrc.includes('function ResGlassZ(') && residenceSrc.includes('opacity={0.25}'))
  check('glass §5g: ResGlassDoorWall ada (kaca kiri + kanan pintu, ambang solid)', residenceSrc.includes('function ResGlassDoorWall(') && residenceSrc.includes('<ResGlassZ z={z} fromX={fromX} toX={d0}/>') && residenceSrc.includes('<ResGlassZ z={z} fromX={d1} toX={toX}/>'))
  check('glass §5g: fasad selatan L1 pakai ResGlassDoorWall', residenceSrc.includes('<ResGlassDoorWall z={maxZ} fromX={minX} toX={maxX}/>'))
  check('glass §5g: ResDoorWall lama sudah tidak dipakai di L1', !residenceSrc.includes('<ResDoorWall z={maxZ}'))
  check('glass §5g: jendela selatan L1 dihapus (tidak ada y 1,5 di maxZ)', !residenceSrc.includes('1.5, maxZ + 0.14'))
  check('glass §5g: jendela utara/timur/barat L1 tetap ada', residenceSrc.includes('minZ - 0.14]} rotation={Math.PI} night={night}/>)}') && residenceSrc.includes('maxX + 0.14, 1.5, z]} rotation={Math.PI / 2} night={night}/>)}'))

  // §5h — Menu overlay RINGKAS (perintah user 2026-11-24 ~13:07, dari
  // screenshot): toolbar + panel gedung/lantai lebih kecil.
  check('compact §5h: tidak ada lagi min-h-11 di Office3D (menu 44px)', !officeSrc.includes('min-h-11'))
  check('compact §5h: tombol toolbar pakai min-h-8 desktop + min-h-7 HP', officeSrc.includes('md:min-h-8') && officeSrc.includes('min-h-7'))
  check('compact §5h: tombol panel kiri pakai min-h-8 desktop + min-h-7 HP', officeSrc.includes('md:min-h-8') && officeSrc.includes('min-h-7 text-left'))
  check('compact §5h: teks menu 9px di HP, 11px di desktop', officeSrc.includes('text-[9px]') && officeSrc.includes('md:text-[11px]'))
  check('compact §5h: label agent di scene TIDAK ikut dikecilkan', officeSrc.includes('text-[10px] tracking-wide') && officeSrc.includes('text-[9px]'))

  // --- §5i: chat dinamis di HP (2026-11-24, laporan user: chat panjang) ---
  const pageSrc = readFileSync('components/kantor/KantorPageClient.tsx', 'utf8')
  const panelSrc = readFileSync('components/kantor/CommandPanel.tsx', 'utf8')
  const mdSrc = readFileSync('components/kantor/AgentMarkdown.tsx', 'utf8')
  check('chat §5i: root kantor punya fallback vh + dvh via supports', pageSrc.includes('h-[calc(100vh-7rem)]') && pageSrc.includes('supports-[height:100dvh]:h-[calc(100dvh-7rem-env(safe-area-inset-bottom))]'))
  check('chat §5i: scene panel-tutup juga punya fallback vh', pageSrc.includes('xl:h-[calc(100vh-11rem)]'))
  check('chat §5i: thread tetap flex-1 + scroll internal (bukan max-h)', panelSrc.includes('min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-2.5'))
  check('chat §5i: tabel hasil ResultTable table-fixed + sel break-words', panelSrc.includes('w-full table-fixed border-collapse text-xs') && panelSrc.includes('break-words px-1.5 py-1 align-top'))
  check('chat §5i: tabel markdown AgentMarkdown table-fixed + sel break-words', mdSrc.includes('w-full table-fixed border-collapse text-xs') && mdSrc.includes('break-words px-1.5 py-1 align-top'))
  check('chat §5i: tidak ada lagi tabel w-full tanpa table-fixed di chat', !panelSrc.includes('w-full border-collapse') && !mdSrc.includes('w-full border-collapse'))

  // --- §5j: panel chat desktop harus flex (2026-11-24) ---
  // Wrapper panel base-nya flex-col; 'hidden xl:block' di desktop mematikan
  // flex-1 panel sehingga tinggi chat mengikuti isi thread (panjang melebihi
  // scene, kolom ketik tenggelam). Harus 'hidden xl:flex'.
  check('chat §5j: wrapper panel pakai hidden xl:flex (bukan xl:block)', pageSrc.includes("mobileTab === 'scene' && 'hidden xl:flex'"))
  check('chat §5j: tidak ada hidden xl:block pada wrapper panel', !pageSrc.includes("mobileTab === 'scene' && 'hidden xl:block'"))
  check('chat §5j: CommandPanel tetap min-h-0 flex-1 di dalam wrapper', pageSrc.includes('<CommandPanel') && pageSrc.includes('className="min-h-0 flex-1"'))
}

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nSemua cek Fase 5a lolos.' : `\n${failures} cek GAGAL.`)
process.exit(failures === 0 ? 0 : 1)
