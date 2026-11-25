/**
 * WOORK VIRTUAL OFFICE — Neon box + wall branding.
 *
 * Branding di dinding kantor virtual, memakai logo WOORK RESMI yang sudah
 * ada di proyek (/logo.png via useLogoTexture, fallback prosedural yang
 * sama dengan LogoSign) — TIDAK ada logo baru, TIDAK ada proporsi diubah.
 * Semua teks digambar via CanvasTexture (pola yang sama dengan
 * meeting-screen.tsx: kaligrafi/mihrab) — tajam, tanpa dependensi font
 * eksternal, tanpa model baru.
 *
 * Kontrak posisi (sama seperti LogoSign): `position` = titik di permukaan
 * dinding, `rotation` = arah hadap (0 = menghadap +z, PI/2 = +x, -PI/2 = -x).
 * Semua elemen menempel di dinding (offset kecil dari permukaan, tanpa
 * bidang koplanar -> tanpa z-fighting) dan TIDAK melayang/menembus dinding.
 */
'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { useLogoTexture } from './logo-sign'
import { makeStaticTexture } from './meeting-screen'
import { RBox } from './props'
import type { Vec3 } from './office3d-layout'

/** Warna identitas WOORK (sama seperti logo + LogoSign). */
const BRAND_DARK = '#1d3f6e'
const BRAND_LIGHT = '#6fb7de'
const NEON_GLOW = '#4aa8dd'

/** Gambar teks "WOORK" + ".id" dua warna, terpusat; `glow` = efek neon. */
function drawWordmark(ctx: CanvasRenderingContext2D, w: number, h: number, glow: boolean) {
  ctx.clearRect(0, 0, w, h)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  // Turunkan ukuran font sampai muat (dengan margin 4%).
  let fontSize = Math.floor(h * 0.62)
  ctx.font = `800 ${fontSize}px Arial, sans-serif`
  const word = 'WOORK'
  const suffix = '.id'
  while (fontSize > 10 && ctx.measureText(word).width + ctx.measureText(suffix).width > w * 0.96) {
    fontSize -= 4
    ctx.font = `800 ${fontSize}px Arial, sans-serif`
  }
  const total = ctx.measureText(word).width + ctx.measureText(suffix).width
  const startX = (w - total) / 2
  if (glow) {
    ctx.shadowColor = NEON_GLOW
    ctx.shadowBlur = fontSize * 0.35
  }
  ctx.fillStyle = glow ? '#8fd0f0' : BRAND_DARK
  ctx.fillText(word, startX, h / 2 + fontSize * 0.04)
  ctx.fillStyle = glow ? '#ffffff' : BRAND_LIGHT
  ctx.fillText(suffix, startX + ctx.measureText(word).width, h / 2 + fontSize * 0.04)
  // Lapisan kedua supaya glow neon lebih merata (tanpa mengubah bentuk huruf).
  if (glow) {
    ctx.shadowBlur = fontSize * 0.18
    ctx.fillStyle = '#8fd0f0'
    ctx.fillText(word, startX, h / 2 + fontSize * 0.04)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(suffix, startX + ctx.measureText(word).width, h / 2 + fontSize * 0.04)
  }
}

/** Tekstur wordmark "WOORK.ID" (transparan, tanpa latar). */
function wordmarkTexture(glow: boolean): THREE.CanvasTexture {
  return makeStaticTexture(1024, 300, (ctx, w, h) => drawWordmark(ctx, w, h, glow))
}

