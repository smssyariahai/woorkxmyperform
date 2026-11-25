/**
 * Diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha).
 * File asli: src/scene3d/environment.tsx — dilisensikan di bawah lisensi MIT.
 * Di-port ke WOORK (Next.js 14 + React 18 + @react-three/fiber 8 + three 0.169).
 * Tidak ada perubahan logika; hanya impor tanpa ekstensi ala Next.js.
 */

import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { BriefingContent } from '@/lib/kantor/briefing'
import type { NextPrayer, PrayerScheduleDay } from '@/lib/kantor/prayer'
import { ARCADES, BALCONY, BALCONY3_TABLE, BALCONY_DOOR, BATHROOM, BEANBAGS, CARROM, COFFEE_TABLE, DEFAULT_QIBLA_BEARING, FLAG, FLOOR_HEIGHT, type Floor, type FloorView, GAME_DOOR, GAME_ROOM, GAME_TV, HAMMOCK3, LESEHAN_TABLE, LIFT, LIFT_CABIN_Z, LIFT_DOOR_Z, LOUNGE_PARTITION_END_Z, MEETING_DOOR_X, MUSALA, MUSALA_DOOR_X, PARTITION_X, PING_PONG, RESIDENCE, RESIDENCE_DOOR, RESIDENCE_FLAG, SOFA, STALL_ROTATION, type OfficeLayout, TV, type Vec3, floor3Rooms, floorOf, floorSlabPieces, musalaSafPositions, qiblaDirection, qiblaFacing, type Placement } from './office3d-layout'
import { liftController } from './lift-controller'
import { LogoSign } from './logo-sign'
import { NeonBox, RoadsideNeonSign, RoomNamePlate, RoomTotem, WallLogo, WallStatement, WallWordmark } from './branding'
import { Residence } from './residence'
import { MeetingScreen, PrayerBoard, calligraphyTexture, mihrabTexture, qiblaArrowTexture, type PrayerBoardData } from './meeting-screen'
import { AcOutdoorUnit, AirConditioner, ArcadeCabinet, Armchair, BathroomFittings, Beanbag, Bookshelf, CarromTable, ClothesLine, CoffeeTable, FlagPole, FloorCushion, Fridge, GalonDispenser, Gerobak, Hammock, KopiSepeda, LongTable, LowTable, OfficeChair, OfficeLight, PantryCounter, PingPongTable, Plant, Railing, RattanChair, RBox, SideTable, Sofa, StreetLamp, StringLights, Television, Tree, Vendor, WallClock, Whiteboard, WorkDesk } from './props'
import { asphalt, carpet, grass, pavingStones, tileFloor, woodFloor } from './textures'

/**
 * Data live yang ditampilkan di scene (diambil Office3D dari API, BUKAN
 * hardcode): konten slideshow monitor + jadwal salat + arah kiblat.
 * Semua opsional — bila belum termuat, scene memakai fallback aman
 * (slideshow "Memuat…", kiblat default Jakarta 295,15°).
 */
export interface KantorSceneData {
  briefingContent: BriefingContent | null
  briefingActive: boolean
  briefingLeaderName: string | null
  prayerSchedule: PrayerScheduleDay | null
  prayerNext: NextPrayer | null
  prayerQibla: number
  prayerSource: string
  prayerCityName: string | null
  prayerTimezone: string
}

export const EMPTY_SCENE_DATA: KantorSceneData = {
  briefingContent: null,
  briefingActive: false,
  briefingLeaderName: null,
  prayerSchedule: null,
  prayerNext: null,
  prayerQibla: DEFAULT_QIBLA_BEARING,
  prayerSource: 'kemenag_astronomical',
  prayerCityName: null,
  prayerTimezone: 'Asia/Jakarta',
}

// The building (floors, walls, windows, furniture) and its surroundings (yard, sidewalk,
// street food, the flag and the road). In the evening (dark theme) the lamps come on. Walls facing the camera are kept low, like a
// cut-away dollhouse, so the inside stays visible from any angle the controls allow.

const WALL = '#efe6d6'
const WALL_TOP = '#d9cdb8'
const WALL_HEIGHT = 2.6
const THICK = 0.25

function Floor({ position, size, map, color = '#ffffff', roughness = 0.8 }: { position: Vec3; size: [number, number]; map?: ReturnType<typeof woodFloor>; color?: string; roughness?: number }) {
  return <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={size}/>
    <meshStandardMaterial map={map} color={color} roughness={roughness}/>
  </mesh>
}

