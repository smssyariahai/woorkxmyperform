/**
 * Demo Mode — tur kamera otomatis keliling 22 ruangan kantor virtual + mess
 * (Wave 16 + Musala + lantai 3 Fase 2b + klaster Tech lantai 2 & ruangan
 * eksekutif Fase 7a2 + 5 ruangan Staff Residence Fase 6b + 2 stop outdoor
 * AI Campus Fase 3: Taman Antargedung + Jalur Pedestrian).
 *
 * Semua koordinat diturunkan dari OfficeLayout yang sama dengan scene
 * (office3d-layout.ts) — bukan angka karangan: pusat ruangan dari meja /
 * meja rapat / sofa-TV / lantai pantry / Creative Lounge + balkon / meja
 * lesehan yang benar-benar ada di scene. Kamera selalu memandang dari
 * arah depan-atas (sisi jalan, +z dan +y) sehingga tidak pernah menembus
 * dinding: lantai 1 adalah dollhouse cut-away (dinding depan hanya 0,55)
 * dan lantai 2 tidak beratap, jadi pandangan dari atas-depan selalu bebas.
 *
 * Satu putaran = 22 ruangan × 10 detik (+ transisi 2,5 detik antar-ruangan).
 * Urutan diacak per putaran dengan Fisher-Yates (shuffle satu deck penuh),
 * jadi tiap ruangan dikunjungi tepat satu kali sebelum urutan baru dibuat.
 * Framing mengikuti AI Agent yang sedang berada di ruangan (dari placement
 * snapshot server, bukan data dummy): 1 agent -> medium shot ke agent itu,
 * 2+ agent -> wide shot ke centroid kelompok, 0 agent -> overview ruangan
 * dengan gerakan pan/truck/dolly.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BALCONY, FLOOR_HEIGHT, floor3Rooms, floorOf, GAME_ROOM, LESEHAN_TABLE, MUSALA, PARTITION_X, RESIDENCE, RESIDENCE_DOOR, SOFA, TV, type Building, type CameraView, type Floor, type OfficeLayout, type Vec3 } from './office3d-layout'

export type { CameraView } from './office3d-layout'

export interface DemoRoom {
  key: string
  label: string
  /** Gedung tempat ruangan ini berada (Fase 6b) — tur memindahkan gedung +
   * lantai saat ruangan berganti, bukan hanya lantai kantor. Kampus tidak
   * punya ruangan demo. */
  building: 'office' | 'residence'
  floor: Floor
  /** Titik yang dibidik kamera (pusat ruangan). */
  center: Vec3
  /** Offset kamera dari center (dari arah depan-atas, di luar dinding). */
  offset: Vec3
  /** Pola gerakan selama 10 detik di ruangan. */
  motion: 'dolly' | 'arc' | 'pan' | 'truck' | 'tilt'
  /** Batas ruangan (dipakai mendeteksi agent yang sedang di ruangan). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export const DEMO_DWELL_MS = 10_000
export const DEMO_TRANSITION_MS = 2_500

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)

/** Lima belas ruangan tur, dihitung dari layout (bangunan tumbuh mengikuti jumlah agent). Dorm +
 *  lesehan pindah ke lantai 3 di Fase 2; klaster Tech lantai 2 + ruangan
 *  eksekutif Strategy & PM dan Ruang Meeting Eksekutif ditambahkan di
 *  Fase 7a2 (sebelumnya tur 10 ruangan tanpa lantai 2). */