/** Halo radial biru (untuk glow di sekitar neon box, transparan di tepi). */
function haloTexture(): THREE.CanvasTexture {
  return makeStaticTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(74, 168, 221, 0.55)')
    g.addColorStop(0.55, 'rgba(74, 168, 221, 0.18)')
    g.addColorStop(1, 'rgba(74, 168, 221, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

/**
 * Neon box "WOORK.ID": panel akrilik gelap + teks menyala (meshBasicMaterial
 * toneMapped false = terlihat menyala seperti LED) + halo lembut di dinding.
 * Tanpa pointLight tambahan (tidak mengubah pencahayaan scene).
 */
export function NeonBox({ position, rotation = 0, width = 1.6 }: { position: Vec3; rotation?: number; width?: number }) {
  const height = width * 0.36
  const textTex = useMemo(() => wordmarkTexture(true), [])
  const haloTex = useMemo(() => haloTexture(), [])
  return <group position={position} rotation={[0, rotation, 0]}>
    {/* Halo lembut di dinding, sedikit lebih besar dari panel. */}
    <mesh position={[0, 0, 0.008]}>
      <planeGeometry args={[width + 0.35, height + 0.35]}/>
      <meshBasicMaterial map={haloTex} transparent toneMapped={false} depthWrite={false}/>
    </mesh>
    {/* Panel akrilik gelap (belakang rata dengan dinding). */}
    <RBox position={[0, 0, 0.025]} size={[width, height, 0.05]} radius={0.02} color="#0f1512" roughness={0.3}/>
    {/* Teks neon di depan panel. */}
    <mesh position={[0, 0, 0.06]}>
      <planeGeometry args={[width * 0.92, height * 0.78]}/>
      <meshBasicMaterial map={textTex} transparent toneMapped={false}/>
    </mesh>
  </group>
}

/**
 * Neon box WOORK.ID di pinggir jalan (2026-11-23, permintaan user):
 * papan neon DUA SISI di atas dua tiang + alas — terbaca dari arah jalan
 * (+z, kamera default) maupun dari arah gedung (-z). Memakai NeonBox yang
 * sama dengan di dinding dalam (wordmark + glow sama, logo resmi WOORK.ID).
 * `position` = titik di tanah (alas), `rotation` = arah hadap (0 = +z).
 */
export function RoadsideNeonSign({ position, rotation = 0, width = 2.2 }: { position: Vec3; rotation?: number; width?: number }) {
  const height = width * 0.36
  const panelY = 1.9 // tengah panel — terbaca di atas pagar/trotoar
  const postH = panelY - height / 2
  return <group position={position} rotation={[0, rotation, 0]}>
    {/* Dua tiang + alas beton. */}
    <RBox position={[-width / 2 + 0.12, postH / 2, 0]} size={[0.12, postH, 0.12]} radius={0.02} color="#2a2f33" roughness={0.6}/>
    <RBox position={[width / 2 - 0.12, postH / 2, 0]} size={[0.12, postH, 0.12]} radius={0.02} color="#2a2f33" roughness={0.6}/>
    <RBox position={[0, 0.06, 0]} size={[width * 0.7, 0.12, 0.5]} radius={0.02} color="#3a3f44" roughness={0.8}/>
    {/* Inti papan (mengisi celah antara kedua panel). */}
    <RBox position={[0, panelY, 0]} size={[width, height, 0.06]} radius={0.02} color="#0f1512" roughness={0.3}/>
    {/* Panel neon depan (jalan) + belakang (gedung). */}
    <NeonBox position={[0, panelY, 0.03]} width={width}/>
    <NeonBox position={[0, panelY, -0.03]} rotation={Math.PI} width={width}/>
  </group>
}

/**
 * Logo WOORK resmi di dinding (backing putih + plane logo, rasio 4,09 sama
 * dengan PNG — pola yang sama dengan LogoSign, hanya lebih kecil).
 */
export function WallLogo({ position, rotation = 0, width = 1.8 }: { position: Vec3; rotation?: number; width?: number }) {
  const texture = useLogoTexture()
  const boardH = width * 0.3
  const logoW = width * 0.94
  const logoH = logoW / 4.09
  return <group position={position} rotation={[0, rotation, 0]}>
    <RBox position={[0, 0, 0.02]} size={[width, boardH, 0.04]} radius={0.02} color="#ffffff" roughness={0.85}/>
    <mesh position={[0, 0, 0.045]}>
      <planeGeometry args={[logoW, logoH]}/>
      <meshStandardMaterial map={texture} transparent roughness={0.6}/>
    </mesh>
  </group>
}

/**
 * Wordmark "WOORK.ID" sebagai wall lettering (tanpa backing, huruf biru tua
 * + ".id" biru — terbaca di dinding krem #efe6d6).
 */
export function WallWordmark({ position, rotation = 0, width = 1.5 }: { position: Vec3; rotation?: number; width?: number }) {
  const height = width * 0.29
  const textTex = useMemo(() => wordmarkTexture(false), [])
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0, 0.012]}>
      <planeGeometry args={[width, height]}/>
      <meshBasicMaterial map={textTex} transparent toneMapped={false}/>
    </mesh>
  </group>
}

