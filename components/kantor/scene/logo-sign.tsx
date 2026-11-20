/**
 * Papan nama WOORK di dinding utama ruang kerja lantai 1.
 *
 * Posisi (satuan dunia ≈ meter, y ke atas, +z ke arah jalan):
 * - Dinding belakang ruang kerja ada di z = minZ (-5,2); permukaan dalam tembok
 *   (tebal 0,25) ada di z = minZ + 0,125.
 * - Jendela di dinding itu berpusat di x = -7 / -3,6 / 1,4 / 6,6 (bingkai selebar
 *   1,92). Celah bebas jendela di tengah ruang kerja adalah x -2,64..0,44, jadi
 *   papan dipusatkan di x = -1,1 — tepat di belakang barisan meja, terlihat dari
 *   sudut kamera default (kamera di depan-atas, melihat ke dinding belakang).
 * - Papan putih 3,0 × 0,9 × 0,06 (tengah y 1,55) supaya huruf biru tua logo
 *   terbaca di tema siang maupun malam; plane logo 2,8 × 0,685 mengikuti
 *   rasio asli PNG 2081/509 ≈ 4,09.
 * - Papan tertanam 5 mm ke dalam tembok (tanpa bidang koplanar → tanpa
 *   z-fighting); plane logo 0,015 di depan permukaan papan.
 * - Hanya dipasang di dalam `Building` (environment.tsx), yang cuma dirender
 *   saat lantai 1 tampil — tidak pernah muncul di lantai 2 atau di luar gedung.
 */

import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { RBox } from './props'
import { woorkLogoFallback } from './textures'

/** Pusat celah bebas jendela di dinding belakang ruang kerja. */
export const LOGO_SIGN_X = -1.1
/** Tengah dinding (jendela berpusat di y 1,55; jam dinding di y 2,35). */
export const LOGO_SIGN_Y = 1.55
/** Papan putih: [lebar, tinggi, tebal]. */
export const LOGO_BOARD_SIZE: [number, number, number] = [3.0, 0.9, 0.06]
/** Plane logo: [lebar, tinggi] — rasio 4,09 sama dengan PNG 2081×509. */
export const LOGO_PLANE_SIZE: [number, number] = [2.8, 0.685]
/** Jarak dari permukaan dalam tembok ke tengah papan (papan tertanam 5 mm). */
const BOARD_CENTER_OFFSET = 0.15
/** Jarak dari permukaan dalam tembok ke plane logo (0,015 di depan papan). */
const PLANE_OFFSET = 0.195

/**
 * Tekstur logo: coba /logo.png dulu (tanpa Suspense — loadAsync + state, jadi
 * gagal muat tidak pernah meruntuhkan Canvas). Selama PNG belum tiba, atau bila
 * gagal dimuat (404, offline, dsb.), dipakai tekstur fallback prosedural
 * "WOORK.id" dari textures.ts.
 */
function useLogoTexture(): THREE.Texture {
  const [texture, setTexture] = useState<THREE.Texture>(() => woorkLogoFallback())
  useEffect(() => {
    let alive = true
    let loaded: THREE.Texture | null = null
    new THREE.TextureLoader().loadAsync('/logo.png').then((tex) => {
      if (!alive) { tex.dispose(); return }
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      loaded = tex
      setTexture(tex)
    }).catch(() => {
      // Tetap pakai fallback prosedural — papan tidak pernah kosong.
    })
    return () => {
      alive = false
      loaded?.dispose()
    }
  }, [])
  return texture
}

/** Papan nama WOORK di dinding belakang (z = `minZ` dari layout.building). */
export function LogoSign({ minZ }: { minZ: number }) {
  const texture = useLogoTexture()
  return <group>
    {/* Backing putih — huruf biru tua logo terbaca di tema siang dan malam. */}
    <RBox position={[LOGO_SIGN_X, LOGO_SIGN_Y, minZ + BOARD_CENTER_OFFSET]} size={LOGO_BOARD_SIZE} radius={0.02} color="#ffffff" roughness={0.85}/>
    {/* Logo transparan (RGBA) di atas papan; transparent agar putih papan tampak di sela huruf. */}
    <mesh position={[LOGO_SIGN_X, LOGO_SIGN_Y, minZ + PLANE_OFFSET]}>
      <planeGeometry args={LOGO_PLANE_SIZE}/>
      <meshStandardMaterial map={texture} transparent roughness={0.6}/>
    </mesh>
  </group>
}
