/**
 * Diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha).
 * File asli: src/pages/Office3D.tsx — dilisensikan di bawah lisensi MIT.
 * Di-port ke WOORK (Next.js 14 + React 18 + @react-three/fiber 8 + three 0.169).
 *
 * Penyesuaian terhadap aslinya:
 * - Kontrak data: KantorStation WOORK (lib/kantor/types.ts), bukan OfficeStation Hermes.
 * - Warna karakter: hash nama ala src/agents.ts Ruang (di-inline di bawah) + avatarColor
 *   dari DB WOORK sebagai warna baju bila ada.
 * - Badge state: adaptasi src/office-state.ts Ruang (tanpa bagian gateway/Source Hermes).
 * - Tema: dibaca dari document.documentElement.dataset.theme bila ada; bila tidak ada,
 *   fallback terang + tombol ganti tema scene sendiri (disimpan di localStorage).
 *   (WOORK tidak memakai atribut data-theme yang sama dengan Ruang.)
 * - Gaya label/tombol: Tailwind WOORK, bukan styles.css Ruang (tidak diimpor).
 * - Klik agent memanggil onSelectAgent(station); dialog detail dibuat di Wave 2.
 * - Kunci localStorage diganti awalan `woork.kantor*` (bukan `mc.*` milik Ruang).
 */

'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { KantorBriefingState, KantorPrayerState, KantorStation } from '@/lib/kantor/types'
import type { BriefingContent } from '@/lib/kantor/briefing'
import type { NextPrayer, PrayerScheduleDay } from '@/lib/kantor/prayer'
import { ALL_VIEW_MAX_DISTANCE, allFloorsCameraView, campusCameraView, CAMPUS_VIEW_MAX_DISTANCE, clampTarget, createLayout, DEFAULT_QIBLA_BEARING, divisionFocus, FLOOR_HEIGHT, floorCameraView, floorOf, GAME_ROOM, inResidenceXZ, LIFT_CABIN_Z, LIFT_QUEUE_SLOTS, liftEnterLeg, liftExitLeg, musalaSafPositions, placementFor, residenceCameraView, walkPath3, type Building, type Floor, type FloorView, type OfficeLayout, type Placement, type ResidenceFloor, type Vec3 } from './scene/office3d-layout'
import { liftController } from './scene/lift-controller'
import { Environment, EMPTY_SCENE_DATA, type KantorSceneData } from './scene/environment'
import { DemoTour, demoRooms, type CameraView, type DemoPriority, type DemoRoom } from './scene/demo-tour'
import { RBox, WorkDesk } from './scene/props'

// ---------------------------------------------------------------------------
// Warna karakter — diadaptasi dari src/agents.ts Ruang (MIT © 2026 yugienugraha).
// Tiap agent mendapat tampilan deterministik dari hash FNV-1a namanya.

interface AgentLook { hair: string; skin: string; shirt: string; pants: string }

const HAIR = ['#1d293c', '#b54b45', '#6a4d8d', '#3b2a20', '#c9a24a', '#2f4f3a', '#8b5a2b', '#11151c']
const SKIN = ['#e9b57d', '#c98e5a', '#f1c9a0', '#a8714a', '#dca06e']
const SHIRT = ['#e6b34e', '#70bdcb', '#93ca67', '#e76f51', '#8f7ae6', '#f4a3b4', '#4f9c7a', '#d9534f', '#5a8dee', '#c7a17a']
const PANTS = ['#36475d', '#374052', '#344349', '#4a3b2f', '#2f3a44', '#3d2f4a']

