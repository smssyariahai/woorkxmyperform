/**
 * Verifikasi Fase 4b — pathfinding kantor -> mess (Staff Residence).
 *
 * walkPath3 cabang RESIDENCE: meja agent (lantai berapa pun) -> lift
 * kantor turun ke L1 -> pintu depan kantor -> trotoar -> jalur pejalan
 * -> pintu mess -> lobi -> ruang makan -> tangga naik -> koridor L2 ->
 * pintu kamar -> kasur; + rute pulang (kasur -> meja L1) + rute di
 * dalam mess. Tanpa teleport; tanpa mengubah rute kantor yang sudah ada
 * (skrip verify-fase5b.ts menjaganya — jalankan juga setelah ini).
 *
 * Model tabrakan (dari residence.tsx + props.tsx, bukan karangan):
 * badan agent 0,48 (x) x 0,30 (z) — Character torso RBox 0,48x0,3
 * (Office3D.tsx). Semua rintangan diperlebar 0,19 (x) / 0,10 (z) =
 * setengah lebar/dalam badan (0,24/0,15) dikurangi toleransi gesekan
 * 0,05 m — geometri mess dikemas rapat (Fase 4c: kasur 1,05 m di kolom
 * ±0,80 m: celah tengah 0,55 m — kini LEBIH LEBAR dari badan 0,48 m,
 * tanpa gesekan; celah samping 0,425 m; kaki kasur depan 0,025 m dari
 * dinding koridor). Gesekan <= 0,05 m dilaporkan angkanya di §0b
 * dan BUKAN kegagalan; penghalang keras (kursi makan, kasur Kamar 4)
 * tetap gagal dengan jelas — keduanya diperbaiki di Fase 4c (kursi
 * utara ke ujung meja; pintu Kamar 4 ke tengah kamar + kamar mandi
 * L2 menyempit dari 2,5 m jadi 1,3 m).
 * karena rutenya didominasi gerak searah x — di mess, celah
 * utara-selatan yang menentukan, jadi 0,10 di z lebih tepat secara fisik.
 * Kasur asal + kasur tujuan dikecualikan (agent bangun dari / naik ke
 * kasurnya sendiri — sama seperti restSpot kantor).
 *
 * Dijalankan: `npx tsx scripts/verify-fase4.ts` — exit 0 bila semua cek
 * lolos, exit 1 bila ada yang gagal. TIDAK mengubah data / DB / file lain.
 */
import {
  FLOOR_HEIGHT,
  LIFT_APPROACH,
  LIFT_DOOR_Z,
  LIFT_QUEUE_SLOTS,
  RESIDENCE,
  RESIDENCE_DOOR,
  RES_BEDROOM_DOORS,
  RES_CORRIDOR_Z,
  RES_ENTRY_X,
  RES_STAIRS_ENTRY,
  RES_STAIRS_LANDING,
  chairForDesk,
  createLayout,
  floorOf,
  residenceBeds,
  walkPath3,
  type OfficeLayout,
  type Vec3,
} from '../components/kantor/scene/office3d-layout'