function Wall({ from, to, height = WALL_HEIGHT }: { from: [number, number]; to: [number, number]; height?: number }) {
  const [x1, z1] = from
  const [x2, z2] = to
  const length = Math.hypot(x2 - x1, z2 - z1)
  const angle = Math.atan2(z2 - z1, x2 - x1)
  return <group position={[(x1 + x2) / 2, 0, (z1 + z2) / 2]} rotation={[0, -angle, 0]}>
    <RBox position={[0, height / 2, 0]} size={[length + THICK, height, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
    <RBox position={[0, height + 0.02, 0]} size={[length + THICK + 0.02, 0.05, THICK + 0.04]} radius={0.01} color={WALL_TOP}/>
  </group>
}

function Window({ position, width = 1.8, night }: { position: Vec3; width?: number; night: boolean }) {
  return <group position={position}>
    <RBox position={[0, 0, 0]} size={[width + 0.12, 1.22, 0.12]} radius={0.02} color="#5a4636"/>
    <mesh position={[0, 0, 0.065]}><planeGeometry args={[width, 1.1]}/><meshStandardMaterial color={night ? '#2d3f5c' : '#9fd3ea'} emissive={night ? '#1c2c4a' : '#6fb6d6'} emissiveIntensity={0.35} roughness={0.05} metalness={0.2}/></mesh>
    <RBox position={[0, 0, 0.08]} size={[0.05, 1.1, 0.03]} radius={0.01} color="#5a4636"/>
  </group>
}

/** A glass pane along x = const, from `bottom` up to near the top of the walls. */
function Glass({ x, fromZ, toZ, bottom }: { x: number; fromZ: number; toZ: number; bottom: number }) {
  const top = WALL_HEIGHT - 0.2
  return <RBox position={[x, (bottom + top) / 2, (fromZ + toZ) / 2]} size={[0.05, top - bottom, Math.abs(toZ - fromZ)]} radius={0.01} color="#cfe8ee" opacity={0.25} roughness={0.05} shadow={false}/>
}

/** Dinding penuh (2.6) sepanjang x dengan celah pintu + ambang atas — dinding utara ruangan lantai 3. */
function DoorWall({ z, fromX, toX, doorCenter, doorWidth = 0.9 }: { z: number; fromX: number; toX: number; doorCenter: number; doorWidth?: number }) {
  const d0 = doorCenter - doorWidth / 2
  const d1 = doorCenter + doorWidth / 2
  return <group>
    <Wall from={[fromX, z]} to={[d0, z]}/>
    <Wall from={[d1, z]} to={[toX, z]}/>
    <RBox position={[doorCenter, 2.35, z]} size={[doorWidth, 0.5, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
  </group>
}

/** The game room wing: ping-pong, arcade machines, a console corner and a karambol board. */
function GameRoom({ night }: { night: boolean }) {
  const { minX, maxX, minZ, maxZ } = GAME_ROOM
  const floor = useMemo(() => carpet('#3b4170', [3, 3]), [])
  return <group>
    <Floor position={[(minX + maxX) / 2, 0.006, (minZ + maxZ) / 2]} size={[maxX - minX, maxZ - minZ]} map={floor} roughness={0.9}/>
    <Wall from={[minX, minZ]} to={[maxX, minZ]}/>
    <Wall from={[maxX, minZ]} to={[maxX, maxZ]}/>
    <Wall from={[minX, maxZ]} to={[maxX, maxZ]} height={0.55}/>
    <group rotation={[0, -Math.PI / 2, 0]} position={[maxX - 0.14, 1.55, -2.2]}><Window position={[0, 0, 0]} width={1.6} night={night}/></group>
    <PingPongTable position={PING_PONG}/>
    {ARCADES.map((position, index) => <ArcadeCabinet key={index} position={position} color={index === 0 ? '#c62828' : '#1d4ed8'}/>)}
    <RBox position={[GAME_TV[0], 0.25, GAME_TV[2] + 0.2]} size={[1.8, 0.5, 0.4]} radius={0.03} color="#1f2328"/>
    <RBox position={[GAME_TV[0] - 0.3, 0.55, GAME_TV[2] + 0.2]} size={[0.36, 0.08, 0.26]} radius={0.02} color="#f2f2f2"/>
    <Television position={[GAME_TV[0], 1.35, GAME_TV[2] + 0.02]}/>
    {BEANBAGS.map((position, index) => <Beanbag key={index} position={position} color={index === 0 ? '#e76f51' : '#2a9d8f'}/>)}
    <CarromTable position={CARROM}/>
    <Plant position={[maxX - 0.5, 0, maxZ - 0.5]} size={0.9}/>
    {/* Plang nama ruangan (Fase 3b): di dinding utara, y 2,35 — di atas TV
        dan arcade, terbaca dari kamera default. */}
    <RoomNamePlate position={[12.6, 2.35, minZ + 0.125]} text="Game Room" width={1.6}/>
    <AirConditioner position={[(minX + maxX) / 2 - 0.6, 2.3, minZ + 0.125]}/>
    {[[PING_PONG[0], 2.4, PING_PONG[2]], [ARCADES[0][0] + 0.5, 2.4, -3.6], [GAME_TV[0], 2.4, -3.6]].map((position) => <OfficeLight key={position.join(',')} position={position as Vec3} night={night}/>)}
  </group>
}

function Building({ night, layout, scene, onLiftRide }: { night: boolean; layout: OfficeLayout; scene: KantorSceneData; onLiftRide?: () => void }) {
  const { minX, maxX, minZ, maxZ } = layout.building
  const wood = useMemo(() => woodFloor([4, 4]), [])
  const tiles = useMemo(() => tileFloor([3, 5]), [])
  const rug = useMemo(() => carpet('#5b7c8c', [2, 2]), [])
  const meetingRug = useMemo(() => carpet('#8a4b3c', [2, 2]), [])
  return <group>
    {/* Floors: parquet everywhere, tiles in the pantry, rugs in the lounge and meeting area */}
    <Floor position={[(minX + maxX) / 2, 0.005, (minZ + maxZ) / 2]} size={[maxX - minX, maxZ - minZ]} map={wood} roughness={0.55}/>
    <Floor position={[8.35, 0.01, 1.4]} size={[2.3, 5.4]} map={tiles} roughness={0.35}/>
    <Floor position={[4.6, 0.012, -2.9]} size={[4.4, 2.8]} map={rug}/>
    <Floor position={[(layout.meetingRoom.minX + layout.meetingRoom.maxX) / 2, 0.012, (layout.meetingRoom.minZ + layout.meetingRoom.maxZ) / 2]} size={[layout.meetingRoom.maxX - layout.meetingRoom.minX - 0.3, layout.meetingRoom.maxZ - layout.meetingRoom.minZ - 0.3]} map={meetingRug}/>
    {/* Full-height back and left walls, low walls towards the camera */}
    <Wall from={[minX, minZ]} to={[maxX, minZ]}/>
    <Wall from={[minX, minZ]} to={[minX, maxZ]}/>
    {/* Right wall: the lounge side opens into the game room through a door, glass above */}
    <Wall from={[maxX, minZ]} to={[maxX, GAME_DOOR.fromZ]} height={1.1}/>
    <Wall from={[maxX, GAME_DOOR.toZ]} to={[maxX, maxZ]} height={1.1}/>
    <Glass x={maxX} fromZ={minZ} toZ={GAME_DOOR.fromZ} bottom={1.1}/>
    <Glass x={maxX} fromZ={GAME_DOOR.toZ} toZ={GAME_ROOM.maxZ} bottom={1.1}/>
    {/* Glass partition that makes the lounge its own room */}
    <Wall from={[PARTITION_X, minZ]} to={[PARTITION_X, LOUNGE_PARTITION_END_Z]} height={0.9}/>
    <Glass x={PARTITION_X} fromZ={minZ} toZ={LOUNGE_PARTITION_END_Z} bottom={0.9}/>
    <Wall from={[minX, maxZ]} to={[4.9, maxZ]} height={0.55}/>
    <Wall from={[6.7, maxZ]} to={[maxX, maxZ]} height={0.55}/>
    {/* Meeting room: glass-topped half walls with a door by the aisle, and a planter row by the lounge */}
    <MeetingRoom layout={layout} night={night} scene={scene}/>
    {/* Musala Virtual: dinding utara + timur dibangun di sini; barat =
        dinding timur ruang meeting, selatan = dinding depan gedung. */}
    <Musala night={night} layout={layout} scene={scene}/>
    {[1.3, 2.3, 3.3].map((z) => <Plant key={z} position={[0.9, 0, z]} size={0.8}/>)}
    {/* Windows on the back and left walls */}
    {[-7, -3.6, 1.4, 6.6].map((x) => <Window key={x} position={[x, 1.55, minZ + 0.14]} night={night}/>)}
    {[-3].map((z) => <group key={z} rotation={[0, Math.PI / 2, 0]} position={[minX + 0.14, 1.55, z]}><Window position={[0, 0, 0]} width={1.6} night={night}/></group>)}
    {/* Workspace */}
    <Bookshelf position={[minX + 0.35, 0, -0.9]} rotation={Math.PI / 2}/>
    <Plant position={[minX + 0.5, 0, -4.6]}/>
    <Plant position={[-0.4, 0, -4.7]} size={0.9}/>
    <WallClock position={[-3.6, 2.35, minZ + 0.14]}/>
    {/* Papan nama WOORK di dinding belakang, di belakang barisan meja */}
    <LogoSign minZ={minZ}/>
    {/* Plang nama ruangan lantai 1 (Fase 3b): di dinding belakang/utara,
        y 2,35 (di atas jendela, di bawah tepi dinding) supaya terbaca dari
        kamera default tanpa menutupi TV/branding/jam dinding. */}
    <RoomNamePlate position={[-5.3, 2.35, minZ + 0.125]} text="Ruang Kerja" width={2.0}/>
    <RoomNamePlate position={[3.0, 2.35, minZ + 0.125]} text="Ruang Tengah" width={1.6}/>
    <RoomNamePlate position={[(layout.meetingRoom.minX + layout.meetingRoom.maxX) / 2, 2.1, 1.01]} text="Ruang Meeting" width={1.6}/>
    <RoomNamePlate position={[-2.05, 2.23, MUSALA.minZ + 0.06]} text="Musala" width={1.2}/>
    <RoomNamePlate position={[9.44, 1.6, 1.4]} rotation={-Math.PI / 2} text="Dapur" width={1.4}/>
    {/* Neon box WOORK.ID di dinding belakang, sudut dapur/lounge: celah
        bebas jendela x 7,56..9,5 (jendela terakhir berakhir 7,56; sudut
        9,5) — panel 1,6 m di x 8,5, y 1,6, menempel di dinding. */}
    <NeonBox position={[8.5, 1.6, minZ + 0.125]}/>
    {/* Brand statement di fasad depan (sisi luar dinding depan, menghadap
        jalan/kamera default): "WORK SMARTER WITH WOORK." */}
    <WallStatement position={[-2, 0.28, maxZ + 0.125]} text="WORK SMARTER WITH WOORK." width={1.8}/>
    {/* Lounge */}
    <Sofa position={SOFA} rotation={Math.PI}/>
    {/* Armchairs sit exactly behind the lounge seats agents use (LOUNGE_SEATS 2 and 3) */}
    <Armchair position={[2.1, 0, -2.9]} rotation={Math.PI / 2} color="#d9784a"/>
    <Armchair position={[7.1, 0, -2.9]} rotation={-Math.PI / 2} color="#3d7fd6"/>
    <CoffeeTable position={COFFEE_TABLE}/>
    <RBox position={[TV[0], 0.3, TV[2]]} size={[1.8, 0.6, 0.45]} radius={0.03} color="#6b4a32"/>
    {/* TV lounge LIVE: menampilkan website woork.id (iframe, fallback
        otomatis ke slideshow branding bila gagal muat). TV ruang meeting
        TIDAK diganti — ia menampilkan MeetingScreen (Smart Display). */}
    <Television position={[TV[0], 1.35, minZ + 0.17]} live briefingContent={scene.briefingContent} building={layout.building}/>
    <Plant position={[2.1, 0, -4.6]}/>
    {/* Pantry: galon dispenser, fridge and counter */}
    <GalonDispenser position={[maxX - 0.45, 0, -0.4]} rotation={-Math.PI / 2}/>
    <Fridge position={[maxX - 0.5, 0, 0.6]} rotation={-Math.PI / 2}/>
    <PantryCounter position={[maxX - 0.45, 0, 2.6]} rotation={-Math.PI / 2}/>
    {/* Split ACs high on the walls */}
    <AirConditioner position={[-5.3, 2.3, minZ + 0.125]}/>
    <AirConditioner position={[TV[0], 2.3, minZ + 0.125]}/>
    <AirConditioner position={[minX + 0.125, 2.3, 2.6]} rotation={Math.PI / 2}/>
    {/* Office lights: suspended cool-white LED bars */}
    {[...layout.desks.map(([x, , z]): Vec3 => [x, 2.4, z + 0.2]),  [(layout.meetingRoom.table.x1 + layout.meetingRoom.table.x2) / 2, 2.4, layout.meetingRoom.table.z] as Vec3, [COFFEE_TABLE[0], 2.4, COFFEE_TABLE[2] + 0.4] as Vec3, [8.2, 2.4, 1.2] as Vec3].map((position) => <OfficeLight key={position.join(',')} position={position} night={night}/>)}
    {/* Shaft lift lantai 1 (ujung selatan pantry) — segmen atas dirender Environment (mode all / lantai 2–3) */}
    <LiftShaft baseY={0} onDoorClick={onLiftRide}/>
    <GameRoom night={night}/>
  </group>
}

/** A glass pane along z = const, from `bottom` to near the top of the walls. */
function GlassAlongX({ z, fromX, toX, bottom }: { z: number; fromX: number; toX: number; bottom: number }) {
  const top = WALL_HEIGHT - 0.2
  return <RBox position={[(fromX + toX) / 2, (bottom + top) / 2, z]} size={[Math.abs(toX - fromX), top - bottom, 0.05]} radius={0.01} color="#cfe8ee" opacity={0.25} roughness={0.05} shadow={false}/>
}

/** The meeting room: long table and chairs, a TV showing a live slideshow, a whiteboard. */
function MeetingRoom({ layout, night, scene }: { layout: OfficeLayout; night: boolean; scene: KantorSceneData }) {
  const { minX, maxX, minZ, maxZ, table, tv, whiteboard, seats } = layout.meetingRoom
  const door = { from: MEETING_DOOR_X - 0.45, to: MEETING_DOOR_X + 0.45 }
  const chairs = seats.filter((seat) => seat.seated)
  return <group>
    {/* Right wall towards the lounge side, and the aisle-side wall with its door */}
    <Wall from={[maxX, minZ]} to={[maxX, maxZ]} height={0.9}/>
    <Glass x={maxX} fromZ={minZ} toZ={maxZ} bottom={0.9}/>
    {/* Its own left wall when the room is narrower than the building */}
    {minX > layout.building.minX + 0.1 && <><Wall from={[minX, minZ]} to={[minX, maxZ]} height={0.9}/><Glass x={minX} fromZ={minZ} toZ={maxZ} bottom={0.9}/></>}
    <Wall from={[minX, minZ]} to={[door.from, minZ]} height={0.9}/>
    <Wall from={[door.to, minZ]} to={[maxX, minZ]} height={0.9}/>
    {/* Logo WOORK di dinding belakang ruang meeting (tengah segmen dinding
        di kiri pintu, y 0,45 — muat di dinding 0,9 m), terlihat dari kursi
        rapat dan kamera meeting. */}
    <WallLogo position={[(minX + (MEETING_DOOR_X - 0.45)) / 2, 0.45, minZ + 0.125]} width={1.8}/>
    <GlassAlongX z={minZ} fromX={minX} toX={door.from} bottom={0.9}/>
    <GlassAlongX z={minZ} fromX={door.to} toX={maxX} bottom={0.9}/>
    <RBox position={[MEETING_DOOR_X, WALL_HEIGHT - 0.15, minZ]} size={[0.95, 0.1, 0.12]} radius={0.02} color={WALL_TOP}/>
    <LongTable position={[(table.x1 + table.x2) / 2, 0, table.z]} length={table.x2 - table.x1}/>
    {chairs.map(({ position: [x, , z], facing }) => <OfficeChair key={`${x},${z}`} position={[x, 0, z]} rotation={facing}/>)}
    {/* TV on a stand at the table's left end — Smart Display: slideshow
        dinamis dari data NYATA (GET /api/kantor/briefing/content), bukan
        grafik batang statis. Bidang tepat di depan layar TV (z 0,05),
        rasio 1,88:1,03 sama dengan layar; material unlit = menyala.
        Presentation Mode: bila briefing aktif, slide pertama = MORNING
        BRIEFING (diatur di buildSlides). */}
    <group position={[tv[0], 0, tv[2]]} rotation={[0, Math.PI / 2, 0]}>
      <RBox position={[0, 0.03, 0]} size={[0.9, 0.05, 0.5]} radius={0.02} color="#2a2f33"/>
      <RBox position={[0, 0.75, -0.08]} size={[0.1, 1.45, 0.08]} radius={0.02} color="#3a3f44" metalness={0.5}/>
      <group position={[0, 1.45, 0.05]}>
      <Television position={[0, 0, -0.05]}/>
      <MeetingScreen content={scene.briefingContent} briefingActive={scene.briefingActive} leaderName={scene.briefingLeaderName}/>
      </group>
    </group>
    <Whiteboard position={whiteboard} rotation={-Math.PI / 2}/>
    <Plant position={[maxX - 0.4, 0, maxZ - 0.45]} size={0.8}/>
  </group>
}

/**
 * MUSALA VIRTUAL (lantai 1): karpet salat, saf menghadap kiblat, mihrab,
 * penanda kiblat, rak Al-Qur'an, lemari perlengkapan, kaligrafi, papan
 * jadwal salat, area imam, dan lampu hangat.
 *
 * Dinding barat = dinding timur ruang meeting (sudah ada); dinding
 * selatan = dinding depan gedung (sudah ada, rendah, gaya dollhouse);
 * dinding utara + timur dibangun di sini (setengah dinding + kaca, gaya
 * yang sama dengan ruang meeting). Pintu di dinding utara menghadap gang.
 * Saf + mihrab menghadap kiblat dari API (bukan angka asal).
 */
function Musala({ night, layout, scene }: { night: boolean; layout: OfficeLayout; scene: KantorSceneData }) {
  const { minX, maxX, minZ, maxZ } = MUSALA
  const qibla = scene.prayerQibla
  const rug = useMemo(() => carpet('#1e5c46', [3, 3]), [])
  const saf = useMemo(() => musalaSafPositions(layout, qibla), [layout, qibla])
  const imam = saf[0]
  const row1 = saf.slice(1, 5)
  const row2 = saf.slice(5, 9)
  const mihrabTex = useMemo(() => mihrabTexture(), [])
  const calligraphyTex = useMemo(() => calligraphyTexture(), [])
  const arrowTex = useMemo(() => qiblaArrowTexture(), [])
  const [qx, qz] = qiblaDirection(qibla)
  // Sudut strip garis saf: sumbu baris tegak lurus kiblat.
  const rowAngle = Math.atan2(-qx, -qz)
  const facing = qiblaFacing(qibla)
  const rowCenter = (row: Placement[]): Vec3 => {
    const xs = row.map((p) => p.position[0])
    const zs = row.map((p) => p.position[2])
    return [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2]
  }
  const rowLength = (row: Placement[]) => Math.max(1.6, (row.length - 1) * 0.8 + 0.8)
  const door = { from: MUSALA_DOOR_X - 0.45, to: MUSALA_DOOR_X + 0.45 }
  const board: PrayerBoardData = {
    schedule: scene.prayerSchedule,
    next: scene.prayerNext,
    qibla: scene.prayerQibla,
    source: scene.prayerSource,
    cityName: scene.prayerCityName,
    timezone: scene.prayerTimezone,
  }
  return <group>
    {/* Lantai karpet hijau */}
    <Floor position={[(minX + maxX) / 2, 0.006, (minZ + maxZ) / 2]} size={[maxX - minX, maxZ - minZ]} map={rug} roughness={0.9}/>
    {/* Dinding utara (z = minZ) dengan pintu; dinding timur (x = maxX). */}
    <Wall from={[minX, minZ]} to={[door.from, minZ]} height={0.9}/>
    <Wall from={[door.to, minZ]} to={[maxX, minZ]} height={0.9}/>
    <GlassAlongX z={minZ} fromX={minX} toX={door.from} bottom={0.9}/>
    <GlassAlongX z={minZ} fromX={door.to} toX={maxX} bottom={0.9}/>
    <RBox position={[MUSALA_DOOR_X, WALL_HEIGHT - 0.15, minZ]} size={[0.95, 0.1, 0.12]} radius={0.02} color={WALL_TOP}/>
    <Wall from={[maxX, minZ]} to={[maxX, maxZ]} height={0.9}/>
    <Glass x={maxX} fromZ={minZ} toZ={maxZ} bottom={0.9}/>
    {/* Garis saf emas (satu strip per baris). */}
    {[row1, row2].map((row, i) => {
      const c = rowCenter(row)
      return <RBox key={i} position={[c[0], 0.02, c[2]]} size={[rowLength(row), 0.02, 0.09]} radius={0.01} rotation={[0, rowAngle, 0]} color="#c9a24a" emissive="#c9a24a" emissiveIntensity={night ? 0.5 : 0.2} shadow={false}/>
    })}
    {/* Sajadah imam: alas merah bata berbingkai emas, menghadap kiblat. */}
    <RBox position={[imam.position[0], 0.018, imam.position[2]]} size={[1.15, 0.02, 1.45]} radius={0.02} rotation={[0, facing, 0]} color="#c9a24a" shadow={false}/>
    <RBox position={[imam.position[0], 0.022, imam.position[2]]} size={[1.0, 0.02, 1.3]} radius={0.02} rotation={[0, facing, 0]} color="#8a4b3c" shadow={false}/>
    {/* Mihrab di dinding barat, tepat di depan imam (arah kiblat). */}
    <RBox position={[minX + 0.03, 0.95, imam.position[2]]} size={[0.05, 1.9, 0.98]} radius={0.02} color="#14532d"/>
    <mesh position={[minX + 0.06, 0.95, imam.position[2]]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[0.9, 1.9]}/>
      <meshBasicMaterial map={mihrabTex} toneMapped={false}/>
    </mesh>
    {/* Penanda kiblat di lantai, tepat di dalam pintu. */}
    <group position={[MUSALA_DOOR_X, 0.02, 1.75]} rotation={[0, -((qibla * Math.PI) / 180), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, 0.9]}/>
        <meshBasicMaterial map={arrowTex} transparent toneMapped={false}/>
      </mesh>
    </group>
    {/* Rak Al-Qur'an di dinding timur (menghadap ke ruangan). */}
    <Bookshelf position={[maxX - 0.2, 0, 1.7]} rotation={-Math.PI / 2}/>
    {/* Lemari perlengkapan ibadah (sarung/mukena) di sudut tenggara. */}
    <RBox position={[maxX - 0.25, 0.6, maxZ - 0.35]} size={[0.5, 1.2, 0.6]} radius={0.03} color="#6b4a32"/>
    {/* Kaligrafi geometris di dinding timur. */}
    <mesh position={[maxX - 0.06, 1.55, 2.9]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[1.1, 0.69]}/>
      <meshBasicMaterial map={calligraphyTex} toneMapped={false}/>
    </mesh>
    {/* Papan jadwal salat di dinding utara (menghadap selatan), dengan
        panel gelap di belakangnya supaya terbaca di atas kaca. */}
    <RBox position={[-2.05, 1.55, minZ + 0.03]} size={[1.85, 1.2, 0.04]} radius={0.02} color="#111416" shadow={false}/>
    <group position={[-2.05, 1.55, minZ + 0.06]}>
      <PrayerBoard {...board}/>
    </group>
    {/* Lampu hangat di atas musala + tanaman di sudut barat daya. */}
    <OfficeLight position={[(minX + maxX) / 2, 2.4, (minZ + maxZ) / 2]} night={night}/>
    <Plant position={[minX + 0.25, 0, maxZ - 0.45]} size={0.7}/>
  </group>
}

/**
 * Pintu lift geser (lift-only): DUA panel baja yang membuka/menutup
 * mengikuti liftController.getSnapshot().doorOpen (0 = tertutup, 1 =
 * terbuka penuh) — hanya di lantai tempat kabin berada (kabin di lantai
 * lain = pintu segmen ini tetap tertutup). Panel tetap bisa diklik
 * (onDoorClick dipertahankan — ride kamera). Lampu indikator di atas
 * pintu menyala saat kabin di lantai ini, redup bila tidak.
 * Posisi digerakkan lewat ref di useFrame (bukan React state — 60 fps).
 */
function LiftShaftDoors({ baseY, onDoorClick }: { baseY: number; onDoorClick?: () => void }) {
  const panelA = useRef<THREE.Mesh>(null)
  const panelB = useRef<THREE.Mesh>(null)
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const snap = liftController.getSnapshot()
    const here = Math.abs(snap.cabinY - baseY) < 0.01
    const open = here ? snap.doorOpen : 0
    const shift = 0.45 * open
    panelA.current?.position.set(LIFT.minX, baseY + 1.05, LIFT_DOOR_Z - 0.225 - shift)
    panelB.current?.position.set(LIFT.minX, baseY + 1.05, LIFT_DOOR_Z + 0.225 + shift)
    if (lamp.current) lamp.current.emissiveIntensity = here ? 1.6 : 0.15
  })
  const click = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onDoorClick?.() }
  const over = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }
  const out = () => { document.body.style.cursor = '' }
  return <>
    <mesh ref={panelA} position={[LIFT.minX, baseY + 1.05, LIFT_DOOR_Z - 0.225]} castShadow onClick={click} onPointerOver={over} onPointerOut={out}>
      <boxGeometry args={[0.05, 2.1, 0.45]}/>
      <meshStandardMaterial color="#2a2f33" metalness={0.5} roughness={0.4}/>
    </mesh>
    <mesh ref={panelB} position={[LIFT.minX, baseY + 1.05, LIFT_DOOR_Z + 0.225]} castShadow onClick={click} onPointerOver={over} onPointerOut={out}>
      <boxGeometry args={[0.05, 2.1, 0.45]}/>
      <meshStandardMaterial color="#2a2f33" metalness={0.5} roughness={0.4}/>
    </mesh>
    {/* Lampu indikator lantai: menyala saat kabin di lantai ini. */}
    <mesh position={[LIFT.minX - 0.06, baseY + 2.3, LIFT_DOOR_Z]}>
      <boxGeometry args={[0.06, 0.12, 0.3]}/>
      <meshStandardMaterial ref={lamp} color="#3a2f10" emissive="#ffb020" emissiveIntensity={0.15}/>
    </mesh>
  </>
}

