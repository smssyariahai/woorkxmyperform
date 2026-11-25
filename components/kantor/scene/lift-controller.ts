/**
 * Lift Controller (lift-only 2026-11-23) — SATU-SATUNYA sumber kebenaran
 * lift Kantor Virtual. Singleton `liftController`, digerakkan
 * `update(delta)` tiap frame dari <LiftUpdater/> di Office3D (SATU tempat
 * — jangan panggil update() dari tempat lain).
 *
 * Model lift ASLI (bukan teleport / glide):
 * - SATU kabin, SATU agent per trip (LIFT_CAPACITY = 1), antre FIFO global
 *   (siapa duluan antre, dia duluan dilayani — tanpa rebut-merebut).
 * - Kecepatan kabin LIFT_SPEED_MPS = 1,0 m/dtk; pintu buka/tutup masing-
 *   masing LIFT_DOOR_TIME_S = 1,0 dtk; jeda naik (boarding) 0,5 dtk
 *   setelah agent masuk sebelum pintu menutup.
 * - Mesin state per trip: idle -> toCaller (kabin ke lantai pemanggil,
 *   dilewati bila kabin sudah di sana) -> doorsOpening (1 dtk) ->
 *   boarding (tunggu agent terdepan masuk + notifyBoarded, lalu +0,5 dtk)
 *   -> doorsClosing (1 dtk) -> travelling (1,0 m/dtk) -> doorsOpening
 *   (1 dtk) -> alighting (tunggu notifyAlighted) -> doorsClosing (1 dtk)
 *   -> idle.
 * - Kabin TIDAK PERNAH berisi 2 agent: trip berikutnya baru dimulai
 *   setelah trip sebelumnya selesai (pintu tertutup di lantai tujuan).
 * - Request ulang saat menunggu = ganti tujuan (posisi antre TETAP);
 *   request ulang saat riding = selesaikan dulu trip ini sampai
 *   alighting, baru antre lagi ke tujuan baru (dari lantai tempat turun).
 * - Slot berdiri dihitung PER LANTAI (queuePosition): posisi di antara
 *   penunggu di lantai asal yang sama — dua agent di lantai berbeda
 *   boleh sama-sama di slot 0 lantainya masing-masing. Slot dijepit ke
 *   slot terakhir bila penunggu melebihi LIFT_QUEUE_SLOTS.
 * - Ride KAMERA (klik pintu lift) antre di belakang agent (kamera tidak
 *   memakan kapasitas — ia menumpang trip kabin), tidak pernah merebut
 *   kabin dari agent di tengah trip; naik/turunnya instan (tidak menunggu
 *   notifyBoarded/notifyAlighted). Bila animator dilepas (unmount),
 *   cancelCameraRide() membatalkan trip kamera yang belum jalan.
 * - Pengaman deadlock: agent yang tidak kunjung naik/turun (>15 dtk)
 *   dianggap batal/turun — pintu menutup dan trip berikutnya jalan.
 */

import { FLOOR_HEIGHT, LIFT_CABIN_Z, LIFT_DOOR_TIME_S, LIFT_SPEED_MPS, type Floor, type Vec3 } from './office3d-layout'

export type LiftState = 'idle' | 'toCaller' | 'doorsOpening' | 'boarding' | 'doorsClosing' | 'travelling' | 'alighting'

export interface LiftSnapshot {
  state: LiftState
  cabinY: number
  cabinFloor: Floor
  doorOpen: number
  servingFloor: Floor | null
  queueLength: number
  /** Trip kamera sedang berjalan (tambahan untuk LiftRideAnimator — bukan
   *  bagian dari antrean agent; kamera tidak memakan kapasitas). */
  cameraActive: boolean
}

/** Jeda setelah agent masuk sebelum pintu menutup (pintu tidak langsung
 *  menjepit — seperti lift asli). */
const BOARD_DWELL_S = 0.5
/** Agent yang tidak kunjung naik/turun dianggap batal — trip tidak boleh
 *  macet selamanya karena satu agent nyangkut. */
const NO_SHOW_S = 15

