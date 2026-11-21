/**
 * Demo Mode — tur kamera otomatis keliling 6 ruangan kantor virtual (Wave 16).
 *
 * Semua koordinat diturunkan dari OfficeLayout yang sama dengan scene
 * (office3d-layout.ts) — bukan angka karangan: pusat ruangan dari meja /
 * meja rapat / sofa-TV / lantai pantry / tempat tidur + balkon / meja
 * lesehan yang benar-benar ada di scene. Kamera selalu memandang dari
 * arah depan-atas (sisi jalan, +z dan +y) sehingga tidak pernah menembus
 * dinding: lantai 1 adalah dollhouse cut-away (dinding depan hanya 0,55)
 * dan lantai 2 tidak beratap, jadi pandangan dari atas-depan selalu bebas.
 *
 * Satu putaran = 6 ruangan × 10 detik (+ transisi 2,5 detik antar-ruangan).
 * Urutan diacak per putaran dengan Fisher-Yates (shuffle satu deck penuh),
 * jadi tiap ruangan dikunjungi tepat satu kali sebelum urutan baru dibuat.
 * Framing mengikuti AI Agent yang sedang berada di ruangan (dari placement
 * snapshot server, bukan data dummy): 1 agent -> medium shot ke agent itu,
 * 2+ agent -> wide shot ke centroid kelompok, 0 agent -> overview ruangan
 * dengan gerakan pan/truck/dolly.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BALCONY, FLOOR_HEIGHT, LESEHAN_TABLE, PARTITION_X, SOFA, TV, type Floor, type OfficeLayout, type Vec3 } from './office3d-layout'

export interface DemoRoom {
  key: string
  label: string
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

/** Enam ruangan tur, dihitung dari layout (bangunan tumbuh mengikuti jumlah agent). */
export function demoRooms(layout: OfficeLayout): DemoRoom[] {
  const { building, meetingRoom } = layout
  const deskCenter: Vec3 = [mean(layout.desks.map(([x]) => x)), 0, mean(layout.desks.map(([, , z]) => z))]
  const table = meetingRoom.table
  const meetingCenter: Vec3 = [(table.x1 + table.x2) / 2, 0, table.z]
  const loungeCenter: Vec3 = [SOFA[0], 0, (SOFA[2] + TV[2]) / 2]
  const pantryCenter: Vec3 = [8.35, 0, 1.4]
  const bedCenter: Vec3 = [mean(layout.beds.map(([x]) => x)), FLOOR_HEIGHT, mean(layout.beds.map(([, , z]) => z))]
  const balconyCenter: Vec3 = [(building.minX + building.maxX) / 2, FLOOR_HEIGHT, (BALCONY.minZ + BALCONY.maxZ) / 2]
  const bedroomCenter: Vec3 = [(bedCenter[0] + balconyCenter[0]) / 2, FLOOR_HEIGHT + 0.5, (bedCenter[2] + balconyCenter[2]) / 2]
  const lesehanCenter: Vec3 = [LESEHAN_TABLE[0], FLOOR_HEIGHT + 0.5, LESEHAN_TABLE[2]]
  return [
    { key: 'kerja', label: 'Ruang Kerja', floor: 1, center: deskCenter, offset: [2, 7, 10], motion: 'dolly', bounds: { minX: building.minX, maxX: PARTITION_X, minZ: building.minZ, maxZ: 0.95 } },
    { key: 'meeting', label: 'Ruang Meeting', floor: 1, center: meetingCenter, offset: [1, 6, 9], motion: 'arc', bounds: { minX: meetingRoom.minX, maxX: meetingRoom.maxX, minZ: meetingRoom.minZ, maxZ: meetingRoom.maxZ } },
    { key: 'tengah', label: 'Ruang Tengah', floor: 1, center: loungeCenter, offset: [-1, 7, 10], motion: 'pan', bounds: { minX: PARTITION_X, maxX: 7.6, minZ: building.minZ, maxZ: 0.95 } },
    { key: 'dapur', label: 'Ruang Dapur', floor: 1, center: pantryCenter, offset: [-2, 6, 9], motion: 'dolly', bounds: { minX: 7.6, maxX: building.maxX, minZ: -0.5, maxZ: building.maxZ } },
    { key: 'kamar', label: 'Kamar & Balkon', floor: 2, center: bedroomCenter, offset: [3, 6, 9], motion: 'truck', bounds: { minX: building.minX, maxX: building.maxX, minZ: building.minZ, maxZ: BALCONY.maxZ } },
    { key: 'lesehan', label: 'Lesehan Upstairs', floor: 2, center: lesehanCenter, offset: [-1, 6, 9], motion: 'tilt', bounds: { minX: LESEHAN_TABLE[0] - 1.5, maxX: LESEHAN_TABLE[0] + 1.5, minZ: LESEHAN_TABLE[2] - 1.4, maxZ: LESEHAN_TABLE[2] + 1.4 } },
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
 *  (lesehan sebelum kamar, karena kamar mencakup seluruh lantai 2). */
export function roomOf(position: Vec3, rooms: DemoRoom[]): DemoRoom | null {
  const y = position[1]
  const byArea = [...rooms].sort((a, b) => {
    const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxZ - a.bounds.minZ)
    const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxZ - b.bounds.minZ)
    return areaA - areaB
  })
  for (const room of byArea) {
    const inFloor = room.floor === 1 ? y < FLOOR_HEIGHT / 2 : y >= FLOOR_HEIGHT / 2
    if (!inFloor) continue
    const { minX, maxX, minZ, maxZ } = room.bounds
    if (position[0] >= minX && position[0] <= maxX && position[2] >= minZ && position[2] <= maxZ) return room
  }
  return null
}