/**
 * Kabin lift (lift-only): SATU komponen, dirender SEKALI oleh Environment
 * (bukan per segmen shaft), posisinya mengikuti snapshot tiap frame.
 * Kotak 1,0 × 2,2 × 1,3 berpusat di [9,0, cabinY, 3,55] (tengah shaft —
 * rata dengan fasad, TIDAK menembus dinding depan); titik berdiri agent
 * tetap [9,0, y, LIFT_CABIN_Z = 3,85] seperti Fase 5b (grup diposisikan
 * di sana, isi kabin digeser -0,3 di z lokal). Depan terbuka menghadap
 * barat (pintu); sisi utara terbuka karena counter pantry masuk ke
 * dalam shaft di lantai 1 (ujungnya sampai z 3,6) — panel utara akan
 * memotong counter, jadi kabin dibiarkan terbuka di sisi itu. Lantai +
 * langit-langit + lampu + lapisan dalam timur/selatan (0,01 m di depan
 * dinding shaft supaya interior terbaca sebagai kabin, bukan shaft
 * kosong). Visibilitas mengikuti aturan tampil agent: terlihat bila
 * lantainya terlihat (floorOf(cabinY) <= floor, atau mode all).
 */
function LiftCabin({ floor }: { floor: FloorView }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const snap = liftController.getSnapshot()
    const g = group.current
    if (!g) return
    g.position.set(9.0, snap.cabinY, LIFT_CABIN_Z)
    g.visible = floor === 'all' || floorOf(snap.cabinY) <= floor
  })
  return <group ref={group} position={[9.0, 0, LIFT_CABIN_Z]}>
    {/* Lantai kabin (isi digeser -0,3 di z: kotak berpusat di z 3,55). */}
    <RBox position={[0, 0.03, -0.3]} size={[1.0, 0.06, 1.3]} radius={0.01} color="#6b6f73" roughness={0.6}/>
    {/* Langit-langit + lampu. */}
    <RBox position={[0, 2.17, -0.3]} size={[1.0, 0.06, 1.3]} radius={0.01} color="#3a4046" roughness={0.5}/>
    <RBox position={[0, 2.12, -0.3]} size={[0.6, 0.03, 0.8]} radius={0.01} color="#fff2cc" emissive="#ffdf9e" emissiveIntensity={1.0} shadow={false}/>
    {/* Lapisan dalam timur + selatan (di depan dinding shaft). */}
    <RBox position={[0.36, 1.1, -0.3]} size={[0.02, 2.2, 1.3]} radius={0.005} color="#4a5054" metalness={0.4} roughness={0.5}/>
    <RBox position={[0, 1.1, 0.22]} size={[1.0, 2.2, 0.02]} radius={0.005} color="#4a5054" metalness={0.4} roughness={0.5}/>
  </group>
}

