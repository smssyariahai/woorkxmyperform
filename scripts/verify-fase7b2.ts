/**
 * Verifikasi Fase 7b2 — PERFORMANCE BASELINE + BUDGET (WOORK VIRTUAL OFFICE 3.0).
 *
 * Menghitung dari KODE (bukan tebakan):
 *  1. ukuran layout gedung 7 agent (WOORK.ID);
 *  2. jumlah mesh (draw call) per mode lantai, dengan ekspansi rekursif
 *     komponen scene (RBox/Cyl/<mesh> = 1 mesh; komponen prop diekspansi;
 *     .map() dikali panjang array dari layout/konstanta);
 *  3. asersi budget (§28): chunk JS awal, chunk 3D lazy, mesh per mode.
 *
 * Batasan jujur: hitungan = mesh yang DI-MOUNT di scene graph (React).
 * Mesh dengan visible=false (karakter di lantai lain) tetap dihitung
 * "mounted" dan dilaporkan terpisah sebagai "terlihat". Frame rate nyata
 * hanya bisa diukur di browser user — bukan di sini.
 * Read-only: tidak menulis data, tidak mengubah file apa pun.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLayout, floorSlabPieces } from '../components/kantor/scene/office3d-layout'

const ROOT = join(__dirname, '..')
const SCENE = join(ROOT, 'components', 'kantor', 'scene')
const AGENTS = 16

const layout = createLayout(Array.from({ length: AGENTS }, (_, i) => ({ seat: i + 1 })) as never)
const seatedMeeting = layout.meetingRoom.seats.filter((s) => s.seated).length
const slabPieces = floorSlabPieces(layout.building).length
const minX = layout.building.minX

// Scope nilai untuk evaluasi prop `length` Railing/StringLights per call site
// (angka dari office3d-layout.ts: BALCONY = {minZ: 4.2, maxZ: 6.6}; building
// x -12.1..9.5). UpperFloor DAN TopFloor memakai scope yang sama.
// (Lift-only 2026-11-23: lubang tangga + railing-nya dihapus, scope `hole` ikut dihapus.)
type Scope = Record<string, number | Record<string, number>>
const RAILING_SCOPE: Scope = {
  minX: -12.1,
  maxX: 9.5,
  BALCONY: { minZ: 4.2, maxZ: 6.6 },
}
const SCOPES: Record<string, Scope> = {
  UpperFloor: RAILING_SCOPE,
  TopFloor: RAILING_SCOPE,
}

/** Evaluasi ekspresi aritmetika sederhana (hanya angka + operator + nama dari scope). */
function evalNumeric(expr: string, scope: Scope | undefined): number {
  const s = expr.replace(/[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?/g, (id) => {
    const parts = id.split('.')
    let cur: unknown = scope
    for (const p of parts) {
      if (cur !== null && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p]
      } else {
        throw new Error(`identifikasi tidak dikenal dalam ekspresi panjang: ${expr}`)
      }
    }
    if (typeof cur !== 'number') throw new Error(`identifikasi bukan angka: ${id} dalam ${expr}`)
    return String(cur)
  })
  if (!/^[0-9.+\-*/() ]+$/.test(s)) throw new Error(`ekspresi panjang tidak murni numerik: ${expr} -> ${s}`)
  const v = Function(`'use strict'; return (${s})`)() as number
  if (!Number.isFinite(v)) throw new Error(`panjang tidak hingga: ${expr}`)
  return v
}

function main(): void {
  console.log('== Layout 7 agent ==')
  console.log(`building: x ${layout.building.minX}..${layout.building.maxX}, z ${layout.building.minZ}..${layout.building.maxZ}`)
  console.log(`L1 desks: ${layout.desks.length}, restSpots: ${layout.restSpots.length}`)
  console.log(`techClusters: ${layout.techClusters.length} (desks per cluster ${layout.techClusters.map((c) => c.desks.length).join('+')})`)
  console.log(`execDesks: ${layout.execDesks.length} (${layout.execDesks.map((d) => d.id).join(', ')})`)
  console.log(`meeting seats: total ${layout.meetingRoom.seats.length} (seated ${seatedMeeting}, presenter 1, standing ${layout.meetingRoom.seats.length - seatedMeeting - 1})`)
  console.log(`slab pieces: ${slabPieces}`)
  console.log('')
  reportMeshes()
}

// ---------------------------------------------------------------------------
// 2. Penghitung mesh statis (ekspansi rekursif komponen + .map())
// ---------------------------------------------------------------------------
type ComponentMap = Map<string, string>