export function demoRooms(layout: OfficeLayout): DemoRoom[] {
  const { building, meetingRoom } = layout
  const deskCenter: Vec3 = [mean(layout.desks.map(([x]) => x)), 0, mean(layout.desks.map(([, , z]) => z))]
  const table = meetingRoom.table
  const meetingCenter: Vec3 = [(table.x1 + table.x2) / 2, 0, table.z]
  const musalaCenter: Vec3 = [(MUSALA.minX + MUSALA.maxX) / 2, 0, (MUSALA.minZ + MUSALA.maxZ) / 2]
  const loungeCenter: Vec3 = [SOFA[0], 0, (SOFA[2] + TV[2]) / 2]
  const pantryCenter: Vec3 = [8.35, 0, 1.4]
  const f3 = 2 * FLOOR_HEIGHT
  // Ruangan eksekutif lantai 3 (floor3Rooms): CEO, AI Command Center, Executive Lounge (sofa balkon).
  const rooms3 = floor3Rooms(building)
  // Pusat Creative Lounge = tengah zona bedroom lama (Fase 3b): stabil, tidak
  // tergantung spot istirahat. Titik tengah lama antara dorm dan balkon jatuh
  // di dalam ruangan Strategy & PM (yang baru masuk tur), sehingga roomOf()
  // memetakannya ke sana, bukan ke lounge. Balkon tetap terliput ruangan
  // Executive Lounge.
  const bedroomCenter: Vec3 = [(rooms3.bedroom.minX + rooms3.bedroom.maxX) / 2, f3 + 0.5, (rooms3.bedroom.minZ + rooms3.bedroom.maxZ) / 2]
  const lesehanCenter: Vec3 = [LESEHAN_TABLE[0], LESEHAN_TABLE[1] + 0.5, LESEHAN_TABLE[2]]
  const ceoCenter: Vec3 = [(rooms3.ceoOffice.minX + rooms3.ceoOffice.maxX) / 2, f3, (rooms3.ceoOffice.minZ + rooms3.ceoOffice.maxZ) / 2]
  const commandCenter: Vec3 = [(rooms3.commandCenter.minX + rooms3.commandCenter.maxX) / 2, f3, (rooms3.commandCenter.minZ + rooms3.commandCenter.maxZ) / 2]
  const execLoungeCenter: Vec3 = [building.minX + 4.1, f3, 5.9]
  // Klaster Tech lantai 2 (Fase 7a2, 3 klaster representatif): pusat =
  // tengah karpet klaster (sama seperti divisionFocus Fase 5a), bounds =
  // karpet supaya agent yang bekerja di klaster terdeteksi di ruangan.
  const techRoom = (name: string): { center: Vec3; bounds: DemoRoom['bounds'] } => {
    const cluster = layout.techClusters.find((c) => c.name === name)!
    const rug = cluster.rug
    return {
      center: [cluster.centerX, FLOOR_HEIGHT, rug.center[2]],
      bounds: {
        minX: rug.center[0] - rug.size[0] / 2, maxX: rug.center[0] + rug.size[0] / 2,
        minZ: rug.center[2] - rug.size[1] / 2, maxZ: rug.center[2] + rug.size[1] / 2,
      },
    }
  }
  const frontend = techRoom('Frontend Engineering')
  const backend = techRoom('Backend Engineering')
  const qa = techRoom('Quality Assurance')
  // Ruangan eksekutif lantai 3 yang belum ada di tur (Fase 7a2).
  const strategyCenter: Vec3 = [(rooms3.strategyPm.minX + rooms3.strategyPm.maxX) / 2, f3, (rooms3.strategyPm.minZ + rooms3.strategyPm.maxZ) / 2]
  const execMeetingCenter: Vec3 = [(rooms3.execMeeting.minX + rooms3.execMeeting.maxX) / 2, f3, (rooms3.execMeeting.minZ + rooms3.execMeeting.maxZ) / 2]
  return [
    { key: 'kerja', building: 'office', label: 'Ruang Kerja', floor: 1, center: deskCenter, offset: [2, 7, 10], motion: 'dolly', bounds: { minX: building.minX, maxX: PARTITION_X, minZ: building.minZ, maxZ: 0.95 } },
    { key: 'meeting', building: 'office', label: 'Ruang Meeting', floor: 1, center: meetingCenter, offset: [1, 6, 9], motion: 'arc', bounds: { minX: meetingRoom.minX, maxX: meetingRoom.maxX, minZ: meetingRoom.minZ, maxZ: meetingRoom.maxZ } },
    { key: 'musala', building: 'office', label: 'Musala', floor: 1, center: musalaCenter, offset: [1, 6, 9], motion: 'arc', bounds: { minX: MUSALA.minX, maxX: MUSALA.maxX, minZ: MUSALA.minZ, maxZ: MUSALA.maxZ } },
    { key: 'tengah', building: 'office', label: 'Ruang Tengah', floor: 1, center: loungeCenter, offset: [-1, 7, 10], motion: 'pan', bounds: { minX: PARTITION_X, maxX: 7.6, minZ: building.minZ, maxZ: 0.95 } },
    { key: 'dapur', building: 'office', label: 'Ruang Dapur', floor: 1, center: pantryCenter, offset: [-2, 6, 9], motion: 'dolly', bounds: { minX: 7.6, maxX: building.maxX, minZ: -0.5, maxZ: building.maxZ } },
    { key: 'tech-frontend', building: 'office', label: 'Frontend Engineering', floor: 2, center: frontend.center, offset: [1.5, 6, 8], motion: 'dolly', bounds: frontend.bounds },
    { key: 'tech-backend', building: 'office', label: 'Backend Engineering', floor: 2, center: backend.center, offset: [1.5, 6, 8], motion: 'arc', bounds: backend.bounds },
    { key: 'tech-qa', building: 'office', label: 'Quality Assurance', floor: 2, center: qa.center, offset: [1.5, 6, 8], motion: 'pan', bounds: qa.bounds },
    { key: 'kamar', building: 'office', label: 'Creative Lounge & Balkon', floor: 3, center: bedroomCenter, offset: [3, 6, 9], motion: 'truck', bounds: { minX: building.minX, maxX: building.maxX, minZ: building.minZ, maxZ: BALCONY.maxZ } },
    { key: 'lesehan', building: 'office', label: 'Lesehan Upstairs', floor: 3, center: lesehanCenter, offset: [-1, 6, 9], motion: 'tilt', bounds: { minX: LESEHAN_TABLE[0] - 1.5, maxX: LESEHAN_TABLE[0] + 1.5, minZ: LESEHAN_TABLE[2] - 1.4, maxZ: LESEHAN_TABLE[2] + 1.4 } },
    { key: 'ceo', building: 'office', label: 'CEO Office', floor: 3, center: ceoCenter, offset: [1, 6, 9], motion: 'arc', bounds: { ...rooms3.ceoOffice } },
    { key: 'command', building: 'office', label: 'AI Command Center', floor: 3, center: commandCenter, offset: [1, 6, 9], motion: 'dolly', bounds: { ...rooms3.commandCenter } },
    { key: 'strategy', building: 'office', label: 'Strategy & PM', floor: 3, center: strategyCenter, offset: [1, 6, 9], motion: 'arc', bounds: { ...rooms3.strategyPm } },
    { key: 'execMeeting', building: 'office', label: 'Ruang Meeting Eksekutif', floor: 3, center: execMeetingCenter, offset: [1, 6, 9], motion: 'dolly', bounds: { ...rooms3.execMeeting } },
    { key: 'execLounge', building: 'office', label: 'Executive Lounge', floor: 3, center: execLoungeCenter, offset: [2, 6, 9], motion: 'pan', bounds: { minX: building.minX, maxX: building.minX + 8, minZ: BALCONY.minZ, maxZ: BALCONY.maxZ } },
    // ── Staff Residence (Fase 6b) ──────────────────────────────────────────
    // 5 ruangan mess — total tur 15 → 20. Center/offset dihitung dari
    // geometri mess yang benar-benar ada (residence.tsx):
    // - Exterior: kamera dari selatan/tenggara di luar cutaway (z > 4) supaya
    //   atap terlihat; bidik tengah fasad (z = 2 = bidang dinding selatan);
    //   motion 'arc' (bukan dolly) supaya jarak kamera tetap dan seluruh
    //   gedung tetap muat di frame selama ayunan.
    // - Lobi: kamera di dalam sirkulasi timur (x 31, atas meja cuci) menghadap
    //   barat lewat celah partisi x=29 (z 0,55..1,45, ambang y 2,1).
    // - Ruang Keluarga: kamera dari barat-daya ruangan, di atas rak buku.
    // - Ruang Makan: kamera dari timur ruangan, menghadap meja makan; offset
    //   x hanya +2,4 supaya kamera tetap di barat partisi x=29 saat pan.
    // - Kamar Tidur: Kamar 1–4 sebagai SATU ruangan; kamera dari selatan L2
    //   dengan offset tinggi (y +11) supaya garis pandang melompati dinding
    //   koridor (puncak y 5,4 di z −0,8); offset x hanya −2,5 supaya kamera
    //   1 agent di Kamar 1 tetap di dalam cutaway (x ≥ 20); motion 'pan'
    //   (bukan dolly) supaya kamera 16 agent tidur (wide shot, distScale
    //   1,18) tetap di dalam cutaway (z ≤ 4) dan ke-16 kasur muat di frame —
    //   diverifikasi numerik di scripts/verify-fase5a.ts §5.
    //   (Fase 1 AI Campus: semua center x +4 — mess 16..30. Fase 1b:
    //   semua center x +6 lagi — mess 22..36.)
    { key: 'mess-exterior', building: 'residence', label: 'Mess — Eksterior', floor: 1, center: [29, 3.0, 2], offset: [3, 7.5, 12], motion: 'arc', bounds: { ...RESIDENCE } },
    // ── Taman Antargedung + Jalur Pedestrian (AI Campus Fase 3) ─────────
    // 2 stop outdoor — total tur 20 → 22. Disisipkan setelah mess-exterior
    // (alami: kantor → taman → jalur → mess). Taman bukan gedung — pakai
    // building 'office' (level tanah, terlihat dari view L1); jalur pakai
    // 'residence' (pintu mess). Bounds = zona taman / jalur pejalan yang
    // benar-benar ada (Fase 2): taman x 15,5..22 (sayap Game Room..mess),
    // jalur = strip trotoar→pintu mess (x 28..30, z 2..4,6).
    // - Taman: kamera dari selatan-atas, motion 'arc' supaya ayunan
    //   menampilkan kedua gedung; center = tengah taman Fase 2.
    // - Jalur: kamera dari selatan, motion 'pan'; center = tengah jalur.
    { key: 'taman', building: 'office', label: 'Taman Antargedung', floor: 1, center: [18.75, 0.6, -1.2], offset: [0.5, 6, 10], motion: 'arc', bounds: { minX: GAME_ROOM.maxX, maxX: RESIDENCE.minX, minZ: -5.2, maxZ: 2 } },
    { key: 'jalur', building: 'residence', label: 'Jalur Pedestrian', floor: 1, center: [29, 0.6, 3.5], offset: [0.5, 5, 8], motion: 'pan', bounds: { minX: RESIDENCE_DOOR.minX, maxX: RESIDENCE_DOOR.maxX, minZ: RESIDENCE.maxZ, maxZ: 4.6 } },
    { key: 'mess-lobby', building: 'residence', label: 'Mess — Lobi', floor: 1, center: [29.5, 0.6, 1.0], offset: [1.5, 1.6, -0.8], motion: 'pan', bounds: { minX: RESIDENCE.minX + 5, maxX: RESIDENCE.minX + 9, minZ: 0, maxZ: 2 } },
    { key: 'mess-living', building: 'residence', label: 'Mess — Ruang Keluarga', floor: 1, center: [25.5, 0.6, -3.5], offset: [-2.0, 1.8, 1.0], motion: 'dolly', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.minX + 7, minZ: -5.2, maxZ: -0.5 } },
    { key: 'mess-dining', building: 'residence', label: 'Mess — Ruang Makan', floor: 1, center: [25.5, 0.7, 0.3], offset: [2.4, 1.6, 1.6], motion: 'pan', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.minX + 7, minZ: -0.5, maxZ: 2 } },
    { key: 'mess-bedrooms', building: 'residence', label: 'Mess — Kamar Tidur', floor: 2, center: [29, 3.4, -3.0], offset: [-2.5, 11, 5.8], motion: 'pan', bounds: { minX: RESIDENCE.minX, maxX: RESIDENCE.maxX, minZ: -5.2, maxZ: -0.8 } },
  ]
}