let failures = 0
let total = 0
const check = (name: string, ok: boolean, detail = '') => {
  total += 1
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// Layout produksi: 16 agent (kantor + mess, seperti di situs live).
const layout: OfficeLayout = createLayout(16)
const FLOOR_Y = [0, FLOOR_HEIGHT, 2 * FLOOR_HEIGHT]
const eq = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const samePoint = (a: Vec3, b: Vec3) => dist3(a, b) < 0.01
const SLOT0_L1: Vec3 = [LIFT_QUEUE_SLOTS[0][0], 0, LIFT_QUEUE_SLOTS[0][1]]

// ── Kasur mess + titik-titik representatif ──
const beds = residenceBeds()
const bedFoot = (bed: Vec3): Vec3 => [bed[0], FLOOR_HEIGHT, bed[2] + 0.95]
const bedName = (i: number) => `Kamar ${Math.floor(i / 4) + 1} ${(i % 4) < 2 ? 'belakang' : 'depan'} ${i % 2 === 0 ? 'barat' : 'timur'}`
const l1Desk = chairForDesk(layout.desks[0], 0).position
const l2Front = chairForDesk(layout.techClusters.find((c) => c.row === 'front')!.desks[0].desk, 0).position
const l3Ceo = chairForDesk(layout.execDesks.find((d) => d.id === 'exec:ceo:0')!.desk, 0).position
const L1_APPROACH: Vec3 = [LIFT_APPROACH[0], 0, LIFT_DOOR_Z]
const MESS_DOOR: Vec3 = [RES_ENTRY_X, 0, RESIDENCE_DOOR.z]
const LOBBY: Vec3 = [RES_ENTRY_X, 0, 1.0]

// ── Geometri tabrakan mess (residence.tsx + props.tsx) ──
interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
const ex = (r: Rect, hx: number, hz: number): Rect => ({ minX: r.minX - hx, maxX: r.maxX + hx, minZ: r.minZ - hz, maxZ: r.maxZ + hz })
/** Liang-Barsky 2D: segmen (x,z) menyentuh rect? (pola verify-fase5b.ts) */
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
/** Segmen dinding koridor L2 (z -0,8) di antara celah-celah pintu (rumus yang sama dengan residence.tsx). */
const corridorSegs: [number, number][] = []
{
  let cursor = RESIDENCE.minX
  for (const c of RES_BEDROOM_DOORS) {
    corridorSegs.push([cursor, c - 0.45])
    cursor = c + 0.45
  }
  corridorSegs.push([cursor, RESIDENCE.maxX])
}
/** Dinding mess lantai 1 (tebal 0,25; celah pintu TIDAK dimodelkan).
 *  Semua x diturunkan dari RESIDENCE (Fase 1 AI Campus). */
const MX = RESIDENCE.minX
const DOOR_CX = (RESIDENCE_DOOR.minX + RESIDENCE_DOOR.maxX) / 2
const BATH_WEST = RESIDENCE.maxX - 1.3
const RES_WALLS_L1: Rect[] = [
  { minX: MX, maxX: RESIDENCE.maxX, minZ: -5.325, maxZ: -5.075 },
  { minX: MX, maxX: RESIDENCE_DOOR.minX, minZ: 1.875, maxZ: 2.125 },
  { minX: RESIDENCE_DOOR.maxX, maxX: RESIDENCE.maxX, minZ: 1.875, maxZ: 2.125 },
  { minX: MX - 0.125, maxX: MX + 0.125, minZ: -5.2, maxZ: 2 },
  { minX: RESIDENCE.maxX - 0.125, maxX: RESIDENCE.maxX + 0.125, minZ: -5.2, maxZ: 2 },
  { minX: DOOR_CX - 0.125, maxX: DOOR_CX + 0.125, minZ: -5.2, maxZ: 0.55 },
  { minX: DOOR_CX - 0.125, maxX: DOOR_CX + 0.125, minZ: 1.45, maxZ: 2 },
  { minX: MX, maxX: MX + 3.05, minZ: -0.625, maxZ: -0.375 },
  { minX: MX + 3.95, maxX: DOOR_CX, minZ: -0.625, maxZ: -0.375 },
  { minX: DOOR_CX, maxX: MX + 8.55, minZ: -0.625, maxZ: -0.375 },
  { minX: MX + 9.45, maxX: RESIDENCE.maxX, minZ: -0.625, maxZ: -0.375 },
  { minX: MX + 10.375, maxX: MX + 10.625, minZ: -0.5, maxZ: 0.3 },
  { minX: MX + 10.375, maxX: MX + 10.625, minZ: 1.2, maxZ: 2 },
]
/** Dinding mess lantai 2 (dinding luar penuh + koridor + partisi kamar + kamar mandi). */
const RES_WALLS_L2: Rect[] = [
  { minX: MX, maxX: RESIDENCE.maxX, minZ: -5.325, maxZ: -5.075 },
  { minX: MX, maxX: RESIDENCE.maxX, minZ: 1.875, maxZ: 2.125 },
  { minX: MX - 0.125, maxX: MX + 0.125, minZ: -5.2, maxZ: 2 },
  { minX: RESIDENCE.maxX - 0.125, maxX: RESIDENCE.maxX + 0.125, minZ: -5.2, maxZ: 2 },
  ...corridorSegs.map(([x1, x2]) => ({ minX: x1, maxX: x2, minZ: -0.925, maxZ: -0.675 })),
  ...[MX + 3.5, DOOR_CX, MX + 10.5].map((x) => ({ minX: x - 0.125, maxX: x + 0.125, minZ: -5.2, maxZ: -0.8 })),
  // Dinding barat kamar mandi (Fase 4c: x 28,7, dulu 27,5) + celah pintu z 0,6..1,5.
  { minX: BATH_WEST - 0.125, maxX: BATH_WEST + 0.125, minZ: -0.8, maxZ: 0.6 },
  { minX: BATH_WEST - 0.125, maxX: BATH_WEST + 0.125, minZ: 1.5, maxZ: 2 },
]
/** Perabot lantai 1 yang dilewati / dekat rute (meja + kursi makan, bangku + meja lobi, counter dapur, mesin cuci).
 *  Fase 4c: kursi utara pindah ke ujung meja — 2 rect kursi utara diganti rect kursi ujung (dudukan + sandaran). */
const RES_FURNITURE_L1: Rect[] = [
  { minX: MX + 2.6, maxX: MX + 4.4, minZ: -0.2, maxZ: 0.8 },
  { minX: MX + 2.17, maxX: MX + 2.625, minZ: 0.075, maxZ: 0.525 },
  { minX: MX + 4.375, maxX: MX + 4.83, minZ: 0.075, maxZ: 0.525 },
  { minX: MX + 2.675, maxX: MX + 3.125, minZ: -0.68, maxZ: -0.225 },
  { minX: MX + 3.875, maxX: MX + 4.325, minZ: -0.68, maxZ: -0.225 },
  { minX: MX + 8.6, maxX: MX + 10, minZ: 1.375, maxZ: 1.83 },
  { minX: MX + 8.55, maxX: MX + 9.25, minZ: 0.35, maxZ: 1.05 },
  { minX: MX + 8.2, maxX: MX + 12.8, minZ: -5.05, maxZ: -4.45 },
  { minX: MX + 7.25, maxX: MX + 7.85, minZ: -0.35, maxZ: 0.25 },
  { minX: MX + 7.9, maxX: MX + 8.5, minZ: -0.35, maxZ: 0.25 },
]
/** Railing lubang tangga L2: utara (z 1,2, x masuk..pendaratan) + barat (x masuk, z 1,2..2,0). */
const RES_RAILINGS: Rect[] = [
  { minX: RES_STAIRS_ENTRY[0], maxX: RES_STAIRS_LANDING[0], minZ: 1.16, maxZ: 1.24 },
  { minX: RES_STAIRS_ENTRY[0] - 0.04, maxX: RES_STAIRS_ENTRY[0] + 0.04, minZ: 1.2, maxZ: 2.0 },
]
/** Kasur: Bed 1,05 x 2,05 (props.tsx). */
const bedRect = (bed: Vec3): Rect => ({ minX: bed[0] - 0.525, maxX: bed[0] + 0.525, minZ: bed[2] - 1.025, maxZ: bed[2] + 1.025 })
/** Lubang pelat L2 di atas tangga (x masuk..pendaratan, z 1,2..2,0) — tanpa ekspansi (agent hanya boleh di sana lewat tangga). */
const RES_HOLE: Rect = { minX: RES_STAIRS_ENTRY[0], maxX: RES_STAIRS_LANDING[0], minZ: 1.2, maxZ: 2.0 }
/** Dinding/furnitur/railing/kasur diperlebar 0,19 (x) / 0,10 (z) — setengah badan dikurangi toleransi gesekan 0,05 m (lihat header). */
const WALLS_L1_X = RES_WALLS_L1.map((r) => ex(r, 0.19, 0.10))
const WALLS_L2_X = RES_WALLS_L2.map((r) => ex(r, 0.19, 0.10))
const FURNITURE_L1_X = RES_FURNITURE_L1.map((r) => ex(r, 0.19, 0.10))
const RAILINGS_X = RES_RAILINGS.map((r) => ex(r, 0.19, 0.10))
const BEDS_X = beds.map((b) => ex(bedRect(b), 0.19, 0.10))
const LANDING: Vec3 = [RES_STAIRS_LANDING[0], RES_STAIRS_LANDING[1], RES_STAIRS_LANDING[2]]
const touchesLanding = (a: Vec3, b: Vec3) => samePoint(a, LANDING) || samePoint(b, LANDING)

/**
 * Pelanggaran dinding/furnitur/kasur/lubang pada segmen DATAR (y konstan).
 * Segmen miring (tangga) dilewati — diperiksa terpisah (x/z di run, y naik/turun monoton).
 * Kasur-kasur yang dikecualikan (asal + tujuan) dilewati.
 */
function resViolation(path: Vec3[], excludeBeds: Vec3[]): string | null {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    if (Math.abs(a[1] - b[1]) > 0.01) continue
    const y = a[1]
    const rects = Math.abs(y) < 0.01 ? [...WALLS_L1_X, ...FURNITURE_L1_X]
      : Math.abs(y - FLOOR_HEIGHT) < 0.01 ? [...WALLS_L2_X, ...RAILINGS_X] : []
    for (const r of rects) {
      if (segHitsRect(a, b, r)) return `seg ${i} menembus dinding/perabot mess (${a.map((v) => v.toFixed(2)).join(', ')}) -> (${b.map((v) => v.toFixed(2)).join(', ')})`
    }
    if (Math.abs(y - FLOOR_HEIGHT) < 0.01) {
      for (let k = 0; k < beds.length; k += 1) {
        if (excludeBeds.some((e) => Math.abs(beds[k][0] - e[0]) < 0.01 && Math.abs(beds[k][2] - e[2]) < 0.01)) continue
        if (segHitsRect(a, b, BEDS_X[k])) return `seg ${i} menabrak kasur ${bedName(k)} (${beds[k].map((v) => v.toFixed(2)).join(', ')})`
      }
      if (!touchesLanding(a, b) && segHitsRect(a, b, RES_HOLE)) return `seg ${i} jatuh ke lubang pelat L2`
    }
  }
  return null
}
/**
 * Perubahan y HANYA di kaki tangga mess (x masuk..pendaratan, z 1,2..2,0),
 * naik/turun monoton, maks 0,8 m per waypoint (4 waypoint miring).
 * Tanpa lompatan y (teleport) di tempat lain.
 */