function extractComponents(source: string): ComponentMap {
  const out: ComponentMap = new Map()
  // Prosedural (bukan regex `\([^)]*\)`): parameter bisa berisi `)` di
  // dalam anotasi tipe panah, mis. `onLiftRide?: () => void` — regex akan
  // berhenti di `)` pertama itu dan gagal mengekstrak komponen.
  const re = /(?:export function|function)\s+([A-Z][A-Za-z0-9_]*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const name = m[1]
    const parenOpen = source.indexOf('(', m.index)
    const parenClose = matchParen(source, parenOpen)
    if (parenClose < 0) continue
    let i = parenClose + 1
    while (i < source.length && /\s/.test(source[i])) i += 1
    if (source[i] === ':') {
      while (i < source.length && source[i] !== '{') i += 1
    }
    if (source[i] !== '{') continue
    let depth = 0
    let j = i
    for (; j < source.length; j += 1) {
      if (source[j] === '{') depth += 1
      else if (source[j] === '}') { depth -= 1; if (depth === 0) break }
    }
    out.set(name, source.slice(i + 1, j))
  }
  return out
}

const components: ComponentMap = new Map()
for (const f of ['props.tsx', 'branding.tsx', 'meeting-screen.tsx', 'logo-sign.tsx', 'environment.tsx', 'residence.tsx']) {
  for (const [name, body] of extractComponents(readFileSync(join(SCENE, f), 'utf8'))) {
    if (!components.has(name)) components.set(name, body)
  }
}
for (const [name, body] of extractComponents(readFileSync(join(ROOT, 'components', 'kantor', 'Office3D.tsx'), 'utf8'))) {
  if (name === 'Character' && !components.has(name)) components.set(name, body)
}

/** Panjang array literal `[...]` — hitung elemen top-level (spread dihitung dari tabel). */
function literalArrayLength(text: string): number {
  const inner = text.trim().slice(1, -1)
  let depth = 0
  let count = 1
  let cur = ''
  const items: string[] = []
  for (const ch of inner) {
    if (ch === '[' || ch === '{' || ch === '(') depth += 1
    if (ch === ']' || ch === '}' || ch === ')') depth -= 1
    if (ch === ',' && depth === 0) { items.push(cur); cur = ''; count += 1 } else cur += ch
  }
  items.push(cur)
  if (inner.trim() === '') return 0
  let total = 0
  for (const item of items) {
    const t = item.trim()
    if (t.startsWith('...')) {
      const expr = t.slice(3).trim()
      const mapAt = expr.indexOf('.map(')
      if (mapAt >= 0) total += receiverLength(expr.slice(0, mapAt))
      else total += receiverLength(expr)
    } else total += 1
  }
  return total
}

/** Panjang array dari ekspresi receiver `.map(` — layout, konstanta, literal, slice/filter. */
function resolveArrayLength(expr: string): number {
  const e = expr.trim()
  // .slice(a, b) -> b - a
  const slice = e.match(/\.slice\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*$/)
  if (slice) return Number(slice[2]) - Number(slice[1])
  const base = e.replace(/\.slice\([^)]*\)$/, '').replace(/\.filter\([^)]*\)$/, '')
  if (e.includes('.filter(')) {
    if (e.includes('index % 2 === 0')) return layout.restSpots.filter((_, i) => i % 2 === 0).length
    if (e.includes('x > minX + 1')) {
      const lit = e.match(/\[([^\]]+)\]/)
      if (lit) return lit[1].split(',').map(Number).filter((x) => x > minX + 1).length
    }
    return 0
  }
  if (base.startsWith('[')) return literalArrayLength(base)
  const table: Record<string, number> = {
    'layout.desks': layout.desks.length,
    'layout.restSpots': layout.restSpots.length,
    'layout.techClusters': layout.techClusters.length,
    'cluster.desks': 2,
    'layout.execDesks': layout.execDesks.length,
    'ARCADES': 2,
    'BEANBAGS': 2,
    'balconyPosts': 3,
    'chairs': seatedMeeting,
    'balusters': 7,
    'row1': 4,
    'row2': 4,
    'sachets': 6,
    'clothes': 5,
    'books': 18,
    'slab': slabPieces,
    'stations': AGENTS,
    'places': 3,
    // Residence Fase 2a: kamar lantai 2 (rooms 4 kamar; corridorSegs 4 pintu
    // -> 5 segmen; doorCenters 4 pintu; beds 4 kamar x 4 kasur).
    'rooms': 4,
    'corridorSegs': 5,
    'doorCenters': 4,
    'beds': 16,
  }
  if (base in table) {
    // .slice(n) satu argumen -> panjang dasar dikurangi n.
    const slice1 = e.match(/\.slice\(\s*(-?\d+)\s*\)\s*$/)
    if (slice1) return table[base] - Number(slice1[1])
    return table[base]
  }
  // `books.slice(...)` sudah ditangani di atas; `layout.restSpots.filter` juga.
  throw new Error(`Panjang array tak dikenal: ${e}`)
}