/** Acak satu deck penuh (Fisher-Yates): tiap ruangan tepat satu kali per putaran. */
export function shuffleDeck(count: number): number[] {
  const deck = Array.from({ length: count }, (_, i) => i)
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/** Ruangan tempat sebuah posisi berada. Ruangan yang lebih kecil dicek dulu
 *  (lesehan sebelum kamar, karena kamar mencakup seluruh lantai 3). */
export function roomOf(position: Vec3, rooms: DemoRoom[]): DemoRoom | null {
  const y = position[1]
  const byArea = [...rooms].sort((a, b) => {
    const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxZ - a.bounds.minZ)
    const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxZ - b.bounds.minZ)
    return areaA - areaB
  })
  for (const room of byArea) {
    const inFloor = floorOf(y) === room.floor
    if (!inFloor) continue
    const { minX, maxX, minZ, maxZ } = room.bounds
    if (position[0] >= minX && position[0] <= maxX && position[2] >= minZ && position[2] <= maxZ) return room
  }
  return null
}

const easeInOut = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1)
  return x * x * (3 - 2 * x)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/**
 * Sudut pandang sebuah ruangan pada progress dwell 0..1, dengan framing
 * mengikuti agent yang ada di ruangan: 1 agent -> medium shot (lebih dekat)
 * ke agent itu; 2+ agent -> wide shot (lebih jauh) ke centroid kelompok;
 * 0 agent -> overview ruangan. Gerakan (dolly/arc/pan/truck/tilt) adalah
 * ayunan sinus yang halus, bukan lompatan.
 */