interface AgentJob { agentId: string; fromFloor: Floor; toFloor: Floor }
interface CameraJob { fromFloor: Floor; toFloor: Floor }
type ActiveJob = ({ kind: 'agent'; agentId: string } | { kind: 'camera' }) & { fromFloor: Floor; toFloor: Floor }

const floorY = (floor: Floor): number => (floor - 1) * FLOOR_HEIGHT
const CABIN_X = 9.0

export class LiftController {
  private state: LiftState = 'idle'
  private cabinY = 0
  private cabinFloor: Floor = 1
  private doorOpen = 0
  private queue: AgentJob[] = []
  private cameraQueue: CameraJob[] = []
  private active: ActiveJob | null = null
  /** 'pickup' = pintu dibuka untuk naik; 'dropoff' = pintu dibuka untuk turun. */
  private doorPhase: 'pickup' | 'dropoff' = 'pickup'
  /** Tujuan doorsClosing yang sedang berjalan. */
  private closingPurpose: 'travel' | 'done' | 'abort' = 'travel'
  private timer = 0
  private targetY = 0
  private boarded = false
  private alighted = false
  private waitS = 0
  /** Tujuan baru yang diminta saat agent sedang riding — dieksekusi
   *  SETELAH alighting (dari lantai tempat turun). */
  private pendingAfterRide = new Map<string, Floor>()

  getSnapshot(): LiftSnapshot {
    return {
      state: this.state,
      cabinY: this.cabinY,
      cabinFloor: this.cabinFloor,
      doorOpen: this.doorOpen,
      servingFloor: this.active ? this.active.toFloor : null,
      queueLength: this.queue.length,
      cameraActive: this.active !== null && this.active.kind === 'camera',
    }
  }

  requestRide(agentId: string, fromFloor: Floor, toFloor: Floor): void {
    if (fromFloor === toFloor) return
    // Sedang riding: selesaikan dulu trip ini, baru antre lagi ke tujuan
    // baru (dari lantai tempat turun — fromFloor yang diberikan diabaikan).
    if (this.active !== null && this.active.kind === 'agent' && this.active.agentId === agentId) {
      this.pendingAfterRide.set(agentId, toFloor)
      return
    }
    const queued = this.queue.find((job) => job.agentId === agentId)
    if (queued) {
      // Menunggu: ganti tujuan saja — posisi antre TETAP (FIFO terjaga).
      queued.toFloor = toFloor
      return
    }
    this.queue.push({ agentId, fromFloor, toFloor })
  }

  cancelRide(agentId: string): void {
    this.pendingAfterRide.delete(agentId)
    const index = this.queue.findIndex((job) => job.agentId === agentId)
    if (index >= 0) this.queue.splice(index, 1)
    if (this.active === null || this.active.kind !== 'agent' || this.active.agentId !== agentId) return
    if (this.boarded && !this.alighted) return // sedang naik — harus selesaikan trip
    if (this.state === 'toCaller') {
      this.active = null
      this.state = 'idle'
      return
    }
    if (this.state === 'doorsOpening' || this.state === 'boarding') {
      this.state = 'doorsClosing'
      this.closingPurpose = 'abort'
      // Tutup dari posisi pintu SAAT INI (bukan dari terbuka penuh —
      // kalau tidak, pintu melompat).
      this.timer = LIFT_DOOR_TIME_S * this.doorOpen
    }
    // travelling / alighting / doorsClosing: biarkan selesai sendiri.
  }

  /** Posisi antre DI LANTAI ASAL (0 = terdepan, di slot 0). -1 bila tidak
   *  antre dan bukan trip aktif. Agent di lantai berbeda dihitung
   *  terpisah — slot berdiri memang per lantai. */
  queuePosition(agentId: string): number {
    const activeAgent = this.active !== null && this.active.kind === 'agent' && this.active.agentId === agentId
    const queuedIndex = this.queue.findIndex((job) => job.agentId === agentId)
    if (!activeAgent && queuedIndex < 0) return -1
    if (activeAgent) return 0
    const entry = this.queue[queuedIndex]
    let position = 0
    if (this.active !== null && this.active.kind === 'agent' && this.active.fromFloor === entry.fromFloor) position += 1
    for (let i = 0; i < queuedIndex; i += 1) {
      if (this.queue[i].fromFloor === entry.fromFloor) position += 1
    }
    return position
  }