/**
 * Satu segmen shaft lift (Fase 2a, struktur saja): dinding barat (dengan
 * celah pintu), timur, utara, selatan setinggi satu lantai + pintu geser
 * (LiftShaftDoors, mengikuti liftController) + lampu indikator lantai.
 * Ride/interaksi: pintu bisa diklik (`onDoorClick`) untuk naik lift —
 * kamera mengikuti kabin sungguhan (LiftRideAnimator di Office3D).
 * Dipakai per lantai: Building (baseY 0), Environment (2.8, 5.6).
 */
function LiftShaft({ baseY, cap = false, onDoorClick }: { baseY: number; cap?: boolean; onDoorClick?: () => void }) {
  const { minX, maxX, minZ, maxZ } = LIFT
  const door = { from: LIFT_DOOR_Z - 0.45, to: LIFT_DOOR_Z + 0.45 }
  const H = WALL_HEIGHT
  return <group>
    {/* Dinding barat (x = minX) dengan celah pintu */}
    <RBox position={[minX, baseY + H / 2, (minZ + door.from) / 2]} size={[0.12, H, door.from - minZ]} radius={0.01} color={WALL} roughness={0.9}/>
    <RBox position={[minX, baseY + H / 2, (door.to + maxZ) / 2]} size={[0.12, H, maxZ - door.to]} radius={0.01} color={WALL} roughness={0.9}/>
    <RBox position={[minX, baseY + 2.35, LIFT_DOOR_Z]} size={[0.12, 0.5, 0.9]} radius={0.01} color={WALL} roughness={0.9}/>
    {/* Dinding timur, utara, selatan (penuh) */}
    <RBox position={[maxX - 0.06, baseY + H / 2, (minZ + maxZ) / 2]} size={[0.12, H, maxZ - minZ]} radius={0.01} color={WALL} roughness={0.9}/>
    <RBox position={[(minX + maxX) / 2, baseY + H / 2, minZ + 0.06]} size={[maxX - minX, H, 0.12]} radius={0.01} color={WALL} roughness={0.9}/>
    <RBox position={[(minX + maxX) / 2, baseY + H / 2, maxZ - 0.06]} size={[maxX - minX, H, 0.12]} radius={0.01} color={WALL} roughness={0.9}/>
    <LiftShaftDoors baseY={baseY} onDoorClick={onDoorClick}/>
    {cap && <RBox position={[(minX + maxX) / 2, baseY + H + 0.06, (minZ + maxZ) / 2]} size={[maxX - minX + 0.12, 0.12, maxZ - minZ + 0.12]} radius={0.02} color="#9a9a94" roughness={0.95}/>}
  </group>
}