export function demoRoomView(room: DemoRoom, agents: Vec3[], progress: number): CameraView {
  let target: Vec3
  let distScale = 1
  if (agents.length === 1) {
    target = [agents[0][0], agents[0][1] + 1.0, agents[0][2]]
    distScale = 0.72
  } else if (agents.length >= 2) {
    target = [mean(agents.map((a) => a[0])), mean(agents.map((a) => a[1])) + 1.0, mean(agents.map((a) => a[2]))]
    distScale = 1.18
  } else {
    target = [...room.center]
  }
  const s = Math.sin(progress * Math.PI * 2)
  const s2 = Math.sin(progress * Math.PI)
  let [ox, oy, oz] = room.offset
  let [tx, ty, tz] = target
  switch (room.motion) {
    case 'dolly': {
      const k = (1 + 0.12 * s) * distScale
      ox *= k; oy *= k; oz *= k
      tx += 0.6 * s
      break
    }
    case 'arc': {
      const angle = 0.18 * s
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const nx = ox * cos - oz * sin
      const nz = ox * sin + oz * cos
      ox = nx * distScale; oz = nz * distScale; oy *= distScale
      break
    }
    case 'pan': { tx += 0.9 * s; ox *= distScale; oy *= distScale; oz *= distScale; break }
    case 'truck': { ox = ox * distScale + 1.2 * s; oy *= distScale; oz *= distScale; break }
    case 'tilt': { ty += 0.5 * s; tx += 0.5 * s2; ox *= distScale; oy *= distScale; oz *= distScale; break }
  }
  return { position: [tx + ox, ty + oy, tz + oz], target: [tx, ty, tz] }
}

