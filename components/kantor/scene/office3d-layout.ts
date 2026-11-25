/**
 * Diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha).
 * File asli: src/office3d-layout.ts — dilisensikan di bawah lisensi MIT.
 * Di-port ke WOORK (Next.js 14 + React 18 + @react-three/fiber 8 + three 0.169).
 * Kontrak data diganti ke KantorStation WOORK (lib/kantor/types.ts); seat tetap 1-based, gedung tumbuh mengikuti jumlah agent.
 */

import type { KantorStation } from '@/lib/kantor/types'

// Layout of the 3D office (world units ≈ metres, y up, +z towards the street).
// Kept apart from the scene so it can be tested. The office adapts to the crew: there is one
// unlabeled desk per agent (hot desking), and the building grows to the left to fit them.
//
//   z -5 ┌──────────── back wall ────────────┬────┬───────────┐
//   gang │ desks (one per agent, two rows,   │ lounge │ game room │
//  bakso │  growing to the left)             │(TV,sofa)│          │
//   kopi │ meeting room (long table, TV,     │  pantry ├──────────┘
//        │  whiteboard) │ lift (pindah lantai, antre FIFO)
//   z  4 └── low front wall ─── entrance ───────────┘
//        sidewalk · flag      (street food sits in the gang left of the building)
//        road
//
// Lantai 2 (Fase 3b) sits on the same footprint, FLOOR_HEIGHT up: 8 klaster
// divisi Tech (4 pod baris belakang + 4 pasang baris depan) + balkon, reached
// by the lift (antre FIFO, satu agent per trip). Dorm, lesehan, kamar mandi
// dan balkon PINDAH ke lantai 3, reached by the lift.
// Positions on lantai 3 have y = 2 × FLOOR_HEIGHT.

export type Vec3 = [number, number, number]

/** Glass wall between the workspace and the lounge (back part, up to LOUNGE_PARTITION_END_Z). */
export const PARTITION_X = 0.4
export const LOUNGE_PARTITION_END_Z = -0.5
/** Game room wing right of the building, entered through a door in the lounge wall. */
export const GAME_ROOM = { minX: 9.5, maxX: 15.5, minZ: -5.2, maxZ: 0.6 }
/** Walking line from the lounge lane through the game room door, and the door's extent. */
export const GAME_LANE_Z = -3.7
export const GAME_DOOR = { fromZ: -4.4, toZ: -3.0 }
export const PING_PONG: Vec3 = [12.6, 0, -1.4]
export const ARCADES: Vec3[] = [[10.6, 0, -4.75], [11.6, 0, -4.75]]
export const GAME_TV: Vec3 = [14.2, 0, -5.05]
export const BEANBAGS: Vec3[] = [[13.7, 0, -4.35], [14.7, 0, -4.35]]
export const CARROM: Vec3 = [10.6, 0, -0.1]

/** Walkway in front of the desks; agents walk along it between areas instead of through furniture. */
export const AISLE_Z = 0.4
/** The meeting room's right wall (glass), its door in the aisle-side wall, and its table line. */
export const MEETING_ROOM_MAX_X = -3.2
export const MEETING_ROOM_MIN_Z = 0.95
export const MEETING_DOOR_X = -4.15
export const MEETING_TABLE_Z = 2.75
/** Walking lanes inside the meeting room: behind the aisle-side chairs and behind the front ones. */
const MEETING_BACK_LANE_Z = 1.45
const MEETING_FRONT_LANE_Z = 3.95
const MEETING_SEAT_PITCH = 0.8
/** The TV hangs on the back wall; the sofa faces it (backrest towards the aisle). */
export const TV: Vec3 = [4.6, 0, -4.8]
export const SOFA: Vec3 = [4.6, 0, -1.3]
export const LOUNGE_SEATS: Vec3[] = [[4, 0, -1.8], [2.5, 0, -2.9], [6.7, 0, -2.9]]
const LOUNGE_FACING = [Math.PI, Math.PI / 2, -Math.PI / 2]
export const COFFEE_TABLE: Vec3 = [4.6, 0, -2.9]

/**
 * MUSALA (lantai 1, Musala Virtual): di antara ruang meeting (dinding
 * timur x = MEETING_ROOM_MAX_X) dan partisi lounge (x = PARTITION_X),
 * di depan gang (z = 1.0, sejajar dinding utara ruang meeting). Area ini
 * sebelumnya lantai kosong — TIDAK ada ruangan atau furniture yang
 * digeser. Dinding barat = dinding timur ruang meeting (sudah ada);
 * dinding selatan = dinding depan gedung (sudah ada, rendah, gaya
 * dollhouse); dinding utara + timur dibangun komponen Musala
 * (environment.tsx). Pintu di dinding utara, menghadap gang (AISLE_Z).
 */
export const MUSALA = { minX: -3.2, maxX: 0.4, minZ: 1.0, maxZ: 4.15 }
/** Pintu musala (dinding utara) + jalur jalan di dalam musala (tepat di
 *  dalam pintu, di utara saf pertama) — agent masuk/keluar lewat sini,
 *  bukan menembus dinding atau saf. */
export const MUSALA_DOOR_X = -0.6
export const MUSALA_LANE_Z = 1.3
/** Arah kiblat Jakarta: 295,15° dari utara (GET /api/kantor/prayer/schedule).
 *  Dipakai sebagai fallback sebelum jadwal termuat; nilai yang sama juga
 *  dihitung server dari lat/lng perusahaan. */
export const DEFAULT_QIBLA_BEARING = 295.15
/** Gap in the low front wall, and the walking line along the sidewalk just outside it. */
export const ENTRANCE_X = 5.8
export const SIDEWALK_Z = 5.4
/** Lounge agents step to this lane first, so they pass between the armchair and the TV. */
export const LOUNGE_LANE_X = 3.1
export const STALL_ROTATION = Math.PI / 2
/**
 * WOORK STAFF RESIDENCE — mess karyawan (Fase 1, 2026-11-23): bangunan
 * 2 lantai di TIMUR kantor (kanan dari kamera default), footprint
 * 14 x 7,2 m, jarak 6,5 m dari dinding timur SAYAP GAME ROOM (x 15,5;
 * 12,5 m dari dinding utama kantor x 9,5) — Fase 1 AI Campus
 * (2026-11-24): mess digeser +4 m ke timur (dulu 12..26, jarak 2,5 m);
 * Fase 1b AI Campus (2026-11-24): mess digeser +6 m lagi ke timur
 * (16..30 → 22..36) supaya celahnya dari sayap Game Room benar-benar
 * 6,5 m. Satu sumber koordinat mess — jangan angka mati di
 * tempat lain.
 */
export const RESIDENCE = { minX: 22, maxX: 36, minZ: -5.2, maxZ: 2 }
/** Pintu selatan mess (x 28..30, dinding z = 2), menghadap +z ke trotoar/jalan. */
export const RESIDENCE_DOOR = { minX: 28, maxX: 30, z: 2 }
/** Tiang bendera — pindah ke timur mess (Fase 1 Residence; dulu [16.4, 0, 2.6],
 *  0,6 m di depan dinding selatan mess; Fase 1 AI Campus: 27,5 → 31,5;
 *  Fase 1b AI Campus: 31,5 → 37,5). */
export const RESIDENCE_FLAG: Vec3 = [37.5, 0, 2.6]
/**
 * WOORK STAFF RESIDENCE — pathfinding (Fase 4b, 2026-11-23).
 *
 * Satu sumber koordinat mess untuk routing (jangan angka mati di tempat
 * lain): pintu selatan, tangga (Fase 4a), koridor L2, pintu kamar, dan
 * kasur — rumusnya sama dengan residence.tsx (`beds`, `doorCenters`,
 * `RES_STAIRS`, `RES_BED_ROWS_Z` di sana). residence.tsx TIDAK diimpor
 * ke sini (komponen React) — bila geometri mess berubah, samakan kedua
 * tempat (skrip verify-fase4.ts memeriksa kesamaannya).
 */
/** Pusat pintu selatan mess (x 28..30). */
export const RES_DOOR_X = (RESIDENCE_DOOR.minX + RESIDENCE_DOOR.maxX) / 2
/**
 * Titik masuk mess (x 28,5, di dalam celah pintu 28..30): di BARAT
 * partisi x=29 — partisi itu punya segmen selatan (z 1,45..2,0) yang
 * bertemu dinding selatan, jadi agent yang masuk di x 29 lalu jalan
 * ke utara akan menembus partisi; masuk di x 28,5 (0,135 m dari
 * partisi, badan 0,48 m) lalu ke utara di x 28,5 aman.
 */
export const RES_ENTRY_X = RESIDENCE_DOOR.minX + 0.5
/** Titik masuk tangga mess (Fase 4a): bawah tangga, ujung barat run. */
export const RES_STAIRS_ENTRY: Vec3 = [RESIDENCE.minX + 0.5, 0, 1.6]
/** Pendaratan tangga di koridor L2 mess (Fase 4a): ujung timur run. */
export const RES_STAIRS_LANDING: Vec3 = [RESIDENCE.minX + 4.5, 2.8, 1.5]
/** Jalur jalan koridor L2 mess (koridor z -0,8..1,2 — tengah 0,2). */
export const RES_CORRIDOR_Z = 0.2
/** Pusat celah pintu tiap kamar mess = tengah kamar (Kamar 4 x 28,25
 *  sejak Fase 4c — dulu 27,0 karena dinding barat kamar mandi di
 *  x 27,5; pintu di 27,0 membuka ke kasur depan-barat sehingga 3
 *  kasur Kamar 4 tak terjangkau. Kamar mandi kini menyempit, dinding
 *  barat x 28,7 — lihat residence.tsx). */
export const RES_BEDROOM_DOORS = Array.from({ length: 4 }, (_, i) => RESIDENCE.minX + i * 3.5 + 1.75)
/** Baris kasur mess (pusat, z): sama dengan RES_BED_ROWS_Z di residence.tsx. */
export const RES_BED_ROWS_Z = [-4.1, -2.0]
/** Di dalam footprint mess (x,z)? Dipakai walkPath3 + Character (Fase 5)
 *  supaya tujuan mess tidak dikira lantai 2 kantor. */
export const inResidenceXZ = (x: number, z: number): boolean =>
  x >= RESIDENCE.minX && x <= RESIDENCE.maxX && z >= RESIDENCE.minZ && z <= RESIDENCE.maxZ
/**
 * Posisi 16 kasur mess (L2, y = FLOOR_HEIGHT): 4 kamar × 2 baris × 2
 * kolom, kepala ke utara — urutan sama dengan `beds` di residence.tsx
 * (per kamar, baris utara dulu, lalu kolom barat dulu). Kolom pusat
 * ±0,80 sejak Fase 4c (dulu ±0,75) supaya celah tengah 0,55 m.
 */
export function residenceBeds(): Vec3[] {
  const beds: Vec3[] = []
  for (let i = 0; i < 4; i += 1) {
    const centerX = RESIDENCE.minX + i * 3.5 + 1.75
    for (const z of RES_BED_ROWS_Z) {
      for (const dx of [-0.8, 0.8]) beds.push([centerX + dx, FLOOR_HEIGHT, z])
    }
  }
  return beds
}
/** The flag stands at the front-right corner of the grounds, clear of the rooms in view.
 *  Fase 1 Residence: sama dengan RESIDENCE_FLAG (satu sumber). */
export const FLAG: Vec3 = RESIDENCE_FLAG

/** Height of one floor above the one below: lantai 2 di y = 2.8, lantai 3 di y = 5.6. */
export const FLOOR_HEIGHT = 2.8
export type Floor = 1 | 2 | 3
/** Tampilan lantai yang sedang dilihat (Fase 5a): nomor lantai, atau 'all'
 *  = All Floors View (ketiga lantai sekaligus). `Floor` (numerik) tetap
 *  dipakai untuk lantai fisik — pemetaan posisi, routing jalan agent,
 *  demo-tour — supaya tidak ada yang berubah di sana. */
export type FloorView = Floor | 'all'
/** Sudut pandang kamera: posisi + target orbit (dipakai tur demo, lift
 *  ride, dan glide Fase 5a — satu tipe bersama, bukan definisi ganda). */
export interface CameraView { position: Vec3; target: Vec3 }
/** Lantai tempat sebuah posisi berada — ambang di tengah antar-lantai
 *  (1.4 = 2.8/2; 4.2 = (2.8+5.6)/2). Ditulis literal mengikuti audit §3.5
 *  supaya nilai tepat di ambang tidak bergantung pada pembulatan float. */
export const floorOf = (position: Vec3 | number): Floor => {
  const y = typeof position === 'number' ? position : position[1]
  return y > 4.2 ? 3 : y > 1.4 ? 2 : 1
}
/** Shaft lift (Fase 2a): sudut timur laut di atas pantry, menembus 3 lantai. Pintu menghadap barat (x = minX). */
export const LIFT = { minX: 8.5, maxX: 9.5, minZ: 2.9, maxZ: 4.2 }
/** Tengah pintu lift di dinding barat shaft. */
export const LIFT_DOOR_Z = 3.55
/** Titik tunggu di depan pintu lift (0,5 m di barat pintu, di luar shaft).
 *  Jalur ke titik ini bebas perabot: di lantai 1 garis x = 8,0 dari gang
 *  (kulkas x ≥ 8,65, counter pantry x ≥ 8,75); di lantai 3 lewat koridor
 *  lift x = LIFT_LANE_X. */