/** A glass pane along z = const (front walls), from `bottom` to `top`. */
function GlassZ({ z, fromX, toX, bottom, top }: { z: number; fromX: number; toX: number; bottom: number; top: number }) {
  return <RBox position={[(fromX + toX) / 2, (bottom + top) / 2, z]} size={[Math.abs(toX - fromX), top - bottom, 0.05]} radius={0.01} color="#cfe8ee" opacity={0.25} roughness={0.05} shadow={false}/>
}

/** Lantai 2 (Fase 3b): 8 klaster divisi Tech. Balkon DIHAPUS 2026-11-23 (permintaan user) — dinding depan ditutup (rendah + kaca), pelat + perabot balkon tidak dirender; balkon lantai 3 tetap ada. Lift-only sejak 2026-11-23 — semua pindah lantai pakai lift. */
function UpperFloor({ night, layout, activeDeskIds, onFocusDivision }: { night: boolean; layout: OfficeLayout; activeDeskIds?: Set<string>; onFocusDivision?: (name: string) => void }) {
  const { minX, maxX, minZ, maxZ } = layout.building
  const wood = useMemo(() => woodFloor([4, 4]), [])
  // Karpet tiap klaster (satu tekstur per warna, dihitung sekali).
  const clusterRugs = useMemo(() => layout.techClusters.map((cluster) => carpet(cluster.rug.color, [2, 2])), [layout])
  // Pelat dengan lubang shaft lift (lihat floorSlabPieces).
  // Potongan ke-4 (balkon) TIDAK dirender di lantai 2 — balkon dihapus;
  // lantai 3 memakai keempat potong.
  const slab = floorSlabPieces(layout.building)
  const doorX = (BALCONY_DOOR.fromX + BALCONY_DOOR.toX) / 2
  const H = FLOOR_HEIGHT
  return <group>
    <group position={[0, H, 0]}>
      {slab.slice(0, 3).map(([x1, x2, z1, z2]) => <RBox key={`${x1},${z1}`} position={[(x1 + x2) / 2, -0.11, (z1 + z2) / 2]} size={[x2 - x1, 0.22, z2 - z1]} radius={0.01} color="#cfc6b5"/>)}
      {slab.slice(0, 3).map(([x1, x2, z1, z2]) => <Floor key={`f${x1},${z1}`} position={[(x1 + x2) / 2, 0.005, (z1 + z2) / 2]} size={[x2 - x1, z2 - z1]} map={wood} roughness={0.55}/>)}
      {/* Dinding depan (balkon dihapus 2026-11-23): rendah + kaca penuh,
          tanpa celah pintu — gaya dollhouse tetap, interior tetap terlihat. */}
      <Wall from={[minX, minZ]} to={[maxX, minZ]}/>
      <Wall from={[minX, minZ]} to={[minX, maxZ]}/>
      <Wall from={[maxX, minZ]} to={[maxX, maxZ]}/>
      <Wall from={[minX, maxZ]} to={[maxX, maxZ]} height={0.55}/>
      <GlassZ z={maxZ} fromX={minX} toX={maxX} bottom={0.55} top={2.2}/>
      {[-6, -2.4, 2.6].filter((x) => x > minX + 1).map((x) => <Window key={x} position={[x, 1.55, minZ + 0.14]} night={night}/>)}
      <group rotation={[0, -Math.PI / 2, 0]} position={[maxX - 0.14, 1.55, 0.6]}><Window position={[0, 0, 0]} width={1.6} night={night}/></group>
      {/* ── KLASTER TECH LANTAI 2 (Fase 3b) ──
          8 klaster divisi: 4 pod baris belakang (dua meja berhadapan) + 4
          pasang baris depan (dua meja berdampingan). Tiap klaster: karpet
          warna sendiri (batas divisi terlihat) + meja kerja (menyala bila
          ditempati agent yang bekerja) + totem plang nama di sisi timur.
          Posisi dari layout.techClusters (dihitung dari batas gedung);
          y relatif 0 karena grup ini sudah di y = FLOOR_HEIGHT. */}
      {layout.techClusters.map((cluster, ci) => <group key={cluster.key}>
        <Floor position={[cluster.rug.center[0], 0.012, cluster.rug.center[2]]} size={cluster.rug.size} map={clusterRugs[ci]} roughness={0.9}/>
        {cluster.desks.map((d) => <group key={d.id} rotation={[0, d.rotation, 0]} position={[d.desk[0], 0, d.desk[2]]}><WorkDesk position={[0, 0, 0]} active={activeDeskIds?.has(d.id) ?? false}/></group>)}
        <RoomTotem position={[cluster.totem[0], 0, cluster.totem[2]]} text={cluster.short} width={cluster.totemWidth} onClick={onFocusDivision ? () => onFocusDivision(cluster.name) : undefined}/>
      </group>)}
      <OfficeLight position={[doorX, 2.4, 2]} night={night}/>
      {/* Lampu tambahan di atas klaster Tech (Fase 3b, supaya lantai 2 tidak
          gelap di tema malam). */}
      <OfficeLight position={[-1, 2.4, -2.75]} night={night}/>
      <OfficeLight position={[-1, 2.4, 1.4]} night={night}/>
    </group>
  </group>
}

/**
 * Fase 2a — Lantai 3 (y=5.6): dorm pindah dari lantai 2 + ruangan
 * eksekutif & manajemen §7 (CEO, Strategy & PM, Legal, Executive Meeting
 * Room kaca, Executive Lounge di balkon, AI Command Center) + balkon
 * lantai 3. TANPA atap (terbuka ke langit, konsisten dengan lantai 2).
 * Lift-only sejak 2026-11-23 — semua pindah lantai pakai lift.
 */