function hashName(name: string): number {
  let hash = 2166136261
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function agentLook(id: string): AgentLook {
  const hash = hashName(id)
  return { hair: HAIR[hash % HAIR.length], skin: SKIN[(hash >>> 4) % SKIN.length], shirt: SHIRT[(hash >>> 8) % SHIRT.length], pants: PANTS[(hash >>> 12) % PANTS.length] }
}

// Badge state — diadaptasi dari officeStateBadge di src/office-state.ts Ruang.
type BadgeTone = 'good' | 'muted' | 'unknown'
// Label badge berbahasa Indonesia (UI Kantor Virtual berbahasa Indonesia):
// agent yang sedang bekerja tampil "Bekerja" (hijau, tone good).
const KANTOR_STATE_LABEL: Record<KantorStation['state'], string> = {
  Idle: 'Idle',
  Working: 'Bekerja',
  Reviewing: 'Meninjau',
  Collaborating: 'Collaborating',
  Praying: 'Salat',
  Briefing: 'Briefing',
  Offline: 'Offline',
  Unknown: 'Unknown',
}

function kantorStateBadge(state: KantorStation['state']): { label: string; tone: BadgeTone } {
  return { label: KANTOR_STATE_LABEL[state], tone: state === 'Offline' ? 'muted' : state === 'Unknown' || state === 'Idle' ? 'unknown' : 'good' }
}

const BADGE_CLASSES: Record<BadgeTone, string> = {
  good: 'bg-emerald-900/90 text-emerald-200',
  muted: 'bg-slate-700/90 text-slate-300',
  unknown: 'bg-amber-900/90 text-amber-200',
}

type Registry<T> = MutableRefObject<Map<string, T>>

/** Durasi satu siklus pose salat (qiyam -> ruku -> sujud -> duduk -> sujud -> qiyam). */
const PRAYER_CYCLE_S = 60

function Character({ station, placement, layout, floor, onSelect, anchor, agentRoots, prayerStartedAt }: { station: KantorStation; placement: Placement; layout: OfficeLayout; floor: FloorView; onSelect: (station: KantorStation) => void; anchor: (object: THREE.Object3D | null) => void; agentRoots: Registry<THREE.Object3D>; prayerStartedAt?: string | null }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Mesh>(null)
  const rightLeg = useRef<THREE.Mesh>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const look = agentLook(station.id)
  const colors: AgentLook = { ...look, shirt: station.avatarColor || look.shirt }
  const offline = station.state === 'Offline'
  const unknown = station.state === 'Unknown'
  const tint = (color: string) => offline ? '#7b7f7d' : color
  // Only the first placement is applied as a prop; later changes are walked to via the aisle.
  const [start] = useState<Vec3>(() => placement.position)
  const path = useRef<THREE.Vector3[]>([])
  const destination = placement.position.join(',')
  // ── Lift (lift-only 2026-11-23): mesin state antrean per agent ──
  // idle = jalan biasa; toQueue = berjalan ke slot antre; queue = berdiri
  // di slot menghadap pintu (+x); boarding = berjalan masuk kabin;
  // riding = posisi dikuasai controller (riderPosition); alighting =
  // berjalan keluar kabin. Kaki lift BUKAN waypoint walkPath3.
  type LiftPhase = 'idle' | 'toQueue' | 'queue' | 'boarding' | 'riding' | 'alighting'
  const liftPhase = useRef<LiftPhase>('idle')
  const liftSlot = useRef(-1)
  const liftToFloor = useRef<Floor>(1)
  const pendingFinal = useRef<Vec3 | null>(null)
  const slotTarget = (index: number, y: number): Vec3 => {
    const slot = LIFT_QUEUE_SLOTS[Math.min(Math.max(index, 0), LIFT_QUEUE_SLOTS.length - 1)]
    return [slot[0], y, slot[1]]
  }
  const walkTo = (from: Vec3, target: Vec3) => {
    path.current = walkPath3(from, target, layout).map(([px, py, pz]) => new THREE.Vector3(px, py, pz))
  }
  /**
   * Lantai untuk keperluan lift (Fase 4c): tujuan/asal di mess (y 2,8)
   * BUKAN lantai 2 kantor — mess bangunan terpisah di timur kantor,
   * dicapai jalan kaki dari lantai 1 (bukan lift kantor). Tanpa ini,
   * Character dari L1 naik lift L1→L2 (salah) dan dari L3 naik L3→L2
   * lalu macet. Hanya pemetaan lantai untuk lift — visibilitas agent
   * dan kamera tetap memakai floorOf biasa.
   */
  const liftFloor = (p: Vec3): Floor => (inResidenceXZ(p[0], p[2]) ? 1 : floorOf(p))
  useEffect(() => {
    const group = root.current
    if (!group) return
    const cur: Vec3 = [group.position.x, group.position.y, group.position.z]
    const fromFloor = liftFloor(cur)
    const toFloor = liftFloor(placement.position)
    // Placement berubah saat riding/boarding/alighting: JANGAN ganggu trip
    // yang sedang berjalan — controller menyelesaikan trip ini dulu, lalu
    // antre lagi ke tujuan baru (requestRide saat riding = retarget).
    if (liftPhase.current === 'riding' || liftPhase.current === 'boarding' || liftPhase.current === 'alighting') {
      liftController.requestRide(station.id, liftToFloor.current, toFloor)
      pendingFinal.current = placement.position
      return
    }
    if (fromFloor !== toFloor) {
      liftToFloor.current = toFloor
      pendingFinal.current = placement.position
      liftController.requestRide(station.id, fromFloor, toFloor)
      liftPhase.current = 'toQueue'
      liftSlot.current = liftController.queuePosition(station.id)
      walkTo(cur, slotTarget(liftSlot.current, (fromFloor - 1) * FLOOR_HEIGHT))
      return
    }
    // Satu lantai: batalkan antrean (bila ada) dan jalan biasa.
    liftController.cancelRide(station.id)
    liftPhase.current = 'idle'
    liftSlot.current = -1
    pendingFinal.current = null
    walkTo(cur, placement.position)
    // placement.position is captured through `destination`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])
  // Fase 5a — Follow Agent: daftarkan grup karakter supaya FollowAgent
  // bisa membaca posisi agent tiap frame (tanpa mengubah jalan agent).
  useEffect(() => {
    const group = root.current
    if (!group) return
    agentRoots.current.set(station.id, group)
    return () => { agentRoots.current.delete(station.id) }
  }, [station.id, agentRoots])

  useFrame((state, delta) => {
    const group = root.current
    if (!group) return
    const time = state.clock.elapsedTime
    // ── Lift: mesin state antrean (sebelum walker — walker dilewati saat
    // riding karena posisi dikuasai controller). ──
    const here: Vec3 = [group.position.x, group.position.y, group.position.z]
    const floorHere = liftFloor(here)
    if (liftPhase.current === 'toQueue' || liftPhase.current === 'queue') {
      const qp = liftController.queuePosition(station.id)
      if (qp < 0) {
        // Antrean hilang (dibatalkan dari luar) — minta lagi bila masih
        // perlu lintas lantai, kalau tidak jalan biasa ke tujuan.
        if (pendingFinal.current && liftFloor(pendingFinal.current) !== floorHere) {
          liftController.requestRide(station.id, floorHere, liftFloor(pendingFinal.current))
          liftPhase.current = 'toQueue'
          liftSlot.current = -1
        } else {
          liftPhase.current = 'idle'
          liftSlot.current = -1
          if (pendingFinal.current) walkTo(here, pendingFinal.current)
        }
      } else if (qp !== liftSlot.current) {
        // Maju antrean (yang depan sudah naik) — jalan ke slot baru.
        liftSlot.current = qp
        liftPhase.current = 'toQueue'
        walkTo(here, slotTarget(qp, here[1]))
      } else if (liftPhase.current === 'toQueue' && path.current.length === 0) {
        liftPhase.current = 'queue'
      } else if (liftPhase.current === 'queue' && liftController.boardReady(station.id)) {
        liftPhase.current = 'boarding'
        path.current = liftEnterLeg(here[1]).map(([px, py, pz]) => new THREE.Vector3(px, py, pz))
      }
    } else if (liftPhase.current === 'boarding') {
      if (path.current.length === 0) {
        liftController.notifyBoarded(station.id)
        liftPhase.current = 'riding'
      }
    } else if (liftPhase.current === 'riding') {
      const pos = liftController.riderPosition(station.id)
      if (pos) group.position.set(pos[0], pos[1], pos[2])
      else {
        // Seharusnya tidak terjadi (trip selesai tanpa notify) — amankan
        // dengan keluar kabin.
        liftPhase.current = 'alighting'
        path.current = liftExitLeg(group.position.y).map(([px, py, pz]) => new THREE.Vector3(px, py, pz))
      }
      if (liftPhase.current === 'riding' && liftController.getSnapshot().state === 'alighting') {
        liftPhase.current = 'alighting'
        path.current = liftExitLeg(group.position.y).map(([px, py, pz]) => new THREE.Vector3(px, py, pz))
      }
    } else if (liftPhase.current === 'alighting') {
      if (path.current.length === 0) {
        liftController.notifyAlighted(station.id)
        liftPhase.current = 'idle'
        liftSlot.current = -1
        // Antrean lanjutan (retarget saat riding) atau jalan ke tujuan.
        if (liftController.queuePosition(station.id) >= 0) {
          const qp = liftController.queuePosition(station.id)
          liftSlot.current = qp
          liftPhase.current = 'toQueue'
          walkTo([group.position.x, group.position.y, group.position.z], slotTarget(qp, group.position.y))
        } else if (pendingFinal.current) {
          const dest = pendingFinal.current
          pendingFinal.current = null
          walkTo([group.position.x, group.position.y, group.position.z], dest)
        }
      }
    }
    const riding = liftPhase.current === 'riding'
    const next = riding ? undefined : path.current[0]
    let walking = false
    if (next) {
      const toNext = next.clone().sub(group.position)
      const distance = toNext.length()
      if (distance < 0.04) {
        path.current.shift()
      } else {
        walking = true
        group.position.add(toNext.clone().normalize().multiplyScalar(Math.min(distance, delta * 2.6)))
        if (Math.hypot(toNext.x, toNext.z) > 0.01) {
          const heading = Math.atan2(toNext.x, toNext.z)
          group.rotation.y += Math.atan2(Math.sin(heading - group.rotation.y), Math.cos(heading - group.rotation.y)) * 0.25
        }
      }
    }
    // Aturan tampil agent (diubah 2026-11-23, mengikuti aturan lantai):
    // agent di lantai yang dipilih + semua lantai di bawahnya terlihat;
    // agent di lantai atas disembunyikan. Mode all: semua terlihat.
    // Fase 5b: agent di dalam mess SELALU terlihat — gedung mess selalu
    // terrender penuh di semua mode lantai, jadi agent tidur di mess
    // (y 2,8 → lantai 2) tidak boleh hilang saat user melihat lantai 1.
    // (Label mengikuti otomatis — LabelProjector menyembunyikan label yang
    // jangkarnya tidak visible.)
    group.visible = floor === 'all' || inResidenceXZ(group.position.x, group.position.z) || floorOf(group.position.y) <= floor
    // Diam di slot antre: menghadap pintu lift (+x). Di luar itu, hadap
    // placement seperti biasa.
    if (!walking) {
      const targetFacing = liftPhase.current === 'queue' ? Math.PI / 2 : placement.facing
      group.rotation.y += Math.atan2(Math.sin(targetFacing - group.rotation.y), Math.cos(targetFacing - group.rotation.y)) * 0.12
    }
    const swing = walking ? Math.sin(time * 10) * 0.6 : 0
    // Tiba = jalan selesai DAN tidak sedang dalam proses lift (agent yang
    // antre/naik tidak boleh berpose tidur/duduk/salat di tengah jalan).
    const arrived = !walking && path.current.length === 0 && liftPhase.current === 'idle'
    const lying = arrived && placement.pose === 'lie'
    const onFloor = arrived && placement.pose === 'floor'
    // In bed (or the hammock) the body lines up with it exactly, not wherever the walk left it.
    if (lying) group.rotation.y = placement.facing
    const seated = !walking && (placement.seated || onFloor)
    // --- Pose salat (simulasi visual prosedural, BUKAN animasi skeletal) ---
    // Bila state Praying dan sudah tiba di saf: siklus pose ditentukan dari
    // waktu berjalan sejak sesi dimulai (prayerStartedAt, sama di semua
    // client — dari snapshot server) — semua agent bergerak serentak,
    // dengan variasi ±2 dtk per agent dari hash id supaya tidak kaku.
    // Bila masih berjalan menuju musala, pose jalan biasa. INI SIMULASI
    // VISUAL aktivitas di kantor virtual; BUKAN klaim bahwa karakter AI
    // menjalankan ibadah nyata (tidak ada niat/keyakinan yang disimulasikan).
    const praying = arrived && station.state === 'Praying'
    const prayerOffset = (hashName(station.id) % 5) - 2 // -2..+2 detik
    const prayerElapsed = prayerStartedAt
      ? Math.max(0, (Date.now() - Date.parse(prayerStartedAt)) / 1000 + prayerOffset)
      : time
    const prayerPhase = ((prayerElapsed % PRAYER_CYCLE_S) + PRAYER_CYCLE_S) % PRAYER_CYCLE_S
    // Satu siklus ~60 dtk: qiyam 20 dtk -> ruku 8 -> qiyam 5 -> sujud 8
    // -> duduk 5 -> sujud 8 -> qiyam 6 (rakaat berikutnya).
    let prayerTilt = 0
    let prayerBodyY = 0
    let prayerLeg = 0
    let prayerArm = -0.5
    if (prayerPhase < 20) { prayerTilt = 0; prayerBodyY = 0; prayerLeg = 0; prayerArm = -0.5 }
    else if (prayerPhase < 28) { prayerTilt = 0.5; prayerBodyY = -0.08; prayerLeg = 0.15; prayerArm = 0 }
    else if (prayerPhase < 33) { prayerTilt = 0; prayerBodyY = 0; prayerLeg = 0; prayerArm = -0.5 }
    else if (prayerPhase < 41) { prayerTilt = 1.1; prayerBodyY = -0.45; prayerLeg = -Math.PI / 2.2; prayerArm = -0.8 }
    else if (prayerPhase < 46) { prayerTilt = 0; prayerBodyY = -0.14; prayerLeg = -Math.PI / 2.2; prayerArm = 0 }
    else if (prayerPhase < 54) { prayerTilt = 1.1; prayerBodyY = -0.45; prayerLeg = -Math.PI / 2.2; prayerArm = -0.8 }
    else { prayerTilt = 0; prayerBodyY = 0; prayerLeg = 0; prayerArm = -0.5 }
    // --- Pose briefing: duduk + anggukan halus sesekali (variasi per
    // agent dari hash id, supaya tidak serentak); leader di whiteboard
    // memakai gesture bicara yang sudah ada (talking). BUKAN percakapan
    // palsu — hanya simulasi visual memperhatikan presentasi. ---
    const briefingSeated = arrived && station.state === 'Briefing' && seated
    const nodPhase = ((hashName(station.id) % 100) / 100) * Math.PI * 2
    const nod = briefingSeated ? Math.max(0, Math.sin(time * 0.5 + nodPhase)) * 0.06 : 0
    const isPresenter = station.state === 'Briefing' && placement.label === 'Presenting at the whiteboard'
    if (leftLeg.current && rightLeg.current) {
      if (praying) {
        // Lerp halus antar fase salat (bukan snap).
        leftLeg.current.rotation.x += (prayerLeg - leftLeg.current.rotation.x) * 0.15
        rightLeg.current.rotation.x += (prayerLeg - rightLeg.current.rotation.x) * 0.15
      } else {
        leftLeg.current.rotation.x = lying ? 0 : seated ? -Math.PI / 2.2 : swing
        rightLeg.current.rotation.x = lying ? 0 : seated ? -Math.PI / 2.2 : -swing
      }
    }
    if (leftArm.current && rightArm.current) {
      if (praying) {
        leftArm.current.rotation.x += (prayerArm - leftArm.current.rotation.x) * 0.15
        rightArm.current.rotation.x += (prayerArm - rightArm.current.rotation.x) * 0.15
      } else {
        const typing = !walking && (station.state === 'Working' || station.state === 'Reviewing')
        const talking = !walking && (station.state === 'Collaborating' || isPresenter)
        leftArm.current.rotation.x = lying ? 0 : walking ? -swing : typing ? -1.1 + Math.sin(time * 14) * 0.12 : talking ? -0.4 + Math.sin(time * 3) * 0.3 : 0
        rightArm.current.rotation.x = lying ? 0 : walking ? swing : typing ? -1.1 + Math.cos(time * 14) * 0.12 : 0
      }
    }
    if (body.current) {
      // Lying down: the body tips back so the head rests towards the pillow (local -z).
      // Salat: condong ke depan (ruku/sujud); briefing duduk: anggukan halus.
      const targetTilt = praying ? prayerTilt : lying ? -Math.PI / 2 : nod
      body.current.rotation.x += (targetTilt - body.current.rotation.x) * 0.2
      const talk = (station.state === 'Collaborating' || isPresenter) && !walking ? Math.abs(Math.sin(time * 5)) * 0.03 : 0
      const breathe = station.state === 'Idle' ? Math.sin(time * (lying ? 1.2 : 2)) * 0.015 : 0
      body.current.position.y = praying ? prayerBodyY : lying ? (placement.height ?? 0.5) + 0.16 + breathe : (onFloor ? -0.5 : seated ? -0.14 : 0) + talk + breathe
    }
  })

  return <group ref={root} position={start}>
    <group ref={body} onClick={(event) => { event.stopPropagation(); onSelect(station) }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
      <mesh ref={leftLeg} position={[-0.11, 0.66, 0]} castShadow geometry={legGeometry}><meshStandardMaterial color={tint(colors.pants)} roughness={0.8}/></mesh>
      <mesh ref={rightLeg} position={[0.11, 0.66, 0]} castShadow geometry={legGeometry}><meshStandardMaterial color={tint(colors.pants)} roughness={0.8}/></mesh>
      <RBox position={[0, 0.98, 0]} size={[0.48, 0.58, 0.3]} radius={0.07} color={tint(colors.shirt)} roughness={0.85}/>
      <mesh ref={leftArm} position={[-0.31, 1.2, 0]} castShadow geometry={armGeometry}><meshStandardMaterial color={tint(colors.shirt)} roughness={0.85}/></mesh>
      <mesh ref={rightArm} position={[0.31, 1.2, 0]} castShadow geometry={armGeometry}><meshStandardMaterial color={tint(colors.shirt)} roughness={0.85}/></mesh>
      <RBox position={[0, 1.5, 0]} size={[0.4, 0.4, 0.37]} radius={0.08} color={tint(colors.skin)} roughness={0.7}/>
      <RBox position={[0, 1.72, -0.02]} size={[0.43, 0.13, 0.41]} radius={0.05} color={tint(colors.hair)} roughness={0.9}/>
      <RBox position={[0, 1.58, -0.19]} size={[0.43, 0.3, 0.06]} radius={0.03} color={tint(colors.hair)} roughness={0.9}/>
      <RBox position={[-0.09, 1.52, 0.186]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false}/>
      <RBox position={[0.09, 1.52, 0.186]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false}/>
      <RBox position={[0, 1.4, 0.186]} size={[0.12, 0.025, 0.01]} radius={0.004} color="#9a5a44" shadow={false}/>
      {unknown && <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.55, 24]}/><meshBasicMaterial color="#e9c47b" transparent opacity={0.85}/></mesh>}
      <object3D ref={anchor} position={[0, 2.05, 0]}/>
    </group>
  </group>
}

// Legs and arms pivot at the hip / shoulder: translate the geometry so its top sits at the origin.
const legGeometry = new THREE.BoxGeometry(0.17, 0.62, 0.2).translate(0, -0.31, 0)
const armGeometry = new THREE.BoxGeometry(0.12, 0.52, 0.14).translate(0, -0.26, 0)

/**
 * Screen-space labels: each frame, project every anchor into the canvas and move its DOM label
 * there directly (no React re-render). Labels live outside the Canvas, so they unmount cleanly
 * and use the page's own styles and focus handling.
 *
 * Anti-overlap (Fase 3b — perbaikan bug screenshot: label 'Lesehan
 * upstairs' / 'Sleeping' / 'Idle' bertumpuk saat agent berkerumun): label
 * terdekat didahulukan; label yang jangkarnya berdekatan dengan label yang
 * sudah ditempatkan masuk mode ringkas (baris aktivitas/idle dengan class
 * `kantor-label-extra` disembunyikan — hanya nama + badge state); lalu
 * posisi dicari ke segala arah (atas / bawah / kiri / kanan), bukan hanya
 * diangkat ke atas seperti sebelumnya (tumpukan 3+ label sebelumnya
 * menumpuk di tepi atas layar).
 */
function LabelProjector({ anchors, labels }: { anchors: Registry<THREE.Object3D>; labels: Registry<HTMLElement> }) {
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const projected: { element: HTMLElement; x: number; y: number; depth: number }[] = []
    for (const [key, object] of anchors.current) {
      const element = labels.current.get(key)
      if (!element) continue
      let shown = true
      for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) { shown = false; break }
      object.getWorldPosition(point).project(camera)
      const visible = shown && point.z < 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) projected.push({ element, x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height, depth: point.z })
    }
    // Nearest labels keep their spot; the rest move to the nearest free
    // position in any direction, so every agent stays readable and clickable.
    projected.sort((a, b) => a.depth - b.depth)
    const placed: { left: number; right: number; top: number; bottom: number }[] = []
    const placedAnchors: { x: number; y: number }[] = []
    for (const label of projected) {
      const compact = placedAnchors.some((anchor) => Math.hypot(anchor.x - label.x, anchor.y - label.y) < 56)
      for (const extra of Array.from(label.element.querySelectorAll<HTMLElement>('.kantor-label-extra'))) {
        extra.style.display = compact ? 'none' : ''
      }
      const width = label.element.offsetWidth
      const height = label.element.offsetHeight
      const cx = Math.min(Math.max(label.x, width / 2 + 4), size.width - width / 2 - 4)
      const baseTop = label.y - height
      const candidates: { top: number; left: number }[] = [{ top: baseTop, left: cx - width / 2 }]
      for (let step = 1; step <= 4; step += 1) {
        candidates.push({ top: baseTop - step * (height + 6), left: cx - width / 2 })
        candidates.push({ top: baseTop + step * (height + 6), left: cx - width / 2 })
      }
      for (let step = 1; step <= 2; step += 1) {
        candidates.push({ top: baseTop, left: cx - width / 2 - step * (width / 2 + 6) })
        candidates.push({ top: baseTop, left: cx - width / 2 + step * (width / 2 + 6) })
      }
      let chosen = candidates[0]
      for (const candidate of candidates) {
        const top = Math.min(Math.max(candidate.top, 4), size.height - height - 4)
        const left = Math.min(Math.max(candidate.left, 4), size.width - width - 4)
        const hit = placed.some((box) => left < box.right - 2 && left + width > box.left + 2 && top < box.bottom - 2 && top + height > box.top + 2)
        chosen = { top, left }
        if (!hit) break
      }
      placed.push({ left: chosen.left, right: chosen.left + width, top: chosen.top, bottom: chosen.top + height })
      placedAnchors.push({ x: label.x, y: label.y })
      label.element.style.transform = `translate(${chosen.left + width / 2}px, ${chosen.top + height}px) translate(-50%, -100%)`
      label.element.style.zIndex = String(Math.round((1 - label.depth) * 10_000))
    }
  })
  return null
}