export const LIFT_APPROACH: [number, number] = [8.0, LIFT_DOOR_Z]
/**
 * Posisi z kabin lift saat naik/turun (Fase 5b): 3,85, BUKAN tengah pintu
 * (3,55) — ujung utara counter pantry (x 8,75–9,35, z sampai 3,6) masuk
 * ke dalam shaft lantai 1, jadi kabin di z 3,55 berdiri di atas counter.
 * z 3,85 = titik tengah antara ujung counter (3,625) dan dinding selatan
 * shaft (4,08): badan agent (0,3) bebas ~0,08 m di kedua sisi; pintu
 * (celah z 3,1–4,0) tetap dilewati. Lantai 2/3 shaft kosong — z ini
 * aman di semua lantai.
 */
export const LIFT_CABIN_Z = 3.85

/** Koridor lift lantai 3 (lift-only 2026-11-23): jalur x = 5,2 dari gang
 *  ke strip depan, menghindari ruang rapat eksekutif (x 5,4–8,5,
 *  z 0,4–2,95). */
export const LIFT_LANE_X = 5.2
/** Slot antre lift (lift-only 2026-11-23): 6 slot di strip depan
 *  z = 3,55, slot 0 paling dekat pintu; satu agent per trip. */
export const LIFT_QUEUE_SLOTS: [number, number][] = [[7.0, LIFT_DOOR_Z], [6.0, LIFT_DOOR_Z], [5.0, LIFT_DOOR_Z], [4.0, LIFT_DOOR_Z], [3.0, LIFT_DOOR_Z], [2.0, LIFT_DOOR_Z]]
/** Kecepatan kabin lift (lift-only 2026-11-23): 1,0 m/dtk, seperti lift asli. */
export const LIFT_SPEED_MPS = 1.0
/** Durasi buka/tutup pintu lift (lift-only 2026-11-23), masing-masing. */
export const LIFT_DOOR_TIME_S = 1.0
/** Kapasitas lift (lift-only 2026-11-23): satu agent per trip — antre satu-satu. */
export const LIFT_CAPACITY = 1

/** Potongan pelat lantai 2 dan 3 (lift-only 2026-11-23): 3 potong interior
 *  di sekitar lubang shaft lift, lalu balkon (potongan ke-4, TERAKHIR).
 *  Pelat kini penuh di area bekas jalur lama (potongan ke-3 menutup
 *  strip depan sampai maxZ). Lantai 2 TIDAK memakai potongan balkon
 *  sejak 2026-11-23 (balkon lantai 2 dihapus — UpperFloor memakai
 *  slice(0, 3)); lantai 3 memakai keempat potong. */
export function floorSlabPieces(building: { minX: number; maxX: number; minZ: number; maxZ: number }): [number, number, number, number][] {
  const { minX, maxX, minZ, maxZ } = building
  const l = LIFT
  return [
    [minX, l.minX, minZ, l.minZ],
    [l.minX, l.maxX, minZ, l.minZ],
    [minX, l.minX, l.minZ, maxZ],
    [minX, maxX, BALCONY.minZ, BALCONY.maxZ],
  ]
}

/**
 * Batas ruangan lantai 3 (Fase 2a). Blok barat-daya (x minX–0.4) dibagi
 * proporsional menjadi Command Center / CEO / Strategy&PM supaya tetap
 * muat untuk segala ukuran gedung; ruangan lain berkoordinat tetap.
 * Dipakai scene + (nanti) demo-tour dan pemetaan divisi Fase 3.
 */
export function floor3Rooms(building: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const { minX, maxX, minZ, maxZ } = building
  const w = PARTITION_X - minX
  return {
    bedroom: { minX, maxX: PARTITION_X, minZ, maxZ: -0.3 },
    lesehan: { minX: 2.6, maxX: 6.0, minZ: -4.4, maxZ: -1.6 },
    bathroom: { ...BATHROOM },
    commandCenter: { minX, maxX: minX + w * 0.33, minZ: 0.4, maxZ },
    ceoOffice: { minX: minX + w * 0.33, maxX: minX + w * 0.65, minZ: 0.4, maxZ },
    strategyPm: { minX: minX + w * 0.65, maxX: PARTITION_X, minZ: 0.4, maxZ },
    legal: { minX: PARTITION_X, maxX: 4.2, minZ: 0.4, maxZ: 2.95 },
    execMeeting: { minX: 5.4, maxX: 8.5, minZ: 0.4, maxZ: 2.95 },
    execLoungeBalcony: { minX, maxX, minZ: BALCONY.minZ, maxZ: BALCONY.maxZ },
  }
}
/** Balcony over the front of the building, and the sliding door onto it. */
export const BALCONY = { minZ: 4.2, maxZ: 6.6 }

/**
 * DIVISI TECH LANTAI 2 (Fase 3b). Delapan klaster — empat baris belakang
 * (pod: dua meja berhadapan) dan empat baris depan (dua meja berdampingan).
 * `name` = Department.name di DB (dipakai mencocokkan agent → klaster);
 * `short` = nama di plang totem (pendek supaya terbaca dari kamera default).
 * Baris belakang memakai pod supaya jalur samping kursi (DESK_SIDE_LANE)
 * tidak menembus meja klaster sebelah: pod hanya selebar satu meja.
 */
export const TECH_DIVISIONS: { name: string; short: string; row: 'back' | 'front' }[] = [
  { name: 'Frontend Engineering', short: 'Frontend', row: 'back' },
  { name: 'Backend Engineering', short: 'Backend', row: 'back' },
  { name: 'AI & Automation', short: 'AI & Automation', row: 'back' },
  { name: 'DevOps & Infrastructure', short: 'DevOps', row: 'back' },
  { name: 'Product Management', short: 'Product', row: 'front' },
  { name: 'UI/UX Design', short: 'UI/UX', row: 'front' },
  { name: 'Quality Assurance', short: 'QA', row: 'front' },
  { name: 'Collaboration Hub', short: 'Collaboration', row: 'front' },
]
/** Baris belakang: meja menghadap +z (rotasi 0) dan -z (rotasi PI). */
const TECH_BACK_DESK_Z = [-3.5, -2.0]
/** Baris depan: dua meja berdampingan, keduanya menghadap +z (rotasi 0). */
const TECH_FRONT_DESK_Z = 1.8
const TECH_FRONT_DESK_DX = 1.2
/** Warna karpet tiap klaster (berputar, supaya batas divisi terlihat). */
const TECH_RUG_COLORS = ['#5b7c8c', '#8a4b3c', '#6d5a8c', '#2a9d8f', '#c9a24a', '#e76f51', '#3d7fd6', '#7a5c8c']

/** Satu meja kerja: posisi + arah hadap (rotation.y WorkDesk). */
export interface DivisionDesk {
  /** Id stabil meja (dipakai status menyala di scene): `tech:<divisi>:<i>` / `exec:<ruang>:<i>` / `l1:<i>`. */
  id: string
  desk: Vec3
  rotation: number
}

/** Satu klaster divisi lantai 2: meja + karpet + posisi totem nama. */
export interface TechCluster {
  key: string
  name: string
  short: string
  row: 'back' | 'front'
  centerX: number
  desks: DivisionDesk[]
  rug: { center: Vec3; size: [number, number]; color: string }
  /** Posisi totem plang nama (di sisi timur klaster, di luar jalur jalan). */
  totem: Vec3
  totemWidth: number
}

/**
 * Ruangan eksekutif lantai 3 dari `zone` divisi (Department.zone, dari
 * seed Fase 3a): 'CEO Office' / 'Strategy & PM' / 'Project Management' /
 * 'Legal' / 'AI Command Center'. Zone lain / kosong = bukan ruangan
 * eksekutif (agent jatuh ke meja L1).
 */
export function execRoomForZone(zone: string | null | undefined): 'CEO Office' | 'Strategy & PM' | 'Legal' | 'AI Command Center' | null {
  if (!zone) return null
  if (zone === 'CEO Office') return 'CEO Office'
  if (zone === 'Strategy & PM' || zone === 'Project Management') return 'Strategy & PM'
  if (zone === 'Legal') return 'Legal'
  if (zone === 'AI Command Center') return 'AI Command Center'
  return null
}

/**
 * Kursi sebuah meja: di sisi berlawanan monitor. Monitor di sisi +z lokal
 * meja (rotasi 0 = monitor di +z, kursi di z-0,75 menghadap +z — sama
 * seperti deskPlacement lama); rotasi PI = kursi di z+0,75 menghadap -z;
 * rotasi -PI/2 (Command Center, menghadap TV dinding barat) = kursi di
 * x+0,75 menghadap -x.
 */
export function chairForDesk(desk: Vec3, rotation: number): Placement {
  const [x, y, z] = desk
  return {
    position: [x - Math.sin(rotation) * 0.75, y, z - Math.cos(rotation) * 0.75],
    facing: rotation,
    seated: true,
  }
}
export const BALCONY_DOOR = { fromX: 6.2, toX: 7.4 }
const BALCONY_LANE_Z = 5
export const BALCONY_TABLE: Vec3 = [0.6, FLOOR_HEIGHT, 5.5]
export const HAMMOCK: Vec3 = [4.2, FLOOR_HEIGHT, 5.95]
/** Lesehan corner upstairs: a low table on a carpet with floor cushions around it. Fase 2a: pindah ke lantai 3 bersama dorm. */
export const LESEHAN_TABLE: Vec3 = [4.3, 2 * FLOOR_HEIGHT, -3]
/** Perabot balkon lantai 3 (y = 2 × FLOOR_HEIGHT) — balkon lantai 2 TIDAK berubah. */
export const BALCONY3_TABLE: Vec3 = [0.6, 2 * FLOOR_HEIGHT, 5.5]
export const HAMMOCK3: Vec3 = [4.2, 2 * FLOOR_HEIGHT, 5.95]
export const BATHROOM = { minX: 7.6, maxX: 9.5, minZ: -5.2, maxZ: -2.6 }
/** Rest spots stand above the desk columns, in two rows with their heads to the back wall. */
const REST_ROWS_Z = [-4.1, -1.6]

/** Hot desking: one unlabeled desk per agent, in two rows that grow to the left. */
const DESK_RIGHT_X = -2
const DESK_PITCH = 2.6
const DESK_ROWS_Z = [-3.5, -1]
const MIN_DESK_COLUMNS = 3
/** The stock building (up to six agents) and the scene width the camera is framed for. */
const BASE_MIN_X = -9.5
const BASE_SCENE_WIDTH = 28.7
const CAMERA_OFFSET_BASE: Vec3 = [-3.9, 15.2, 18.8]

/**
 * Where and how an agent is. `pose` lying (bed, hammock: `height` is the surface) or sitting on
 * the floor (lesehan); otherwise standing, or sitting on a chair when `seated`.
 */
export interface Placement { position: Vec3; facing: number; seated: boolean; label?: string; pose?: 'lie' | 'floor'; height?: number }
export interface IdleStop { key: string; label: string; spots: Placement[] }

export interface OfficeLayout {
  deskCount: number
  building: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Meja L1 (hot desking, satu per agent — TIDAK berubah di Fase 3b, supaya
   *  ruang kerja lantai 1 + ukuran gedung tetap persis seperti sebelumnya). */
  desks: Vec3[]
  /** One rest spot per agent in the Creative Lounge on lantai 3 (y = 2 × FLOOR_HEIGHT;
   *  dulu kasur dorm — kasur dihapus di Residence Fase 3a, agent istirahat di karpet lounge). */
  restSpots: Vec3[]
  /**
   * Klaster divisi lantai 2 (Fase 3b): 8 klaster statis — selalu ada
   * (meja kosong untuk agent mendatang), agent yang ditempatkan duduk di
   * klaster divisinya. Posisi dihitung dari `building` (gedung tumbuh
   * mengikuti jumlah agent, klaster ikut melebar).
   */
  techClusters: TechCluster[]
  /**
   * Meja ruangan eksekutif lantai 3 (Fase 3b, dari floor3Rooms): Command
   * Center (2, menghadap TV barat), CEO Office (1), Strategy & PM (2),
   * Legal (1). Render TopFloor dari sini (satu sumber kebenaran dengan
   * placement) — bukan posisi hardcode ganda di environment.tsx.
   */
  execDesks: DivisionDesk[]
  /** Kursi semua meja (L1 + klaster L2 + ruangan L3): dipakai routing jalan
   *  (deskSideLane) supaya agent memutari ujung meja, bukan menembus desktop. */
  deskChairs: { chair: Vec3; desk: Vec3 }[]
  /**
   * Meja tempat tiap agent BEKERJA (Fase 3b, division-aware): agent dengan
   * divisi lantai 2/3 → meja divisinya; agent divisi lantai 1 / tanpa
   * divisi → meja L1-nya (desks[seat-1], seperti sebelumnya). Kunci = seat.
   */
  deskForSeat: Map<number, { placement: Placement; deskId: string }>
  /** Walking line up the gang (alley) along the left outside wall, between the wall and the carts. */
  sideLaneX: number
  /** Street food parks in the gang, turned so its stools and customers face the building. */
  baksoCart: Vec3
  kopiBike: Vec3
  gangCenterX: number
  /** Meeting room in the front of the workspace: a long table (x1..x2) with a TV on a stand at its left end and a whiteboard at its right. */
  meetingRoom: { minX: number; maxX: number; minZ: number; maxZ: number; table: { x1: number; x2: number; z: number }; tv: Vec3; whiteboard: Vec3; seats: Placement[] }
  camera: { target: Vec3; offset: Vec3 }
  /** How far the view may be panned (camera target bounds), so the office never leaves the screen. */
  pan: { minX: number; maxX: number; minZ: number; maxZ: number }
  idleStops: IdleStop[]
}