/**
 * Plang nama ruangan (Fase 3b): papan biru tua WOORK + teks putih tebal —
 * selalu terbaca di tema siang maupun malam (meshBasicMaterial unlit, pola
 * yang sama dengan WallStatement). `position` = titik di permukaan dinding
 * (papan menonjol 0,02 ke arah ruangan, tanpa bidang koplanar → tanpa
 * z-fighting); `rotation` = arah hadap (0 = +z, PI/2 = +x, -PI/2 = -x).
 * Kanvas disesuaikan rasio bidang teks supaya huruf tidak melar.
 */
export function RoomNamePlate({ position, rotation = 0, text, width = 1.6 }: { position: Vec3; rotation?: number; text: string; width?: number }) {
  const height = 0.34
  const textTex = useMemo(
    () =>
      makeStaticTexture(1024, Math.max(64, Math.round((1024 * height * 0.78) / (width * 0.92))), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        let fontSize = Math.floor(h * 0.62)
        ctx.font = `800 ${fontSize}px Arial, sans-serif`
        while (fontSize > 10 && ctx.measureText(text).width > w * 0.96) {
          fontSize -= 4
          ctx.font = `800 ${fontSize}px Arial, sans-serif`
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, w / 2, h / 2 + 2)
      }),
    [text, width],
  )
  return <group position={position} rotation={[0, rotation, 0]}>
    <RBox position={[0, 0, 0.02]} size={[width, height, 0.04]} radius={0.02} color={BRAND_DARK} roughness={0.6}/>
    <mesh position={[0, 0, 0.045]}>
      <planeGeometry args={[width * 0.92, height * 0.78]}/>
      <meshBasicMaterial map={textTex} transparent toneMapped={false}/>
    </mesh>
  </group>
}

/**
 * Totem nama klaster (Fase 3b): plang nama di atas dua tiang kayu — untuk
 * area tanpa dinding di dekatnya (klaster Tech lantai 2). Tinggi total
 * ~1,17 m (papan di y 1,0): terbaca dari kamera default tanpa menutupi
 * meja di belakangnya; tiang di sisi timur klaster, di luar jalur jalan.
 * Fase 5a: bila `onClick` diberikan, totem bisa diklik (Focus Department)
 * — klik diabaikan bila pointer sempat diseret (delta > 6 px, itu drag
 * kamera, bukan klik) dan tidak merambat ke klik-lantai mode all.
 */
export function RoomTotem({ position, text, width = 1.4, onClick }: { position: Vec3; text: string; width?: number; onClick?: () => void }) {
  return <group position={position} onClick={onClick ? (event) => { if (event.delta > 6) return; event.stopPropagation(); onClick() } : undefined} onPointerOver={onClick ? (event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' } : undefined} onPointerOut={onClick ? () => { document.body.style.cursor = '' } : undefined}>
    <RBox position={[-width / 2 + 0.08, 0.42, 0]} size={[0.08, 0.84, 0.08]} radius={0.01} color="#5a4636" roughness={0.8}/>
    <RBox position={[width / 2 - 0.08, 0.42, 0]} size={[0.08, 0.84, 0.08]} radius={0.01} color="#5a4636" roughness={0.8}/>
    <RoomNamePlate position={[0, 1.0, 0]} text={text} width={width}/>
  </group>
}

/**
 * Satu baris brand statement di dinding (huruf biru tua, font mengecil
 * otomatis sampai muat). Dipakai secukupnya — satu statement per kantor.
 */
export function WallStatement({ position, rotation = 0, text, width = 1.8 }: { position: Vec3; rotation?: number; text: string; width?: number }) {
  const height = width * 0.14
  const textTex = useMemo(
    () =>
      makeStaticTexture(1024, 144, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        let fontSize = 64
        ctx.font = `800 ${fontSize}px Arial, sans-serif`
        while (fontSize > 10 && ctx.measureText(text).width > w * 0.96) {
          fontSize -= 4
          ctx.font = `800 ${fontSize}px Arial, sans-serif`
        }
        ctx.fillStyle = BRAND_DARK
        ctx.fillText(text, w / 2, h / 2 + 2)
      }),
    [text],
  )
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0, 0.012]}>
      <planeGeometry args={[width, height]}/>
      <meshBasicMaterial map={textTex} transparent toneMapped={false}/>
    </mesh>
  </group>
}