function TopFloor({ night, layout, activeDeskIds }: { night: boolean; layout: OfficeLayout; activeDeskIds?: Set<string> }) {
  const { minX, maxX, minZ, maxZ } = layout.building
  const wood = useMemo(() => woodFloor([4, 4]), [])
  const loungeRug = useMemo(() => carpet('#8a4b3c', [3, 3]), [])
  const lesehanRug = useMemo(() => carpet('#8c3b3b', [2, 2]), [])
  const tiles = useMemo(() => tileFloor([2, 2]), [])
  const balconyTiles = useMemo(() => tileFloor([6, 1]), [])
  const slab = floorSlabPieces(layout.building)
  const rooms = floor3Rooms(layout.building)
  const doorX = (BALCONY_DOOR.fromX + BALCONY_DOOR.toX) / 2
  const balconyPosts = [minX + 0.15, (minX + maxX) / 2, maxX - 0.15]
  const H = 2 * FLOOR_HEIGHT
  const cc = rooms.commandCenter
  const ceo = rooms.ceoOffice
  const spm = rooms.strategyPm
  const ccX = (cc.minX + cc.maxX) / 2
  const ceoX = (ceo.minX + ceo.maxX) / 2
  const spmDoorX = (spm.minX + spm.maxX) / 2
  const legal = rooms.legal
  const meeting = rooms.execMeeting
  return <group>
    {/* Kolom balkon lantai 3 (BARU, di atas pelat lantai 3) + balok atas */}
    {balconyPosts.map((x) => <RBox key={x} position={[x, H + 2.3 / 2, BALCONY.maxZ - 0.12]} size={[0.18, 2.3, 0.18]} radius={0.02} color={WALL}/>)}
    <RBox position={[(minX + maxX) / 2, H + 2.3, BALCONY.maxZ - 0.12]} size={[maxX - minX, 0.12, 0.14]} radius={0.02} color={WALL_TOP}/>
    <group position={[0, H, 0]}>
      {slab.map(([x1, x2, z1, z2]) => <RBox key={`${x1},${z1}`} position={[(x1 + x2) / 2, -0.11, (z1 + z2) / 2]} size={[x2 - x1, 0.22, z2 - z1]} radius={0.01} color="#cfc6b5"/>)}
      {slab.slice(0, 3).map(([x1, x2, z1, z2]) => <Floor key={`f${x1},${z1}`} position={[(x1 + x2) / 2, 0.005, (z1 + z2) / 2]} size={[x2 - x1, z2 - z1]} map={wood} roughness={0.55}/>)}
      <Floor position={[(minX + maxX) / 2, 0.005, (BALCONY.minZ + BALCONY.maxZ) / 2]} size={[maxX - minX, BALCONY.maxZ - BALCONY.minZ]} map={balconyTiles} roughness={0.5}/>
      <Floor position={[(minX + rooms.bedroom.maxX) / 2, 0.012, -2.4]} size={[rooms.bedroom.maxX - minX - 0.4, 5]} map={loungeRug}/>
      <Floor position={[LESEHAN_TABLE[0], 0.012, LESEHAN_TABLE[2]]} size={[3.4, 2.8]} map={lesehanRug}/>
      <Floor position={[(BATHROOM.minX + BATHROOM.maxX) / 2, 0.012, (BATHROOM.minZ + BATHROOM.maxZ) / 2]} size={[BATHROOM.maxX - BATHROOM.minX, BATHROOM.maxZ - BATHROOM.minZ]} map={tiles} roughness={0.3}/>
      {/* Dinding luar: penuh di belakang/sisi, pintu kaca ke balkon */}
      <Wall from={[minX, minZ]} to={[maxX, minZ]}/>
      <Wall from={[minX, minZ]} to={[minX, maxZ]}/>
      <Wall from={[maxX, minZ]} to={[maxX, maxZ]}/>
      <Wall from={[minX, maxZ]} to={[BALCONY_DOOR.fromX, maxZ]} height={0.3}/>
      <Wall from={[BALCONY_DOOR.toX, maxZ]} to={[maxX, maxZ]} height={0.3}/>
      <GlassZ z={maxZ} fromX={minX} toX={BALCONY_DOOR.fromX} bottom={0.3} top={2.2}/>
      <GlassZ z={maxZ} fromX={BALCONY_DOOR.toX} toX={maxX} bottom={0.3} top={2.2}/>
      {[-6, -2.4, 2.6].filter((x) => x > minX + 1).map((x) => <Window key={x} position={[x, 1.55, minZ + 0.14]} night={night}/>)}
      <group rotation={[0, -Math.PI / 2, 0]} position={[maxX - 0.14, 1.55, 0.6]}><Window position={[0, 0, 0]} width={1.6} night={night}/></group>
      {/* ── CREATIVE LOUNGE (Fase 3a Residence: bekas dorm; kasur/nakas/lemari
          dihapus; furnitur menempel dinding, tengah karpet kosong untuk
          16 rest spot tidur Fase 3b; lampu di atas posisi kasur lama tetap) ── */}
      <Wall from={[rooms.bedroom.maxX, minZ]} to={[rooms.bedroom.maxX, rooms.bedroom.maxZ]} height={0.9}/>
      <Glass x={rooms.bedroom.maxX} fromZ={minZ} toZ={rooms.bedroom.maxZ} bottom={0.9}/>
      {/* Sofa besar di strip timur (x -0,8..0,1), menghadap barat ke arah idea monitor. */}
      <Sofa position={[-0.35, 0, -2.4]} rotation={-Math.PI / 2}/>
      {/* Idea monitor (Television non-live) di dinding barat, menghadap timur ke arah sofa. */}
      <group rotation={[0, Math.PI / 2, 0]} position={[minX + 0.12, 1.5, -2.4]}><Television position={[0, 0, 0]}/></group>
      {/* Rak buku tambahan di dinding barat, ujung utara (buku menghadap timur). */}
      <Bookshelf position={[minX + 0.3, 0, -4.4]} rotation={Math.PI / 2}/>
      {/* Whiteboard di dinding utara, ujung timur (menghadap selatan). */}
      <Whiteboard position={[-0.5, 0, minZ + 0.3]}/>
      <AirConditioner position={[(minX + rooms.bedroom.maxX) / 2, 2.3, minZ + 0.125]}/>
      {/* Lesehan corner */}
      <LowTable position={[LESEHAN_TABLE[0], 0, LESEHAN_TABLE[2]]}/>
      <WallWordmark position={[4.5, 1.55, minZ + 0.125]} width={1.5}/>
      {[[-1, 0, '#e9c46a'], [1, 0, '#2a9d8f'], [0, -0.85, '#e76f51'], [0, 0.85, '#3d7fd6']].map(([dx, dz, color]) => <FloorCushion key={color as string} position={[LESEHAN_TABLE[0] + (dx as number), 0, LESEHAN_TABLE[2] + (dz as number)]} color={color as string}/>)}
      <Bookshelf position={[6.5, 0, minZ + 0.3]}/>
      <Plant position={[1.1, 0, minZ + 0.5]} size={0.9}/>
      <Plant position={[7.1, 0, 1.4]}/>
      {/* Kamar mandi */}
      <Wall from={[BATHROOM.minX, minZ]} to={[BATHROOM.minX, BATHROOM.maxZ]} height={1.9}/>
      <Wall from={[BATHROOM.minX, BATHROOM.maxZ]} to={[8, BATHROOM.maxZ]} height={1}/>
      <Wall from={[8.9, BATHROOM.maxZ]} to={[maxX, BATHROOM.maxZ]} height={1}/>
      <BathroomFittings position={[8.2, 0, -2.6]}/>
      {/* ── RUANG EKSEKUTIF (strip selatan z 0.4–4.2) ── */}
      {/* Dinding utara penuh + pintu tiap ruangan */}
      <DoorWall z={0.4} fromX={cc.minX} toX={cc.maxX} doorCenter={ccX}/>
      <DoorWall z={0.4} fromX={ceo.minX} toX={ceo.maxX} doorCenter={ceoX}/>
      <DoorWall z={0.4} fromX={spm.minX} toX={spm.maxX} doorCenter={spmDoorX}/>
      {/* Dinding pemisah antar ruangan (penuh 2.6) */}
      <Wall from={[cc.maxX, 0.4]} to={[cc.maxX, 4.2]}/>
      <Wall from={[ceo.maxX, 0.4]} to={[ceo.maxX, 4.2]}/>
      {/* Dinding timur Strategy & PM = dinding barat Legal (penuh 2.6) */}
      <Wall from={[spm.maxX, 0.4]} to={[spm.maxX, 4.2]}/>
      {/* AI Command Center: dinding monitor (barat) + 2 meja menghadap barat */}
      <group rotation={[0, Math.PI / 2, 0]} position={[cc.minX + 0.12, 1.5, 2.3]}><Television position={[0, 0, 0]}/></group>
      <RBox position={[cc.minX + 0.12, 1.5, 1.4]} size={[0.06, 0.7, 0.5]} radius={0.02} color="#0f2a3d" emissive="#1e9bd6" emissiveIntensity={0.5} shadow={false}/>
      <RBox position={[cc.minX + 0.12, 1.5, 3.2]} size={[0.06, 0.7, 0.5]} radius={0.02} color="#0f2a3d" emissive="#1e9bd6" emissiveIntensity={0.5} shadow={false}/>
      {/* Meja ruangan eksekutif (Fase 3b, dari layout.execDesks — satu sumber
          kebenaran dengan placement): Command Center menghadap TV barat;
          CEO / Strategy & PM / Legal menghadap +z (kursi di utara meja,
          agent berjalan lurus ke pintu). Meja menyala bila ditempati. */}
      {layout.execDesks.map((d) => <group key={d.id} rotation={[0, d.rotation, 0]} position={[d.desk[0], 0, d.desk[2]]}><WorkDesk position={[0, 0, 0]} active={activeDeskIds?.has(d.id) ?? false}/></group>)}
      {/* CEO Office: rak + tanaman + AC (meja dari layout.execDesks di atas) */}
      <Bookshelf position={[ceo.maxX - 0.3, 0, 0.7]}/>
      <Plant position={[cc.maxX + 0.5, 0, 3.7]}/>
      <AirConditioner position={[ceoX, 2.3, 0.525]}/>
      {/* Strategy & PM (gabung): whiteboard timur + tanaman + AC */}
      <Whiteboard position={[spm.maxX - 0.06, 1.55, 1.7]} rotation={-Math.PI / 2}/>
      <Plant position={[ceo.maxX + 0.5, 0, 3.7]}/>
      <AirConditioner position={[spm.minX + 1.1, 2.3, 0.525]}/>
      {/* ── LEGAL & COMPLIANCE (x 0.4–4.2, z 0.4–2.95) ── */}
      <DoorWall z={legal.minZ} fromX={legal.minX} toX={legal.maxX} doorCenter={2.3}/>
      <Wall from={[legal.maxX, legal.minZ]} to={[legal.maxX, legal.maxZ]}/>
      <Wall from={[legal.minX, legal.maxZ]} to={[legal.maxX, legal.maxZ]}/>
      <Bookshelf position={[legal.minX + 0.3, 0, legal.minZ + 0.3]}/>
      <Plant position={[legal.maxX - 0.5, 0, legal.maxZ - 0.5]}/>
      <AirConditioner position={[2.3, 2.3, legal.minZ + 0.125]}/>
      {/* Plang nama ruangan lantai 3 (Fase 3b): di dinding ruangan, menghadap
          kamera default (+z / -x). Legal di dinding utara (segmen timur pintu). */}
      <RoomNamePlate position={[-4.2, 2.35, minZ + 0.125]} text="Creative Lounge" width={2.4}/>
      <RoomNamePlate position={[4.5, 2.35, minZ + 0.125]} text="Lesehan" width={1.5}/>
      <RoomNamePlate position={[BATHROOM.minX - 0.125, 1.5, -3.9]} rotation={-Math.PI / 2} text="Kamar Mandi" width={1.4}/>
      <RoomNamePlate position={[ceo.maxX - 0.125, 1.6, 2.3]} rotation={-Math.PI / 2} text="CEO Office" width={1.6}/>
      <RoomNamePlate position={[spm.maxX - 0.125, 1.6, 3.2]} rotation={-Math.PI / 2} text="Strategy & PM" width={1.6}/>
      <RoomNamePlate position={[3.5, 1.6, 0.53]} text="Legal" width={1.2}/>
      <RoomNamePlate position={[cc.maxX - 0.125, 1.6, 2.3]} rotation={-Math.PI / 2} text="AI Command Center" width={1.6}/>
      <RoomNamePlate position={[6.95, 1.6, 3.01]} text="Meeting Eksekutif" width={2.0}/>
      <RoomNamePlate position={[minX + 4.1, 1.6, maxZ + 0.06]} text="Executive Lounge" width={1.8}/>
      <RoomNamePlate position={[8.0, 1.6, maxZ + 0.06]} text="Balkon" width={1.2}/>
      {/* ── EXECUTIVE MEETING ROOM (kaca, cerminan meeting room L1) ── */}
      <Wall from={[meeting.minX, meeting.minZ]} to={[6.5, meeting.minZ]} height={0.9}/>
      <Wall from={[7.4, meeting.minZ]} to={[meeting.maxX, meeting.minZ]} height={0.9}/>
      <GlassZ z={meeting.minZ} fromX={meeting.minX} toX={6.5} bottom={0.9} top={2.4}/>
      <GlassZ z={meeting.minZ} fromX={7.4} toX={meeting.maxX} bottom={0.9} top={2.4}/>
      <RBox position={[6.95, 2.35, meeting.minZ]} size={[0.9, 0.5, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
      <Glass x={meeting.minX} fromZ={meeting.minZ} toZ={meeting.maxZ} bottom={0.9}/>
      <Wall from={[meeting.minX, meeting.minZ]} to={[meeting.minX, meeting.maxZ]} height={0.9}/>
      <Glass x={meeting.maxX} fromZ={meeting.minZ} toZ={meeting.maxZ} bottom={0.9}/>
      <Wall from={[meeting.maxX, meeting.minZ]} to={[meeting.maxX, meeting.maxZ]} height={0.9}/>
      <GlassZ z={meeting.maxZ} fromX={meeting.minX} toX={meeting.maxX} bottom={0.9} top={2.4}/>
      <Wall from={[meeting.minX, meeting.maxZ]} to={[meeting.maxX, meeting.maxZ]} height={0.9}/>
      <LongTable position={[6.95, 0, 1.7]} length={2.8}/>
      <OfficeChair position={[6.3, 0, 1.0]} rotation={Math.PI}/>
      <OfficeChair position={[7.6, 0, 1.0]} rotation={Math.PI}/>
      <OfficeChair position={[6.3, 0, 2.4]}/>
      <OfficeChair position={[7.6, 0, 2.4]}/>
      <Whiteboard position={[8.44, 1.55, 1.7]} rotation={-Math.PI / 2}/>
      <WallLogo position={[6.95, 0.45, 2.82]} rotation={Math.PI}/>
      {/* Lampu */}
      {[...layout.restSpots.filter((_, index) => index % 2 === 0).map(([x, , z]): Vec3 => [x, 2.4, z + 0.6]), [LESEHAN_TABLE[0], 2.4, LESEHAN_TABLE[2]] as Vec3, [doorX, 2.4, 2] as Vec3, [ceoX, 2.4, 2.3] as Vec3, [spm.minX + 1.1, 2.4, 2.3] as Vec3, [6.95, 2.4, 1.7] as Vec3, [ccX, 2.4, 2.3] as Vec3].map((position) => <OfficeLight key={position.join(',')} position={position} night={night}/>)}
      {/* ── BALKON LANTAI 3 (z 4.2–6.6) ── */}
      <Railing position={[(minX + maxX) / 2, 0, BALCONY.maxZ - 0.05]} length={maxX - minX}/>
      <Railing position={[minX + 0.05, 0, (BALCONY.minZ + BALCONY.maxZ) / 2]} length={BALCONY.maxZ - BALCONY.minZ} rotation={Math.PI / 2}/>
      <Railing position={[maxX - 0.05, 0, (BALCONY.minZ + BALCONY.maxZ) / 2]} length={BALCONY.maxZ - BALCONY.minZ} rotation={Math.PI / 2}/>
      {/* Executive Lounge (terbuka, ujung barat balkon) */}
      <Sofa position={[minX + 4.1, 0, 5.9]} rotation={Math.PI}/>
      <CoffeeTable position={[minX + 4.1, 0, 5.0]}/>
      <Armchair position={[minX + 2.5, 0, 5.0]} rotation={Math.PI / 2} color="#d9784a"/>
      <Armchair position={[minX + 5.7, 0, 5.0]} rotation={-Math.PI / 2} color="#3d7fd6"/>
      {/* Set dorm balkon (pindah dari lantai 2) */}
      <SideTable position={[BALCONY3_TABLE[0], 0, BALCONY3_TABLE[2]]}/>
      <RattanChair position={[BALCONY3_TABLE[0] - 0.85, 0, BALCONY3_TABLE[2]]} rotation={Math.PI / 2}/>
      <RattanChair position={[BALCONY3_TABLE[0] + 0.85, 0, BALCONY3_TABLE[2]]} rotation={-Math.PI / 2}/>
      <Hammock position={[HAMMOCK3[0], 0, HAMMOCK3[2]]}/>
      <ClothesLine position={[Math.max(minX + 1.6, -3.2), 0, 6.15]}/>
      <Plant position={[maxX - 0.5, 0, BALCONY.minZ + 0.5]} size={0.9}/>
      <Plant position={[minX + 0.5, 0, BALCONY.minZ + 0.5]} size={0.9}/>
      <StringLights position={[(minX + maxX) / 2, 2.15, BALCONY.maxZ - 0.12]} length={maxX - minX - 0.6} night={night}/>
    </group>
  </group>
}

function Outdoors({ night, layout, hideResidenceInterior = false, hideResidenceRoof = false }: { night: boolean; layout: OfficeLayout; hideResidenceInterior?: boolean; hideResidenceRoof?: boolean }) {
  // How far the building grew to the left for a larger crew; the grounds grow with it.
  const shift = layout.building.minX + 9.5
  const lawn = useMemo(() => grass([14, 12]), [])
  const road = useMemo(() => asphalt([8, 1]), [])
  const sidewalk = useMemo(() => pavingStones([14, 2]), [])
  const gang = useMemo(() => pavingStones([2, 5]), [])
  return <group>
    {/* Lahan (Fase 1b AI Campus): tepi timur 34 → 40 supaya area santai
        mess (x 36..39) + tiang bendera (37,5) tetap di atas rumput;
        tepi barat tetap shift−30. */}
    <Floor position={[(shift + 10) / 2, -0.02, 2]} size={[70 - shift, 44]} map={lawn} roughness={1}/>
    <Floor position={[shift / 2, -0.005, 7.1]} size={[34 - shift, 5]} map={sidewalk} roughness={0.9}/>
    <Floor position={[(shift + 10) / 2, -0.01, 12.1]} size={[70 - shift, 5]} map={road} roughness={0.95}/>
    {/* Path from the entrance to the sidewalk */}
    <Floor position={[5.8, 0, 4.7]} size={[1.8, 1]} map={sidewalk}/>
    {/* Merah Putih by the entrance */}
    <FlagPole position={FLAG}/>
    {/* WOORK Staff Residence (Fase 1): shell 2 lantai di timur kantor. */}
    <Residence night={night} hideInterior={hideResidenceInterior} hideRoof={hideResidenceRoof}/>
    {/* Perpanjangan trotoar ke mess (Fase 1): trotoar existing berakhir di x 17 (konstan — ujung timur = shift/2 + (34-shift)/2). */}
    <Floor position={[(17 + (RESIDENCE_FLAG[0] - 0.5)) / 2, -0.005, 7.1]} size={[RESIDENCE_FLAG[0] - 0.5 - 17, 5]} map={sidewalk} roughness={0.9}/>
    {/* Jalur pejalan trotoar -> pintu selatan mess. */}
    <Floor position={[(RESIDENCE_DOOR.minX + RESIDENCE_DOOR.maxX) / 2, 0, (RESIDENCE.maxZ + 4.6) / 2]} size={[RESIDENCE_DOOR.maxX - RESIDENCE_DOOR.minX, 4.6 - RESIDENCE.maxZ]} map={sidewalk}/>
    {/* The gang (alley) left of the building, with the street food out of the main view */}
    <Floor position={[layout.gangCenterX, -0.008, -0.4]} size={[3.6, 10]} map={gang} roughness={0.9}/>
    <group position={layout.baksoCart} rotation={[0, STALL_ROTATION, 0]}>
      <Gerobak position={[0, 0, 0]} night={night}/>
      <Vendor position={[-1.6, 0, 0]} rotation={Math.PI / 2} shirt="#f1f1ec" hat="peci"/>
    </group>
    <group position={layout.kopiBike} rotation={[0, STALL_ROTATION, 0]}>
      <KopiSepeda position={[0, 0, 0]} night={night}/>
      <Vendor position={[-1.35, 0, -0.1]} rotation={Math.PI / 2} shirt="#2f6d8f" hat="cap"/>
    </group>
    {/* AC outdoor units behind the building */}
    <AcOutdoorUnit position={[-5.3, 0, layout.building.minZ - 0.45]} rotation={Math.PI}/>
    <AcOutdoorUnit position={[TV[0] - 1.6, 0, layout.building.minZ - 0.45]} rotation={Math.PI}/>
    {/* Tiang lampu jalan (Fase 6b): 2 di depan kantor + 2 di depan mess —
        trotoar yang sama (z 9,3), di luar jalur pejalan (x 28..30) dan
        neon box (x 8,5) — menyala saat tema dark, seperti lampu kantor.
        Lampu mess diturunkan dari RESIDENCE (Fase 1 AI Campus). */}
    <StreetLamp position={[-8, 0, 9.3]} night={night}/>
    <StreetLamp position={[4, 0, 9.3]} night={night}/>
    <StreetLamp position={[RESIDENCE.minX + 2, 0, 9.3]} night={night}/>
    <StreetLamp position={[RESIDENCE.maxX - 2, 0, 9.3]} night={night}/>
    {/* Neon box WOORK.ID di pinggir jalan (2026-11-23, permintaan user):
        papan dua sisi di tepi trotoar, timur jalur masuk — segaris dengan
        lampu jalan (z 9,3), bebas dari pohon (12, 8) dan lampu (4, 9,3). */}
    <RoadsideNeonSign position={[8.5, 0, 9.3]}/>
    {[[-12.8 + shift, -7.4, 1.3], [13.5, -7.2, 1.2], [-14.8 + shift, 2.6, 1.1], [18.6, 4.8, 1.3], [-10.5 + shift, 7.5, 1], [12, 8, 1.1], [-2, -8.5, 1.2], [6, -8, 1.1]].map(([x, z, size]) => <Tree key={`${x}${z}`} position={[x, 0, z]} size={size}/>)}
    {/* Taman antargedung (Fase 2 AI Campus): lahan terbuka antara sayap
        Game Room (GAME_ROOM.maxX = 15,5) dan mess (RESIDENCE.minX = 22),
        z −5,2..0,6 + strip selatan sayap (z 0,6..2). Semua posisi relatif
        ke kedua konstanta itu. Jauh dari jalur agent (trotoar z 5,4 +
        jalur pejalan x 28..30, z 2–4,6) dan dari pintu mess — objek
        terdekat ≥6 m dari jalur. Mesh: +33 (L1 1719 → 1752, lihat
        FASE7B2 §11 — konten outdoor baru, bukan regresi). */}
    {/* Paving dekoratif sejajar sumbu x — dekorasi, bukan jalur agent. */}
    <Floor position={[(GAME_ROOM.maxX + RESIDENCE.minX) / 2, 0, -1.2]} size={[5, 1]} map={sidewalk}/>
    <Tree position={[GAME_ROOM.maxX + 2.1, 0, -3.6]} size={1.2}/>
    <Tree position={[RESIDENCE.minX - 1.6, 0, -3.0]} size={1}/>
    <Plant position={[GAME_ROOM.maxX + 0.9, 0, -4.4]} size={0.8}/>
    <Plant position={[RESIDENCE.minX - 0.8, 0, -4.5]} size={0.7}/>
    <Plant position={[GAME_ROOM.maxX + 1.5, 0, 1.2]} size={0.9}/>
    {/* Bangku sederhana (RBox) di tepi selatan taman, menghadap ke taman. */}
    <RBox position={[(GAME_ROOM.maxX + RESIDENCE.minX) / 2 + 1.55, 0.45, 1.4]} size={[1.4, 0.08, 0.45]} radius={0.04} color="#c49a5c" roughness={0.9}/>
    <RBox position={[(GAME_ROOM.maxX + RESIDENCE.minX) / 2 + 1.0, 0.2, 1.4]} size={[0.08, 0.4, 0.4]} radius={0.02} color="#8a6a3a"/>
    <RBox position={[(GAME_ROOM.maxX + RESIDENCE.minX) / 2 + 2.1, 0.2, 1.4]} size={[0.08, 0.4, 0.4]} radius={0.02} color="#8a6a3a"/>
    {/* Lampu taman kecil (tiang RBox + bola emissive, menyala saat night). */}
    {[[GAME_ROOM.maxX + 0.8, 0.2], [RESIDENCE.minX - 0.8, 0.2]].map(([x, z]) => (
      <group key={`${x}${z}`} position={[x, 0, z]}>
        <RBox position={[0, 0.35, 0]} size={[0.09, 0.7, 0.09]} radius={0.02} color="#2f3336" metalness={0.5}/>
        <mesh position={[0, 0.78, 0]} castShadow>
          <sphereGeometry args={[0.11, 12, 8]}/>
          <meshStandardMaterial color="#f5e6b8" emissive="#ffd98a" emissiveIntensity={night ? 2.5 : 0.15}/>
        </mesh>
        {night && <pointLight position={[0, 0.8, 0]} color="#ffd08a" intensity={4} distance={5} decay={2}/>}
      </group>
    ))}
  </group>
}

/**
 * Penanda lantai di mode all (Fase 5a): pita tembus pandang di atas pelat
 * lantai yang di-hover/dipilih, supaya lantai itu terbaca dari kamera all.
 * Tembus pandang + depthWrite mati: terlihat di sekitar furniture, tidak
 * menutupi meja/kursi di atasnya.
 */
function FloorHighlight({ layout, floor }: { layout: OfficeLayout; floor: Floor }) {
  const { minX, maxX, minZ, maxZ } = layout.building
  const y = (floor - 1) * FLOOR_HEIGHT + 0.06
  return <mesh position={[(minX + maxX) / 2, y, (minZ + maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[maxX - minX, maxZ - minZ]}/>
    <meshBasicMaterial color="#f5bd6d" transparent opacity={0.28} toneMapped={false} depthWrite={false}/>
  </mesh>
}

/** Klik lantai di mode all: pindah ke lantai itu. Drag kamera (delta >
 *  6 px) bukan klik — diabaikan supaya memutar kamera tidak memindah lantai. */
function floorClickHandler(floor: Floor, onFloorClick?: (floor: Floor) => void) {
  if (!onFloorClick) return undefined
  return (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 6) return
    event.stopPropagation()
    onFloorClick(floor)
  }
}

/**
 * Aturan tampil (diubah 2026-11-23 atas permintaan user — "lantai 2 tidak
 * terlihat" saat memilih lantai 3): lantai yang dipilih + SEMUA lantai di
 * bawahnya ikut dirender (gedung penuh ke bawah); hanya lantai DI ATAS
 * yang dipilih yang disembunyikan, supaya tidak menutupi pandangan ke
 * lantai yang dipilih. Dulu: mode lantai tunggal hanya merender lantainya
 * sendiri (lantai 2/3 di atas BuildingShell yang tertutup) — hemat mesh,
 * tapi gedung tampak terpotong. Mode 'all' (Fase 5a): ketiga lantai
 * sekaligus; shaft lift segmen lantai 2/3 dirender eksplisit di sini.
 * Lift-only sejak 2026-11-23. Dinding luar TIDAK perlu dibuat
 * transparan tambahan: gaya dollhouse yang sudah ada (dinding depan
 * rendah + kaca) sudah membuka interior dari kamera.
 */
export function Environment({ night = false, layout, floor = 1, scene = EMPTY_SCENE_DATA, onLiftRide, activeDeskIds, highlightFloor = null, onFloorClick, onFocusDivision, hideResidenceInterior = false, hideResidenceRoof = false }: { night?: boolean; layout: OfficeLayout; floor?: FloorView; scene?: KantorSceneData; onLiftRide?: () => void; activeDeskIds?: Set<string>; highlightFloor?: Floor | null; onFloorClick?: (floor: Floor) => void; onFocusDivision?: (name: string) => void; hideResidenceInterior?: boolean; hideResidenceRoof?: boolean }) {
  return <group>
    {floor === 'all' ? <>
      <group onClick={floorClickHandler(1, onFloorClick)}><Building night={night} layout={layout} scene={scene} onLiftRide={onLiftRide}/></group>
      <group onClick={floorClickHandler(2, onFloorClick)}><UpperFloor night={night} layout={layout} activeDeskIds={activeDeskIds} onFocusDivision={onFocusDivision}/></group>
      <group onClick={floorClickHandler(3, onFloorClick)}><TopFloor night={night} layout={layout} activeDeskIds={activeDeskIds}/></group>
      <LiftShaft baseY={FLOOR_HEIGHT} onDoorClick={onLiftRide}/>
      <LiftShaft baseY={2 * FLOOR_HEIGHT} cap onDoorClick={onLiftRide}/>
      {highlightFloor !== null && <FloorHighlight layout={layout} floor={highlightFloor}/>}
    </> : floor === 1 ? <Building night={night} layout={layout} scene={scene} onLiftRide={onLiftRide}/> : floor === 2 ? <>
      <Building night={night} layout={layout} scene={scene} onLiftRide={onLiftRide}/>
      <UpperFloor night={night} layout={layout} activeDeskIds={activeDeskIds} onFocusDivision={onFocusDivision}/>
      <LiftShaft baseY={FLOOR_HEIGHT} onDoorClick={onLiftRide}/>
    </> : <>
      <Building night={night} layout={layout} scene={scene} onLiftRide={onLiftRide}/>
      <UpperFloor night={night} layout={layout} activeDeskIds={activeDeskIds} onFocusDivision={onFocusDivision}/>
      <TopFloor night={night} layout={layout} activeDeskIds={activeDeskIds}/>
      <LiftShaft baseY={FLOOR_HEIGHT} onDoorClick={onLiftRide}/>
      <LiftShaft baseY={2 * FLOOR_HEIGHT} cap onDoorClick={onLiftRide}/>
    </>}
    {/* Kabin lift: SATU komponen untuk semua mode (visibilitas per lantai
        diatur sendiri di LiftCabin, mengikuti aturan tampil agent). */}
    <LiftCabin floor={floor}/>
    <Outdoors night={night} layout={layout} hideResidenceInterior={hideResidenceInterior} hideResidenceRoof={hideResidenceRoof}/>
  </group>
}