const spot = (x: number, z: number, facing: number, seated = false, label?: string): Placement => ({ position: [x, 0, z], facing, seated, ...(label ? { label } : {}) })
/** Spot di lantai 3 (dorm pindah dari lantai 2 di Fase 2): y = 2 × FLOOR_HEIGHT. */
const upstairs = (x: number, z: number, facing: number, extra: Partial<Placement> = {}): Placement => ({ position: [x, 2 * FLOOR_HEIGHT, z], facing, seated: false, ...extra })
/** Lying at a rest spot in the Creative Lounge: feet at the foot end, head toward the back wall. */
export const restSpot = ([x, , z]: Vec3, label?: string): Placement => upstairs(x, z + 0.95, 0, { pose: 'lie', height: 0.5, ...(label ? { label } : {}) })
/**
 * Berbaring di kasur mess (Fase 5b): pola SAMA seperti restSpot kantor —
 * kaki di ujung kaki kasur (tengah kasur + 0,95 ke selatan), kepala ke
 * bantal (dinding utara, headboard di z −1,0), pose 'lie', height 0,5 =
 * permukaan mattress (mattress top 0,48, selimut 0,53 — lihat <Bed> di
 * props.tsx). Bila placement di tengah kasur, badan (±1,7 m dari titik
 * placement ke utara, lihat Character di Office3D.tsx) menembus headboard
 * / dinding kamar — jadi "tengah kasur" di desain §0.3 dibaca sebagai
 * "di atas kasur", bukan titik tengah geometrinya.
 */
export const residenceBedSpot = (bed: Vec3, label?: string): Placement => ({ position: [bed[0], FLOOR_HEIGHT, bed[2] + 0.95], facing: 0, seated: false, pose: 'lie', height: 0.5, ...(label ? { label } : {}) })
/** A spot given in a stall's own coordinates (as if unrotated), placed in the world. */
function stallSpot(stall: Vec3, x: number, z: number, facing: number, seated = false): Placement {
  const cos = Math.cos(STALL_ROTATION)
  const sin = Math.sin(STALL_ROTATION)
  return spot(stall[0] + x * cos + z * sin, stall[2] - x * sin + z * cos, facing + STALL_ROTATION, seated)
}

/**
 * Where idle agents spend their time. Each stop has a few spots; idlePlan spreads agents so that
 * no two share a spot while free ones remain.
 */
function idleStops(building: OfficeLayout['building'], baksoCart: Vec3, kopiBike: Vec3, restSpots: Vec3[]): IdleStop[] {
  const [tableX, , tableZ] = LESEHAN_TABLE
  return [
    { key: 'tidur', label: 'Sleeping', spots: restSpots.map((spot) => restSpot(spot)) },
    { key: 'balkon', label: 'Relaxing on the balcony', spots: [
      upstairs(BALCONY3_TABLE[0] - 0.85, BALCONY3_TABLE[2], Math.PI / 2, { seated: true }),
      upstairs(BALCONY3_TABLE[0] + 0.85, BALCONY3_TABLE[2], -Math.PI / 2, { seated: true }),
      upstairs(HAMMOCK3[0] + 0.9, HAMMOCK3[2], -Math.PI / 2, { pose: 'lie', height: 0.62, label: 'Napping in the hammock' }),
      upstairs(7.9, BALCONY.maxZ - 0.45, 0, { label: 'Enjoying the view from the balcony' }),
    ] },
    { key: 'lesehan', label: 'Lesehan upstairs', spots: [[-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2], [0, -0.85, 0], [0, 0.85, Math.PI]].map(([dx, dz, facing]) => upstairs(tableX + dx, tableZ + dz, facing, { pose: 'floor' })) },
    { key: 'lounge', label: 'Relaxing in the lounge', spots: LOUNGE_SEATS.map(([x, , z], index) => spot(x, z, LOUNGE_FACING[index], true)) },
    { key: 'galon', label: 'Getting water from the galon', spots: [spot(8.35, -0.4, Math.PI / 2), spot(8.2, -1.05, 2.2), spot(8.2, 0.3, 1.1)] },
    // On the gerobak's plastic stools, facing the cart.
    { key: 'bakso', label: 'Eating bakso', spots: [stallSpot(baksoCart, 0.5, 1.1, Math.PI, true), stallSpot(baksoCart, -0.3, 1.2, Math.PI, true), stallSpot(baksoCart, 1.3, 0.9, -2.4)] },
    // Spot ketiga digeser dari x 8.25 ke 7.9: 0,25 m dari dinding barat shaft lift (x 8.5)
    // terlalu dekat — agent berdiri menempel pintu lift (pintu di z 3.1–4.0).
    { key: 'dapur', label: 'In the kitchen', spots: [spot(8.25, 2.6, Math.PI / 2), spot(8.3, 0.65, Math.PI / 2), spot(7.9, 3.3, Math.PI / 2)] },
    { key: 'kopi', label: 'Coffee at the kopi bike', spots: [stallSpot(kopiBike, -0.5, 0.85, Math.PI), stallSpot(kopiBike, 0.5, 0.85, Math.PI), stallSpot(kopiBike, 1.45, 0.3, -Math.PI / 2)] },
    { key: 'game', label: 'Playing ping-pong', spots: [spot(PING_PONG[0] - 1.75, PING_PONG[2], Math.PI / 2), spot(PING_PONG[0] + 1.75, PING_PONG[2], -Math.PI / 2), spot(BEANBAGS[0][0], BEANBAGS[0][2], Math.PI, true, 'Gaming on the console')] },
    { key: 'arcade', label: 'Playing arcade games', spots: [spot(ARCADES[0][0], ARCADES[0][2] + 0.8, Math.PI), spot(ARCADES[1][0], ARCADES[1][2] + 0.8, Math.PI), spot(BEANBAGS[1][0], BEANBAGS[1][2], Math.PI, true, 'Gaming on the console')] },
    { key: 'jalan', label: 'Taking a stroll', spots: [spot(FLAG[0] - 0.8, FLAG[2] + 0.3, Math.PI / 2), spot(building.minX + 0.95, -0.9, -Math.PI / 2), spot(1.3, -4.4, Math.PI)] },
  ]
}

/**
 * Agent yang dikenal layout (Fase 3b): seat + divisi. `KantorStation`
 * memenuhi bentuk ini (department opsional) — agent tanpa divisi (atau
 * panggilan lama berupa angka) berperilaku persis seperti sebelumnya.
 */
export interface LayoutAgent {
  seat: number
  department?: { name: string; floor: number | null; zone: string | null } | null
}

/**
 * Klaster Tech lantai 2 dari batas gedung (Fase 3b). Baris belakang = pod
 * (dua meja berhadapan, z -3,5/-2,0); baris depan = dua meja berdampingan
 * (z 1,8). Rentang x yang bisa dipakai meja: dinding barat (minX + 0,125
 * + setengah lebar meja 0,95) s.d. dinding barat shaft lift (8,44 - 0,95).
 * Totem nama di sisi timur klaster (di luar jalur samping kursi cx+1,3).
 */
function buildTechClusters(building: OfficeLayout['building']): TechCluster[] {
  const y = FLOOR_HEIGHT
  const lo = building.minX + 1.075
  const hi = LIFT.minX - 0.06 - 0.95
  const back = TECH_DIVISIONS.filter((d) => d.row === 'back')
  const front = TECH_DIVISIONS.filter((d) => d.row === 'front')
  const backCenters = back.map((_, i) => lo + 0.95 + (i * (hi - 0.95 - (lo + 0.95))) / Math.max(1, back.length - 1))
  const frontPitch = (hi - lo - 2 * TECH_FRONT_DESK_DX) / Math.max(1, front.length - 1)
  const frontCenters = front.map((_, i) => lo + TECH_FRONT_DESK_DX + i * frontPitch)
  const clusters: TechCluster[] = []
  back.forEach((div, i) => {
    const cx = backCenters[i]
    const desks: DivisionDesk[] = TECH_BACK_DESK_Z.map((z, j) => ({
      id: `tech:${div.name}:${j}`,
      desk: [cx, y, z],
      rotation: j === 0 ? 0 : Math.PI,
    }))
    const totemWidth = Math.min(1.6, Math.max(1.2, div.short.length * 0.11))
    clusters.push({
      key: div.name, name: div.name, short: div.short, row: 'back', centerX: cx, desks,
      rug: { center: [cx, y, -2.75], size: [3.4, 3.8], color: TECH_RUG_COLORS[clusters.length % TECH_RUG_COLORS.length] },
      totem: [cx + 1.68 + totemWidth / 2, y, -2.75],
      totemWidth,
    })
  })
  front.forEach((div, i) => {
    const cx = frontCenters[i]
    const desks: DivisionDesk[] = [-TECH_FRONT_DESK_DX, TECH_FRONT_DESK_DX].map((dx, j) => ({
      id: `tech:${div.name}:${j}`,
      desk: [cx + dx, y, TECH_FRONT_DESK_Z],
      rotation: 0,
    }))
    const totemWidth = Math.min(1.6, Math.max(1.2, div.short.length * 0.11))
    clusters.push({
      key: div.name, name: div.name, short: div.short, row: 'front', centerX: cx, desks,
      rug: { center: [cx, y, 1.6], size: [4.0, 2.2], color: TECH_RUG_COLORS[clusters.length % TECH_RUG_COLORS.length] },
      totem: [cx + 1.68 + totemWidth / 2, y, 0.85],
      totemWidth,
    })
  })
  return clusters
}

/** Meja ruangan eksekutif lantai 3 (Fase 3b, dari floor3Rooms — satu sumber
 *  kebenaran dengan TopFloor). Command Center menghadap TV dinding barat
 *  (rotasi -PI/2); CEO / Strategy & PM / Legal menghadap +z (rotasi 0,
 *  kursi di sisi utara meja supaya agent berjalan lurus ke pintu, tanpa
 *  memutari meja lalu menembus dinding utara ruangan). */
function buildExecDesks(building: OfficeLayout['building']): DivisionDesk[] {
  const y = 2 * FLOOR_HEIGHT
  const rooms = floor3Rooms(building)
  const ceoX = (rooms.ceoOffice.minX + rooms.ceoOffice.maxX) / 2
  const spm = rooms.strategyPm
  // Meja Command Center digeser 0,8 m ke barat dari tengah ruangan (Fase
  // 5b): meja ini berotasi -PI/2 (panjang 1,9 m searah z, tepi utara
  // z 0,45) dan tadinya tepat di sumbu x pintu — jalur keluar ruangan
  // (z 0,7, lihat execRoomExit) memotong sudut meja. Digeser, kursi
  // (x +0,75) jatuh di timur pintu sehingga jalur keluar tidak lagi
  // menyentuh meja; meja tetap menghadap TV dinding barat.
  const ccDeskX = (rooms.commandCenter.minX + rooms.commandCenter.maxX) / 2 - 0.8
  return [
    { id: 'exec:command:0', desk: [ccDeskX, y, 1.4], rotation: -Math.PI / 2 },
    { id: 'exec:command:1', desk: [ccDeskX, y, 3.2], rotation: -Math.PI / 2 },
    { id: 'exec:ceo:0', desk: [ceoX, y, 2.3], rotation: 0 },
    { id: 'exec:strategy:0', desk: [spm.minX + 1.1, y, 2.3], rotation: 0 },
    { id: 'exec:strategy:1', desk: [spm.maxX - 1.1, y, 2.3], rotation: 0 },
    { id: 'exec:legal:0', desk: [2.3, y, 1.8], rotation: 0 },
  ]
}

/** The office for a given number of agents: one desk each, and a building wide enough for them.
 *  Fase 3b: menerima daftar agent (dengan divisi) atau jumlah agent seperti
 *  sebelumnya — angka = semua agent tanpa divisi (perilaku lama). Meja L1
 *  tetap satu per agent (hot desking) supaya ruang kerja + ukuran gedung
 *  TIDAK berubah; meja divisi (klaster L2 + ruangan L3) adalah workstation
 *  tambahan tempat agent yang ditempatkan bekerja. */