/** Lift (lift-only): SATU-SATUNYA pemanggil liftController.update(delta) —
 *  dipasang pertama di dalam Canvas supaya update jalan sebelum komponen
 *  lain membaca snapshot di frame yang sama. Jangan panggil update()
 *  dari tempat lain. */
function LiftUpdater() {
  useFrame((_, delta) => { liftController.update(delta) })
  return null
}

/** Ride kamera lift (lift-only): kamera mengikuti kabin SUNGGUHAN.
 *  Klik pintu -> requestCameraRide(lantai saat ini -> lantai berikut,
 *  siklus 1→2→3→1) -> kamera meluncur bersama kabin dengan kecepatan
 *  lift asli (1,0 m/dtk + jeda pintu), bukan glide 1,4 dtk. Bila kabin
 *  sedang melayani agent, trip kamera antre FIFO di belakang mereka
 *  (kamera tidak memakan kapasitas — ia menumpang trip); tidak pernah
 *  merebut kabin dari agent di tengah trip. Setelah kabin tiba, kamera
 *  settle ke overview lantai tujuan, lalu onDone. Di-mount hanya selama
 *  ride berlangsung; dibatalkan bila user menyentuh canvas / ganti lantai
 *  manual / Reset view / Demo (parent mengosongkan `ride`, komponen
 *  unmount — trip kamera yang belum jalan dibatalkan). */
function LiftRideAnimator({ fromFloor, toFloor, layout, view, onDone }: {
  fromFloor: Floor
  toFloor: Floor
  layout: OfficeLayout
  view: { current: ViewHandle | null }
  onDone: () => void
}) {
  const { camera, size } = useThree()
  const offsetRef = useRef<THREE.Vector3 | null>(null)
  const phaseRef = useRef<'wait' | 'follow' | 'settle'>('wait')
  const settleRef = useRef<{ from: CameraView; to: CameraView; start: number } | null>(null)
  const doneRef = useRef(false)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
  useEffect(() => {
    liftController.requestCameraRide(fromFloor, toFloor)
    return () => { liftController.cancelCameraRide() }
    // Satu request per mount; from/to tidak berubah selama ride.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame((state) => {
    const snap = liftController.getSnapshot()
    const now = state.clock.elapsedTime * 1000
    if (phaseRef.current === 'wait') {
      if (!snap.cameraActive) return
      // Trip kamera mulai: kunci offset kamera relatif terhadap target
      // (sudut pandang user dipertahankan — kamera hanya ikut naik/turun
      // bersama kabin, tanpa teleport).
      const current = view.current?.getView()
      offsetRef.current = current
        ? new THREE.Vector3(current.position[0] - current.target[0], current.position[1] - current.target[1], current.position[2] - current.target[2])
        : new THREE.Vector3(camera.position.x, camera.position.y - 1, camera.position.z)
      phaseRef.current = 'follow'
    }
    if (phaseRef.current === 'follow') {
      if (snap.cameraActive) {
        const offset = offsetRef.current ?? new THREE.Vector3(0, 6, 10)
        const target: Vec3 = [9.0, snap.cabinY + 1.0, LIFT_CABIN_Z]
        view.current?.setView([target[0] + offset.x, target[1] + offset.y, target[2] + offset.z], target)
        return
      }
      // Trip kamera selesai: kabin di lantai tujuan, pintu menutup.
      if (snap.cabinFloor === toFloor) {
        const current = view.current?.getView()
        const aspect = size.width / Math.max(size.height, 1)
        const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
        const from: CameraView = current
          ? { position: [...current.position] as Vec3, target: [...current.target] as Vec3 }
          : { position: [camera.position.x, camera.position.y, camera.position.z] as Vec3, target: [0, 0, 0] as Vec3 }
        settleRef.current = { from, to: floorCameraView(layout, toFloor, safeAspect), start: now }
        phaseRef.current = 'settle'
      } else if (!doneRef.current) {
        // Trip dibatalkan sebelum tiba — selesai saja, kamera tetap.
        doneRef.current = true
        onDone()
      }
      return
    }
    const settle = settleRef.current
    if (!settle) return
    const t = Math.min(1, (now - settle.start) / 700)
    const e = t * t * (3 - 2 * t)
    view.current?.setView(lerpVec(settle.from.position, settle.to.position, e), lerpVec(settle.from.target, settle.to.target, e))
    if (t >= 1 && !doneRef.current) { doneRef.current = true; onDone() }
  })
  return null
}

/** Glide kamera Fase 5a (pola yang sama dengan LiftRideAnimator): meluncur
 *  mulus (±1,4 dtk, ease in-out) dari tampilan sekarang ke sudut pandang
 *  yang diminta — ganti lantai, masuk/keluar All Floors View, atau fokus
 *  divisi/agent. `to` dihitung di frame pertama (butuh aspek canvas),
 *  dari layout yang sama dengan Controls.frame() — bukan angka karangan.
 *  Bila `request` berganti selagi glide berjalan, glide dihitung ulang
 *  dari posisi kamera saat itu (tidak ada lompatan). Dibatalkan bila
 *  parent mengosongkan `request` (pointer down di canvas / ganti lantai /
 *  Reset). OrbitControls tetap aktif selama glide (pola lift ride). */
export type GlideRequest =
  | { kind: 'floor'; floor: Floor }
  | { kind: 'all' }
  | { kind: 'focus'; target: Vec3; offset: Vec3 }
  | { kind: 'residence'; floor: ResidenceFloor | 'all' }
  | { kind: 'campus' }

function CameraGlide({ request, layout, view, onDone }: {
  request: GlideRequest
  layout: OfficeLayout
  view: { current: ViewHandle | null }
  onDone: () => void
}) {
  const { camera, size } = useThree()
  const animRef = useRef<{ from: CameraView; to: CameraView; start: number; request: GlideRequest } | null>(null)
  const doneRef = useRef(false)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000
    if (!animRef.current || animRef.current.request !== request) {
      const current = view.current?.getView()
      const from: CameraView = current
        ? { position: [...current.position] as Vec3, target: [...current.target] as Vec3 }
        : { position: [camera.position.x, camera.position.y, camera.position.z] as Vec3, target: [0, 0, 0] as Vec3 }
      const aspect = size.width / Math.max(size.height, 1)
      const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
      let to: CameraView
      if (request.kind === 'floor') to = floorCameraView(layout, request.floor, safeAspect)
      else if (request.kind === 'all') to = allFloorsCameraView(layout, safeAspect)
      else if (request.kind === 'residence') to = residenceCameraView(layout, request.floor, safeAspect)
      else if (request.kind === 'campus') to = campusCameraView(layout, safeAspect)
      else {
        const offsetLen = Math.hypot(request.offset[0], request.offset[1], request.offset[2]) * Math.min(1.35, Math.max(1, 1.2 / safeAspect))
        const cur = Math.hypot(request.offset[0], request.offset[1], request.offset[2])
        const k = cur > 0 ? offsetLen / cur : 1
        const off: Vec3 = [request.offset[0] * k, request.offset[1] * k, request.offset[2] * k]
        to = { position: [request.target[0] + off[0], request.target[1] + off[1], request.target[2] + off[2]], target: [...request.target] }
      }
      animRef.current = { from, to, start: now, request }
    }
    const anim = animRef.current
    const t = Math.min(1, (now - anim.start) / 1400)
    const e = t * t * (3 - 2 * t)
    view.current?.setView(lerpVec(anim.from.position, anim.to.position, e), lerpVec(anim.from.target, anim.to.target, e))
    if (t >= 1 && !doneRef.current) { doneRef.current = true; onDone() }
  })
  return null
}