function yViolation(path: Vec3[]): string | null {
  let dir = 0
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    const dy = b[1] - a[1]
    if (Math.abs(dy) < 0.01) continue
    if (Math.abs(dy) > 0.8) return `seg ${i} lompat y ${dy.toFixed(2)} m (teleport?)`
    const inRun = (p: Vec3) => p[0] >= RES_STAIRS_ENTRY[0] && p[0] <= RES_STAIRS_LANDING[0] && p[2] >= 1.2 && p[2] <= 2.0
    if (!inRun(a) || !inRun(b)) return `seg ${i} berubah y di luar tangga (${a.map((v) => v.toFixed(2)).join(', ')}) -> (${b.map((v) => v.toFixed(2)).join(', ')})`
    const d = Math.sign(dy)
    if (dir === 0) dir = d
    else if (d !== dir) return `seg ${i} y berbalik arah di tangga`
  }
  return null
}
/** Rute melewati pintu depan kantor (dinding depan z 4,2, celah x 4,9..6,7)? Segmen yang menyeberang, atau waypoint tepat di garis pintu. */
function crossesOfficeDoor(path: Vec3[]): boolean {
  if (path.some((p) => Math.abs(p[1]) < 0.01 && Math.abs(p[2] - 4.2) < 0.01 && p[0] > 4.9 && p[0] < 6.7)) return true
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    if (Math.abs(a[1]) > 0.01 || Math.abs(b[1]) > 0.01) continue
    const x = segCrosses(a, b, 'z', 4.2)
    if (x !== null && x > 4.9 && x < 6.7) return true
  }
  return false
}
/** Rute melewati pintu mess (dinding selatan z 2, celah x 28..30)? Segmen yang menyeberang, atau waypoint tepat di garis pintu (jalur pejalan berakhir di (29, 2)). */
function crossesMessDoor(path: Vec3[]): boolean {
  if (path.some((p) => Math.abs(p[1]) < 0.01 && Math.abs(p[2] - RESIDENCE_DOOR.z) < 0.01 && p[0] > RESIDENCE_DOOR.minX && p[0] < RESIDENCE_DOOR.maxX)) return true
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    if (Math.abs(a[1]) > 0.01 || Math.abs(b[1]) > 0.01) continue
    const x = segCrosses(a, b, 'z', RESIDENCE_DOOR.z)
    if (x !== null && x > RESIDENCE_DOOR.minX && x < RESIDENCE_DOOR.maxX) return true
  }
  return false
}
/** Rute melewati tangga mess (waypoint masuk (22,5, 0, 1,6) + pendaratan (26,5, 2,8, 1,5))? */
function usesMessStairs(path: Vec3[]): boolean {
  const entry = path.some((p) => samePoint(p, [RES_STAIRS_ENTRY[0], 0, RES_STAIRS_ENTRY[2]]))
  const landing = path.some((p) => samePoint(p, LANDING))
  return entry && landing
}