export function createLayout(input: number | LayoutAgent[]): OfficeLayout {
  const agents: LayoutAgent[] = typeof input === 'number'
    ? Array.from({ length: input }, (_, i) => ({ seat: i + 1 }))
    : input
  const agentCount = Math.max(1, agents.length)
  const deskCount = Math.max(1, agentCount)
  const columns = Math.max(MIN_DESK_COLUMNS, Math.ceil(deskCount / DESK_ROWS_Z.length))
  // The back row fills first (right to left), then the front row.
  const desks: Vec3[] = Array.from({ length: deskCount }, (_, index) => {
    const row = index < columns ? 0 : 1
    const column = row === 0 ? index : index - columns
    return [DESK_RIGHT_X - column * DESK_PITCH, 0, DESK_ROWS_Z[row]]
  })
  const minX = DESK_RIGHT_X - (columns - 1) * DESK_PITCH - 2.3
  const shift = minX - BASE_MIN_X
  const building = { minX, maxX: 9.5, minZ: -5.2, maxZ: 4.2 }
  const restSpots: Vec3[] = desks.map(([x], index) => [x, 2 * FLOOR_HEIGHT, REST_ROWS_Z[index < columns ? 0 : 1]])
  const baksoCart: Vec3 = [-11.9 + shift, 0, -2.3]
  const kopiBike: Vec3 = [-11.9 + shift, 0, 1.6]
  const sceneMinX = minX - 3.7
  const scale = (GAME_ROOM.maxX - sceneMinX) / BASE_SCENE_WIDTH
  const techClusters = buildTechClusters(building)
  const execDesks = buildExecDesks(building)
  // Kursi semua meja (L1 + klaster L2 + ruangan L3) untuk routing jalan.
  const deskChairs: { chair: Vec3; desk: Vec3 }[] = [
    ...desks.map((desk) => ({ chair: [desk[0], desk[1], desk[2] - 0.75] as Vec3, desk })),
    ...techClusters.flatMap((cluster) => cluster.desks.map((d) => ({ chair: chairForDesk(d.desk, d.rotation).position, desk: d.desk }))),
    ...execDesks.map((d) => ({ chair: chairForDesk(d.desk, d.rotation).position, desk: d.desk })),
  ]
  // Meja kerja tiap agent (division-aware): divisi lantai 2 → meja pertama
  // yang masih bebas di klaster divisinya; divisi lantai 3 → meja pertama
  // yang masih bebas di ruangan zonenya; divisi lantai 1 / tanpa divisi /
  // klaster penuh / divisi tak dikenal → meja L1 (desks[seat-1], seperti dulu).
  const deskForSeat = new Map<number, { placement: Placement; deskId: string }>()
  const usedTech = new Map<string, number>()
  const usedExec = new Map<string, number>()
  const l1Entry = (seat: number): { placement: Placement; deskId: string } => {
    const index = (Math.max(seat, 1) - 1) % desks.length
    const [x, y, z] = desks[index]
    return { placement: { position: [x, y, z - 0.75], facing: 0, seated: true }, deskId: `l1:${index}` }
  }
  for (const agent of agents) {
    const dept = agent.department ?? null
    if (dept?.floor === 2) {
      const cluster = techClusters.find((c) => c.name === dept.name)
      const taken = usedTech.get(dept.name) ?? 0
      if (cluster && taken < cluster.desks.length) {
        usedTech.set(dept.name, taken + 1)
        const d = cluster.desks[taken]
        deskForSeat.set(agent.seat, { placement: chairForDesk(d.desk, d.rotation), deskId: d.id })
        continue
      }
    }
    if (dept?.floor === 3) {
      const room = execRoomForZone(dept.zone)
      if (room) {
        const roomDesks = execDesks.filter((d) => d.id.startsWith(`exec:${room === 'CEO Office' ? 'ceo' : room === 'Strategy & PM' ? 'strategy' : room === 'Legal' ? 'legal' : 'command'}:`))
        const taken = usedExec.get(room) ?? 0
        if (taken < roomDesks.length) {
          usedExec.set(room, taken + 1)
          const d = roomDesks[taken]
          deskForSeat.set(agent.seat, { placement: chairForDesk(d.desk, d.rotation), deskId: d.id })
          continue
        }
      }
    }
    deskForSeat.set(agent.seat, l1Entry(agent.seat))
  }
  return {
    deskCount, building, desks, restSpots, baksoCart, kopiBike,
    techClusters, execDesks, deskChairs, deskForSeat,
    sideLaneX: -10.15 + shift,
    gangCenterX: -11.4 + shift,
    camera: { target: [(sceneMinX + GAME_ROOM.maxX) / 2 - 0.15, 0.6, 0.2], offset: CAMERA_OFFSET_BASE.map((value) => value * scale) as Vec3 },
    // Batas geser target kamera: halaman kini mencakup mess + area santai
    // luar (x sampai 39) — target kamera Residence (x 28..29) dan dapur
    // mess (x 32,5) harus bisa dicapai, bukan dijepret ke 17.
    pan: { minX: sceneMinX - 0.3, maxX: RESIDENCE.maxX + 3, minZ: -7, maxZ: 11 },
    idleStops: idleStops(building, baksoCart, kopiBike, restSpots),
    meetingRoom: meetingRoom(building, deskCount),
  }
}

/**
 * The meeting room sits in the front of the workspace, by the aisle. Its long table has a chair for
 * every agent but the presenter (at least six), so the room grows with the crew, up to the
 * building's left wall: a TV on a stand at the table's left end, a whiteboard at its right.
 */
function meetingRoom(building: OfficeLayout['building'], agents: number): OfficeLayout['meetingRoom'] {
  const pairs = Math.max(3, Math.ceil((agents - 1) / 2))
  const x2 = -4.7
  const x1 = Math.max(building.minX + 1.6, x2 - (pairs * MEETING_SEAT_PITCH + 0.5))
  const table = { x1, x2, z: MEETING_TABLE_Z }
  const minX = Math.max(building.minX, x1 - 1.4)
  const whiteboard: Vec3 = [-3.75, 0, MEETING_TABLE_Z]
  // The first agent presents at the whiteboard; the others sit along both sides, nearest the
  // door first, alternating sides; any more stand along the lanes.
  const columns: number[] = []
  for (let x = table.x2 - 0.45; x >= table.x1 + 0.35; x -= MEETING_SEAT_PITCH) columns.push(x)
  const seated = columns.flatMap((x): Placement[] => [
    { position: [x, 0, table.z - 0.7], facing: 0, seated: true },
    { position: [x, 0, table.z + 0.7], facing: Math.PI, seated: true },
  ])
  const standing = columns.flatMap((x): Placement[] => [
    { position: [x, 0, MEETING_BACK_LANE_Z], facing: 0, seated: false },
    { position: [x, 0, MEETING_FRONT_LANE_Z], facing: Math.PI, seated: false },
  ])
  const presenter: Placement = { position: [whiteboard[0] - 0.5, 0, table.z], facing: -Math.PI / 2, seated: false, label: 'Presenting at the whiteboard' }
  return { minX, maxX: MEETING_ROOM_MAX_X, minZ: MEETING_ROOM_MIN_Z, maxZ: building.maxZ, table, tv: [x1 - 0.75, 0, table.z], whiteboard, seats: [presenter, ...seated, ...standing] }
}

/** The n-th place in the meeting room (0-based): the whiteboard, then the chairs, then standing room. */
export function meetingSeat(index: number, layout: OfficeLayout = DEFAULT_LAYOUT): Placement {
  const { seats } = layout.meetingRoom
  return seats[index % seats.length]
}

/**
 * Arah kiblat. Utara scene = -z; bearing diukur dari utara searah jarum
 * jam (0 = utara/-z, 90 = timur/+x, 180 = selatan/+z, 270 = barat/-x).
 * Vektor (x, z) = (sin bearing, -cos bearing).
 */
export function qiblaDirection(bearingDeg: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180
  return [Math.sin(rad), -Math.cos(rad)]
}

/** Sudut hadap (rotation.y = atan2(dx, dz)) agar karakter menghadap kiblat. */
export function qiblaFacing(bearingDeg: number): number {
  const [dx, dz] = qiblaDirection(bearingDeg)
  return Math.atan2(dx, dz)
}

/**
 * Posisi saf musala (indeks 0 = imam, di depan, menghadap kiblat; lalu
 * baris 1 s.d. 4 agent, baris 2 s.d. 4 agent — kapasitas 9 untuk 7 agent).
 * Baris tegak lurus arah kiblat; jarak antar-agent 0,8 m, antar-baris
 * 0,9 m, imam 1,2 m di depan baris 1. Semua menghadap kiblat (facing
 * yang sama, dihitung dari bearing — bukan angka asal).
 */
export function musalaSafPositions(layout: OfficeLayout = DEFAULT_LAYOUT, qiblaBearingDeg: number = DEFAULT_QIBLA_BEARING): Placement[] {
  void layout
  const { minX, maxX, minZ, maxZ } = MUSALA
  const [qx, qz] = qiblaDirection(qiblaBearingDeg)
  // Sumbu baris = tegak lurus kiblat (putar 90°): (-qz, qx).
  const rx = -qz
  const rz = qx
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const facing = qiblaFacing(qiblaBearingDeg)
  const at = (alongQibla: number, alongRow: number): Placement => ({
    position: [cx + qx * alongQibla + rx * alongRow, 0, cz + qz * alongQibla + rz * alongRow],
    facing,
    seated: false,
  })
  // Imam 1,35 m ke arah kiblat dari pusat; baris 1 0,15 m ke arah kiblat
  // (1,2 m di belakang imam); baris 2 0,75 m berlawanan kiblat.
  const row = (alongQibla: number, count: number): Placement[] => {
    const offsets = count === 1 ? [0] : count === 2 ? [-0.4, 0.4] : count === 3 ? [-0.8, 0, 0.8] : [-1.2, -0.4, 0.4, 1.2]
    return offsets.map((off) => at(alongQibla, off))
  }
  return [at(1.35, 0), ...row(0.15, 4), ...row(-0.75, 4)]
}

/**
 * Kursi meja sendiri (Fase 3b, division-aware): `layout.deskForSeat` sudah
 * memetakan seat → kursi meja divisinya (klaster L2 / ruangan L3) atau meja
 * L1-nya (agent divisi lantai 1 / tanpa divisi). `seated` mengikuti state:
 * bekerja/meninjau = duduk mengetik; selain itu berdiri di samping kursi.
 * Fallback lama (desks[seat-1]) hanya bila layout tak punya pemetaan
 * (layout dari versi lama / panggilan tanpa station).
 */
function deskPlacement(station: KantorStation, layout: OfficeLayout): Placement {
  const entry = layout.deskForSeat.get(station.seat)
  if (entry) return { ...entry.placement, seated: station.state === 'Working' || station.state === 'Reviewing' }
  const seat = Math.max(station.seat, 1) - 1
  const [x, y, z] = layout.desks[seat % layout.desks.length]
  return { position: [x, y, z - 0.75], facing: 0, seated: station.state === 'Working' || station.state === 'Reviewing' }
}

/**
 * Where a station stands: a desk (seat n uses desk n; desks have no names), a place at the
 * meeting table (`meetingIndex` counts the agents already there), or a lounge seat.
 * Bekerja/meninjau SELALU di meja komputernya sendiri — tidak mengembara dan tidak duduk di
 * lounge, walau `room` di snapshot masih 'Lounge' (mis. snapshot basi/campuran).
 */
export function placementFor(station: KantorStation, layout: OfficeLayout = DEFAULT_LAYOUT, meetingIndex = 0, prayerIndex = 0, qiblaBearingDeg: number = DEFAULT_QIBLA_BEARING): Placement {
  const seat = Math.max(station.seat, 1) - 1
  // Bekerja/meninjau SELALU di meja komputernya sendiri — didahulukan atas
  // meeting-area, supaya snapshot basi/campuran (state Working tapi
  // roomPosition masih 'meeting-area') tidak menaruh agent di meja rapat.
  if (station.state === 'Working' || station.state === 'Reviewing') return deskPlacement(station, layout)
  // Sesi salat: agent di musala menempati saf (prayerIndex 0 = imam;
  // prayerIndex dihitung Office3D dari urutan station — seat terendah
  // = imam, sesuai penentuan imam backend: defaultImamAgentId atau
  // agent pertama menurut nama).
  if (station.state === 'Praying' || station.roomPosition === 'musala-saf') {
    const saf = musalaSafPositions(layout, qiblaBearingDeg)
    return saf[Math.max(0, prayerIndex) % saf.length]
  }
  if (station.roomPosition === 'meeting-area') return meetingSeat(meetingIndex, layout)
  if (station.room === 'Lounge') {
    const [x, y, z] = LOUNGE_SEATS[seat % LOUNGE_SEATS.length]
    return { position: [x, y, z], facing: LOUNGE_FACING[seat % LOUNGE_SEATS.length], seated: true }
  }
  return deskPlacement(station, layout)
}

const inGameRoom = ([x, z]: [number, number]) => x > GAME_ROOM.minX && x < GAME_ROOM.maxX && z > GAME_ROOM.minZ && z < GAME_ROOM.maxZ
const inLounge = ([x, z]: [number, number]) => x > 1.5 && x < 7.8 && z < -0.6

/**
 * Waypoints from one spot to another, so agents walk around furniture instead of through it:
 * inside along the aisle (lounge spots via the lounge lane), in or out through the entrance,
 * along the sidewalk, and up the gang's lane to the street food. The last point is always the
 * destination.
 */
export function walkPath(from: [number, number], to: [number, number], layout: OfficeLayout = DEFAULT_LAYOUT): [number, number][] {
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.3) return [to]
  return simplify(from, groundRoute(from, to, layout), to)
}

/**
 * Jarak jalur samping kursi dari pusat meja (setengah lebar meja 0,95 + jarak
 * aman dari ujung meja dan meja sebelah; jarak antar kolom meja 2,6).
 */