  boardReady(agentId: string): boolean {
    return this.active !== null
      && this.active.kind === 'agent'
      && this.active.agentId === agentId
      && this.state === 'boarding'
      && this.doorOpen >= 0.999
  }

  notifyBoarded(agentId: string): void {
    if (this.active !== null && this.active.kind === 'agent' && this.active.agentId === agentId && this.state === 'boarding') {
      this.boarded = true
      this.waitS = 0
    }
  }

  notifyAlighted(agentId: string): void {
    if (this.active !== null && this.active.kind === 'agent' && this.active.agentId === agentId && this.state === 'alighting') {
      this.alighted = true
      this.waitS = 0
    }
  }

  /** Posisi agent yang sedang naik (pusat kabin, ikut cabinY) — untuk
   *  Character saat riding. null bila agent tidak sedang di dalam kabin. */
  riderPosition(agentId: string): Vec3 | null {
    if (this.active === null || this.active.kind !== 'agent' || this.active.agentId !== agentId) return null
    if (!this.boarded || this.alighted) return null
    return [CABIN_X, this.cabinY, LIFT_CABIN_Z]
  }

  requestCameraRide(fromFloor: Floor, toFloor: Floor): void {
    if (fromFloor === toFloor) return
    // Kamera antre di belakang agent; satu trip kamera yang menunggu cukup
    // (klik baru mengganti tujuan trip yang menunggu itu).
    if (this.cameraQueue.length > 0) this.cameraQueue[0] = { fromFloor, toFloor }
    else this.cameraQueue.push({ fromFloor, toFloor })
  }

  cancelCameraRide(): void {
    this.cameraQueue.length = 0
    if (this.active === null || this.active.kind !== 'camera') return
    if (this.state === 'toCaller') {
      this.active = null
      this.state = 'idle'
      return
    }
    if (this.state === 'doorsOpening' || this.state === 'boarding') {
      this.state = 'doorsClosing'
      this.closingPurpose = 'abort'
      // Tutup dari posisi pintu SAAT INI (bukan dari terbuka penuh).
      this.timer = LIFT_DOOR_TIME_S * this.doorOpen
    }
    // travelling / alighting: biarkan selesai (kabin tidak boleh
    // berhenti di tengah shaft).
  }