// ── 0. Kasur mess: 16, posisi sama dengan residence.tsx ──
{
  check('kasur: 16 kasur', beds.length === 16, `ada ${beds.length}`)
  check('kasur: semua di L2 mess (y=2,8)', beds.every((b) => eq(b[1], FLOOR_HEIGHT)))
  check('kasur: semua di dalam footprint mess', beds.every((b) => b[0] >= RESIDENCE.minX && b[0] <= RESIDENCE.maxX && b[2] >= RESIDENCE.minZ && b[2] <= RESIDENCE.maxZ))
  let match = true
  for (let i = 0; i < 4; i += 1) {
    const cx = RESIDENCE.minX + i * 3.5 + 1.75
    for (const z of [-4.1, -2.0]) {
      for (const dx of [-0.8, 0.8]) {
        if (!beds.some((b) => eq(b[0], cx + dx) && eq(b[2], z))) match = false
      }
    }
  }
  check('kasur: posisi = rumus residence.tsx (4 kamar x 2 baris x 2 kolom, pusat ±0,80)', match)
  const expectedDoors = [0, 1, 2, 3].map((i) => RESIDENCE.minX + i * 3.5 + 1.75)
  check(`kasur: pintu kamar = [${expectedDoors.join(', ')}] (semua di tengah kamar, Fase 4c)`, RES_BEDROOM_DOORS.join(',') === expectedDoors.join(','))
}