const DESK_SIDE_LANE = 1.3

/**
 * Bila `point` tepat di kursi sebuah meja, kembalikan jalur x di samping meja
 * itu — TAPI hanya bila meja berada di antara kursi dan gang (z 0,4): kursi
 * yang sudah menghadap gang (meja di belakang kursi — klaster depan L2 dan
 * meja eksekutif L3 rotasi 0) jalan lurus saja, tanpa memutar. `floorY` = y
 * lantai kursi (0 / 2,8 / 5,6); kursi dicocokkan per lantai supaya kursi
 * L1/L2/L3 yang x,z-nya sama tidak tertukar. Dipakai toAisle supaya agent
 * berjalan memutari ujung meja saat menuju/meninggalkan kursinya, bukan
 * menembus desktop.
 */
function deskSideLane(point: [number, number], layout: OfficeLayout, floorY: number): number | null {
  for (const { chair, desk } of layout.deskChairs) {
    if (Math.abs(chair[1] - floorY) > 0.01) continue
    if (Math.abs(point[0] - chair[0]) < 0.01 && Math.abs(point[1] - chair[2]) < 0.01) {
      const deskBetween = Math.min(chair[2], AISLE_Z) < desk[2] && desk[2] < Math.max(chair[2], AISLE_Z)
      return deskBetween ? chair[0] + DESK_SIDE_LANE : null
    }
  }
  return null
}

/**
 * Keluar dari ruangan eksekutif lantai 3 lewat pintunya (Fase 3b): ruangan
 * tertutup (dinding utara z 0,4 + pintu di doorCenter), jadi dari dalam
 * ruangan agent harus ke pintu dulu — jalan lurus ke gang akan menembus
 * dinding. Mengembalikan waypoint [ke z 0,7 → ke pintu → ke gang], atau
 * null bila titik tidak di dalam ruangan eksekutif. z 0,7 = di dalam
 * ruangan, di utara semua meja (meja paling utara di z 1,4).
 */
function execRoomExit(point: [number, number], building: OfficeLayout['building']): [number, number][] | null {
  const rooms = floor3Rooms(building)
  const doors: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; doorX: number }[] = [
    { bounds: rooms.commandCenter, doorX: (rooms.commandCenter.minX + rooms.commandCenter.maxX) / 2 },
    { bounds: rooms.ceoOffice, doorX: (rooms.ceoOffice.minX + rooms.ceoOffice.maxX) / 2 },
    { bounds: rooms.strategyPm, doorX: (rooms.strategyPm.minX + rooms.strategyPm.maxX) / 2 },
    { bounds: rooms.legal, doorX: 2.3 },
    { bounds: rooms.execMeeting, doorX: 6.95 },
  ]
  for (const { bounds, doorX } of doors) {
    if (point[0] > bounds.minX && point[0] < bounds.maxX && point[1] > bounds.minZ && point[1] < bounds.maxZ) {
      const exitZ = Math.min(point[1], 0.7)
      return [[point[0], exitZ], [doorX, exitZ], [doorX, AISLE_Z]]
    }
  }
  return null
}

function groundRoute(from: [number, number], to: [number, number], layout: OfficeLayout): [number, number][] {
  const { building, sideLaneX } = layout
  const outside = (point: [number, number]) => point[1] > building.maxZ || point[0] < building.minX || (point[0] > building.maxX && !inGameRoom(point))
  const inGang = ([x]: [number, number]) => x < building.minX
  const route: [number, number][] = [from]
  const room = layout.meetingRoom
  const inMeetingRoom = ([x, z]: [number, number]) => x > room.minX && x < room.maxX && z > room.minZ && z < room.maxZ
  const inMusala = ([x, z]: [number, number]) => x > MUSALA.minX && x < MUSALA.maxX && z > MUSALA.minZ && z < MUSALA.maxZ
  // In the meeting room: along the lane behind the chairs (or past the table's end) to the door.
  const meetingExit = ([x, z]: [number, number]): [number, number][] => x > room.table.x2 ? [[MEETING_DOOR_X, z], [MEETING_DOOR_X, AISLE_Z]]
    : z > room.table.z ? [[x, MEETING_FRONT_LANE_Z], [MEETING_DOOR_X, MEETING_FRONT_LANE_Z], [MEETING_DOOR_X, AISLE_Z]]
      : [[x, MEETING_BACK_LANE_Z], [MEETING_DOOR_X, MEETING_BACK_LANE_Z], [MEETING_DOOR_X, AISLE_Z]]
  // In the musala: ke jalur dalam (tepat di dalam pintu, di utara saf
  // pertama) lalu ke pintu, baru ke gang — bukan menembus dinding utara
  // atau berjalan melintasi saf.
  const musalaExit = ([x, z]: [number, number]): [number, number][] => [[x, MUSALA_LANE_Z], [MUSALA_DOOR_X, MUSALA_LANE_Z], [MUSALA_DOOR_X, AISLE_Z]]
  const toAisle = (point: [number, number]): [number, number][] => {
    // Dari/menuju kursi meja: memutari ujung meja lewat jalur samping, bukan
    // menembus desktop.
    const side = deskSideLane(point, layout, 0)
    if (side !== null) return [[side, point[1]], [side, AISLE_Z]]
    return inGameRoom(point) ? [[point[0], GAME_LANE_Z], [LOUNGE_LANE_X, GAME_LANE_Z], [LOUNGE_LANE_X, AISLE_Z]]
      : inLounge(point) ? [[LOUNGE_LANE_X, point[1]], [LOUNGE_LANE_X, AISLE_Z]] : inMeetingRoom(point) ? meetingExit(point) : inMusala(point) ? musalaExit(point) : [[point[0], AISLE_Z]]
  }
  const toSidewalk = (point: [number, number]): [number, number][] => inGang(point) ? [[sideLaneX, point[1]], [sideLaneX, SIDEWALK_Z]] : [[point[0], SIDEWALK_Z]]
  if (!outside(from) && !outside(to)) {
    route.push(...toAisle(from), ...toAisle(to).reverse())
  } else if (inGang(from) && inGang(to)) {
    route.push([sideLaneX, from[1]], [sideLaneX, to[1]])
  } else if (outside(from) && outside(to)) {
    route.push(...toSidewalk(from), ...toSidewalk(to).reverse())
  } else if (outside(to)) {
    route.push(...toAisle(from), [ENTRANCE_X, AISLE_Z], [ENTRANCE_X, SIDEWALK_Z], ...toSidewalk(to).reverse())
  } else {
    route.push(...toSidewalk(from), [ENTRANCE_X, SIDEWALK_Z], [ENTRANCE_X, AISLE_Z], ...toAisle(to).reverse())
  }
  route.push(to)
  return route
}

/**
 * Lorong penyeberangan baris meja depan lantai 2 (Fase 7a2): di antara
 * meja depan (z sampai 2,515 dengan clearance agent) dan strip depan
 * (z dari 2,95) ada lorong timur-barat yang bebas dari meja — agent
 * menyeberangi baris meja lewat lorong ini + celah antar meja, bukan
 * lurus menembus desktop.
 */
const FRONT_ROW_CROSS_Z = 2.7
/** Setengah lebar meja depan (WorkDesk 1,9 m) + clearance agent 0,24 m
 *  (sama seperti model tabrakan verifier Fase 5b). */
const FRONT_DESK_HALF_X = 0.95 + 0.24

/** Interval x meja klaster depan lantai 2 (digabung bila tumpang tindih),
 *  dengan clearance agent. */
function frontDeskIntervals(layout: OfficeLayout): [number, number][] {
  const xs = layout.techClusters
    .filter((c) => c.row === 'front')
    .flatMap((c) => c.desks.map((d) => d.desk[0]))
    .sort((a, b) => a - b)
  const merged: [number, number][] = []
  for (const x of xs) {
    const iv: [number, number] = [x - FRONT_DESK_HALF_X, x + FRONT_DESK_HALF_X]
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else merged.push(iv)
  }
  return merged
}

/** Titik tengah celah antar meja depan yang cukup lebar untuk agent
 *  (lebar >= 0,5 m — badan agent 0,3 m + margin), termasuk tepian
 *  gedung bila cukup lebar. Dihitung dari layout, bukan hardcode —
 *  posisi klaster bergantung lebar gedung (jumlah agent). */
function frontRowGapCenters(layout: OfficeLayout): number[] {
  const intervals = frontDeskIntervals(layout)
  const gaps: number[] = []
  for (let i = 0; i < intervals.length - 1; i += 1) {
    const [a, b] = [intervals[i][1], intervals[i + 1][0]]
    if (b - a >= 0.5) gaps.push((a + b) / 2)
  }
  const { minX } = layout.building
  if (intervals.length > 0) {
    if (intervals[0][0] - (minX + 0.3) >= 0.5) gaps.push((minX + 0.3 + intervals[0][0]) / 2)
    if (LIFT.minX - 0.3 - intervals[intervals.length - 1][1] >= 0.5) {
      gaps.push((intervals[intervals.length - 1][1] + LIFT.minX - 0.3) / 2)
    }
  }
  return gaps.sort((a, b) => a - b)
}

/**
 * Lintasan dari titik di utara baris meja depan lantai 2 (z > 2,515)
 * ke gang (z = 0,4): turun ke lorong penyeberangan z = 2,7, geser ke
 * celah antar meja terdekat, lalu lurus ke selatan lewat celah itu.
 * Memperbaiki bug Fase 5b: jalur dari strip depan (dulu x=1,3) menembus
 * meja QA (2,12, 1,8), dan jalur pintu balkon x=6,8 menembus meja
 * Collaboration (7,49, 1,8). Bila titik sudah berada di celah
 * (lintasan lurus aman) atau tidak ada celah yang cukup lebar,
 * lintasan lurus dipertahankan.
 * Asumsi: titik berada di luar jangkauan x strip depan timur (x > 5,2) —
 * semua titik nyata (pintu balkon x=6,8, jalur lift x>=5,2, approach
 * lift x=8,0) memenuhi ini, jadi kaki pertama ke lorong tidak pernah
 * menyeberangi area yang terhalang.
 */
function frontRowCrossing(point: [number, number], layout: OfficeLayout): [number, number][] {
  const [x, z] = point
  if (z <= 2.515) return [[x, AISLE_Z]]
  const blocked = frontDeskIntervals(layout).some(([a, b]) => x > a && x < b)
  if (!blocked) return [[x, AISLE_Z]]
  const gaps = frontRowGapCenters(layout)
  if (gaps.length === 0) return [[x, AISLE_Z]]
  const gapX = gaps.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), gaps[0])
  return [[x, FRONT_ROW_CROSS_Z], [gapX, FRONT_ROW_CROSS_Z], [gapX, AISLE_Z]]
}

/** Waypoints on lantai 2 dan 3: along its aisle, into the bedroom between the bed columns, and
 * out through the sliding door onto the balcony. Lantai 3 memakai pola yang sama (dorm +
 * lesehan + balkon pindah ke sana di Fase 2); ruangan eksekutif tidak punya stop idle di
 * Fase 2b, jadi tidak ada rute yang masuk ke sana. Fase 3b: agent BEKERJA di
 * ruangan eksekutif (meja divisi) dan klaster Tech lantai 2 — routing di
 * sini dibuat sadar-lantai: dorm hanya di lantai 3 (di lantai 2 area yang
 * sama adalah klaster Tech baris belakang), ruangan eksekutif keluar lewat
 * pintu, kursi meja klaster memutari ujung meja bila meja menghalangi. Fase
 * 7a2: lintasan yang menyeberangi baris meja depan lantai 2 (strip
 * depan, pintu balkon, jalur lift) lewat celah antar meja — lihat
 * frontRowCrossing. */
