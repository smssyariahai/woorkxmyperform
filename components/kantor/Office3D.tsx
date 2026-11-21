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
import type { KantorStation } from '@/lib/kantor/types'
import { clampTarget, createLayout, FLOOR_HEIGHT, floorOf, GAME_ROOM, placementFor, walkPath3, type Floor, type OfficeLayout, type Placement, type Vec3 } from './scene/office3d-layout'
import { Environment } from './scene/environment'
import { DemoTour, demoRooms, type DemoRoom } from './scene/demo-tour'
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

/** Ground-floor spots outside the building (gang, sidewalk, yard) stay in view from lantai 2. */
function outdoors(x: number, z: number, layout: OfficeLayout): boolean {
  const { minX, maxX, maxZ } = layout.building
  const inGameRoom = x > GAME_ROOM.minX && x < GAME_ROOM.maxX && z > GAME_ROOM.minZ && z < GAME_ROOM.maxZ
  return x < minX || z > maxZ || (x > maxX && !inGameRoom)
}

function Character({ station, placement, layout, floor, onSelect, anchor }: { station: KantorStation; placement: Placement; layout: OfficeLayout; floor: Floor; onSelect: (station: KantorStation) => void; anchor: (object: THREE.Object3D | null) => void }) {
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
  useEffect(() => {
    const group = root.current
    if (!group) return
    path.current = walkPath3([group.position.x, group.position.y, group.position.z], placement.position, layout).map(([px, py, pz]) => new THREE.Vector3(px, py, pz))
    // placement.position is captured through `destination`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])

  useFrame((state, delta) => {
    const group = root.current
    if (!group) return
    const time = state.clock.elapsedTime
    const next = path.current[0]
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
    // Only the floor in view is drawn; from lantai 2 the agents outside on the ground stay visible.
    const upstairs = group.position.y > FLOOR_HEIGHT / 2
    group.visible = floor === 2 ? upstairs || outdoors(group.position.x, group.position.z, layout) : !upstairs
    if (!walking) group.rotation.y += Math.atan2(Math.sin(placement.facing - group.rotation.y), Math.cos(placement.facing - group.rotation.y)) * 0.12
    const swing = walking ? Math.sin(time * 10) * 0.6 : 0
    const arrived = !walking && path.current.length === 0
    const lying = arrived && placement.pose === 'lie'
    const onFloor = arrived && placement.pose === 'floor'
    // In bed (or the hammock) the body lines up with it exactly, not wherever the walk left it.
    if (lying) group.rotation.y = placement.facing
    const seated = !walking && (placement.seated || onFloor)
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = lying ? 0 : seated ? -Math.PI / 2.2 : swing
      rightLeg.current.rotation.x = lying ? 0 : seated ? -Math.PI / 2.2 : -swing
    }
    if (leftArm.current && rightArm.current) {
      const typing = !walking && (station.state === 'Working' || station.state === 'Reviewing')
      const talking = !walking && station.state === 'Collaborating'
      leftArm.current.rotation.x = lying ? 0 : walking ? -swing : typing ? -1.1 + Math.sin(time * 14) * 0.12 : talking ? -0.4 + Math.sin(time * 3) * 0.3 : 0
      rightArm.current.rotation.x = lying ? 0 : walking ? swing : typing ? -1.1 + Math.cos(time * 14) * 0.12 : 0
    }
    if (body.current) {
      // Lying down: the body tips back so the head rests towards the pillow (local -z).
      body.current.rotation.x += ((lying ? -Math.PI / 2 : 0) - body.current.rotation.x) * 0.2
      const talk = station.state === 'Collaborating' && !walking ? Math.abs(Math.sin(time * 5)) * 0.03 : 0
      const breathe = station.state === 'Idle' ? Math.sin(time * (lying ? 1.2 : 2)) * 0.015 : 0
      body.current.position.y = lying ? (placement.height ?? 0.5) + 0.16 + breathe : (onFloor ? -0.5 : seated ? -0.14 : 0) + talk + breathe
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
    // Nearest labels keep their spot; a farther label that would overlap one already placed is
    // lifted above it, so every agent stays readable and clickable.
    projected.sort((a, b) => a.depth - b.depth)
    const placed: { left: number; right: number; top: number; bottom: number }[] = []
    for (const label of projected) {
      const width = label.element.offsetWidth
      const height = label.element.offsetHeight
      const x = Math.min(Math.max(label.x, width / 2 + 4), size.width - width / 2 - 4)
      let bottom = label.y
      const left = x - width / 2
      const right = x + width / 2
      for (let guard = 0; guard < 6; guard += 1) {
        const hit = placed.find((box) => left < box.right && right > box.left && bottom - height < box.bottom && bottom > box.top)
        if (!hit) break
        bottom = hit.top - 4
      }
      placed.push({ left, right, top: bottom - height, bottom })
      label.element.style.transform = `translate(${x}px, ${Math.max(bottom, height + 4)}px) translate(-50%, -100%)`
      label.element.style.zIndex = String(Math.round((1 - label.depth) * 10_000))
    }
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
const Controls = forwardRef<ViewHandle, { panMode: boolean; keyTarget: HTMLElement | null; layout: OfficeLayout; elevation: number }>(function Controls({ panMode, keyTarget, layout, elevation }, handle) {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  // Bila true, resize TIDAK me-reframe kamera: tampilan manual / demo /
  // fullscreen dipertahankan. Diaktifkan saat user menggerakkan kamera
  // (event 'start' OrbitControls), saat Demo Mode / Full Screen, dan
  // dimatikan lagi oleh Reset View.
  const preserveRef = useRef(false)
  const { target: cameraTarget, offset: cameraOffset } = layout.camera
  const target = useMemo(() => new THREE.Vector3(...cameraTarget), [cameraTarget])
  const frame = useMemo(() => () => {
    const aspect = size.width / Math.max(size.height, 1)
    // Guard: a zero-width canvas (mounted while its tab is hidden) makes
    // aspect 0, and 1.2 / 0 = Infinity poisons the camera with NaN — the
    // scene then renders only its sky colour.
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
    const offset = new THREE.Vector3(...cameraOffset)
    // Narrow (portrait) views need to back off so the whole building fits across,
    // but never past 1.35x: further out the camera sits at OrbitControls'
    // max distance (48) deep in the fog and the building washes out entirely.
    // The wider portrait lens (see useFrame) recovers the horizontal fit instead.
    offset.setLength(offset.length() * Math.min(1.35, Math.max(1, 1.2 / safeAspect)))
    const focus = target.clone().set(safeAspect < 1 ? cameraTarget[0] - 1.4 : cameraTarget[0], cameraTarget[1] + elevation, safeAspect < 1 ? 0.8 : cameraTarget[2])
    const orbit = controls.current
    // An undamped update applies and clears any momentum left from an earlier drag,
    // so it has to happen before the camera is placed, not after.
    if (orbit) { orbit.enableDamping = false; orbit.update() }
    camera.position.copy(focus).add(offset)
    camera.lookAt(focus)
    if (!orbit) return
    orbit.target.copy(focus)
    orbit.update()
    orbit.enableDamping = true
  }, [camera, size.width, size.height, target, cameraOffset, cameraTarget, elevation])

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
  { floor: 2, label: 'Kamar & Balkon', title: 'Lantai 2: bedroom, lesehan and balcony' },
  { floor: 1, label: 'Kantor', title: 'Lantai 1: office, lounge, pantry and game room' },
]
const FLOOR_KEY = 'woork.kantorFloor'
// Kunci localStorage LAMA untuk tidur (Wave 10 ke bawah) — dihapus saat
// load (Wave 11), karena tidur kini state bersama di server. Browser yang
// dulu menyimpan tidur = 1 (mis. DWI) langsung kembali sinkron tanpa
// bersih-bersih manual.
const LEGACY_SLEEP_KEY = 'woork.kantorSleep'

function useFloor(): [Floor, (floor: Floor) => void] {
  const [floor, setFloor] = useState<Floor>(() => {
    try { return localStorage.getItem(FLOOR_KEY) === '2' ? 2 : 1 } catch { return 1 }
  })
  return [floor, (next: Floor) => {
    setFloor(next)
    try { localStorage.setItem(FLOOR_KEY, String(next)) } catch { /* per-browser convenience only */ }
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
}

export default function Office3D({ stations = [], onSelectAgent, sleep = false, onToggleSleep, theme: sharedTheme, onToggleTheme, fillHeight = false }: Office3DProps) {
  const anchors = useRef(new Map<string, THREE.Object3D>())
  const labels = useRef(new Map<string, HTMLElement>())
  const view = useRef<ViewHandle>(null)
  const [panMode, setPanMode] = useState(false)
  const [keyTarget, setKeyTarget] = useState<HTMLElement | null>(null)
  const [theme, toggleTheme] = useSceneTheme(sharedTheme, onToggleTheme)
  const [floor, setFloor] = useFloor()
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
  // Demo Mode (Wave 16): tur kamera otomatis keliling 6 ruangan. State
  // lokal per browser (bukan bersama) — tiap user bisa menonton tur sendiri
  // tanpa mengganggu layar user lain. `demoRoom` untuk badge ruangan aktif.
  const [demo, setDemo] = useState(false)
  const [demoRoom, setDemoRoom] = useState<DemoRoom | null>(null)
  const toggleDemo = useCallback(() => {
    setDemo((value) => {
      if (value) setDemoRoom(null)
      return !value
    })
  }, [])
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
  const overlayVisibility = !highUi || controlsVisible ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'
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
  // One unlabeled desk per agent (hot desking); the building is sized for the crew.
  const layout = useMemo(() => createLayout(stations.length), [stations.length])
  // Demo Mode (Wave 16): enam ruangan tur dihitung dari layout yang sama.
  const demoRoomsMemo = useMemo(() => demoRooms(layout), [layout])
  // Idle agents wander between the lounge, the game room, the pantry, the street food and
  // lantai 2 (decorative only), spread so no two share a spot. Bila kantor
  // sedang tidur (prop `sleep` dari snapshot server), semua agent Idle ada
  // di tempat tidur — placement-nya sudah dihitung server di
  // GET /api/kantor/office (`station.idle`, stop 'tidur', pose 'lie').
  const idleSeats = stations.filter((station) => station.state === 'Idle' && station.room === 'Lounge').map((station) => station.seat)
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
  const meetingOrder = stations.filter((station) => station.roomPosition === 'meeting-area').map((station) => station.id)
  // Bekerja/meninjau: langsung ke meja komputernya sendiri — tidak pernah
  // mengembara. Begitu kembali Idle, idlePlacement() di atas mengambil alih lagi.
  const placement = (station: KantorStation) => station.state === 'Working' || station.state === 'Reviewing'
    ? placementFor(station, layout, Math.max(0, meetingOrder.indexOf(station.id)))
    : idlePlacement(station)?.placement ?? placementFor(station, layout, Math.max(0, meetingOrder.indexOf(station.id)))
  const floorCount = (value: Floor) => stations.filter((station) => floorOf(placement(station).position) === value).length
  // Meja menyala bila ditempati: agent Working/Reviewing selalu duduk di mejanya
  // sendiri (placementFor), walau `room` di snapshot masih 'Lounge'; station
  // Workspace lain di luar meeting-area ikut terhitung; Offline tidak pernah.
  const occupiedSeats = new Set(stations.filter((station) => station.state !== 'Offline' && (station.state === 'Working' || station.state === 'Reviewing' || (station.room === 'Workspace' && station.roomPosition !== 'meeting-area'))).map((station) => station.seat))
  // Fullscreen: `h-screen w-screen` dari state (bukan varian Tailwind
  // `fullscreen:` — varian itu tidak ter-generate di build proyek ini).
  return <div className={isFullscreen
    ? "relative isolate h-screen w-screen touch-none border-8 border-[#121a18] bg-[#15201c] shadow-[inset_0_0_0_2px_#4d6459] focus-visible:outline-2 focus-visible:outline-[#6fb6d6]"
    : fillHeight
      ? "relative isolate h-full min-h-0 touch-none border-8 border-[#121a18] bg-[#15201c] shadow-[inset_0_0_0_2px_#4d6459] focus-visible:outline-2 focus-visible:outline-[#6fb6d6]"
      : "relative isolate h-[400px] touch-none border-8 border-[#121a18] bg-[#15201c] shadow-[inset_0_0_0_2px_#4d6459] focus-visible:outline-2 focus-visible:outline-[#6fb6d6] md:aspect-[2.1/1] md:h-auto md:min-h-[420px]"} ref={(el) => { setKeyTarget(el); containerRef.current = el }} tabIndex={0} role="region" aria-label="3D office. Drag to rotate, right-drag or two fingers to pan, scroll to zoom, arrow keys pan when focused. Page Up and Page Down change floors." onPointerMove={(event) => { if (highUi && event.pointerType === 'mouse') showControls() }} onPointerDown={(event) => { if (highUi && event.pointerType === 'mouse') showControls() }} onTouchStart={(event) => { const touch = event.touches[0]; if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() } }} onTouchEnd={(event) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!highUi || !start) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
    if (Date.now() - start.time < 300 && moved < 12) showControls()
  }} onKeyDown={(event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); setFloor(event.key === 'PageUp' ? 2 : 1) }
  }}>
    <div className="absolute inset-0" onPointerDown={() => { if (demo) { setDemo(false); setDemoRoom(null) } }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [-3, 13, 16], fov: 40, near: 0.5, far: 150 }} gl={{ antialias: true }}>
        <Lighting theme={theme}/>
        <Environment night={theme === 'dark'} layout={layout} floor={floor}/>
        {floor === 1 && layout.desks.map((position, index) => <WorkDesk key={index} position={position} active={occupiedSeats.has(index + 1)} withChair/>)}
        {stations.map((station) => <Character key={station.id} station={station} placement={placement(station)} layout={layout} floor={floor} onSelect={onSelectAgent} anchor={register(anchors, `agent-${station.id}`)}/>)}
        <LabelProjector anchors={anchors} labels={labels}/>
        <Controls key={layout.deskCount} ref={view} panMode={panMode} keyTarget={keyTarget} layout={layout} elevation={floor === 2 ? FLOOR_HEIGHT : 0}/>
        <DemoTour active={demo} rooms={demoRoomsMemo} agentPositions={stations.map((station) => placement(station).position)} floor={floor} onFloorChange={setFloor} onRoomChange={setDemoRoom} view={view}/>
      </Canvas>
    </div>
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stations.map((station) => {
        const badge = kantorStateBadge(station.state)
        const busy = ['Working', 'Reviewing', 'Collaborating'].includes(station.state)
        const idle = idlePlacement(station)
        return <button key={station.id} ref={register(labels, `agent-${station.id}`)} type="button" className={`invisible absolute left-0 top-0 grid cursor-pointer justify-items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 text-[#eef9ef] will-change-transform focus-visible:outline-2 focus-visible:outline-[#f5bd6d] ${station.state === 'Offline' ? 'opacity-70' : ''}`} onClick={() => onSelectAgent(station)} aria-label={`${station.name}. ${badge.label}.${station.activity ? ` ${station.activity}.` : ''}${idle ? ` ${idle.label}.` : ''} Open station details.`}>
          {busy && station.activity && <span className="w-max max-w-[150px] whitespace-normal rounded border-2 border-[#17201e] bg-[#fff7e8] px-1.5 py-0.5 text-center text-[9px] leading-snug text-[#1b2420]">{station.activity}</span>}
          {idle && <span className={`w-max max-w-[150px] whitespace-normal rounded border-2 border-dashed bg-white/85 px-1.5 py-0.5 text-center text-[9px] italic leading-snug text-slate-600 ${idle.placement.pose === 'lie' ? 'italic' : ''}`}>{idle.placement.pose === 'lie' ? '💤 ' : ''}{idle.label}</span>}
          <span className="flex items-center gap-1"><span className="font-mono text-[10px] tracking-wide [text-shadow:0_1px_1px_rgba(0,0,0,0.8)]">{station.name}</span><span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${BADGE_CLASSES[badge.tone]}`}>{badge.label}</span></span>
        </button>
      })}
    </div>
    <div className={`absolute left-2.5 top-2.5 z-[2] flex flex-col gap-1.5 transition-opacity duration-300 ${overlayVisibility}`} role="group" aria-label="Floors" {...overlayHover}>
      {FLOORS.map((item) => <button key={item.floor} type="button" className={`grid min-w-0 grid-cols-[26px_auto] items-center gap-1.5 rounded-lg border px-2 py-2 pl-1.5 min-h-11 text-left text-[11px] text-[#f4efe6] md:min-w-[150px] md:grid-cols-[26px_auto_auto] md:gap-2 md:px-2.5 md:text-xs ${floor === item.floor ? 'border-[#f4efe6] bg-[#d9534f]' : 'border-white/20 bg-black/70 hover:bg-black/90'}`} aria-pressed={floor === item.floor} onClick={() => setFloor(item.floor)} title={`${item.title} (Page ${item.floor === 2 ? 'Up' : 'Down'})`}>
        <b className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/40 font-mono text-xs font-semibold">{item.floor}</b><span>{item.label}</span><small className="hidden justify-self-end rounded-full bg-white/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-white md:inline-block">{floorCount(item.floor)}</small>
      </button>)}
    </div>
    <div className={`absolute bottom-2.5 right-2.5 z-[2] flex flex-wrap justify-end gap-1.5 transition-opacity duration-300 md:bottom-auto md:top-2.5 md:max-w-[calc(100%-170px)] ${overlayVisibility}`} {...overlayHover}>
      <button type="button" className={sleep ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs' : 'rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90'} aria-pressed={sleep} onClick={() => { onToggleSleep?.(!sleep); if (!sleep && idleSeats.length > 0) setFloor(2) }} title="Send every idle agent to bed on lantai 2">💤 Tidur</button>
      <button type="button" className={panMode ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs' : 'rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90'} aria-pressed={panMode} onClick={() => setPanMode((value) => !value)} title="Drag moves the view instead of rotating it">✥ Geser</button>
      <button type="button" className="rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90" onClick={() => { if (demo) { setDemo(false); setDemoRoom(null) } view.current?.reset() }} title="Hentikan Demo Mode (bila aktif) dan kembali ke tampilan awal">↺ Reset view</button>
      <button type="button" className="rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90" onClick={toggleTheme} title={theme === 'dark' ? 'Ganti ke tema siang' : 'Ganti ke tema malam'}>{theme === 'dark' ? '☀️ Siang' : '🌙 Malam'}</button>
      <button type="button" className={isFullscreen ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs' : 'rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90'} aria-pressed={isFullscreen} onClick={toggleFullscreen} title={isFullscreen ? 'Keluar dari layar penuh (Esc)' : 'Tampilkan kantor dalam layar penuh'}>⛶ Fullscreen</button>
      <button type="button" className={demo ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs' : 'rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90'} aria-pressed={demo} onClick={toggleDemo} title={demo ? 'Hentikan tur kamera otomatis' : 'Jalankan tur kamera otomatis keliling 6 ruangan kantor'}>🎬 Demo</button>
      <button type="button" className={highUi ? 'rounded-md border border-[#f4efe6] bg-[#d9534f] px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs' : 'rounded-md border border-white/20 bg-black/70 px-2.5 py-2 min-h-11 text-[11px] text-[#f4efe6] md:px-3 md:text-xs hover:bg-black/90'} aria-pressed={highUi} onClick={() => setHighUi(!highUi)} title={highUi ? 'Tampilkan tombol kontrol seperti biasa' : 'Sembunyikan tombol kontrol otomatis setelah 3 detik tanpa aktivitas pointer (High UI Mode)'}>👁 UI</button>
    </div>
    {demo && <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-[2] rounded-full border border-[#f4efe6] bg-[#d9534f] px-3 py-1.5 text-[11px] font-semibold text-[#f4efe6] md:text-xs" role="status">🎬 DEMO MODE ACTIVE{demoRoom ? ` — ${demoRoom.label}` : ''}</div>}
    {highUi && !controlsVisible && <div className="pointer-events-none absolute left-1/2 top-2.5 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-[#f4efe6] md:text-xs">Gerakkan mouse / ketuk layar untuk menampilkan kontrol</div>}
  </div>
}