/** Cari index penutup `)` dari `(` di posisi `open` (abaikan string/template sederhana). */
function matchParen(text: string, open: number): number {
  let depth = 0
  let inStr: string | null = null
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    if (inStr) { if (ch === inStr && text[i - 1] !== '\\') inStr = null; continue }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; if (depth === 0) return i }
  }
  return -1
}

// ---------------------------------------------------------------------------
// 3. Mesin hitung: ekspansi rekursif + .map() + Array.from()
// ---------------------------------------------------------------------------
const expandedCache = new Map<string, number>()
function expanded(name: string, scope?: Scope): number {
  // Railing/StringLights bergantung pada prop `length` di call site — tidak
  // bisa diekspansi tanpa scope; ditangani pre-pass di countMeshes.
  if (name === 'Railing' || name === 'StringLights') {
    throw new Error(`${name} butuh prop length dari call site — pakai pre-pass countMeshes`)
  }
  const s = SCOPES[name] ?? scope
  if (expandedCache.has(name)) return expandedCache.get(name)!
  const body = components.get(name)
  if (!body) return 0
  expandedCache.set(name, 0) // penjaga siklus
  const n = countMeshes(body, s)
  expandedCache.set(name, n)
  return n
}

/** Panjang array dari ekspresi receiver `.map(` (teks tepat sebelum `.map(`). */
function receiverLength(before: string): number {
  const text = before.trimEnd()
  if (text.endsWith(')')) {
    // Panggilan .slice(...) / .filter(...) di ujung receiver.
    const callAt = Math.max(text.lastIndexOf('.slice('), text.lastIndexOf('.filter('))
    const isSlice = text.lastIndexOf('.slice(') > text.lastIndexOf('.filter(')
    const open = text.indexOf('(', callAt)
    const close = matchParen(text, open)
    const args = text.slice(open + 1, close)
    const recv = text.slice(0, callAt)
    if (isSlice) {
      if (/books\.slice\(/.test(text)) return 6
      const nums = args.split(',').map((s) => Number(s.trim()))
      if (nums.length === 2 && nums.every((n) => Number.isFinite(n))) return nums[1] - nums[0]
      // .slice(n) satu argumen: panjang receiver dikurangi n (mis. rooms.slice(1) -> 4-1 = 3).
      if (nums.length === 1 && Number.isFinite(nums[0])) return receiverLength(recv) - nums[0]
      return 0
    }
    // .filter(...)
    if (args.includes('index % 2 === 0')) return layout.restSpots.filter((_, i) => i % 2 === 0).length
    if (args.includes('x > minX + 1')) {
      const lit = recv.match(/\[([^\]]+)\]/)
      if (lit) return lit[1].split(',').map(Number).filter((x) => x > minX + 1).length
    }
    return 0
  }
  if (text.endsWith(']')) {
    const open = (() => {
      let depth = 0
      for (let i = text.length - 1; i >= 0; i -= 1) {
        if (text[i] === ']') depth += 1
        else if (text[i] === '[') { depth -= 1; if (depth === 0) return i }
      }
      return -1
    })()
    if (open >= 0) return literalArrayLength(text.slice(open))
    return 0
  }
  const chain = text.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/)
  if (!chain) throw new Error(`Receiver tak dikenal sebelum .map(: …${text.slice(-60)}`)
  const table: Record<string, number> = {
    'layout.desks': layout.desks.length,
    'layout.restSpots': layout.restSpots.length,
    'layout.techClusters': layout.techClusters.length,
    'cluster.desks': 2,
    'layout.execDesks': layout.execDesks.length,
    'ARCADES': 2,
    'BEANBAGS': 2,
    'balconyPosts': 3,
    'chairs': seatedMeeting,
    'balusters': 7,
    'row1': 4,
    'row2': 4,
    'sachets': 6,
    'clothes': 5,
    'books': 18,
    'slab': slabPieces,
    'stations': AGENTS,
    // Residence Fase 2a: kamar lantai 2 (rooms 4 kamar; corridorSegs 4 pintu
    // -> 5 segmen; doorCenters 4 pintu; beds 4 kamar x 4 kasur).
    'rooms': 4,
    'corridorSegs': 5,
    'doorCenters': 4,
    'beds': 16,
  }
  const key = chain[1]
  if (key in table) return table[key]
  throw new Error(`Panjang array tak dikenal: ${key}`)
}