function upperRoute(from: [number, number], to: [number, number], layout: OfficeLayout, floor: Floor): [number, number][] {
  const onBalcony = ([, z]: [number, number]) => z > BALCONY.minZ
  const doorX = (BALCONY_DOOR.fromX + BALCONY_DOOR.toX) / 2
  // Dorm hanya ada di lantai 3 (Fase 2): di lantai 2, area yang sama (x <
  // PARTITION_X, z < -0,3) adalah klaster Tech baris belakang — BUKAN kamar.
  const inBedroom = ([x, z]: [number, number]) => floor === 3 && x < PARTITION_X && z < -0.3
  // Beds share columns, so the back row is reached through the gap beside its column.
  const gapX = (x: number) => Math.min(x + DESK_PITCH / 2, PARTITION_X - 0.3)
  const floorY = (floor - 1) * FLOOR_HEIGHT
  const toAisle = (point: [number, number]): [number, number][] => {
    if (onBalcony(point)) {
      // Lantai 3 (Fase 5b): pintu balkon (x 6,2–7,4) terhalang ruang rapat
      // eksekutif (x 5,4–8,5, z 0,4–2,95) — ke balkon lewat koridor
      // x 5,2 + strip depan z 3,55 (jalur lift), bukan lurus ke selatan
      // menembus ruangan. Lantai 2: strip depan terbuka, lurus saja —
      // TAPI kaki terakhir (pintu balkon -> gang) lewat celah antar meja
      // (Fase 7a2): lurus di x=6,8 menembus meja Collaboration (7,49, 1,8).
      // Balkon lantai 2 dihapus 2026-11-23 — cabang lantai 2 di bawah ini
      // kini tak terjangkau (tidak ada stop di balkon lantai 2),
      // dipertahankan sebagai pengaman.
      if (floor === 3) return [[point[0], BALCONY_LANE_Z], [doorX, BALCONY_LANE_Z], [doorX, LIFT_DOOR_Z], [LIFT_LANE_X, LIFT_DOOR_Z], [LIFT_LANE_X, AISLE_Z]]
      return [[point[0], BALCONY_LANE_Z], [doorX, BALCONY_LANE_Z], ...frontRowCrossing([doorX, BALCONY_LANE_Z], layout)]
    }
    if (inBedroom(point)) return [[gapX(point[0]), point[1]], [gapX(point[0]), AISLE_Z]]
    // Ruangan eksekutif lantai 3: keluar lewat pintu (bukan menembus dinding).
    if (floor === 3) {
      const exit = execRoomExit(point, layout.building)
      if (exit) return exit
    }
    // Lantai 3, titik di strip depan (z > 2,95 — selatan ruang eksekutif,
    // mis. slot antre lift [7,0, 3,55] / approach lift): lurus ke gang
    // menembus ruang rapat (dinding selatan z=2,95) — lewat koridor lift
    // x = 5,2 (barat ruang rapat) lalu sepanjang strip depan z = 3,55.
    // Tanpa ini, rute ke slot antre lift dari ruangan eksekutif memotong
    // ruang rapat. (Balkon ditangani cabang di atas; titik di jalur lift
    // sendiri [5,2, 3,55] hanya menambah titik yang sama — simplify
    // membuangnya.)
    if (floor === 3 && point[1] > 2.95) {
      return [[point[0], LIFT_DOOR_Z], [LIFT_LANE_X, LIFT_DOOR_Z], [LIFT_LANE_X, AISLE_Z]]
    }
    // Dari/menuju kursi meja klaster: memutari ujung meja lewat jalur
    // samping bila meja menghalangi jalan ke gang; kursi yang sudah
    // menghadap gang jalan lurus (deskSideLane mengembalikan null).
    const side = deskSideLane(point, layout, floorY)
    if (side !== null) return [[side, point[1]], [side, AISLE_Z]]
    // Lantai 2 (Fase 7a2): titik di utara baris meja depan (strip depan,
    // jalur lift) ke gang lewat celah antar meja — bukan lurus menembus
    // desktop (dulu: segmen x=1,3 menembus meja QA (2,12, 1,8)).
    if (floor === 2) return frontRowCrossing(point, layout)
    return [[point[0], AISLE_Z]]
  }
  return [from, ...toAisle(from), ...toAisle(to).reverse(), to]
}

/** Rute datar di satu lantai: lantai 1 lewat groundRoute, lantai 2 dan 3 lewat upperRoute. */
function floorRoute(floor: Floor, from: [number, number], to: [number, number], layout: OfficeLayout): [number, number][] {
  return floor === 1 ? groundRoute(from, to, layout) : upperRoute(from, to, layout, floor)
}

/**
 * Aturan pemilihan lift (lift-only 2026-11-23, deterministik — tanpa
 * acak): lantai BERBEDA → naik lift (antre FIFO, satu agent per trip,
 * dikendalikan liftController); satu lantai → jalan biasa. Semua pindah
 * lantai memakai lift — tidak ada rute jalan kaki antar lantai.
 */
export function needsLift(from: Vec3, to: Vec3): boolean {
  return floorOf(from) !== floorOf(to)
}

/**
 * Kaki MASUK kabin (lift-only): dari ambang pintu (x = LIFT.minX, z =
 * LIFT_CABIN_Z) ke tengah kabin (x = 9,0). Dipakai Character saat
 * boardReady — BUKAN waypoint walkPath3 (kaki lift urusan controller +
 * Character, lihat kontrak walkPath3).
 */
export function liftEnterLeg(y: number): Vec3[] {
  return [[LIFT.minX, y, LIFT_CABIN_Z], [(LIFT.minX + LIFT.maxX) / 2, y, LIFT_CABIN_Z]]
}

/**
 * Kaki KELUAR kabin (lift-only): dari tengah kabin ke titik tunggu depan
 * pintu (LIFT_APPROACH). Dipakai Character saat pintu terbuka di lantai
 * tujuan — BUKAN waypoint walkPath3.
 */
export function liftExitLeg(y: number): Vec3[] {
  return [[LIFT.minX, y, LIFT_CABIN_Z], [LIFT_APPROACH[0], y, LIFT_DOOR_Z]]
}

// ── Pathfinding kantor <-> mess (Fase 4b) ──────────────────────────────────

/** Gabung kaki-kaki rute tanpa duplikat di sambungan (jarak 3D <= 0,2 m). */
function joinVec3(...legs: Vec3[][]): Vec3[] {
  const out: Vec3[] = []
  for (const leg of legs) {
    for (const p of leg) {
      const last = out[out.length - 1]
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 0.2) out.push(p)
    }
  }
  return out
}
/** Indeks kamar mess (0..3) dari sebuah x. */
const resRoomOfX = (x: number): number => Math.min(3, Math.max(0, Math.floor((x - RESIDENCE.minX) / 3.5)))
/**
 * Kasur (pusat) untuk sebuah posisi kaki kasur (placement tidur:
 * [x, 2,8, z+0,95]), null bila bukan kaki kasur. Menerima JUGA pusat
 * kasur itu sendiri (z = baris kasur) — pemanggil boleh memakai
 * koordinat kasur dari residence.tsx; keduanya dirutekan ke kaki kasur.
 */
function residenceBedForFoot(foot: Vec3): Vec3 | null {
  if (Math.abs(foot[1] - FLOOR_HEIGHT) > 0.01) return null
  const bedZ = RES_BED_ROWS_Z.some((z) => Math.abs(foot[2] - z - 0.95) < 0.01)
    ? foot[2] - 0.95
    : RES_BED_ROWS_Z.some((z) => Math.abs(foot[2] - z) < 0.01) ? foot[2] : null
  if (bedZ === null) return null
  const centerX = RESIDENCE.minX + resRoomOfX(foot[0]) * 3.5 + 1.75
  // Kolom kasur pusat ±0,80 (sama dengan residenceBeds() + residence.tsx —
  // dulu ±0,75; Fase 4c: bila diubah, samakan ketiga tempat).
  if (Math.abs(Math.abs(foot[0] - centerX) - 0.8) > 0.01) return null
  return [foot[0], FLOOR_HEIGHT, bedZ]
}
/** Spine lantai 1 mess: pintu selatan -> lobi -> titik masuk tangga
 *  (masuk di x 29 — lihat RES_ENTRY_X — lalu ke barat di z 1,0). */
const RES_L1_SPINE: Vec3[] = [
  [RES_ENTRY_X, 0, RESIDENCE_DOOR.z],
  [RES_ENTRY_X, 0, 1.0],
  [RES_STAIRS_ENTRY[0], 0, 1.0],
  [RES_STAIRS_ENTRY[0], 0, RES_STAIRS_ENTRY[2]],
]
/** Tangga mess naik: 4 waypoint miring mengikuti kemiringan 2,8/4,0
 *  (walker 3D mendukung waypoint miring — tidak ada teleport). */
const RES_STAIR_UP: Vec3[] = [
  [RES_STAIRS_ENTRY[0] + 1, 0.7, 1.6],
  [RES_STAIRS_ENTRY[0] + 2, 1.4, 1.6],
  [RES_STAIRS_ENTRY[0] + 3, 2.1, 1.6],
  [RES_STAIRS_LANDING[0], RES_STAIRS_LANDING[1], RES_STAIRS_LANDING[2]],
]
/** Tangga mess turun (kebalikan RES_STAIR_UP). */
const RES_STAIR_DOWN: Vec3[] = [...RES_STAIR_UP].reverse()
/** Dari titik L1 mess (pintu / lobi, di spine) ke titik masuk tangga. */
function residenceL1LegToStairs(from: Vec3): Vec3[] {
  const idx = RES_L1_SPINE.findIndex((s) => Math.abs(s[0] - from[0]) < 0.01 && Math.abs(s[2] - from[2]) < 0.01)
  if (idx >= 0) return RES_L1_SPINE.slice(idx)
  // Titik di luar spine: ke lobi dulu (jalur lurus, best-effort), baru ikuti spine.
  return [from, [RES_ENTRY_X, 0, 1.0], [RES_STAIRS_ENTRY[0], 0, 1.0], [RES_STAIRS_ENTRY[0], 0, RES_STAIRS_ENTRY[2]]]
}
/** Koridor L2 mess: pendaratan tangga -> pintu kamar (geser ke timur dulu
 *  ke x pendaratan+0,5 supaya tidak menyentuh ujung timur railing lubang
 *  (x pendaratan, z 1,2), baru ke utara ke jalur koridor). */
function residenceCorridorLeg(doorX: number): Vec3[] {
  const y = FLOOR_HEIGHT
  return [
    [RES_STAIRS_LANDING[0], y, RES_STAIRS_LANDING[2]],
    [RES_STAIRS_LANDING[0] + 0.5, y, 1.5],
    [RES_STAIRS_LANDING[0] + 0.5, y, RES_CORRIDOR_Z],
    [doorX, y, RES_CORRIDOR_Z],
  ]
}
/**
 * Kaki kamar mess: pintu koridor -> kaki kasur.
 * - Baris depan (z -2,0): ke utara di garis pintu sampai z -1,1 (di
 *   utara dinding koridor — diagonal langsung dari pintu ke kaki kasur
 *   menyentuh sudut dinding koridor), lalu ke timur/barat ke kaki kasur.
 *   Pintu selalu di tengah kamar (garis celah tengah antar kolom kasur)
 *   sejak Fase 4c — dulu pintu Kamar 4 di x 27,0 membuka ke kasur.
 * - Baris belakang (z -4,1): lewat celah tengah antar kolom kasur ke
 *   garis tengah kasur, belok, lalu ke selatan ke kaki kasur (kasur
 *   target dikecualikan dari tabrakan — agent naik ke kasurnya sendiri,
 *   sama seperti restSpot kantor).
 */
function residenceBedroomLeg(bed: Vec3): Vec3[] {
  const [bx, , bz] = bed
  const room = resRoomOfX(bx)
  const doorX = RES_BEDROOM_DOORS[room]
  const centerX = RESIDENCE.minX + room * 3.5 + 1.75
  const y = FLOOR_HEIGHT
  const pts: Vec3[] = [[doorX, y, RES_CORRIDOR_Z], [doorX, y, -0.8]]
  if (bz === RES_BED_ROWS_Z[1]) {
    pts.push([doorX, y, -1.1])
    if (doorX !== centerX && bx > centerX) pts.push([centerX, y, -1.1])
    pts.push([bx, y, bz + 0.95])
  } else {
    if (doorX !== centerX) pts.push([doorX, y, -1.1], [centerX, y, -1.1])
    pts.push([centerX, y, bz], [bx, y, bz], [bx, y, bz + 0.95])
  }
  return pts
}
/** Kaki L2 mess: pendaratan tangga -> koridor -> pintu kamar -> kaki kasur. */
function residenceL2LegToBed(bed: Vec3): Vec3[] {
  return joinVec3(residenceCorridorLeg(RES_BEDROOM_DOORS[resRoomOfX(bed[0])]), residenceBedroomLeg(bed))
}
/**
 * Kaki dalam mess, pintu selatan -> kaki kasur L2: lobi -> ruang makan ->
 * naik tangga (waypoint MIRING) -> koridor L2 -> pintu kamar -> kasur.
 * Dihitung dari layout mess (pintu, koridor, tangga) — BUKAN jalan lurus.
 *
 * CATATAN (Fase 4b): kaki ruang makan (z 1,0 dari x 29 ke x 22,5)
 * dulu TERHALANG kursi utara meja makan — Fase 4c memindah 2 kursi
 * utara ke ujung meja, jalur utara kini bersih (verify-fase4 100%).
 */
function residenceMessLegToBed(bed: Vec3): Vec3[] {
  return joinVec3(RES_L1_SPINE, RES_STAIR_UP, residenceL2LegToBed(bed))
}
/** Kaki dalam mess ke titik umum (bukan kasur): L2 lewat koridor + pintu
 *  kamar (didahului spine + tangga naik — kaki ini selalu berangkat dari
 *  pintu selatan mess y 0, jadi titik L2 tanpa tangga = teleport);
 *  L1 lewat spine pintu -> tangga. */