/** Follow Agent (Fase 5a): tiap frame, geser target orbit + kamera
 *  mengikuti posisi agent yang diikuti (delta per frame kecil karena
 *  agent berjalan mulus — tanpa snap, tanpa lag). Bila agent pindah
 *  lantai, ganti lantai tampilan (tanpa glide, tanpa menghentikan
 *  follow). Fase 6a: agent yang masuk mess (tidur) memindahkan tampilan
 *  ke gedung residence (bukan lantai 2 kantor — mess bukan L2 kantor);
 *  agent yang keluar mess kembali ke kantor. Tidak aktif selama ada
 *  glide (glide yang memimpin kamera), dan TIDAK mengubah sistem jalan
 *  agent sedikit pun. */
function FollowAgent({ followId, agentRoots, view, building, floor, onNavigate, glideActive }: {
  followId: string | null
  agentRoots: Registry<THREE.Object3D>
  view: { current: ViewHandle | null }
  building: Building
  floor: FloorView
  onNavigate: (building: Building, floor: Floor) => void
  glideActive: boolean
}) {
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!followId || glideActive) return
    const object = agentRoots.current.get(followId)
    if (!object) return
    object.getWorldPosition(point)
    const agentFloor = floorOf(point.y)
    // Di dalam mess: lantai residence 1 (y < 1,4) atau 2 — bukan lantai
    // kantor (floorOf 2 untuk agent tidur di kasur mess y 2,8).
    if (inResidenceXZ(point.x, point.z)) {
      const resFloor = (agentFloor >= 2 ? 2 : 1) as Floor
      if (building !== 'residence' || resFloor !== floor) onNavigate('residence', resFloor)
    } else if (building !== 'office' || agentFloor !== floor) {
      onNavigate('office', agentFloor)
    }
    const current = view.current?.getView()
    if (!current) return
    const delta: Vec3 = [point.x - current.target[0], point.y + 1.0 - current.target[1], point.z - current.target[2]]
    if (Math.hypot(delta[0], delta[1], delta[2]) < 0.01) return
    view.current?.setView(
      [current.position[0] + delta[0], current.position[1] + delta[1], current.position[2] + delta[2]],
      [current.target[0] + delta[0], current.target[1] + delta[1], current.target[2] + delta[2]],
    )
  })
  return null
}

export interface ViewHandle {
  reset: () => void
  /** Posisi kamera + target orbit saat ini (untuk Full Screen / Demo Mode). */
  getView: () => { position: [number, number, number]; target: [number, number, number] } | null
  /** Pindahkan kamera + target orbit (dipakai Demo Mode). */
  setView: (position: [number, number, number], target: [number, number, number]) => void
  /** Aktif/nonaktifkan OrbitControls (Demo Mode mematikannya sementara). */
  setOrbitEnabled: (enabled: boolean) => void
  /** Bila true, resize tidak me-reframe kamera (tampilan manual / demo /
   *  fullscreen dipertahankan). Reset View mengembalikannya ke false. */
  setPreserveView: (preserve: boolean) => void
}

/** Orbit (drag), pan (right-drag, two fingers, arrow keys or pan mode) and zoom, kept in bounds. */
const Controls = forwardRef<ViewHandle, { panMode: boolean; keyTarget: HTMLElement | null; layout: OfficeLayout; viewMode: FloorView; building: Building }>(function Controls({ panMode, keyTarget, layout, viewMode, building }, handle) {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  // Bila true, resize TIDAK me-reframe kamera: tampilan manual / demo /
  // fullscreen dipertahankan. Diaktifkan saat user menggerakkan kamera
  // (event 'start' OrbitControls), saat Demo Mode / Full Screen, dan
  // dimatikan lagi oleh Reset View.
  const preserveRef = useRef(false)
  const frame = useMemo(() => () => {
    const aspect = size.width / Math.max(size.height, 1)
    // Guard: a zero-width canvas (mounted while its tab is hidden) makes
    // aspect 0, and 1.2 / 0 = Infinity poisons the camera with NaN — the
    // scene then renders only its sky colour.
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
    // Sudut pandang overview dari fungsi view yang sama dengan glide
    // (floorCameraView / allFloorsCameraView / residenceCameraView /
    // campusCameraView) — bukan angka karangan — supaya Reset View sama
    // dengan glide masuk. Fase 6a: residence 'all' = eksterior mess.
    const resFloor = (viewMode === 3 ? 2 : viewMode) as ResidenceFloor | 'all'
    const view = building === 'campus'
      ? campusCameraView(layout, safeAspect)
      : building === 'residence'
        ? residenceCameraView(layout, resFloor, safeAspect)
        : viewMode === 'all'
          ? allFloorsCameraView(layout, safeAspect)
          : floorCameraView(layout, viewMode, safeAspect)
    const orbit = controls.current
    // An undamped update applies and clears any momentum left from an earlier drag,
    // so it has to happen before the camera is placed, not after.
    if (orbit) { orbit.enableDamping = false; orbit.update() }
    camera.position.set(view.position[0], view.position[1], view.position[2])
    camera.lookAt(new THREE.Vector3(view.target[0], view.target[1], view.target[2]))
    if (!orbit) return
    orbit.target.set(view.target[0], view.target[1], view.target[2])
    orbit.update()
    orbit.enableDamping = true
  }, [camera, size.width, size.height, building, viewMode, layout])

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = true
    orbit.screenSpacePanning = false // pan across the floor, not up into the sky
    orbit.minDistance = 5
    orbit.maxDistance = 48
    orbit.minPolarAngle = 0.2
    orbit.maxPolarAngle = 1.32
    orbit.keyPanSpeed = 25
    controls.current = orbit
    // Begitu user menggerakkan kamera sendiri, tampilannya dipertahankan
    // saat resize / fullscreen (tidak di-reframe ke overview lagi).
    const onStart = () => { preserveRef.current = true }
    orbit.addEventListener('start', onStart)
    frame()
    return () => { orbit.removeEventListener('start', onStart); orbit.dispose(); controls.current = null }
    // frame() only sets the initial view; re-running it on resize is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl])
  // Mode all (Fase 5a): kamera boleh mundur sampai 64 (offset all ≈
  // 1,45× overview; batas 48 akan menjepret kamera saat glide masuk).
  // Mode campus (Fase 6a): glide campus 16 agent portrait ≈ 87 — batas
  // 100 memberi ruang sampai ~20 agent.
  useEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    orbit.maxDistance = building === 'campus' ? CAMPUS_VIEW_MAX_DISTANCE : viewMode === 'all' ? ALL_VIEW_MAX_DISTANCE : 48
  }, [viewMode, building])
  // Resize me-reframe ke overview HANYA bila kamera belum disentuh user /
  // demo / fullscreen — kalau tidak, masuk-keluar Full Screen (yang mengubah
  // ukuran canvas) akan memindahkan kamera seenaknya.
  useEffect(() => { if (!preserveRef.current) frame() }, [frame])
  useEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    orbit.mouseButtons.LEFT = panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    orbit.mouseButtons.RIGHT = panMode ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
    orbit.touches.ONE = panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE
  }, [panMode])
  useEffect(() => {
    const orbit = controls.current
    if (!orbit || !keyTarget) return
    orbit.listenToKeyEvents(keyTarget)
    return () => orbit.stopListenToKeyEvents()
  }, [keyTarget])
  useImperativeHandle(handle, () => ({
    reset: () => { preserveRef.current = false; frame() },
    getView: () => {
      const orbit = controls.current
      if (!orbit) return null
      return {
        position: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number],
        target: [orbit.target.x, orbit.target.y, orbit.target.z] as [number, number, number],
      }
    },
    setView: (position, target) => {
      const orbit = controls.current
      preserveRef.current = true
      camera.position.set(position[0], position[1], position[2])
      camera.lookAt(new THREE.Vector3(target[0], target[1], target[2]))
      if (!orbit) return
      orbit.target.set(target[0], target[1], target[2])
      orbit.update()
    },
    setOrbitEnabled: (enabled) => { if (controls.current) controls.current.enabled = enabled },
    setPreserveView: (preserve) => { preserveRef.current = preserve },
  }), [frame, camera])

  useFrame(() => {
    // Wider lens in portrait so the building fits across a narrow phone
    // screen without backing the camera into the fog (see frame()).
    if (camera instanceof THREE.PerspectiveCamera) {
      const wantFov = size.width < size.height ? 55 : 40
      if (camera.fov !== wantFov) {
        camera.fov = wantFov
        camera.updateProjectionMatrix()
      }
    }
    const orbit = controls.current
    if (!orbit) return
    orbit.update()
    const [x, z] = clampTarget(orbit.target.x, orbit.target.z, layout.pan)
    if (x !== orbit.target.x || z !== orbit.target.z) {
      const shift = new THREE.Vector3(x - orbit.target.x, 0, z - orbit.target.z)
      orbit.target.add(shift)
      camera.position.add(shift)
    }
  })
  return null
})

function register<T>(registry: Registry<T>, key: string) {
  return (value: T | null) => { if (value) registry.current.set(key, value); else registry.current.delete(key) }
}

const SCENE_THEME_KEY = 'woork.kantorSceneTheme'

function readDocumentTheme(): 'dark' | 'light' | null {
  if (typeof document === 'undefined') return null
  const value = document.documentElement.dataset.theme
  return value === 'dark' || value === 'light' ? value : null
}

/**
 * Tema scene: bila tema BERSAMA dari server diberikan (prop `sharedTheme`,
 * Wave 15 — nilai per kantor dari snapshot), pakai itu dan tombol ganti
 * tema memanggil `onToggleShared` (parent mem-POST ke /api/kantor/theme).
 * Bila tidak diberikan (pemakaian mandiri tanpa snapshot), fallback ke
 * perilaku lama: ikuti document.documentElement.dataset.theme bila ada
 * (ala Ruang), bila tidak ada pakai tema terang + tombol ganti tema scene
 * sendiri (disimpan per browser). WOORK tidak memakai atribut data-theme
 * yang sama dengan Ruang, jadi jangan diasumsikan.
 */