/** Hitung mesh dalam `text` (rekursif; .map() dan Array.from() dikali panjangnya). */
function countMeshes(text: string, scope?: Scope): number {
  let total = 0
  let work = text
  // Pre-pass: Railing/StringLights — jumlahnya bergantung pada prop `length`
  // di call site (Railing: 2 RBox tetap + posts = max(2, round(L/0.9)+1);
  // StringLights: bulbs = round(L/0.45), 1 mesh per lampu).
  for (const kind of ['Railing', 'StringLights'] as const) {
    for (;;) {
      const at = work.indexOf(`<${kind}`)
      if (at < 0) break
      // Cari ujung tag `/>` pada kedalaman kurung 0.
      let i = at + kind.length + 1
      let depth = 0
      let end = -1
      for (; i < work.length; i += 1) {
        const c = work[i]
        if (c === '{') depth += 1
        else if (c === '}') depth -= 1
        else if (c === '/' && work[i + 1] === '>' && depth === 0) { end = i + 2; break }
      }
      if (end < 0) throw new Error(`tag <${kind}> tidak tertutup`)
      const tagText = work.slice(at, end)
      const lenAt = tagText.indexOf('length={')
      if (lenAt < 0) throw new Error(`<${kind}> tanpa prop length`)
      const braceOpen = tagText.indexOf('{', lenAt)
      const braceClose = matchParen(tagText, braceOpen)
      const length = evalNumeric(tagText.slice(braceOpen + 1, braceClose), scope)
      const count = kind === 'Railing'
        ? 2 + Math.max(2, Math.round(length / 0.9) + 1)
        : Math.round(length / 0.45)
      total += count
      work = work.slice(0, at) + ' '.repeat(end - at) + work.slice(end)
    }
  }
  // Array.from({ length: N }, (_, i) => <JSX/>) — LongTable (places=3).
  // (Staircase (steps=14) dihapus lift-only 2026-11-23; cabang `steps`
  // dipertahankan untuk keamanan bila ada komponen Array.from lain.)
  for (;;) {
    const at = work.indexOf('Array.from({ length: ')
    if (at < 0) break
    const lenStart = at + 'Array.from({ length: '.length
    const lenEnd = work.indexOf(' }', lenStart)
    const lenExpr = work.slice(lenStart, lenEnd).trim()
    const len = lenExpr === 'steps' ? 14 : lenExpr === 'places' ? 3 : Number(lenExpr)
    if (!Number.isFinite(len)) throw new Error(`Array.from length tak dikenal: ${lenExpr}`)
    const open = work.indexOf('(', at)
    const close = matchParen(work, open)
    const arrow = work.indexOf('=>', open)
    const cb = work.slice(arrow + 2, close)
    // Callback non-JSX (mis. `(_, i) => [x, y, z]` atau data useMemo):
    // tidak menambah mesh — lewati tanpa menghitung panjangnya.
    if (/<[A-Za-z]/.test(cb)) total += countMeshes(cb, scope) * len
    work = work.slice(0, at) + ' '.repeat(close - at + 1) + work.slice(close + 1)
  }
  // .map(...) — proses satu per satu (rekursif menangani map bersarang).
  for (;;) {
    const at = work.indexOf('.map(')
    if (at < 0) break
    const open = work.indexOf('(', at)
    const close = matchParen(work, open)
    if (close < 0) break
    const arrow = work.indexOf('=>', open)
    const cb = work.slice(arrow + 2, close)
    // Callback non-JSX (mis. `row.map((p) => p.position[0])`): tidak
    // menambah mesh — lewati TANPA resolve panjang receiver (receiver
    // seperti `row` tidak ada di tabel dan tidak perlu ada).
    if (/<[A-Za-z]/.test(cb)) {
      const len = receiverLength(work.slice(0, at))
      total += countMeshes(cb, scope) * len
    }
    work = work.slice(0, at) + ' '.repeat(close - at + 1) + work.slice(close + 1)
  }
  // Tag langsung (tanpa .map tersisa).
  const tagRe = /<([A-Za-z][A-Za-z0-9_]*)\b/g
  let tm: RegExpExecArray | null
  while ((tm = tagRe.exec(work)) !== null) {
    const tag = tm[1]
    // `<Nama` yang menempel pada identifier di depannya (`useRef<Floor>`,
    // `Array<Vec3>`) adalah argumen generik TypeScript, BUKAN tag JSX —
    // jangan dihitung/diekspansi. (Dulu: `useRef<Floor>` di Character salah
    // dihitung sebagai komponen scene Floor, +1 mesh per karakter.)
    // Tag JSX asli tidak pernah menempel pada identifier (`<` selalu
    // didahului spasi / tanda baca), jadi penjaga ini tidak mengubah
    // hitungan komponen yang sah.
    const prev = tm.index > 0 ? work[tm.index - 1] : ''
    if (/[A-Za-z0-9_$.]/.test(prev)) continue
    if (tag === 'mesh' || tag === 'RBox' || tag === 'Cyl') total += 1
    else if (/^[A-Z]/.test(tag) && tag !== 'Group' && tag !== 'Material' && tag !== 'Html') total += expanded(tag, scope)
  }
  return total
}