function residenceMessLegToPoint(p: Vec3): Vec3[] {
  if (Math.abs(p[1] - FLOOR_HEIGHT) < 0.01) {
    const doorX = RES_BEDROOM_DOORS[resRoomOfX(p[0])]
    return joinVec3(RES_L1_SPINE, RES_STAIR_UP, residenceCorridorLeg(doorX), [[doorX, FLOOR_HEIGHT, -0.8], p])
  }
  const idx = RES_L1_SPINE.findIndex((s) => Math.abs(s[0] - p[0]) < 0.01 && Math.abs(s[2] - p[2]) < 0.01)
  if (idx >= 0) return RES_L1_SPINE.slice(0, idx + 1)
  return [...RES_L1_SPINE, p]
}
/**
 * Rute ke/dari/di dalam RESIDENCE (Fase 4b). Hanya dipanggil walkPath3
 * bila salah satu ujung di dalam mess DAN agent sudah di lantai 1 / luar
 * gedung, atau sudah di dalam mess (dari lantai atas kantor, walkPath3
 * memakai kaki pra-lift yang sudah ada — lihat cabang di walkPath3).
 *
 * - Kantor L1/luar -> kasur mess: pintu depan kantor -> trotoar ->
 *   jalur pejalan -> pintu mess -> lobi -> ruang makan -> tangga naik
 *   -> koridor L2 -> pintu kamar -> kasur.
 * - Kasur mess -> kantor L1: kebalikannya, berakhir tepat di tujuan.
 * - Kasur mess -> kantor L2/L3: kebalikan sampai kepala antrean lift
 *   lantai 1 (kontrak lift-only: kaki lift urusan controller + Character).
 * - Di dalam mess: koridor L2 / tangga / lobi (bukan jalan lurus).
 */
function residenceRoute(from: Vec3, to: Vec3, layout: OfficeLayout): Vec3[] {
  const fromRes = inResidenceXZ(from[0], from[2])
  const toRes = inResidenceXZ(to[0], to[2])
  const at0 = ([x, z]: [number, number]): Vec3 => [x, 0, z]
  const walkway: Vec3[] = [[RES_ENTRY_X, 0, SIDEWALK_Z], [RES_ENTRY_X, 0, RESIDENCE_DOOR.z]]
  if (Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) < 0.3) return [to]
  if (!fromRes && toRes) {
    const toBed = residenceBedForFoot(to)
    const officeLeg = groundRoute([from[0], from[2]], [RES_ENTRY_X, SIDEWALK_Z], layout).map(at0)
    const messLeg = toBed ? residenceMessLegToBed(toBed) : residenceMessLegToPoint(to)
    const path = joinVec3(officeLeg, walkway, messLeg)
    path[path.length - 1] = to
    return path
  }
  if (fromRes && !toRes) {
    const fromBed = residenceBedForFoot(from)
    const messLeg = fromBed ? [...residenceMessLegToBed(fromBed)].reverse() : [...residenceMessLegToPoint(from)].reverse()
    const officeTarget: [number, number] = floorOf(to) === 1 ? [to[0], to[2]] : LIFT_QUEUE_SLOTS[0]
    const officeLeg = groundRoute([RES_ENTRY_X, SIDEWALK_Z], officeTarget, layout).map(at0)
    const path = joinVec3(messLeg, [...walkway].reverse(), officeLeg)
    if (floorOf(to) === 1) path[path.length - 1] = to
    return path
  }
  // Di dalam mess.
  const fromBed = residenceBedForFoot(from)
  const toBed = residenceBedForFoot(to)
  const y = FLOOR_HEIGHT
  if (fromBed && toBed && Math.abs(from[1] - y) < 0.01 && Math.abs(to[1] - y) < 0.01) {
    // Kasur -> kasur, sama-sama L2: lewat koridor (tanpa turun tangga).
    const toDoorX = RES_BEDROOM_DOORS[resRoomOfX(toBed[0])]
    const path = joinVec3([...residenceBedroomLeg(fromBed)].reverse(), [[toDoorX, y, RES_CORRIDOR_Z]], residenceBedroomLeg(toBed))
    path[path.length - 1] = to
    return path
  }
  if (toBed && Math.abs(from[1]) < 0.01) {
    // L1 -> kasur L2: lewat tangga naik.
    const path = joinVec3(residenceL1LegToStairs(from), RES_STAIR_UP, residenceL2LegToBed(toBed))
    path[path.length - 1] = to
    return path
  }
  if (fromBed && Math.abs(to[1]) < 0.01) {
    // Kasur L2 -> L1: lewat tangga turun.
    const path = joinVec3([...residenceL2LegToBed(fromBed)].reverse(), RES_STAIR_DOWN, [...residenceL1LegToStairs(to)].reverse())
    path[path.length - 1] = to
    return path
  }
  // Fallback: lewat pintu mess (titik umum di dalam mess).
  const fromLeg = fromBed ? [...residenceMessLegToBed(fromBed)].reverse() : [...residenceMessLegToPoint(from)].reverse()
  const toLeg = toBed ? residenceMessLegToBed(toBed) : residenceMessLegToPoint(to)
  const path = joinVec3(fromLeg, toLeg)
  path[path.length - 1] = to
  return path
}

/**
 * Waypoints between any two spots, on any floor (y = (floor-1) × FLOOR_HEIGHT).
 *
 * KONTRAK BARU (lift-only 2026-11-23):
 * - SATU LANTAI: rute datar seperti dulu (byte-identik — route/floorRoute
 *   tidak disentuh). Ujung tepat di tujuan.
 * - LINTAS LANTAI: kembalikan path ke KEPALA ANTREAN lift (slot 0,
 *   LIFT_QUEUE_SLOTS[0]) di lantai asal, y tetap di lantai asal.
 *   Kaki lift (masuk kabin, naik/turun, keluar) BUKAN waypoint di sini —
 *   itu urusan liftController + Character (requestRide, boardReady,
 *   riderPosition, notifyBoarded/notifyAlighted). Panggilan lintas
 *   lantai ini hanya dipakai fallback/verifikasi; Character berjalan ke
 *   slotnya SENDIRI (LIFT_QUEUE_SLOTS[queuePosition]) lewat rute satu
 *   lantai, lalu mengikuti mesin state lift.
 * - TIDAK ADA LAGI perubahan y di path mana pun (tidak ada waypoint
 *   naik/turun, tidak ada waypoint kabin): y hanya berubah saat agent
 *   benar-benar naik lift — dan itu dikendalikan controller, bukan path.
 *   PENGECUALIAN (Fase 4b): tangga MESS — rute ke/dari kasur mess
 *   memakai waypoint MIRING y 0 -> 2,8 di dalam mess (bukan lift).
 */
export function walkPath3(from: Vec3, to: Vec3, layout: OfficeLayout = DEFAULT_LAYOUT): Vec3[] {
  const flat = ([x, , z]: Vec3): [number, number] => [x, z]
  const at = (y: number) => ([x, z]: [number, number]): Vec3 => [x, y, z]
  const floorY = (floor: Floor) => (floor - 1) * FLOOR_HEIGHT
  const fromFloor = floorOf(from)
  const toFloor = floorOf(to)
  const route = (floor: Floor, a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3 ? [b]
    : simplify(a, floorRoute(floor, a, b, layout), b)
  // Reroute saat agent sedang di DALAM kabin lift (placement berubah di
  // tengah ride): posisi di dalam shaft adalah milik controller, BUKAN
  // "nyangkut" — pengaman ini hanya dipakai bila ada yang memanggil
  // walkPath3 dari dalam kabin (mis. Character yang placement-nya berubah
  // saat riding, sebelum controller menyelesaikan trip): keluar lewat
  // pintu di lantai tempat kabin berada, lalu rute normal dari titik
  // approach (rekursi; titik approach tidak di dalam shaft, jadi tidak
  // berulang). Tanpa ini, rute generik dari dalam shaft akan menembus
  // dinding shaft (kulkas di lantai 1 / ruang rapat di lantai 3).
  const [fx, fz] = flat(from)
  const inShaft = fx >= LIFT.minX && fx <= LIFT.maxX && fz >= LIFT.minZ && fz <= LIFT.maxZ
  if (inShaft) {
    const yCur = floorY(fromFloor)
    const cabinX = (LIFT.minX + LIFT.maxX) / 2
    const exit: Vec3[] = []
    if (Math.abs(from[1] - yCur) > 0.01) exit.push([cabinX, yCur, LIFT_CABIN_Z])
    exit.push([LIFT.minX, yCur, LIFT_CABIN_Z], [LIFT_APPROACH[0], yCur, LIFT_DOOR_Z])
    return [...exit, ...walkPath3([LIFT_APPROACH[0], yCur, LIFT_DOOR_Z], to, layout)]
  }
  // Reroute saat agent sedang di strip depan lantai 2/3 di timur koridor
  // lift (x > 5,2, z 2,95–4,2 — hanya posisi transit di jalur lift):
  // rute generik dari sana akan menembus meja klaster depan (lantai 2)
  // atau ruang rapat eksekutif (lantai 3), jadi keluarkan dulu ke jalur
  // lift (x 5,2, z 3,55) lalu hitung rute normal dari sana (rekursi;
  // titik jalur tidak memicu normalisasi lagi).
  const inFrontStripEast = (fromFloor === 2 || fromFloor === 3) && fz > 2.95 && fz < BALCONY.minZ && fx > LIFT_LANE_X && fx < LIFT.minX
  if (inFrontStripEast) {
    const exit: Vec3[] = []
    if (Math.abs(fz - LIFT_DOOR_Z) > 0.01) exit.push([fx, from[1], LIFT_DOOR_Z])
    exit.push([LIFT_LANE_X, from[1], LIFT_DOOR_Z])
    return [...exit, ...walkPath3([LIFT_LANE_X, from[1], LIFT_DOOR_Z], to, layout)]
  }
  // ── Fase 4b: tujuan/asal di dalam RESIDENCE (mess) ──
  // Dari lantai atas kantor ke mess: kaki pra-lift (sama seperti rute
  // lintas-lantai kantor — ke kepala antrean lift di lantai asal);
  // Character naik lift ke L1 dulu (toFloor = 1 untuk tujuan mess —
  // perubahan Character, BUKAN di sini; lihat laporan Fase 4b), lalu
  // walkPath3 dipanggil lagi dari L1 dan masuk residenceRoute.
  // Dari lantai 1 / luar gedung, atau dari dalam mess: residenceRoute.
  const fromRes = inResidenceXZ(fx, fz)
  const toRes = inResidenceXZ(to[0], to[2])
  if (fromRes || toRes) {
    if (!fromRes && from[1] > 0.01) {
      return route(fromFloor, flat(from), LIFT_QUEUE_SLOTS[0]).map(at(floorY(fromFloor)))
    }
    return residenceRoute(from, to, layout)
  }
  if (fromFloor === toFloor) return route(fromFloor, flat(from), flat(to)).map(at(floorY(fromFloor))).map((point, index, all) => index === all.length - 1 ? to : point)
  // Lintas lantai (lift-only): jalan ke kepala antrean (slot 0) di lantai
  // asal. Kaki lift BUKAN waypoint — lihat kontrak di atas.
  return route(fromFloor, flat(from), LIFT_QUEUE_SLOTS[0]).map(at(floorY(fromFloor)))
}

function simplify(from: [number, number], route: [number, number][], to: [number, number]): [number, number][] {
  // Drop waypoints that do not move the agent somewhere new, then any middle point of three on
  // one straight line (so going out to the aisle and straight back becomes one straight walk).
  const points: [number, number][] = [from]
  for (const point of route.slice(1)) {
    const last = points[points.length - 1]
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.2) points.push(point)
  }
  const aligned = (a: [number, number], b: [number, number], c: [number, number]) => (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01)
  for (let index = 1; index < points.length - 1;) {
    if (aligned(points[index - 1], points[index], points[index + 1])) points.splice(index, 1)
    else index += 1
  }
  const path = points.slice(1)
  if (path.length === 0 || path[path.length - 1] !== to) path.push(to)
  return path
}

/** How long an idle agent stays at one stop (walking included). */
export const IDLE_STOP_MS = 32_000
export const IDLE_ROUTE = ['lounge', 'galon', 'balkon', 'game', 'bakso', 'tidur', 'jalan', 'arcade', 'lesehan', 'kopi', 'dapur', 'balkon', 'game', 'tidur']

export interface IdleAssignment { stop: IdleStop; placement: Placement }

/**
 * Where each idle agent is at a given time. Purely decorative and deterministic (only the clock
 * and the seats matter, never agent data): each seat starts at a different point of the route, and
 * an agent whose stop is already full moves on along the route, so nobody shares a spot while
 * free ones remain.
 */
export function idlePlan(seats: number[], time: number, layout: OfficeLayout = DEFAULT_LAYOUT, sleepers: number[] = [], sleeperBeds?: Map<number, Placement>): Map<number, IdleAssignment> {
  const plan = new Map<number, IdleAssignment>()
  const taken = new Map<string, number>()
  const step = Math.floor(time / IDLE_STOP_MS)
  const stopAt = (index: number) => layout.idleStops.find((item) => item.key === IDLE_ROUTE[index % IDLE_ROUTE.length])!
  // Sleepers (when the viewer sends idle agents to rest) stay at their rest spot; they take the first spots.
  // Fase 5b: sleeper yang punya kasur assignment (sleeperBeds) berbaring di
  // kasurnya sendiri di mess, bukan di rest spot lounge — placement kasur
  // TIDAK memakai slot lounge (taken 'tidur' hanya untuk fallback).
  const rest = layout.idleStops.find((item) => item.key === 'tidur')!
  for (const seat of [...sleepers].sort((a, b) => a - b)) {
    const bed = sleeperBeds?.get(seat)
    if (bed) {
      plan.set(seat, { stop: rest, placement: bed })
      continue
    }
    const used = taken.get('tidur') ?? 0
    taken.set('tidur', used + 1)
    plan.set(seat, { stop: rest, placement: rest.spots[used % rest.spots.length] })
  }
  for (const seat of [...seats].filter((item) => !plan.has(item)).sort((a, b) => a - b)) {
    const start = step + (Math.max(seat, 1) - 1) * 3
    let stop = stopAt(start)
    for (let offset = 0; offset < IDLE_ROUTE.length; offset += 1) {
      const candidate = stopAt(start + offset)
      if ((taken.get(candidate.key) ?? 0) < candidate.spots.length) { stop = candidate; break }
    }
    const used = taken.get(stop.key) ?? 0
    taken.set(stop.key, used + 1)
    plan.set(seat, { stop, placement: stop.spots[used % stop.spots.length] })
  }
  return plan
}