export interface CameraView { position: Vec3; target: Vec3 }

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
}

/**
 * Komponen R3F di dalam Canvas: saat `active`, mengambil alih kamera dan
 * menjalankan tur (OrbitControls dimatikan supaya tidak ada konflik input
 * manual). Saat nonaktif, tidak melakukan apa-apa. Tidak mengubah posisi
 * agent, objek, atau percakapan — hanya kamera.
 */
export function DemoTour({ active, rooms, agentPositions, floor, onFloorChange, onRoomChange, view }: {
  active: boolean
  rooms: DemoRoom[]
  /** Posisi placement agent saat ini (dari snapshot server). */
  agentPositions: Vec3[]
  floor: Floor
  onFloorChange: (floor: Floor) => void
  onRoomChange?: (room: DemoRoom) => void
  view: { current: DemoViewHandle | null }
}) {
  const { camera } = useThree()
  const stateRef = useRef<TourState | null>(null)
  const smoothRef = useRef<CameraView | null>(null)
  const propsRef = useRef({ rooms, agentPositions, floor, onFloorChange, onRoomChange })
  propsRef.current = { rooms, agentPositions, floor, onFloorChange, onRoomChange }

  // Aktif/nonaktif: matikan OrbitControls + pertahankan tampilan selama tur,
  // kembalikan kontrol manual saat tur berhenti.
  useEffect(() => {
    if (!active) {
      stateRef.current = null
      smoothRef.current = null
      view.current?.setOrbitEnabled(true)
      return
    }
    view.current?.setOrbitEnabled(false)
    view.current?.setPreserveView(true)
  }, [active, view])

  useFrame((state, delta) => {
    if (!active) return
    const { rooms: roomsNow, agentPositions: agentsNow, floor: floorNow, onFloorChange: setFloorNow, onRoomChange: roomChangeNow } = propsRef.current
    if (roomsNow.length === 0) return
    const now = state.clock.elapsedTime * 1000
    let tour = stateRef.current
    if (!tour) {
      const order = shuffleDeck(roomsNow.length)
      const first = roomsNow[order[0]]
      tour = { order, index: 0, phase: 'transition', phaseStart: now, fromView: null }
      const current = view.current?.getView()
      tour.fromView = current ? { position: [...current.position], target: [...current.target] } : { position: [camera.position.x, camera.position.y, camera.position.z], target: [0, 0, 0] }
      stateRef.current = tour
      if (first.floor !== floorNow) setFloorNow(first.floor)
      roomChangeNow?.(first)
    }
    const room = roomsNow[tour.order[tour.index]]
    const agents = agentsNow.filter((position) => roomOf(position, roomsNow)?.key === room.key)
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
      }
      stateRef.current = tour
      if (nextRoom.floor !== floorNow) setFloorNow(nextRoom.floor)
      roomChangeNow?.(nextRoom)
    }
  })
  return null
}