/** Handle kamera minimal yang dipakai tur (struktural, sama dengan ViewHandle Office3D). */
export interface DemoViewHandle {
  getView: () => { position: [number, number, number]; target: [number, number, number] } | null
  setView: (position: [number, number, number], target: [number, number, number]) => void
  setOrbitEnabled: (enabled: boolean) => void
  setPreserveView: (preserve: boolean) => void
}

interface TourState {
  order: number[]
  index: number
  phase: 'dwell' | 'transition'
  phaseStart: number
  fromView: CameraView | null
  /** Saat prioritas aktif: dwell genap = wide shot seluruh agent di
   *  ruangan, dwell ganjil = medium shot ke focusPosition (imam/leader). */
  focusAlt: number
}

/** Ruangan yang diprioritaskan kamera saat sesi aktif (salat/briefing). */
export interface DemoPriority {
  roomKey: string
  /** Posisi imam/leader untuk medium shot selang-seling (boleh null). */
  focusPosition?: Vec3 | null
}

/**
 * Komponen R3F di dalam Canvas: saat `active`, mengambil alih kamera dan
 * menjalankan tur (OrbitControls dimatikan supaya tidak ada konflik input
 * manual). Saat nonaktif, tidak melakukan apa-apa. Tidak mengubah posisi
 * agent, objek, atau percakapan — hanya kamera.
 *
 * Prioritas sesi (`priority`): bila sesi salat/briefing aktif, kamera
 * menuju ruangan sesi itu dan bertahan di sana (wide shot saf/peserta,
 * selang-seling medium shot imam/leader); bila prioritas berakhir, tur
 * normal (acak) dilanjutkan dari awal.
 */