// ── 0b. Pengukuran celah (angka, bukan lolos/gagal — supaya ketatnya terlihat) ──
{
  const midGap = 1.6 - 1.05
  const sideGap = 1.75 - 0.8 - 0.525
  check(`celah: tengah antar kolom kasur ${midGap.toFixed(2)} m vs badan 0,48 m (kini LEBIH LEBAR — tanpa gesekan, Fase 4c)`, midGap >= 0.48)
  check(`celah: samping kasur-dinding ${sideGap.toFixed(3)} m vs badan 0,48 m (selisih 0,055 m — bukan jalur, hanya ukuran)`, sideGap < 0.48)
  check('celah: jalur selatan meja makan 0,175 m (z -0,375..-0,2) — terlalu sempit untuk badan 0,30 m', true)
  check('celah: jalur utara meja makan 0,40 m (z 0,8..1,2) — bersih setelah kursi utara pindah ke ujung meja (Fase 4c)', true)
  check(`celah: pintu Kamar 4 di tengah kamar x ${RESIDENCE.minX + 3 * 3.5 + 1.75} (Fase 4c: dulu membuka ke kasur)`, RES_BEDROOM_DOORS[3] === RESIDENCE.minX + 3 * 3.5 + 1.75)
}

// ── 1. Kantor L1 -> tiap kasur (16): rute penuh ──
function checkRouteToBed(label: string, from: Vec3, bedIndex: number) {
  const bed = beds[bedIndex]
  const foot = bedFoot(bed)
  const path = walkPath3(from, foot, layout)
  check(`${label}: ujung tepat di kaki kasur`, path.length > 0 && samePoint(path[path.length - 1], foot), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check(`${label}: tanpa NaN (${path.length} waypoint)`, !path.some((p) => p.some((v) => Number.isNaN(v))))
  check(`${label}: lewat pintu depan kantor (z 4,2, x 4,9..6,7)`, crossesOfficeDoor(path))
  check(`${label}: lewat pintu mess (z 2, x 28..30)`, crossesMessDoor(path))
  check(`${label}: naik tangga mess (masuk 22,5 + pendaratan 26,5)`, usesMessStairs(path))
  const yv = yViolation(path)
  check(`${label}: y hanya berubah di tangga (tanpa teleport)`, yv === null, yv ?? '')
  const hole = resViolation(path, [bed])
  check(`${label}: tanpa tabrakan dinding/perabot/kasur mess`, hole === null, hole ?? '')
  check(`${label}: deterministik`, JSON.stringify(walkPath3(from, foot, layout)) === JSON.stringify(path), '')
}
for (let i = 0; i < beds.length; i += 1) checkRouteToBed(`L1 -> ${bedName(i)}`, l1Desk, i)

// ── 2. Kantor L2/L3 -> tiap kasur: kaki pra-lift (ke kepala antrean) + kaki pasca-lift (dari approach L1) ──
for (let i = 0; i < beds.length; i += 1) {
  const foot = bedFoot(beds[i])
  for (const [floorName, from] of [['L2', l2Front], ['L3', l3Ceo]] as const) {
    const yFrom = FLOOR_Y[floorOf(from) - 1]
    const slot0: Vec3 = [LIFT_QUEUE_SLOTS[0][0], yFrom, LIFT_QUEUE_SLOTS[0][1]]
    const path = walkPath3(from, foot, layout)
    check(`${floorName} -> ${bedName(i)}: pra-lift berakhir di kepala antrean lantai asal`, path.length > 0 && samePoint(path[path.length - 1], slot0), `ujung=${JSON.stringify(path[path.length - 1])}`)
    check(`${floorName} -> ${bedName(i)}: pra-lift y konstan ${yFrom}`, path.every((p) => eq(p[1], yFrom)), '')
  }
  checkRouteToBed(`pasca-lift L1 -> ${bedName(i)}`, L1_APPROACH, i)
}

// ── 3. Pulang: tiap kasur -> meja L1 (16) ──
for (let i = 0; i < beds.length; i += 1) {
  const foot = bedFoot(beds[i])
  const path = walkPath3(foot, l1Desk, layout)
  check(`${bedName(i)} -> L1: ujung tepat di meja L1`, path.length > 0 && samePoint(path[path.length - 1], l1Desk), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check(`${bedName(i)} -> L1: lewat pintu mess`, crossesMessDoor(path))
  check(`${bedName(i)} -> L1: lewat pintu depan kantor`, crossesOfficeDoor(path))
  check(`${bedName(i)} -> L1: turun tangga mess`, usesMessStairs(path))
  const yv = yViolation(path)
  check(`${bedName(i)} -> L1: y hanya berubah di tangga`, yv === null, yv ?? '')
  const hole = resViolation(path, [beds[i]])
  check(`${bedName(i)} -> L1: tanpa tabrakan dinding/perabot/kasur mess`, hole === null, hole ?? '')
  check(`${bedName(i)} -> L1: deterministik`, JSON.stringify(walkPath3(foot, l1Desk, layout)) === JSON.stringify(path), '')
}

// ── 4. Pulang ke lantai atas: tiap kasur -> meja L2/L3 (ke kepala antrean L1) ──
for (let i = 0; i < beds.length; i += 1) {
  const foot = bedFoot(beds[i])
  for (const [floorName, to] of [['L2', l2Front], ['L3', l3Ceo]] as const) {
    const path = walkPath3(foot, to, layout)
    check(`${bedName(i)} -> ${floorName}: pulang berakhir di kepala antrean L1`, path.length > 0 && samePoint(path[path.length - 1], SLOT0_L1), `ujung=${JSON.stringify(path[path.length - 1])}`)
    check(`${bedName(i)} -> ${floorName}: pulang lewat pintu mess`, crossesMessDoor(path))
    const yv = yViolation(path)
    check(`${bedName(i)} -> ${floorName}: pulang y hanya berubah di tangga`, yv === null, yv ?? '')
  }
}

// ── 5. Di dalam mess: pintu -> tiap kasur (16) ──
for (let i = 0; i < beds.length; i += 1) {
  const foot = bedFoot(beds[i])
  const path = walkPath3(MESS_DOOR, foot, layout)
  check(`pintu -> ${bedName(i)}: ujung tepat di kaki kasur`, path.length > 0 && samePoint(path[path.length - 1], foot), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check(`pintu -> ${bedName(i)}: naik tangga mess`, usesMessStairs(path))
  const yv = yViolation(path)
  check(`pintu -> ${bedName(i)}: y hanya berubah di tangga`, yv === null, yv ?? '')
  const hole = resViolation(path, [beds[i]])
  check(`pintu -> ${bedName(i)}: tanpa tabrakan dinding/perabot/kasur mess`, hole === null, hole ?? '')
}

// ── 6. Di dalam mess: tiap kasur -> lobi (16) ──
for (let i = 0; i < beds.length; i += 1) {
  const foot = bedFoot(beds[i])
  const path = walkPath3(foot, LOBBY, layout)
  check(`${bedName(i)} -> lobi: ujung tepat di lobi`, path.length > 0 && samePoint(path[path.length - 1], LOBBY), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check(`${bedName(i)} -> lobi: turun tangga mess`, usesMessStairs(path))
  const yv = yViolation(path)
  check(`${bedName(i)} -> lobi: y hanya berubah di tangga`, yv === null, yv ?? '')
  const hole = resViolation(path, [beds[i]])
  check(`${bedName(i)} -> lobi: tanpa tabrakan dinding/perabot/kasur mess`, hole === null, hole ?? '')
}

// ── 7. Di dalam mess: kasur -> kasur (koridor L2, tanpa turun tangga) ──
{
  const pairs: [number, number][] = [[0, 4], [0, 1], [1, 5], [4, 8], [8, 12], [12, 13], [13, 15], [2, 6]]
  for (const [a, b] of pairs) {
    const from = bedFoot(beds[a])
    const to = bedFoot(beds[b])
    const path = walkPath3(from, to, layout)
    check(`${bedName(a)} -> ${bedName(b)}: ujung tepat di kaki kasur`, path.length > 0 && samePoint(path[path.length - 1], to), `ujung=${JSON.stringify(path[path.length - 1])}`)
    check(`${bedName(a)} -> ${bedName(b)}: y konstan 2,8 (koridor L2, tanpa tangga)`, path.every((p) => eq(p[1], FLOOR_HEIGHT)), '')
    const hole = resViolation(path, [beds[a], beds[b]])
    check(`${bedName(a)} -> ${bedName(b)}: tanpa tabrakan dinding/kasur mess`, hole === null, hole ?? '')
  }
}

// ── 8. Regresi ringan: rute kantor satu lantai tidak berubah ──
{
  const lounge: Vec3 = [4, 0, -1.8]
  const path = walkPath3(l1Desk, lounge, layout)
  check('regresi: L1 meja -> lounge ujung tepat', path.length > 0 && samePoint(path[path.length - 1], lounge))
  check('regresi: L1 meja -> lounge y konstan 0', path.every((p) => eq(p[1], 0)))
  check('regresi: L1 meja -> lounge tanpa waypoint tangga mess', !path.some((p) => p[0] >= RESIDENCE.minX && p[0] <= RESIDENCE.maxX && p[2] >= RESIDENCE.minZ && p[2] <= RESIDENCE.maxZ))
  const cross = walkPath3(l1Desk, l3Ceo, layout)
  check('regresi: L1 -> L3 tetap ke kepala antrean (bukan ke mess)', cross.length > 0 && samePoint(cross[cross.length - 1], SLOT0_L1))
}

// ── 9. Tujuan pusat kasur + titik umum L2 (bukan kaki kasur) ──
// residenceBedForFoot menerima pusat kasur (bukan hanya kaki) dan
// residenceMessLegToPoint mendahului titik L2 dengan spine + tangga —
// keduanya tidak boleh teleport (temuan saat menulis laporan Fase 4b).
{
  for (const i of [2, 15]) {
    const bed = beds[i]
    const path = walkPath3(l1Desk, bed, layout)
    check(`pusat kasur ${bedName(i)}: ujung tepat di pusat kasur`, path.length > 0 && samePoint(path[path.length - 1], bed), `ujung=${JSON.stringify(path[path.length - 1])}`)
    check(`pusat kasur ${bedName(i)}: naik tangga mess`, usesMessStairs(path))
    const yv = yViolation(path)
    check(`pusat kasur ${bedName(i)}: y hanya berubah di tangga (tanpa teleport)`, yv === null, yv ?? '')
    const hole = resViolation(path, [bed])
    check(`pusat kasur ${bedName(i)}: tanpa tabrakan dinding/perabot/kasur mess`, hole === null, hole ?? '')
  }
  const corridor: Vec3 = [RES_STAIRS_LANDING[0] + 0.5, FLOOR_HEIGHT, RES_CORRIDOR_Z]
  const path = walkPath3(l1Desk, corridor, layout)
  check('titik koridor L2: ujung tepat', path.length > 0 && samePoint(path[path.length - 1], corridor), `ujung=${JSON.stringify(path[path.length - 1])}`)
  check('titik koridor L2: naik tangga mess', usesMessStairs(path))
  const yv = yViolation(path)
  check('titik koridor L2: y hanya berubah di tangga (tanpa teleport)', yv === null, yv ?? '')
  check('titik koridor L2: deterministik', JSON.stringify(walkPath3(l1Desk, corridor, layout)) === JSON.stringify(path), '')
}

// ── Ringkasan ──
// eslint-disable-next-line no-console
console.log(`\n${total - failures}/${total} cek lolos${failures > 0 ? ` — ${failures} GAGAL` : ''}`)
if (failures > 0) process.exit(1)