  update(delta: number): void {
    const dt = Math.max(0, Math.min(delta, 0.25))
    switch (this.state) {
      case 'idle': {
        const nextAgent = this.queue[0]
        const nextCamera = this.cameraQueue[0]
        // Agent selalu didahulukan; kamera jalan hanya bila tidak ada
        // agent yang menunggu (kamera antre di belakang agent).
        if (nextAgent) {
          this.queue.shift()
          this.startTrip({ kind: 'agent', agentId: nextAgent.agentId, fromFloor: nextAgent.fromFloor, toFloor: nextAgent.toFloor })
        } else if (nextCamera) {
          this.cameraQueue.shift()
          this.startTrip({ kind: 'camera', fromFloor: nextCamera.fromFloor, toFloor: nextCamera.toFloor })
        }
        return
      }
      case 'toCaller': {
        this.cabinY = this.moveToward(this.cabinY, this.targetY, dt)
        if (this.cabinY === this.targetY) {
          this.cabinFloor = this.active!.fromFloor
          this.state = 'doorsOpening'
          this.doorPhase = 'pickup'
          this.timer = LIFT_DOOR_TIME_S
        }
        return
      }
      case 'doorsOpening': {
        this.timer -= dt
        this.doorOpen = Math.min(1, Math.max(0, 1 - this.timer / LIFT_DOOR_TIME_S))
        if (this.timer > 0) return
        this.doorOpen = 1
        this.waitS = 0
        if (this.doorPhase === 'pickup') {
          this.state = 'boarding'
          // Jeda 0,5 dtk setelah masuk — dihitung sejak boarded, bukan
          // sejak pintu terbuka (timer di-set di sini, dikurangi di bawah
          // hanya bila boarded sudah true).
          this.timer = BOARD_DWELL_S
          // Kamera "naik" instan — tidak menunggu siapa pun.
          if (this.active !== null && this.active.kind === 'camera') this.boarded = true
        } else {
          this.state = 'alighting'
          if (this.active !== null && this.active.kind === 'camera') this.alighted = true
        }
        return
      }
      case 'boarding': {
        if (!this.boarded) {
          this.waitS += dt
          if (this.waitS > NO_SHOW_S) {
            // Agent tak kunjung masuk — batalkan tripnya, tutup pintu.
            if (this.active !== null && this.active.kind === 'agent') this.pendingAfterRide.delete(this.active.agentId)
            this.state = 'doorsClosing'
            this.closingPurpose = 'abort'
            this.timer = LIFT_DOOR_TIME_S
          }
          return
        }
        // Sudah masuk: jeda 0,5 dtk sebelum pintu menutup.
        this.timer -= dt
        if (this.timer > 0) return
        this.state = 'doorsClosing'
        this.closingPurpose = 'travel'
        this.timer = LIFT_DOOR_TIME_S
        return
      }
      case 'doorsClosing': {
        this.timer -= dt
        this.doorOpen = Math.min(1, Math.max(0, this.timer / LIFT_DOOR_TIME_S))
        if (this.timer > 0) return
        this.doorOpen = 0
        if (this.closingPurpose === 'travel') {
          this.state = 'travelling'
          this.targetY = floorY(this.active!.toFloor)
        } else if (this.closingPurpose === 'done') {
          this.finishTrip()
        } else {
          this.active = null
          this.state = 'idle'
        }
        return
      }
      case 'travelling': {
        this.cabinY = this.moveToward(this.cabinY, this.targetY, dt)
        if (this.cabinY === this.targetY) {
          this.cabinFloor = this.active!.toFloor
          this.state = 'doorsOpening'
          this.doorPhase = 'dropoff'
          this.timer = LIFT_DOOR_TIME_S
        }
        return
      }
      case 'alighting': {
        if (!this.alighted) {
          this.waitS += dt
          if (this.waitS > NO_SHOW_S) this.alighted = true // anggap sudah turun
          else return
        }
        this.state = 'doorsClosing'
        this.closingPurpose = 'done'
        this.timer = LIFT_DOOR_TIME_S
        return
      }
    }
  }

  private startTrip(job: ActiveJob): void {
    this.active = job
    this.boarded = false
    this.alighted = false
    this.waitS = 0
    if (this.cabinFloor === job.fromFloor && this.cabinY === floorY(job.fromFloor)) {
      this.state = 'doorsOpening'
      this.doorPhase = 'pickup'
      this.timer = LIFT_DOOR_TIME_S
    } else {
      this.state = 'toCaller'
      this.targetY = floorY(job.fromFloor)
    }
  }

  private finishTrip(): void {
    const done = this.active
    this.active = null
    this.state = 'idle'
    // Request yang masuk saat riding: antre lagi dari lantai turun.
    if (done !== null && done.kind === 'agent') {
      const next = this.pendingAfterRide.get(done.agentId)
      if (next !== undefined) {
        this.pendingAfterRide.delete(done.agentId)
        if (next !== done.toFloor) this.queue.push({ agentId: done.agentId, fromFloor: done.toFloor, toFloor: next })
      }
    }
  }

  /** Gerak kabin 1,0 m/dtk — tidak pernah lebih cepat, tidak pernah
   *  teleport (tujuan dijepit tepat, tanpa overshoot). */
  private moveToward(current: number, target: number, dt: number): number {
    const step = LIFT_SPEED_MPS * dt
    if (Math.abs(target - current) <= step) return target
    return current + Math.sign(target - current) * step
  }
}

/** Singleton — SATU kabin, SATU antrean, untuk seluruh scene. */
export const liftController = new LiftController()