export function DemoTour({ active, rooms, agentPositions, building, floor, onNavigate, onRoomChange, view, priority = null }: {
  active: boolean
  rooms: DemoRoom[]
  /** Posisi placement agent saat ini (dari snapshot server). */
  agentPositions: Vec3[]
  /** Gedung yang sedang aktif (Fase 6b: tur memindahkannya per ruangan). */
  building: Building
  floor: Floor
  /** Dipanggil saat ruangan berikutnya berada di gedung/lantai lain —
   * pemanggil memindahkan `building` + `floor` (dan menghentikan Follow). */
  onNavigate: (building: Building, floor: Floor) => void
  onRoomChange?: (room: DemoRoom) => void
  view: { current: DemoViewHandle | null }
  priority?: DemoPriority | null
}) {
  const { camera } = useThree()
  const stateRef = useRef<TourState | null>(null)
  const smoothRef = useRef<CameraView | null>(null)
  const lastPriorityRef = useRef<string | null>(null)
  const propsRef = useRef({ rooms, agentPositions, building, floor, onNavigate, onRoomChange, priority })
  propsRef.current = { rooms, agentPositions, building, floor, onNavigate, onRoomChange, priority }

  // Aktif/nonaktif: matikan OrbitControls + pertahankan tampilan selama tur,
  // kembalikan kontrol manual saat tur berhenti.
  useEffect(() => {
    if (!active) {
      stateRef.current = null
      smoothRef.current = null
      lastPriorityRef.current = null
      view.current?.setOrbitEnabled(true)
      return
    }
    view.current?.setOrbitEnabled(false)
    view.current?.setPreserveView(true)
  }, [active, view])

  useFrame((state, delta) => {
    if (!active) return
    const { rooms: roomsNow, agentPositions: agentsNow, building: buildingNow, floor: floorNow, onNavigate: navigateNow, onRoomChange: roomChangeNow, priority: priorityNow } = propsRef.current
    if (roomsNow.length === 0) return
    const now = state.clock.elapsedTime * 1000
    const priorityKey = priorityNow?.roomKey ?? null
    // Prioritas berubah (mulai/berakhir/berganti ruangan) -> mulai tur baru
    // (ke ruangan prioritas, atau kembali ke acak bila prioritas berakhir).
    if (priorityKey !== lastPriorityRef.current) {
      lastPriorityRef.current = priorityKey
      stateRef.current = null
      smoothRef.current = null
    }
    let tour = stateRef.current
    if (!tour) {
      // Prioritas: deck satu ruangan; normal: acak satu deck penuh.
      const priorityIndex = priorityKey ? roomsNow.findIndex((r) => r.key === priorityKey) : -1
      const order = priorityIndex >= 0 ? [priorityIndex] : shuffleDeck(roomsNow.length)
      const first = roomsNow[order[0]]
      tour = { order, index: 0, phase: 'transition', phaseStart: now, fromView: null, focusAlt: 0 }
      const current = view.current?.getView()
      tour.fromView = current ? { position: [...current.position], target: [...current.target] } : { position: [camera.position.x, camera.position.y, camera.position.z], target: [0, 0, 0] }
      stateRef.current = tour
      if (first.building !== buildingNow || first.floor !== floorNow) navigateNow(first.building, first.floor)
      roomChangeNow?.(first)
    }
    const room = roomsNow[tour.order[tour.index]]
    // Prioritas aktif + dwell ganjil + ada focusPosition -> medium shot
    // ke imam/leader; selain itu wide shot ke seluruh agent di ruangan.
    const useFocus = priorityKey !== null && tour.focusAlt % 2 === 1 && priorityNow?.focusPosition
    const agents = useFocus
      ? [priorityNow.focusPosition as Vec3]
      : agentsNow.filter((position) => roomOf(position, roomsNow)?.key === room.key)
    const phaseElapsed = now - tour.phaseStart
    if (tour.phase === 'transition') {
      const t = easeInOut(phaseElapsed / DEMO_TRANSITION_MS)
      const toView = demoRoomView(room, agents, 0)
      const from = tour.fromView ?? toView
      const next: CameraView = { position: lerpVec(from.position, toView.position, t), target: lerpVec(from.target, toView.target, t) }
      smoothRef.current = next
      view.current?.setView(next.position, next.target)
      if (phaseElapsed >= DEMO_TRANSITION_MS) {
        tour.phase = 'dwell'
        tour.phaseStart = now
      }
      return
    }
    // Dwell: ikuti sudut pandang ruangan dengan smoothing (target agent yang
    // bergerak / placement baru tidak membuat kamera meloncat).
    const desired = demoRoomView(room, agents, phaseElapsed / DEMO_DWELL_MS)
    const prev = smoothRef.current ?? desired
    const k = 1 - Math.exp(-Math.max(delta, 0.001) * 2.5)
    const next: CameraView = { position: lerpVec(prev.position, desired.position, k), target: lerpVec(prev.target, desired.target, k) }
    smoothRef.current = next
    view.current?.setView(next.position, next.target)
    if (phaseElapsed >= DEMO_DWELL_MS) {
      // Prioritas aktif: tetap di ruangan yang sama (dwell berikutnya
      // berganti fokus wide/medium). Normal: lanjut ke ruangan berikut.
      if (priorityKey !== null) {
        tour.focusAlt += 1
        tour.phase = 'transition'
        tour.phaseStart = now
        const current = view.current?.getView()
        tour.fromView = current ? { position: [...current.position], target: [...current.target] } : { position: [...next.position], target: [...next.target] }
        stateRef.current = tour
        return
      }
      const nextIndex = tour.index + 1
      const order = nextIndex >= tour.order.length ? shuffleDeck(roomsNow.length) : tour.order
      const nextRoom = roomsNow[order[nextIndex % order.length]]
      const current = view.current?.getView()
      tour = {
        order,
        index: nextIndex % order.length,
        phase: 'transition',
        phaseStart: now,
        fromView: current ? { position: [...current.position], target: [...current.target] } : { position: [...next.position], target: [...next.target] },
        focusAlt: 0,
      }
      stateRef.current = tour
      if (nextRoom.building !== buildingNow || nextRoom.floor !== floorNow) navigateNow(nextRoom.building, nextRoom.floor)
      roomChangeNow?.(nextRoom)
    }
  })
  return null
}