function useSceneTheme(sharedTheme?: 'dark' | 'light', onToggleShared?: () => void): ['dark' | 'light', () => void] {
  const [docTheme, setDocTheme] = useState<'dark' | 'light' | null>(() => readDocumentTheme())
  const [override, setOverride] = useState<'dark' | 'light' | null>(() => {
    try {
      const saved = localStorage.getItem(SCENE_THEME_KEY)
      return saved === 'dark' || saved === 'light' ? saved : null
    } catch { return null }
  })
  useEffect(() => {
    const observer = new MutationObserver(() => setDocTheme(readDocumentTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  const localTheme = override ?? docTheme ?? 'light'
  const theme = sharedTheme ?? localTheme
  const toggle = () => {
    if (onToggleShared) { onToggleShared(); return }
    const next = localTheme === 'dark' ? 'light' : 'dark'
    setOverride(next)
    try { localStorage.setItem(SCENE_THEME_KEY, next) } catch { /* per-browser convenience only */ }
  }
  return [theme, toggle]
}

/** Day in the light theme; evening in the dark theme, when the lamps in the scene switch on. */
function Lighting({ theme }: { theme: 'dark' | 'light' }) {
  const day = theme === 'light'
  return <>
    <color attach="background" args={[day ? '#bfe0ef' : '#1a2335']}/>
    {/* Fog starts past the farthest the camera ever sits (48): any closer
        and the building must stay crisp, even on a portrait phone. */}
    <fog attach="fog" args={[day ? '#bfe0ef' : '#1a2335', 60, 140]}/>
    <hemisphereLight args={[day ? '#fff4e0' : '#7f95bd', day ? '#5d7a4c' : '#1e2620', day ? 1.1 : 0.32]}/>
    <directionalLight position={[10, 16, 9]} intensity={day ? 2.4 : 0.75} color={day ? '#fff1d6' : '#ff9a5a'} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-camera-far={60}/>
    <ambientLight intensity={day ? 0.35 : 0.14} color={day ? '#ffffff' : '#8fa4d8'}/>
  </>
}

const FLOORS: { floor: Floor; label: string; title: string }[] = [
  { floor: 3, label: 'Eksekutif & Lounge', title: 'Lantai 3: creative lounge, executive & command center' },
  { floor: 2, label: 'Teknologi & Produk', title: 'Lantai 2: technology & product (8 klaster divisi)' },
  { floor: 1, label: 'Kantor', title: 'Lantai 1: office, lounge, pantry and game room' },
]
/** Lantai mess (Fase 6a — Building Navigator): hanya 2 lantai. */
const RES_FLOORS: { floor: ResidenceFloor; label: string; title: string }[] = [
  { floor: 2, label: 'Kamar Tidur', title: 'Mess lantai 2: 4 kamar tidur + kamar mandi' },
  { floor: 1, label: 'Lobi & Ruang Makan', title: 'Mess lantai 1: lobi, ruang keluarga, ruang makan, dapur' },
]
/** Building Navigator (Fase 6a, SPEC §10): 3 pilihan gedung. */
const BUILDINGS: { building: Building; label: string; title: string; icon: string }[] = [
  { building: 'office', label: 'WOORK Office', title: 'Kantor utama — 3 lantai', icon: '🏢' },
  { building: 'residence', label: 'Staff Residence', title: 'Mess karyawan — 2 lantai', icon: '🛏️' },
  { building: 'campus', label: 'Campus Overview', title: 'Kedua gedung sekaligus', icon: '🗺️' },
]
const FLOOR_KEY = 'woork.kantorFloor'
// Kunci localStorage LAMA untuk tidur (Wave 10 ke bawah) — dihapus saat
// load (Wave 11), karena tidur kini state bersama di server. Browser yang
// dulu menyimpan tidur = 1 (mis. DWI) langsung kembali sinkron tanpa
// bersih-bersih manual.
const LEGACY_SLEEP_KEY = 'woork.kantorSleep'

function useFloor(): [FloorView, (floor: FloorView) => void] {
  const [floor, setFloor] = useState<FloorView>(() => {
    try {
      const saved = localStorage.getItem(FLOOR_KEY)
      return saved === '2' ? 2 : saved === '3' ? 3 : saved === 'all' ? 'all' : 1
    } catch { return 1 }
  })
  return [floor, (next: FloorView) => {
    setFloor(next)
    try { localStorage.setItem(FLOOR_KEY, String(next)) } catch { /* per-browser convenience only */ }
  }]
}

/** Gedung yang dilihat (Fase 6a — Building Navigator, pola useFloor). */
const BUILDING_KEY = 'woork.kantorBuilding'
function useBuilding(): [Building, (building: Building) => void] {
  const [building, setBuilding] = useState<Building>(() => {
    try {
      const saved = localStorage.getItem(BUILDING_KEY)
      return saved === 'residence' ? 'residence' : saved === 'campus' ? 'campus' : 'office'
    } catch { return 'office' }
  })
  return [building, (next: Building) => {
    setBuilding(next)
    try { localStorage.setItem(BUILDING_KEY, next) } catch { /* per-browser convenience only */ }
  }]
}

export interface Office3DProps {
  stations: KantorStation[]
  /** Dipanggil saat agent diklik di scene (dialog detail dibuat di Wave 2). */
  onSelectAgent: (station: KantorStation) => void
  /** Wave 11: status "Tidur" BERSAMA per kantor, dari snapshot server
   *  (`snapshot.sleep`). Bukan lagi preferensi per-browser — semua user
   *  kantor yang sama melihat nilai yang sama. */
  sleep?: boolean
  /** Wave 11: dipanggil saat tombol Tidur ditekan — parent memanggil
   *  POST /api/kantor/sleep; state baru datang lewat snapshot / SSE. */
  onToggleSleep?: (next: boolean) => void
  /** Wave 15: tema scene BERSAMA per kantor, dari snapshot server
   *  (`snapshot.theme`). Bukan lagi preferensi per-browser — semua user
   *  kantor yang sama melihat tema yang sama. */
  theme?: 'dark' | 'light'
  /** Wave 15: dipanggil saat tombol Siang/Malam ditekan — parent memanggil
   *  POST /api/kantor/theme; state baru datang lewat snapshot / SSE. */
  onToggleTheme?: () => void
  /** Wave 8: bila true, canvas mengisi tinggi parent (h-full) alih-alih
   *  rasio aspek 2.1/1 — dipakai halaman /kantor yang tingginya dinamis
   *  (dvh). Logika 3D/movement/placement tidak berubah. */
  fillHeight?: boolean
  /** Musala: state sesi salat bersama per kantor, dari snapshot server
   *  (`snapshot.prayer`). Bila aktif, peserta sesi berjalan ke musala
   *  dan menempati saf (state station 'Praying' dari office route). */
  prayer?: KantorPrayerState
  /** Morning Briefing: state sesi briefing bersama per kantor, dari
   *  snapshot server (`snapshot.briefing`). Bila aktif, peserta sesi
   *  berkumpul di ruang meeting (state station 'Briefing'). */
  briefing?: KantorBriefingState
}

export default function Office3D({ stations = [], onSelectAgent, sleep = false, onToggleSleep, theme: sharedTheme, onToggleTheme, fillHeight = false, prayer, briefing }: Office3DProps) {
  const anchors = useRef(new Map<string, THREE.Object3D>())
  const labels = useRef(new Map<string, HTMLElement>())
  const view = useRef<ViewHandle>(null)
  const [panMode, setPanMode] = useState(false)
  const [keyTarget, setKeyTarget] = useState<HTMLElement | null>(null)
  const [theme, toggleTheme] = useSceneTheme(sharedTheme, onToggleTheme)
  const [floor, setFloor] = useFloor()
  // Fase 6a — Building Navigator: gedung yang dilihat (kantor / mess /
  // kampus). Lantai (`floor`) dipakai bersama kedua gedung: mess hanya
  // punya lantai 1-2, jadi pindah ke mess menjepret lantai 3 → 2.
  const [building, setBuilding] = useBuilding()
  // ── Fase 5a — All Floors View + Focus / Follow / Hide UI ──
  // `glide` = permintaan glide kamera yang sedang berjalan (CameraGlide);
  // `followId` = agent yang sedang diikuti kameranya (FollowAgent);
  // `highlightFloor` = lantai yang disorot di mode all (hover tombol lantai);
  // `uiHidden` = sembunyikan overlay manual (tombol khusus, bukan High UI
  // otomatis). Semua per browser, bukan state bersama — tiap user mengatur
  // tampilannya sendiri.
  const [glide, setGlide] = useState<GlideRequest | null>(null)
  const [followId, setFollowId] = useState<string | null>(null)
  const [highlightFloor, setHighlightFloor] = useState<Floor | null>(null)
  const [uiHidden, setUiHidden] = useState(false)
  const agentRoots = useRef(new Map<string, THREE.Object3D>())
  const stopFollow = useCallback(() => { setFollowId(null) }, [])
  /** Pindah ke satu lantai dengan glide halus (SPEC §10: kamera berpindah
   *  dengan smooth transition). setPreserveView dulu supaya Controls tidak
   *  menjepret kamera instan saat lantai berubah. Fase 6a: di mode mess,
   *  lantai dijepret ke 1-2 (mess tidak punya lantai 3); di mode campus,
   *  klik lantai di scene pindah dulu ke kantor. */
  const goFloor = useCallback((next: Floor) => {
    stopFollow()
    setLiftRide(null)
    setHighlightFloor(null)
    view.current?.setPreserveView(true)
    if (building === 'campus') setBuilding('office')
    if (building === 'residence') {
      const resFloor = (next === 3 ? 2 : next) as ResidenceFloor
      setFloor(resFloor)
      setGlide({ kind: 'residence', floor: resFloor })
      return
    }
    setFloor(next)
    setGlide({ kind: 'floor', floor: next })
  }, [stopFollow, building])
  /** Masuk All Floors View dengan glide halus ke sudut pandang all.
   *  Fase 6a: di mode mess, "Semua" = eksterior seluruh bangunan mess. */
  const goAll = useCallback(() => {
    stopFollow()
    setLiftRide(null)
    setHighlightFloor(null)
    view.current?.setPreserveView(true)
    if (building === 'campus') setBuilding('office')
    setFloor('all')
    setGlide(building === 'residence' ? { kind: 'residence', floor: 'all' } : { kind: 'all' })
  }, [stopFollow, building])
  // Lift (lift-only): klik pintu lift -> naik satu lantai (siklus
  // 1→2→3→1) mengikuti kabin sungguhan (LiftRideAnimator) — kamera
  // meluncur bersama kabin 1,0 m/dtk + jeda pintu, bukan glide 1,4 dtk.
  // setPreserveView dulu supaya Controls tidak menjepret kamera instan
  // saat elevation berubah (lantai baru sudah ter-render saat animasi jalan).
  // Fase 5a: dari mode all, lift turun ke lantai 1; ride membatalkan
  // glide + follow (kamera sedang dianimasikan lift).
  const [liftRide, setLiftRide] = useState<{ from: Floor; to: Floor } | null>(null)
  const rideLift = useCallback(() => {
    // Fase 6a: lift hanya ada di kantor — di mode mess/kampus, klik pintu
    // lift pindah dulu ke kantor (glide, tanpa ride); klik lagi untuk naik.
    if (building !== 'office') {
      setFollowId(null)
      setGlide(null)
      view.current?.setPreserveView(true)
      setBuilding('office')
      const here = (floor === 'all' ? 1 : floor) as Floor
      setFloor(here)
      setGlide({ kind: 'floor', floor: here })
      return
    }
    const from = (floor === 'all' ? 1 : floor) as Floor
    const dest = (from === 3 ? 1 : from + 1) as Floor
    setFollowId(null)
    setGlide(null)
    view.current?.setPreserveView(true)
    setFloor(dest)
    setLiftRide({ from, to: dest })
  }, [floor, building])
  // Full Screen (Wave 16): Fullscreen API pada root scene. Esc keluar
  // secara native dari browser; `fullscreenchange` menyinkronkan tombol.
  // Kamera TIDAK berpindah: sebelum masuk fullscreen, Controls diminta
  // mempertahankan tampilan (setPreserveView), jadi resize canvas tidak
  // me-reframe ke overview.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return }
    view.current?.setPreserveView(true)
    el.requestFullscreen?.().catch(() => {})
  }, [])
  // Demo Mode (Wave 16, 22 ruangan sejak AI Campus Fase 3 — 15 kantor + 5 mess + 2 outdoor): tur kamera otomatis keliling 22 ruangan. State
  // lokal per browser (bukan bersama) — tiap user bisa menonton tur sendiri
  // tanpa mengganggu layar user lain. `demoRoom` untuk badge ruangan aktif.
  const [demo, setDemo] = useState(false)
  const [demoRoom, setDemoRoom] = useState<DemoRoom | null>(null)
  const toggleDemo = useCallback(() => {
    setLiftRide(null)
    setGlide(null)
    stopFollow()
    // Fase 6b: tur demo kini mengenal kantor + mess — DemoTour memindahkan
    // gedung + lantai sendiri tiap ruangan, jadi tidak perlu kembali ke
    // kantor dulu saat memulai.
    // Tur demo berjalan per lantai (bukan mode all): keluar dari All Floors
    // View dulu — DemoTour sendiri yang mengatur lantai tiap ruangan.
    if (floor === 'all') setFloor(1)
    setDemo((value) => {
      if (value) setDemoRoom(null)
      return !value
    })
  }, [floor, stopFollow])
  /** Pindah gedung (Fase 6a — Building Navigator): glide ke sudut pandang
   *  gedung itu. Demo berhenti (pindah gedung manual mengakhiri tur);
   *  follow berhenti; lift ride dibatalkan. */
  const goBuilding = useCallback((next: Building) => {
    stopFollow()
    setLiftRide(null)
    setHighlightFloor(null)
    if (demo) { setDemo(false); setDemoRoom(null) }
    view.current?.setPreserveView(true)
    setBuilding(next)
    if (next === 'residence') {
      const resFloor = (floor === 3 ? 2 : floor) as ResidenceFloor | 'all'
      if (floor === 3) setFloor(2)
      setGlide({ kind: 'residence', floor: resFloor })
    } else if (next === 'campus') {
      setGlide({ kind: 'campus' })
    } else if (floor === 'all') {
      setGlide({ kind: 'all' })
    } else {
      setGlide({ kind: 'floor', floor: floor as Floor })
    }
  }, [floor, stopFollow, demo])
  // High UI Mode (Wave 16): sembunyikan tombol kontrol otomatis setelah 3
  // detik tanpa aktivitas pointer; muncul lagi saat mouse bergerak / ketuk
  // layar. Preferensi per browser (localStorage), bukan state bersama —
  // tiap user mengatur tampilannya sendiri.
  const HIGH_UI_KEY = 'woork.kantorHighUi'
  const HIGH_UI_HIDE_MS = 3000
  const [highUi, setHighUiState] = useState(() => {
    try { return localStorage.getItem(HIGH_UI_KEY) === '1' } catch { return false }
  })
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactingRef = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  // Fase 5a — Follow Agent keluar bila user MENYERET kamera (bukan sekadar
  // klik): posisi pointer saat pointer down, dibandingkan saat pointer up.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }, [])
  const scheduleHide = useCallback(() => {
    clearHideTimer()
    if (!highUi || interactingRef.current) return
    hideTimerRef.current = setTimeout(() => { setControlsVisible(false) }, HIGH_UI_HIDE_MS)
  }, [highUi, clearHideTimer])
  const showControls = useCallback(() => {
    setControlsVisible(true)
    scheduleHide()
  }, [scheduleHide])
  const setHighUi = useCallback((next: boolean) => {
    setHighUiState(next)
    try { localStorage.setItem(HIGH_UI_KEY, next ? '1' : '0') } catch { /* abaikan */ }
  }, [])
  // Performance Settings (Fase 7b, SPEC §27.14): kualitas grafis per
  // browser (localStorage) — 'rendah' mematikan bayangan + paksa dpr 1
  // supaya scene 3 lantai tetap ringan di HP lama. Dibaca langsung oleh
  // <Canvas> di bawah, bukan pengaturan hiasan.
  const QUALITY_KEY = 'woork.kantorQuality'
  const [quality, setQualityState] = useState<'tinggi' | 'rendah'>(() => {
    try { return localStorage.getItem(QUALITY_KEY) === 'rendah' ? 'rendah' : 'tinggi' } catch { return 'tinggi' }
  })
  const setQuality = useCallback((next: 'tinggi' | 'rendah') => {
    setQualityState(next)
    try { localStorage.setItem(QUALITY_KEY, next) } catch { /* abaikan */ }
  }, [])
  // Saat High UI dinyalakan: tampilkan kontrol dulu, lalu jadwalkan sembunyi.
  // Saat dimatikan: tampilkan kontrol dan batalkan timer.
  useEffect(() => {
    if (!highUi) { clearHideTimer(); setControlsVisible(true); return }
    setControlsVisible(true)
    scheduleHide()
    return clearHideTimer
  }, [highUi, scheduleHide, clearHideTimer])
  // Selama pointer di atas tombol / tombol sedang fokus, kontrol tidak boleh
  // menghilang (hover + keyboard navigation).
  const overlayHover = {
    onMouseEnter: () => { interactingRef.current = true; clearHideTimer() },
    onMouseLeave: () => { interactingRef.current = false; scheduleHide() },
    onFocus: () => { interactingRef.current = true; clearHideTimer() },
    onBlur: () => { interactingRef.current = false; scheduleHide() },
  }
  const overlayVisibility = uiHidden ? 'invisible pointer-events-none opacity-0' : !highUi || controlsVisible ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'
  // Wave 11 — tidur kini state bersama server (prop `sleep` dari snapshot).
  // Hapus kunci localStorage lama sekali saat mount: browser yang dulu
  // menyimpan tidur = 1 (mis. DWI) langsung kembali sinkron (bangun,
  // sama seperti Eka) tanpa harus membersihkan manual.
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_SLEEP_KEY) } catch { /* abaikan */ }
  }, [])
  // Wave 15 — tema kini state bersama server (prop `theme` dari snapshot).
  // Hapus kunci localStorage lama bila tema bersama aktif: browser yang
  // dulu menyimpan tema sendiri langsung kembali sinkron dengan kantor.
  useEffect(() => {
    if (sharedTheme === undefined) return
    try { localStorage.removeItem(SCENE_THEME_KEY) } catch { /* abaikan */ }
  }, [sharedTheme])
  // Hot desking L1 (satu meja per agent, gedung tumbuh mengikuti jumlah
  // agent) + meja divisi (klaster L2 / ruangan L3, dari station.department).
  const layout = useMemo(() => createLayout(stations), [stations])
  // Demo Mode (Wave 16, 22 ruangan sejak AI Campus Fase 3): ruangan tur dihitung dari layout yang sama.
  const demoRoomsMemo = useMemo(() => demoRooms(layout), [layout])
  // Musala + Smart Display: jadwal salat (arah kiblat + papan jadwal)
  // dan konten briefing (slideshow monitor) diambil dari API — data
  // NYATA, bukan hardcode. Refresh tiap 60 dtk (jadwal di-cache server
  // per hari; konten briefing berubah seiring Meeting/Task/Kalender).
  const [prayerSchedule, setPrayerSchedule] = useState<{ schedule: PrayerScheduleDay; next: NextPrayer | null; qibla: number; source: string; cityName: string | null; timezone: string } | null>(null)
  const [briefingContent, setBriefingContent] = useState<BriefingContent | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [ps, bc] = await Promise.all([
          fetch('/api/kantor/prayer/schedule', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/kantor/briefing/content', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ])
        if (!alive) return
        if (ps?.data) setPrayerSchedule(ps.data)
        if (bc?.data) setBriefingContent(bc.data)
      } catch {
        // Abaikan — scene memakai fallback (kiblat default, slideshow "Memuat…").
      }
    }
    void load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
  // Arah kiblat dari API jadwal (Jakarta 295,15°); sebelum termuat pakai
  // default yang sama. Dipakai saf musala + panah kiblat + mihrab.
  const qiblaBearing = prayerSchedule?.qibla ?? DEFAULT_QIBLA_BEARING
  const sceneData: KantorSceneData = useMemo(() => ({
    briefingContent,
    briefingActive: briefing?.active ?? false,
    briefingLeaderName: briefing?.leaderName ?? null,
    prayerSchedule: prayerSchedule?.schedule ?? null,
    prayerNext: prayerSchedule?.next ?? null,
    prayerQibla: qiblaBearing,
    prayerSource: prayerSchedule?.source ?? 'kemenag_astronomical',
    prayerCityName: prayerSchedule?.cityName ?? null,
    prayerTimezone: prayerSchedule?.timezone ?? 'Asia/Jakarta',
  }), [briefingContent, briefing?.active, briefing?.leaderName, prayerSchedule, qiblaBearing])
  // Idle agents wander between the lounge, the game room, the pantry, the street food and
  // lantai 2 (decorative only), spread so no two share a spot. Bila kantor
  // sedang tidur (prop `sleep` dari snapshot server), semua agent Idle ada
  // di tempat tidur — placement-nya sudah dihitung server di
  // GET /api/kantor/office (`station.idle`, stop 'tidur', pose 'lie').
  /**
   * Placement idle sebuah station (Wave 10 — sinkronisasi realtime).
   * Sumbernya `station.idle` dari snapshot server — dihitung SEKALI dari
   * jam server (`idlePlan` di GET /api/kantor/office), jadi semua client
   * menaruh agent Idle yang sama di spot yang sama. Dulu placement dihitung
   * di sini dari `Date.now()` browser (`useClock(2000)`) — jam browser
   * berbeda → posisi berbeda antar layar. Jam lokal kini TIDAK dipakai
   * untuk placement; animasi ayunan anggota badan tetap memakai clock r3f
   * (kosmetik, di Character/useFrame).
   */
  const idlePlacement = (station: KantorStation): { placement: Placement; label: string } | undefined => {
    if (station.state !== 'Idle' || station.room !== 'Lounge') return undefined
    const idle = station.idle
    if (!idle) return undefined
    return {
      placement: { position: idle.position, facing: idle.facing, seated: idle.seated, label: idle.label, pose: idle.pose, height: idle.height },
      label: idle.label,
    }
  }
  // Agents at the meeting table take the next free place around it.
  // Briefing aktif: leader (snapshot.briefing.leaderName) duduk di
  // presenter (meetingSeat 0, di whiteboard); sisanya mengisi kursi.
  const meetingOrder = (() => {
    const raw = stations.filter((station) => station.roomPosition === 'meeting-area').map((station) => station.id)
    if (!briefing?.active || !briefing.leaderName) return raw
    const leader = stations.find((s) => s.name === briefing.leaderName && raw.includes(s.id))
    if (!leader) return raw
    return [leader.id, ...raw.filter((id) => id !== leader.id)]
  })()
  // Agents di musala menempati saf sesuai urutan station (seat terendah
  // = imam, sesuai penentuan imam backend: defaultImamAgentId atau
  // agent pertama menurut nama).
  const prayerOrder = stations.filter((station) => station.roomPosition === 'musala-saf' || station.state === 'Praying').map((station) => station.id)
  // Bekerja/meninjau: langsung ke meja komputernya sendiri — tidak pernah
  // mengembara. Begitu kembali Idle, idlePlacement() di atas mengambil alih lagi.
  const placement = (station: KantorStation) => station.state === 'Working' || station.state === 'Reviewing'
    ? placementFor(station, layout, 0, 0, qiblaBearing)
    : idlePlacement(station)?.placement ?? placementFor(station, layout, Math.max(0, meetingOrder.indexOf(station.id)), Math.max(0, prayerOrder.indexOf(station.id)), qiblaBearing)
  // ── Fase 5a — Focus Department + Follow Agent ──
  /** Fokus ke divisi: klaster/ruangan divisinya (divisionFocus) atau meja
   *  agent pertama divisi itu (divisi lantai 1, tanpa ruangan sendiri);
   *  bila tidak ada, overview ruang kerja lantai 1. */
  const focusDivision = useCallback((name: string) => {
    const found = divisionFocus(name, layout)
    stopFollow()
    setLiftRide(null)
    view.current?.setPreserveView(true)
    // Fase 6a: divisi selalu di kantor — dari mode mess/kampus, kembali
    // dulu ke kantor (glide fokus tetap ke klaster/ruangan divisi).
    if (building !== 'office') setBuilding('office')
    if (found) {
      setFloor(found.floor)
      setGlide({ kind: 'focus', target: found.target, offset: found.offset })
      return
    }
    const member = stations.find((s) => s.department?.name === name)
    const desk = member ? layout.deskForSeat.get(member.seat)?.placement.position : undefined
    const deskCenter: Vec3 = [
      layout.desks.reduce((sum, [x]) => sum + x, 0) / Math.max(1, layout.desks.length),
      0.8,
      layout.desks.reduce((sum, [, , z]) => sum + z, 0) / Math.max(1, layout.desks.length),
    ]
    const target: Vec3 = desk ? [desk[0], desk[1] + 0.8, desk[2]] : deskCenter
    const deptFloor = member?.department?.floor
    setFloor(deptFloor === 2 ? 2 : deptFloor === 3 ? 3 : 1)
    setGlide({ kind: 'focus', target, offset: [1.5, 5, 7] })
  }, [layout, stations, stopFollow, building])
  /** Ikuti agent: glide dulu ke agent (medium shot), lalu FollowAgent
   *  mengambil alih tiap frame. Keluar dari demo (kamera milik tur).
   *  Fase 6a: agent yang sedang tidur di mess -> tampilan pindah ke
   *  gedung residence (bukan lantai 2 kantor); agent di kantor -> office. */
  const startFollow = useCallback((id: string) => {
    const station = stations.find((s) => s.id === id)
    if (!station) return
    setLiftRide(null)
    setDemo(false)
    setDemoRoom(null)
    view.current?.setPreserveView(true)
    const object = agentRoots.current.get(id)
    const pos: Vec3 = object ? [object.position.x, object.position.y, object.position.z] : placement(station).position
    if (inResidenceXZ(pos[0], pos[2])) {
      const resFloor = (floorOf(pos) >= 2 ? 2 : 1) as ResidenceFloor
      setBuilding('residence')
      setFloor(resFloor)
      setGlide({ kind: 'residence', floor: resFloor })
    } else {
      setBuilding('office')
      setFloor(floorOf(pos))
      setGlide({ kind: 'focus', target: [pos[0], pos[1] + 1.0, pos[2]], offset: [2.5, 3.5, 5.5] })
    }
    setFollowId(id)
    // placement() diturunkan dari stations/layout/qiblaBearing (sudah di deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations])
  /** Pilihan dropdown "Fokus divisi": klaster Tech L2 + ruangan eksekutif
   *  L3 + divisi lantai 1 yang dimiliki agent (dari snapshot, bukan hardcode). */
  const divisionOptions = useMemo(() => ({
    l1: Array.from(new Set(stations.filter((s) => s.department && s.department.floor !== 2 && s.department.floor !== 3).map((s) => s.department!.name))).sort(),
    l2: layout.techClusters.map((c) => c.name),
    l3: ['CEO Office', 'Strategy & PM', 'Legal', 'AI Command Center'],
  }), [stations, layout])
  // Demo Mode: bila sesi salat aktif -> kamera prioritaskan musala
  // (wide shot saf, selang-seling medium shot imam); bila briefing aktif
  // -> prioritaskan ruang meeting (wide shot peserta + monitor,
  // selang-seling medium shot leader). Bila tidak ada sesi -> tur normal.
  const demoPriority: DemoPriority | null = useMemo(() => {
    if (prayer?.active) {
      const imam = musalaSafPositions(layout, qiblaBearing)[0]
      return { roomKey: 'musala', focusPosition: imam.position }
    }
    if (briefing?.active) {
      const leader = stations.find((s) => s.name === briefing.leaderName)
      return { roomKey: 'meeting', focusPosition: leader ? placement(leader).position : null }
    }
    return null
    // placement() diturunkan dari stations/layout/qiblaBearing (sudah di deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prayer?.active, briefing?.active, briefing?.leaderName, layout, qiblaBearing, stations])
  const floorCount = (value: Floor) => stations.filter((station) => floorOf(placement(station).position) === value).length
  /** Badge jumlah agent per lantai mess (Fase 6a): agent di dalam bounds
   *  mess + lantai placement-nya (tidur di kasur y 2,8 = lantai 2). */
  const resFloorCount = (value: ResidenceFloor) => stations.filter((station) => {
    const pos = placement(station).position
    return inResidenceXZ(pos[0], pos[2]) && floorOf(pos) === value
  }).length
  // Meja menyala bila ditempati (Fase 3b, division-aware): id meja dari
  // layout.deskForSeat — meja klaster L2 / ruangan L3 ikut menyala, bukan
  // hanya meja L1. Agent Working/Reviewing selalu duduk di mejanya sendiri
  // (placementFor), walau `room` di snapshot masih 'Lounge'; station
  // Workspace lain di luar meeting-area ikut terhitung; Offline tidak pernah.
  const activeDeskIds = useMemo(() => new Set(
    stations
      .filter((station) => station.state !== 'Offline' && (station.state === 'Working' || station.state === 'Reviewing' || (station.room === 'Workspace' && station.roomPosition !== 'meeting-area')))
      .map((station) => layout.deskForSeat.get(station.seat)?.deskId)
      .filter((id): id is string => typeof id === 'string'),
  ), [stations, layout])
  // Fullscreen: `h-screen w-screen` dari state (bukan varian Tailwind
  // `fullscreen:` — varian itu tidak ter-generate di build proyek ini).
  return <div className={isFullscreen
    ? "relative isolate h-screen w-screen touch-none border-8 border-[#121a18] bg-[#15201c] shadow-[inset_0_0_0_2px_#4d6459] focus-visible:outline-2 focus-visible:outline-[#6fb6d6]"
    : fillHeight
      ? "relative isolate h-full min-h-0 touch-none border-8 border-[#121a18] bg-[#15201c] shadow-[inset_0_0_0_2px_#4d6459] focus-visible:outline-2 focus-visible:outline-[#6fb6d6]"
      : "relative isolate h-[400px] touch-none border-8 border-[#121a18] bg-[#15201c] shadow-[inset_0_0_0_2px_#4d6459] focus-visible:outline-2 focus-visible:outline-[#6fb6d6] md:aspect-[2.1/1] md:h-auto md:min-h-[420px]"} ref={(el) => { setKeyTarget(el); containerRef.current = el }} tabIndex={0} role="region" aria-label="3D office. Drag to rotate, right-drag or two fingers to pan, scroll to zoom, arrow keys pan when focused. Page Up and Page Down change floors." onPointerMove={(event) => { if (highUi && event.pointerType === 'mouse') showControls() }} onPointerDown={(event) => { dragStartRef.current = { x: event.clientX, y: event.clientY }; if (highUi && event.pointerType === 'mouse') showControls() }} onPointerUp={(event) => { const start = dragStartRef.current; dragStartRef.current = null; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) stopFollow() }} onWheel={() => stopFollow()} onTouchStart={(event) => { const touch = event.touches[0]; if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() } }} onTouchEnd={(event) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
    if (moved > 12) stopFollow()
    if (!highUi) return
    if (Date.now() - start.time < 300 && moved < 12) showControls()
  }} onKeyDown={(event) => {
    if (event.key === 'Escape' && uiHidden) { setUiHidden(false); return }
    // Panah = geser kamera manual -> keluar dari Follow Agent.
    if (event.key.startsWith('Arrow')) { stopFollow(); return }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      // Fase 6a: di mode mess, PageUp/Down antar lantai 1-2 mess; di mode
      // campus, goFloor kembali dulu ke kantor. Di kantor seperti lama:
      // dari mode all PageUp -> lantai 3 (atas), PageDown -> lantai 1.
      // PageUp/Down TIDAK PERNAH masuk ke mode all (tetap antar lantai).
      if (building === 'residence') {
        const next = floor === 'all' ? (event.key === 'PageUp' ? 2 : 1) : (event.key === 'PageUp' ? Math.min(2, floor + 1) : Math.max(1, floor - 1))
        goFloor(next as Floor)
      } else {
        const next = floor === 'all' ? (event.key === 'PageUp' ? 3 : 1) : (event.key === 'PageUp' ? Math.min(3, floor + 1) : Math.max(1, floor - 1))
        goFloor(next as Floor)
      }
    }
  }}>
    <div className="absolute inset-0" onPointerDown={() => { setLiftRide(null); setGlide(null); if (demo) { setDemo(false); setDemoRoom(null) } }}>
      <Canvas shadows={quality !== 'rendah'} dpr={quality === 'rendah' ? 1 : [1, 2]} camera={{ position: [-3, 13, 16], fov: 40, near: 0.5, far: 150 }} gl={{ antialias: true }}>
        <Lighting theme={theme}/>
        <LiftUpdater/>
        <Environment night={theme === 'dark'} layout={layout} floor={floor} scene={sceneData} onLiftRide={rideLift} activeDeskIds={activeDeskIds} highlightFloor={highlightFloor} onFloorClick={goFloor} onFocusDivision={focusDivision} hideResidenceInterior={building === 'office' && !sleep} hideResidenceRoof={sleep}/>
        {/* Meja kerja lantai 1 — selalu dirender: lantai 1 kini tampil di
            semua mode (aturan tampil 2026-11-23: lantai terpilih + lantai di
            bawahnya), bukan hanya saat floor === 1. */}
        {layout.desks.map((position, index) => <WorkDesk key={index} position={position} active={activeDeskIds.has(`l1:${index}`)} withChair/>)}
        {stations.map((station) => <Character key={station.id} station={station} placement={placement(station)} layout={layout} floor={floor} onSelect={onSelectAgent} anchor={register(anchors, `agent-${station.id}`)} agentRoots={agentRoots} prayerStartedAt={prayer?.startedAt ?? null}/>)}
        <LabelProjector anchors={anchors} labels={labels}/>
        <Controls key={layout.deskCount} ref={view} panMode={panMode} keyTarget={keyTarget} layout={layout} viewMode={floor} building={building}/>
        {liftRide !== null && <LiftRideAnimator fromFloor={liftRide.from} toFloor={liftRide.to} layout={layout} view={view} onDone={() => setLiftRide(null)}/>}
        {glide !== null && <CameraGlide request={glide} layout={layout} view={view} onDone={() => setGlide(null)}/>}
        <FollowAgent followId={followId} agentRoots={agentRoots} view={view} building={building} floor={floor} onNavigate={(nextBuilding, nextFloor) => { view.current?.setPreserveView(true); setBuilding(nextBuilding); setFloor(nextFloor) }} glideActive={glide !== null}/>
        <DemoTour active={demo} rooms={demoRoomsMemo} agentPositions={stations.map((station) => placement(station).position)} building={building} floor={floor === 'all' ? 1 : floor} onNavigate={(nextBuilding, nextFloor) => { stopFollow(); view.current?.setPreserveView(true); setBuilding(nextBuilding); setFloor(nextFloor) }} onRoomChange={setDemoRoom} view={view} priority={demoPriority}/>
      </Canvas>
    </div>
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stations.map((station) => {
        const badge = kantorStateBadge(station.state)
        const busy = ['Working', 'Reviewing', 'Collaborating'].includes(station.state)
        const idle = idlePlacement(station)
        return <button key={station.id} ref={register(labels, `agent-${station.id}`)} type="button" className={`invisible absolute left-0 top-0 grid cursor-pointer justify-items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 text-[#eef9ef] will-change-transform focus-visible:outline-2 focus-visible:outline-[#f5bd6d] ${station.state === 'Offline' ? 'opacity-70' : ''}`} onClick={() => onSelectAgent(station)} aria-label={`${station.name}. ${badge.label}.${station.activity ? ` ${station.activity}.` : ''}${idle ? ` ${idle.label}.` : ''} Open station details.`}>
          {busy && station.activity && <span className="kantor-label-extra w-max max-w-[150px] whitespace-normal rounded border-2 border-[#17201e] bg-[#fff7e8] px-1.5 py-0.5 text-center text-[9px] leading-snug text-[#1b2420]">{station.activity}</span>}
          {idle && <span className={`kantor-label-extra w-max max-w-[150px] whitespace-normal rounded border-2 border-dashed bg-white/85 px-1.5 py-0.5 text-center text-[9px] italic leading-snug text-slate-600 ${idle.placement.pose === 'lie' ? 'italic' : ''}`}>{idle.placement.pose === 'lie' ? '💤 ' : ''}{idle.label}</span>}
          <span className="flex items-center gap-1"><span className="font-mono text-[10px] tracking-wide [text-shadow:0_1px_1px_rgba(0,0,0,0.8)]">{station.name}</span><span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${BADGE_CLASSES[badge.tone]}`}>{badge.label}</span></span>
        </button>
      })}
    </div>
    <div className={`absolute left-2.5 top-2.5 z-[2] flex flex-col gap-1 transition-opacity duration-300 ${overlayVisibility}`} role="group" aria-label="Buildings and floors" {...overlayHover}>
      {/* Building Navigator (Fase 6a): 3 gedung — kantor, mess, kampus. */}
      {BUILDINGS.map((item) => <button key={item.building} type="button" className={`grid min-w-0 grid-cols-[18px_auto] items-center gap-1 rounded-lg border px-1.5 py-0.5 pl-1 min-h-7 text-left text-[9px] text-[#f4efe6] md:min-w-[132px] md:grid-cols-[22px_auto] md:gap-1.5 md:px-2 md:py-1 md:min-h-8 md:text-[11px] ${building === item.building ? 'border-[#f4efe6] bg-[#d9534f]' : 'border-white/20 bg-black/70 hover:bg-black/90'}`} aria-pressed={building === item.building} onClick={() => goBuilding(item.building)} title={item.title}>
        <b className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/40 text-[10px] font-semibold md:h-5 md:w-5 md:text-[11px]">{item.icon}</b><span>{item.label}</span>
      </button>)}
      {(building === 'residence' ? RES_FLOORS : FLOORS).map((item) => <button key={item.floor} type="button" disabled={building === 'campus'} className={`grid min-w-0 grid-cols-[18px_auto] items-center gap-1 rounded-lg border px-1.5 py-0.5 pl-1 min-h-7 text-left text-[9px] text-[#f4efe6] md:min-w-[132px] md:grid-cols-[22px_auto_auto] md:gap-1.5 md:px-2 md:py-1 md:min-h-8 md:text-[11px] ${building === 'campus' ? 'cursor-not-allowed border-white/10 bg-black/40 opacity-50' : floor === item.floor ? 'border-[#f4efe6] bg-[#d9534f]' : 'border-white/20 bg-black/70 hover:bg-black/90'}`} aria-pressed={floor === item.floor} onClick={() => goFloor(item.floor)} onMouseEnter={() => { if (floor === 'all' && building === 'office') setHighlightFloor(item.floor) }} onMouseLeave={() => setHighlightFloor(null)} onFocus={() => { if (floor === 'all' && building === 'office') setHighlightFloor(item.floor) }} onBlur={() => setHighlightFloor(null)} title={`${item.title} (Page ${item.floor === 2 ? 'Up' : 'Down'})`}>
        <b className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/40 font-mono text-[10px] font-semibold md:h-5 md:w-5 md:text-[11px]">{item.floor}</b><span>{item.label}</span><small className="hidden justify-self-end rounded-full bg-white/20 px-1.5 py-0 font-mono text-[10px] font-semibold text-white md:inline-block">{building === 'residence' ? resFloorCount(item.floor as ResidenceFloor) : floorCount(item.floor)}</small>
      </button>)}
      {/* All Floors View (Fase 5a): semua lantai sekaligus — kantor 3
          lantai, mess 2 lantai (eksterior). Hover tombol lantai selagi
          mode all kantor aktif menyorot lantai itu di scene. */}
      <button type="button" disabled={building === 'campus'} className={`grid min-w-0 grid-cols-[18px_auto] items-center gap-1 rounded-lg border px-1.5 py-0.5 pl-1 min-h-7 text-left text-[9px] text-[#f4efe6] md:min-w-[132px] md:grid-cols-[22px_auto_auto] md:gap-1.5 md:px-2 md:py-1 md:min-h-8 md:text-[11px] ${building === 'campus' ? 'cursor-not-allowed border-white/10 bg-black/40 opacity-50' : floor === 'all' ? 'border-[#f4efe6] bg-[#d9534f]' : 'border-white/20 bg-black/70 hover:bg-black/90'}`} aria-pressed={floor === 'all'} onClick={goAll} title={building === 'residence' ? 'Tampilkan kedua lantai mess sekaligus (eksterior)' : 'Tampilkan ketiga lantai sekaligus (All Floors View) — klik lantai di scene atau tombol lantai untuk fokus ke lantai itu'}>
        <b className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/40 font-mono text-[10px] font-semibold md:h-5 md:w-5 md:text-[11px]">▦</b><span>Semua Lantai</span><small className="hidden justify-self-end rounded-full bg-white/20 px-1.5 py-0 font-mono text-[10px] font-semibold text-white md:inline-block">{stations.length}</small>
      </button>
    </div>
    <div className={`absolute bottom-2.5 right-2.5 z-[2] flex flex-wrap justify-end gap-1 transition-opacity duration-300 md:bottom-auto md:top-2.5 md:max-w-[calc(100%-150px)] ${overlayVisibility}`} {...overlayHover}>
      <button type="button" className={sleep ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px]' : 'rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90'} aria-pressed={sleep} onClick={() => onToggleSleep?.(!sleep)} title="Send every idle agent to rest in their mess beds (Fase 5b — dulu Creative Lounge lantai 3)">💤 Tidur</button>
      <button type="button" className={panMode ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px]' : 'rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90'} aria-pressed={panMode} onClick={() => setPanMode((value) => !value)} title="Drag moves the view instead of rotating it">✥ Geser</button>
      <button type="button" className="rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90" onClick={() => { setLiftRide(null); setGlide(null); stopFollow(); if (demo) { setDemo(false); setDemoRoom(null) } setBuilding('office'); setFloor(1); view.current?.reset() }} title="Hentikan Demo Mode (bila aktif) dan kembali ke tampilan awal (Office lantai 1)">↺ Reset view</button>
      <button type="button" className="rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90" onClick={toggleTheme} title={theme === 'dark' ? 'Ganti ke tema siang' : 'Ganti ke tema malam'}>{theme === 'dark' ? '☀️ Siang' : '🌙 Malam'}</button>
      <button type="button" className={isFullscreen ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px]' : 'rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90'} aria-pressed={isFullscreen} onClick={toggleFullscreen} title={isFullscreen ? 'Keluar dari layar penuh (Esc)' : 'Tampilkan kantor dalam layar penuh'}>⛶ Fullscreen</button>
      <button type="button" className={demo ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px]' : 'rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90'} aria-pressed={demo} onClick={toggleDemo} title={demo ? 'Hentikan tur kamera otomatis' : 'Jalankan tur kamera otomatis keliling 22 ruangan kantor, mess & taman'}>🎬 Demo</button>
      {/* Focus Department (Fase 5a): kamera fokus ke klaster/ruangan divisi
          — atau klik totem nama divisi langsung di scene lantai 2. */}
      <select aria-label="Fokus divisi" className="rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90" value="" onChange={(event) => { const name = event.target.value; if (name) focusDivision(name); event.target.value = '' }} title="Fokus kamera ke klaster/ruangan sebuah divisi">
        <option value="">🎯 Fokus divisi…</option>
        {divisionOptions.l1.length > 0 && <optgroup label="Lantai 1 — Bisnis & Operasional">{divisionOptions.l1.map((name) => <option key={name} value={name}>{name}</option>)}</optgroup>}
        <optgroup label="Lantai 2 — Teknologi & Produk">{divisionOptions.l2.map((name) => <option key={name} value={name}>{name}</option>)}</optgroup>
        <optgroup label="Lantai 3 — Eksekutif & Manajemen">{divisionOptions.l3.map((name) => <option key={name} value={name}>{name}</option>)}</optgroup>
      </select>
      {/* Follow Agent (Fase 5a): kamera mengikuti agent yang dipilih saat ia
          berjalan. Berhenti bila user menyeret / zoom / panah / ganti lantai
          / Reset / pilih "—" di sini. */}
      <select aria-label="Ikuti agent" className="rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90" value={followId ?? ''} onChange={(event) => { const id = event.target.value; if (id) startFollow(id); else stopFollow() }} title="Kamera mengikuti agent yang dipilih saat ia berjalan">
        <option value="">👣 Ikuti agent…</option>
        {[...stations].sort((a, b) => a.name.localeCompare(b.name)).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
      </select>
      {/* Hide UI (Fase 5a): sembunyikan SEMUA overlay sekaligus secara
          manual; hanya tombol "Tampilkan UI" yang tersisa ( + Esc ).
          BUKAN "High UI" — High UI adalah mode auto-hide Wave 16 (SPEC
          §21: High UI / Auto-hide UI, tombol 👁 UI di samping ini):
          kontrol sembunyi OTOMATIS setelah 3 dtk tanpa aktivitas pointer.
          Koreksi tafsir Fase 5a di Fase 7b. */}
      <button type="button" className="rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90" onClick={() => setUiHidden(true)} title="Sembunyikan semua tombol overlay sementara (tampilan bersih) — kembalikan lewat tombol Tampilkan UI atau Esc">🙈 Sembunyikan UI</button>
      <button type="button" className={highUi ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px]' : 'rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90'} aria-pressed={highUi} onClick={() => setHighUi(!highUi)} title={highUi ? 'Tampilkan tombol kontrol seperti biasa' : 'Sembunyikan tombol kontrol otomatis setelah 3 detik tanpa aktivitas pointer (High UI Mode)'}>👁 UI</button>
      {/* Performance Settings (Fase 7b, SPEC §27.14): kualitas grafis —
          'Ringan' mematikan bayangan + turunkan resolusi render (dpr 1)
          supaya scene tetap ringan di HP lama. Per browser (localStorage). */}
      <button type="button" className={quality === 'rendah' ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px]' : 'rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90'} aria-pressed={quality === 'rendah'} onClick={() => setQuality(quality === 'rendah' ? 'tinggi' : 'rendah')} title={quality === 'rendah' ? 'Kualitas grafis rendah aktif (tanpa bayangan, resolusi render 1x) — ketuk untuk kembali ke kualitas tinggi' : 'Kualitas grafis tinggi (bayangan aktif, resolusi render hingga 2x) — ketuk untuk mode ringan di HP lama'}>⚡ {quality === 'rendah' ? 'Ringan' : 'Kualitas'}</button>
    </div>
    {demo && <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-[2] rounded-full border border-[#f4efe6] bg-[#d9534f] px-2 py-0.5 text-[9px] font-semibold text-[#f4efe6] md:px-2.5 md:py-1 md:text-[11px]" role="status">🎬 DEMO MODE ACTIVE{demoRoom ? ` — ${demoRoom.label}` : ''}</div>}
    {followId && <button type="button" className={`absolute left-1/2 top-2.5 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full border border-[#f4efe6] bg-[#d9534f] px-2.5 py-1 text-[10px] font-semibold text-[#f4efe6] transition-opacity duration-300 md:text-[11px] ${overlayVisibility}`} onClick={stopFollow} title="Berhenti mengikuti agent">👣 Mengikuti {stations.find((s) => s.id === followId)?.name ?? 'agent'} — ketuk untuk berhenti</button>}
    {uiHidden && <button type="button" className="absolute right-2.5 top-2.5 z-[3] rounded-md border border-white/20 bg-black/70 px-2 py-0.5 min-h-7 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:min-h-8 md:text-[11px] hover:bg-black/90" onClick={() => setUiHidden(false)} title="Tampilkan kembali semua tombol overlay (atau tekan Esc)">👁 Tampilkan UI</button>}
    {highUi && !controlsVisible && <div className="pointer-events-none absolute left-1/2 top-2.5 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[9px] text-[#f4efe6] md:px-2.5 md:py-1 md:text-[11px]">Gerakkan mouse / ketuk layar untuk menampilkan kontrol</div>}
  </div>
}