/** One idle agent on its own. */
export function idleStop(seat: number, time: number, layout: OfficeLayout = DEFAULT_LAYOUT): IdleAssignment {
  return idlePlan([seat], time, layout).get(seat)!
}

/**
 * Sudut pandang kamera (Fase 5a — glide antar lantai / All Floors View /
 * Focus Department). Semua dihitung dari `layout.camera` yang sama dengan
 * Controls.frame() — bukan angka karangan — supaya framing konsisten
 * dengan tampilan overview yang sudah ada.
 *
 * Koreksi aspek (pola yang sama dengan Controls.frame): layar sempit
 * (portrait) perlu mundur supaya gedung muat melintang, tapi tidak
 * pernah lebih dari 1,35× (lebih jauh kamera masuk kabut).
 */
function framingScale(aspect: number): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  return Math.min(1.35, Math.max(1, 1.2 / safeAspect))
}
/** Offset kamera dari target, diskalakan dengan koreksi aspek. */
function scaledOffset(offset: Vec3, aspect: number, extra = 1): Vec3 {
  const len = Math.hypot(offset[0], offset[1], offset[2]) * framingScale(aspect) * extra
  const cur = Math.hypot(offset[0], offset[1], offset[2])
  const k = cur > 0 ? len / cur : 1
  return [offset[0] * k, offset[1] * k, offset[2] * k]
}
/** Titik bidik overview satu lantai (pola Controls.frame): target +
 *  elevasi lantai; layar portrait menggeser bidik sedikit ke barat. */
function floorFocus(layout: OfficeLayout, floor: Floor, aspect: number): Vec3 {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const ct = layout.camera.target
  return [
    safeAspect < 1 ? ct[0] - 1.4 : ct[0],
    ct[1] + (floor - 1) * FLOOR_HEIGHT,
    safeAspect < 1 ? 0.8 : ct[2],
  ]
}
/** Sudut pandang overview satu lantai (sama persis dengan Controls.frame). */
export function floorCameraView(layout: OfficeLayout, floor: Floor, aspect: number): CameraView {
  const target = floorFocus(layout, floor, aspect)
  const offset = scaledOffset(layout.camera.offset, aspect)
  return { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target }
}
/**
 * Sudut pandang All Floors View: bidik di tengah tinggi gedung (y ≈ 3,4,
 * antara lantai 2 dan 3) dengan kamera mundur 1,55× dari overview biasa —
 * seluruh gedung 3 lantai + halaman muat dalam satu frame (terverifikasi
 * skrip `scripts/verify-fase5a.ts`: 8 sudut gedung + sudut halaman
 * terproyeksi di dalam frame untuk aspek 16:9 dan 9:16).
 */
export function allFloorsCameraView(layout: OfficeLayout, aspect: number): CameraView {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const ct = layout.camera.target
  const target: Vec3 = [safeAspect < 1 ? ct[0] - 1.4 : ct[0], 3.4, safeAspect < 1 ? 0.8 : ct[2]]
  const offset = scaledOffset(layout.camera.offset, aspect, ALL_VIEW_DISTANCE_FACTOR)
  return { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target }
}
/** Jarak kamera maksimum OrbitControls: mode all boleh mundur lebih jauh
 *  (offset all ≈ 1,55× overview; 48 akan menjepret kamera saat glide). */
export const ALL_VIEW_MAX_DISTANCE = 64
/** Faktor jarak kamera mode all terhadap overview biasa (dipakai
 *  allFloorsCameraView + Controls.frame supaya Reset View sama dengan
 *  glide masuk). 1,55 (bukan 1,45): di portrait 9:16 sudut timur sayap
 *  game room masih 3% di luar frame pada 1,45 (terverifikasi skrip). */
export const ALL_VIEW_DISTANCE_FACTOR = 1.55

/**
 * Gedung yang sedang dilihat (Fase 6a — Building Navigator): kantor utama,
 * mess, atau overview kampus (keduanya). State di Office3D (useBuilding),
 * bukan di layout — layout tidak tahu pilihan kamera user.
 */
export type Building = 'office' | 'residence' | 'campus'
/** Lantai mess: 1 = lobi/ruang keluarga/ruang makan/dapur, 2 = 4 kamar tidur. */
export type ResidenceFloor = 1 | 2
/** Faktor jarak kamera Campus Overview terhadap overview biasa (dipakai
 *  campusCameraView). 1,8 — terverifikasi skrip verify-fase5a.ts §4:
 *  16:9 muat (max |ndc| 0,66, 16 agent; 0,72, 7 agent); portrait 9:16
 *  tidak muat penuh (max |ndc| ~1,03–1,10) — keterbatasan yang sama
 *  dengan All Floors View portrait. Faktor rasio lebar (2,35) tidak
 *  dipakai: jarak 84 menenggelamkan mess dalam kabut (fog mulai 60)
 *  sampai ~40%, jadi tidak dipakai. */
export const CAMPUS_VIEW_DISTANCE_FACTOR = 1.8
/** Jarak kamera maksimum OrbitControls di mode campus (glide campus
 *  16 agent portrait ≈ 87; 100 memberi ruang sampai ~20 agent). */
export const CAMPUS_VIEW_MAX_DISTANCE = 100
/** Jarak kamera view eksterior mess ('all' residence): bangunan mess
 *  14 m — tetap, tidak tumbuh mengikuti jumlah agent. */
const RESIDENCE_ALL_DISTANCE = 17
/**
 * Offset kamera L1 mess dari target (meja makan): garis bidik lewat celah
 * partisi x=25 (z 0,55..1,45, ambang bawah 2,1) — lihat residenceCameraView.
 */
const RESIDENCE_L1_OFFSET: Vec3 = [5.5, 2.1, 1.5]
/**
 * Offset kamera L2 mess dari target (tengah kamar): garis bidik melewati
 * puncak dinding selatan L2 (y 5,4) dan dinding koridor (y 5,4).
 */
const RESIDENCE_L2_OFFSET: Vec3 = [-2, 6.6, 6.5]

/**
 * Sudut pandang mess (Fase 6a — Building Navigator). Dinding selatan mess
 * setinggi penuh (2,6 m — BUKAN 0,55 m seperti dinding depan kantor),
 * jadi kamera dari luar TIDAK bisa melihat interior L1 lewat dinding;
 * karena itu L1 diambil dari DALAM lobi dan L2 dari atas-selatan yang curam:
 * - L1: kamera [31, 2,7, 1,8] (lobi, di atas bangku) membidik meja makan
 *   [25,5, 0,6, 0,3] — garis bidik lewat celah partisi x=29 sehingga
 *   ruang makan + tangga mess terlihat. Kamera di dalam batas cutaway
 *   (x 20..38, z -7..4) dan y 2,7 < 3,5 → mode ground (atap + L2 hilang).
 * - L2: kamera [26, 10, 3,5] membidik tengah kamar [28, 3,4, -3] —
 *   garis bidik melewati puncak dinding selatan L2 (y 5,4) dan dinding
 *   koridor (y 5,4) sehingga koridor + kasur terlihat; kamera
 *   y 10 ≥ 3,5 → mode noRoof (atap hilang, L2 terlihat).
 * - 'all': eksterior seluruh bangunan mess (atap terlihat — kamera di
 *   luar batas cutaway), paralel dengan All Floors View kantor.
 * Offset L1/L2 TETAP (tanpa koreksi aspek): koreksi portrait akan
 * menggeser kamera keluar batas cutaway / ke atas ambang 3,5 sehingga
 * L2 muncul kembali di view L1. Semua angka diturunkan dari RESIDENCE +
 * FLOOR_HEIGHT — bukan karangan. Diverifikasi skrip verify-fase5a.ts §4
 * (mode cutaway, jarak, garis bidik).
 */
export function residenceCameraView(layout: OfficeLayout, floor: ResidenceFloor | 'all', aspect: number): CameraView {
  const cx = (RESIDENCE.minX + RESIDENCE.maxX) / 2
  const cz = (RESIDENCE.minZ + RESIDENCE.maxZ) / 2
  if (floor === 'all') {
    // Eksterior: arah yang sama dengan offset kantor (selatan-barat-atas),
    // panjang tetap 17 m — mess tidak tumbuh mengikuti jumlah agent.
    const baseLen = Math.hypot(...layout.camera.offset)
    const dir: Vec3 = [layout.camera.offset[0] / baseLen, layout.camera.offset[1] / baseLen, layout.camera.offset[2] / baseLen]
    const len = RESIDENCE_ALL_DISTANCE * framingScale(aspect)
    const target: Vec3 = [cx, 2.0, cz]
    const offset: Vec3 = [dir[0] * len, dir[1] * len, dir[2] * len]
    return { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target }
  }
  if (floor === 1) {
    // Meja makan (residence.tsx [25,5, 0,74, 0,3]).
    const target: Vec3 = [RESIDENCE.minX + 3.5, 0.6, 0.3]
    return { position: [target[0] + RESIDENCE_L1_OFFSET[0], target[1] + RESIDENCE_L1_OFFSET[1], target[2] + RESIDENCE_L1_OFFSET[2]], target }
  }
  // Tengah zona kamar (z -5,2..-0,8 → -3,0), y = lantai 2 + 0,6.
  const target: Vec3 = [cx - 1, FLOOR_HEIGHT + 0.6, -3.0]
  return { position: [target[0] + RESIDENCE_L2_OFFSET[0], target[1] + RESIDENCE_L2_OFFSET[1], target[2] + RESIDENCE_L2_OFFSET[2]], target }
}

/**
 * Sudut pandang Campus Overview (Fase 6a): kedua gedung sekaligus.
 * Target = tengah gabungan (kantor minX..mess maxX 36, z -5,2..balkon 6,6),
 * y 3,4 seperti All Floors View. Jarak = offset kantor ×
 * CAMPUS_VIEW_DISTANCE_FACTOR — dihitung dari layout, bukan angka karangan.
 */
export function campusCameraView(layout: OfficeLayout, aspect: number): CameraView {
  const target: Vec3 = [(layout.building.minX + RESIDENCE.maxX) / 2, 3.4, (RESIDENCE.minZ + BALCONY.maxZ) / 2]
  const offset = scaledOffset(layout.camera.offset, aspect, CAMPUS_VIEW_DISTANCE_FACTOR)
  return { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target }
}
/**
 * Fokus satu divisi/ruangan (Fase 5a — Focus Department): klaster Tech
 * lantai 2 dari `layout.techClusters`, ruangan eksekutif lantai 3 dari
 * `floor3Rooms` (nama zona: 'CEO Office' / 'Strategy & PM' / 'Legal' /
 * 'AI Command Center'). Nama lain (divisi lantai 1, dsb.) = null — pemanggil
 * memakai fallback overview lantai 1. `offset` = arah kamera dari target
 * (dari depan-atas, seperti tur demo — tidak pernah menembus dinding).
 */
export function divisionFocus(name: string, layout: OfficeLayout): { floor: Floor; target: Vec3; offset: Vec3 } | null {
  const cluster = layout.techClusters.find((c) => c.name === name)
  if (cluster) {
    return {
      floor: 2,
      target: [cluster.centerX, FLOOR_HEIGHT + 0.8, cluster.rug.center[2]],
      offset: [1.5, 5, 7],
    }
  }
  const rooms = floor3Rooms(layout.building)
  const exec: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> = {
    'CEO Office': rooms.ceoOffice,
    'Strategy & PM': rooms.strategyPm,
    'Legal': rooms.legal,
    'AI Command Center': rooms.commandCenter,
  }
  const room = exec[name]
  if (room) {
    return {
      floor: 3,
      target: [(room.minX + room.maxX) / 2, 2 * FLOOR_HEIGHT + 0.8, (room.minZ + room.maxZ) / 2],
      offset: [1, 5, 7],
    }
  }
  return null
}

/** Keeps a panned camera target inside the office grounds. */
export function clampTarget(x: number, z: number, bounds: OfficeLayout['pan'] = DEFAULT_LAYOUT.pan): [number, number] {
  return [Math.min(Math.max(x, bounds.minX), bounds.maxX), Math.min(Math.max(z, bounds.minZ), bounds.maxZ)]
}

/** The stock office (three agents), for callers that do not know the crew size. */
export const DEFAULT_LAYOUT = createLayout(3)
export const BUILDING = DEFAULT_LAYOUT.building
export const SIDE_LANE_X = DEFAULT_LAYOUT.sideLaneX
export const PAN_BOUNDS = DEFAULT_LAYOUT.pan
export const IDLE_STOPS = DEFAULT_LAYOUT.idleStops
export const DESKS = DEFAULT_LAYOUT.desks