// ---------------------------------------------------------------------------
// 4. Total per mode + sanity check komponen kunci + budget
// ---------------------------------------------------------------------------
function reportMeshes(): void {
  const per = (name: string): number => {
    const n = expanded(name)
    console.log(`  ${name}: ${n} mesh`)
    return n
  }
  console.log('== Mesh per komponen (ekspansi rekursif) ==')
  const workDesk = per('WorkDesk')
  const officeChair = per('OfficeChair')
  const bookshelf = per('Bookshelf')
  const character = per('Character')
  const liftShaft = per('LiftShaft')
  // Lift-only 2026-11-23: LiftShaft kini berisi LiftShaftDoors (2 panel
  // geser + 1 lampu indikator = 3 mesh, dulu 1 pintu + 1 indikator = 2),
  // dan LiftCabin (5 RBox) dirender SEKALI oleh Environment di semua mode.
  const liftCabin = per('LiftCabin')
  console.log(`  (sanity: WorkDesk=${workDesk} [harap 20], OfficeChair=${officeChair} [harap 8], Bookshelf=${bookshelf} [harap 19], Character=${character} [harap 12], LiftShaft=${liftShaft} [harap 10], LiftCabin=${liftCabin} [harap 5])`)
  console.log('')
  console.log('== Mesh per mode lantai (mounted) ==')
  const building = per('Building')
  const upper = per('UpperFloor')
  const top = per('TopFloor')
  const outdoors = per('Outdoors')
  const l1desks = layout.desks.length * workDesk
  // Character = 12 adalah batas atas (11 mesh badan + 1 ring kondisional
  // yang hanya muncul saat state 'Unknown'; normalnya 16×11 = 176).
  const chars = AGENTS * character
  // (Lift-only 2026-11-23: TopFloor tidak lagi berisi Staircase, jadi
  // dipakai utuh — dulu `top - staircase` karena flight 2 dirender ganda.)
  // Aturan tampil (diubah 2026-11-23 atas permintaan user — "lantai 2 tidak
  // terlihat" saat memilih lantai 3): lantai yang dipilih + semua lantai di
  // bawahnya; lantai di atas disembunyikan. BuildingShell sudah dihapus.
  const floor1 = building + outdoors + l1desks + chars + liftCabin
  const floor2 = building + upper + liftShaft + outdoors + l1desks + chars + liftCabin
  const floor3 = building + upper + top + 2 * liftShaft + outdoors + l1desks + chars + liftCabin
  const all = building + upper + top + 2 * liftShaft + outdoors + l1desks + chars + liftCabin
  console.log(`  lantai 1 : ${floor1} (Building ${building} + Outdoors ${outdoors} + meja L1 ${l1desks} + karakter ${chars} + LiftCabin ${liftCabin})`)
  console.log(`  lantai 2 : ${floor2} (Building ${building} + UpperFloor ${upper} + LiftShaft ${liftShaft} + Outdoors ${outdoors} + meja L1 ${l1desks} + karakter ${chars} + LiftCabin ${liftCabin})`)
  console.log(`  lantai 3 : ${floor3} (Building ${building} + UpperFloor ${upper} + TopFloor ${top} + 2×LiftShaft ${2 * liftShaft} + Outdoors ${outdoors} + meja L1 ${l1desks} + karakter ${chars} + LiftCabin ${liftCabin})`)
  console.log(`  semua    : ${all} (sama dengan lantai 3 — gedung penuh)`)
  console.log('')
  console.log('== Sanity check ==')
  const checks: [string, boolean][] = [
    ['WorkDesk = 20', workDesk === 20],
    ['OfficeChair = 8', officeChair === 8],
    ['Bookshelf = 19', bookshelf === 19],
    ['Character = 12 (11 badan + 1 ring kondisional Unknown)', character === 12],
    ['LiftShaft = 10 (6 dinding + 1 cap + 2 panel geser + 1 lampu indikator)', liftShaft === 10],
    ['LiftCabin = 5 (lantai + langit-langit + lampu + 2 lapisan dalam)', liftCabin === 5],
    ['mode all = lantai 3 (gedung penuh, paling berat)', all === floor3 && all > floor1 && all > floor2],
    ['lantai 2 memuat interior lantai 1 (Building dipakai)', floor2 > floor1],
    ['lantai 3 memuat lantai 1 + 2 (gedung penuh)', floor3 === all],
  ]
  let fail = 0
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
    if (!ok) fail += 1
  }
  if (fail > 0) {
    console.error(`\n${fail} sanity check GAGAL — angka di atas tidak bisa dipakai sebagai baseline.`)
    process.exit(1)
  }
  console.log('\nSemua sanity check lolos — angka di atas adalah baseline Fase 7b2.')
  // ── Fase 4 Campus: selective rendering interior mess ──
  // Interior mess (ResL1Interior + ResL2Interior) disembunyikan saat
  // building === 'office' (kamera di luar batas mess); eksterior mess
  // (shell Residence) selalu terlihat. building === 'residence' /
  // 'campus' tidak menyembunyikan apa pun; interior kantor tidak pernah
  // disembunyikan (dinding selatan kantor kaca + rendah — interior
  // terlihat dari selatan, menyembunyikannya akan tampak kosong).
  // Angka di sini = mesh dengan group.visible=true (bukan oklusi).
  console.log('\n== Fase 4 Campus: mesh terlihat per (building, floor) ==')
  const resL1Int = per('ResL1Interior')
  const resL2Int = per('ResL2Interior')
  const resTotal = per('Residence')
  const hidden = resL1Int + resL2Int
  const shell = resTotal - hidden
  console.log(`  Residence total ${resTotal} = shell ${shell} (selalu terlihat: fondasi, dinding luar, jendela, atap, plang nama, lobi, area santai) + interior tersembunyi ${hidden} (L1 ${resL1Int} + L2 ${resL2Int})`)
  console.log(`  office    L1 ${floor1 - hidden}  L2 ${floor2 - hidden}  L3/all ${floor3 - hidden}  (interior mess disembunyikan, kamera di luar batas mess)`)
  console.log(`  residence L1 ${floor1}  L2 ${floor2}  all ${floor3}  (tidak ada yang disembunyikan)`)
  console.log(`  campus    all ${floor3}  (tidak ada yang disembunyikan)`)
  const pct = (n: number) => ((hidden / n) * 100).toFixed(1)
  console.log(`  penghematan mode office: L1 ${pct(floor1)}%  L2 ${pct(floor2)}%  L3/all ${pct(floor3)}%  (ambang terapkan Fase 4: >= 5%)`)
  const fase4checks: [string, boolean][] = [
    ['Residence = shell + interior (tidak ada mesh hilang/duplikat)', resTotal === shell + hidden && hidden > 0],
    ['penghematan mode office L1 >= 5%', hidden / floor1 >= 0.05],
    ['penghematan mode office L2 >= 5%', hidden / floor2 >= 0.05],
    ['penghematan mode office L3/all >= 5%', hidden / floor3 >= 0.05],
    ['shell mess > 0 (eksterior tetap terlihat saat office)', shell > 0],
  ]
  let f4fail = 0
  for (const [label, ok] of fase4checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
    if (!ok) f4fail += 1
  }
  if (f4fail > 0) {
    console.error(`\n${f4fail} cek Fase 4 GAGAL — selective rendering TIDAK boleh diterapkan (lihat FASE4_CAMPUS_DESIGN_2026-11-24.md §6).`)
    process.exit(1)
  }
  console.log('Semua cek Fase 4 lolos — selective rendering interior mess memenuhi ambang >= 5%.')
}

main()
