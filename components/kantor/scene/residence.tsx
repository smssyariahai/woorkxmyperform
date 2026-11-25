/**
 * WOORK STAFF RESIDENCE — mess karyawan (Fase 1 shell + Fase 2a interior L2, 2026-11-23).
 *
 * Shell luar bangunan 2 lantai di timur kantor (RESIDENCE): pondasi,
 * dinding krem + atap pelana, jendela bercahaya hangat di malam hari,
 * pintu selatan + papan nama.
 *
 * Fase 2a — interior LANTAI 2: koridor selatan, 4 kamar tidur di sisi
 * utara (4 kasur per kamar = 16, komponen <Bed> yang sama dengan dorm
 * lantai 3 kantor + selimut warna berputar), kamar mandi di ujung timur
 * koridor, plang nama tiap kamar.
 * Fase 2b — interior LANTAI 1: lobi, ruang keluarga, ruang makan,
 * dapur, laundry, kamar mandi + area santai luar.
 * Fase 4a — tangga lurus di ruang makan (17 anak, x 22,5→26,5,
 * z 1,2..2,0) + lubang pelat L2 + railing lubang; pintu selatan
 * DIBUKA (panel kayu dihapus — sama seperti pintu depan kantor);
 * meja makan + kursi digeser supaya strip tangga bersih. BELUM ada
 * pathfinding agent (Fase 4b), BELUM ada perubahan tidur / kamera /
 * demo — komponen ini murni visual.
 *
 * Cutaway atap: bila kamera masuk ke batas mess yang diperluas
 * (x 20..38, z -7..4), atap disembunyikan (kamera y >= 3,5) supaya
 * interior L2 terlihat, atau atap + lantai 2 disembunyikan (kamera
 * y < 3,5) supaya interior L1 terlihat. Di luar batas, semua terlihat
 * seperti biasa. Disetel lewat ref + .visible (tanpa setState per frame).
 *
 * Fase 4 Campus — selective rendering: bila hideInterior (building ===
 * 'office'), grup interior L1 + L2 (ResL1Interior/ResL2Interior)
 * disembunyikan via ref di useFrame yang sama — KECUALI kamera masuk
 * batas mess (pengecualian kamera-dalam). Eksterior (dinding, jendela,
 * atap, plang nama gedung, lobi, area santai luar) SELALU terlihat;
 * <Residence> tidak pernah di-unmount.
 *
 * Pola mengikuti environment.tsx: dinding RBox + lis atas (Wall),
 * jendela kusen kayu + kaca (Window), lantai kayu (Building). Warna
 * dinding sama dengan kantor. Atap pelana adalah penanda rumah tinggal:
 * kantor beratap datar, mess beratap pelana.
 * Tinggi mengikuti pola kantor: dinding 2,6 m per lantai + pelat 0,2 m
 * (total per lantai 2,8 m). Bubungan y 6,2 m.
 */
'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { RESIDENCE, RESIDENCE_DOOR, type Vec3 } from './office3d-layout'
import { Armchair, Bed, Bookshelf, CoffeeTable, Cyl, Fridge, OfficeLight, Plant, Railing, RBox, Sofa } from './props'
import { RoomNamePlate } from './branding'
import { woodFloor } from './textures'

/** Warna dan ukuran dinding — sama seperti environment.tsx. */
const WALL = '#efe6d6'
const WALL_TOP = '#d9cdb8'
const WALL_H = 2.6
const THICK = 0.25
/** Warna atap pelana (terakota, sudah ada di palet: karpet meeting). */
const ROOF = '#8a4b3c'
/** Lantai 2: dinding mulai y 2,8 (di atas pelat tengah), lantai kayu y 2,81. */
const L2_Y = 2.8
const L2_FLOOR_Y = 2.81
/** Warna selimut kasur — sama seperti dorm lantai 3 kantor (environment.tsx:526). */
const BLANKETS = ['#3d7fd6', '#e76f51', '#2a9d8f', '#e9c46a', '#8d5bc1', '#d64545']
/**
 * Kamar mandi L2 di ujung timur koridor (z -0,8..2). Fase 4c: dinding
 * barat digeser ke x 28,7 (dulu 27,5) — kamar mandi menyempit 2,5 m
 * jadi 1,3 m — supaya pintu Kamar 4 bisa di tengah kamar (x 28,25):
 * dinding barat di 27,5 memblokir koridor, jadi pintu tengah kamar
 * hanya bisa dicapai lewat kamar mandi. Toilet tetap di dinding timur
 * utara, wastafel pindah ke dinding timur selatan (tata linear).
 * Diturunkan dari RESIDENCE (Fase 1 AI Campus) — jangan angka mati.
 */
const BATHROOM = { minX: RESIDENCE.maxX - 1.3, maxX: RESIDENCE.maxX, minZ: -0.8, maxZ: 2 }
/** Dinding koridor (sisi utara koridor, z -0,8) + celah pintu 0,9 m. */
const CORRIDOR_Z = -0.8
const DOOR_W = 0.9
/**
 * Baris kasur (pusat, z): baris utara sama dengan dorm (-4,1); baris
 * kedua digeser ke -2,0 (dorm -1,6) supaya kaki kasur tidak menembus
 * dinding koridor — interior kamar hanya 4,15 m (z -5,075..-0,925),
 * dua kasur 2,05 m = 4,10 m, sisa 0,05 m; celah antar baris seperti
 * dorm tidak muat tanpa menggeser dinding koridor.
 */
const RES_BED_ROWS_Z = [-4.1, -2.0]
/**
 * Tangga mess (Fase 4a): lurus di dinding selatan ruang makan,
 * x 22,5→26,5, z 1,2..2,0, naik y 0→2,8 (17 anak, naik ±0,16 m per
 * anak), pendaratan di koridor L2 (26,5, 2,8, 1,5). Lubang pelat L2
 * di atas tangga: x 22,5..26,5, z 1,2..2,0. Diturunkan dari RESIDENCE
 * (Fase 1 AI Campus) — jangan angka mati.
 */
const RES_STAIRS = { minX: RESIDENCE.minX + 0.5, maxX: RESIDENCE.minX + 4.5, minZ: 1.2, maxZ: 2.0, steps: 17 }
/** Kemiringan tangga: atan(2,8 / 4,0) — dipakai rotasi pegangan miring. */
const RES_STAIRS_SLOPE = 0.611

/** Dinding luar (pola Wall di environment.tsx): RBox + lis atas. */
function ResWall({ from, to, baseY = 0, height = WALL_H }: { from: [number, number]; to: [number, number]; baseY?: number; height?: number }) {
  const [x1, z1] = from
  const [x2, z2] = to
  const length = Math.hypot(x2 - x1, z2 - z1)
  const angle = Math.atan2(z2 - z1, x2 - x1)
  return <group position={[(x1 + x2) / 2, baseY, (z1 + z2) / 2]} rotation={[0, -angle, 0]}>
    <RBox position={[0, height / 2, 0]} size={[length + THICK, height, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
    <RBox position={[0, height + 0.02, 0]} size={[length + THICK + 0.02, 0.05, THICK + 0.04]} radius={0.01} color={WALL_TOP}/>
  </group>
}

/** Panel kaca penuh (pola GlassZ di environment.tsx): RBox transparan
 * #cfe8ee opacity 0,25, tanpa dinding rendah — "kaca aja full". */
function ResGlassZ({ z, fromX, toX, bottom = 0, top = WALL_H }: { z: number; fromX: number; toX: number; bottom?: number; top?: number }) {
  return <RBox position={[(fromX + toX) / 2, (bottom + top) / 2, z]} size={[Math.abs(toX - fromX), top - bottom, 0.05]} radius={0.01} color="#cfe8ee" opacity={0.25} roughness={0.05} shadow={false}/>
}

/**
 * Dinding selatan lantai 1 KACA PENUH (perintah user 2026-11-24 ~11:23):
 * lobi + ruang makan terlihat dari luar (jalur pedestrian / trotoar).
 * Pola DoorWall di environment.tsx — celah pintu + ambang atas tetap
 * solid — tapi segmen kiri (ruang makan, x minX..pintu) dan kanan
 * (lobi/dapur, x pintu..maxX) diganti kaca penuh tinggi 0..2,6.
 * Jendela selatan L1 dihapus (sudah tidak ada dinding untuk ditempel).
 */
function ResGlassDoorWall({ z, fromX, toX }: { z: number; fromX: number; toX: number }) {
  const d0 = RESIDENCE_DOOR.minX
  const d1 = RESIDENCE_DOOR.maxX
  const center = (d0 + d1) / 2
  return <group>
    <ResGlassZ z={z} fromX={fromX} toX={d0}/>
    <ResGlassZ z={z} fromX={d1} toX={toX}/>
    <RBox position={[center, 2.35, z]} size={[d1 - d0, 0.5, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
  </group>
}

/**
 * Jendela mess (pola Window di environment.tsx). Kaca menghadap KE LUAR
 * supaya cahaya hangat terlihat dari kamera default di malam hari.
 * Malam: kaca oranye hangat menyala; siang: kaca biru muda seperti kantor.
 */
function ResWindow({ position, rotation = 0, width = 1.6, night }: { position: Vec3; rotation?: number; width?: number; night: boolean }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    <RBox position={[0, 0, 0]} size={[width + 0.12, 1.22, 0.12]} radius={0.02} color="#5a4636"/>
    <mesh position={[0, 0, 0.065]}>
      <planeGeometry args={[width, 1.1]}/>
      <meshStandardMaterial color={night ? '#ffd9a0' : '#9fd3ea'} emissive={night ? '#ff9d3c' : '#6fb6d6'} emissiveIntensity={night ? 1.4 : 0.35} roughness={0.05} metalness={0.2}/>
    </mesh>
    <RBox position={[0, 0, 0.08]} size={[0.05, 1.1, 0.03]} radius={0.01} color="#5a4636"/>
  </group>
}

/** Interior lantai 1 mess (Fase 4 Campus): partisi, ruang keluarga, ruang
    makan, tangga, dapur, laundry, kamar mandi L1 + 2 lampu dalam.
    Dikeluarkan dari Residence supaya penghitung mesh (verify-fase7b2)
    bisa mengukur grup ini terpisah dan Residence bisa menyembunyikannya
    saat building === 'office'. Lobi + area santai luar TETAP di shell
    Residence (terlihat lewat celah pintu dari luar). */
export function ResL1Interior({ minX, maxX, minZ, maxZ, doorCx, night }: { minX: number; maxX: number; minZ: number; maxZ: number; doorCx: number; night: boolean }) {
  return <group>
    {/* ===== Interior lantai 1 (Fase 2b) ===== */}
    {/* Partisi dalam (y 0..2,6): dinding x=doorCx, celah pintu z 0,55..1,45 (lobi). */}
    <ResWall from={[doorCx, minZ]} to={[doorCx, 0.55]}/>
    <ResWall from={[doorCx, 1.45]} to={[doorCx, maxZ]}/>
    <RBox position={[doorCx, 2.35, 1.0]} size={[THICK, 0.5, DOOR_W]} radius={0.02} color={WALL} roughness={0.9}/>
    {/* Partisi z=-0,5: barat (keluarga/makan) celah x 19,05..19,95; timur (dapur/laundry) celah x 24,55..25,45. */}
    <ResWall from={[minX, -0.5]} to={[minX + 3.05, -0.5]}/>
    <ResWall from={[minX + 3.95, -0.5]} to={[doorCx, -0.5]}/>
    <RBox position={[minX + 3.5, 2.35, -0.5]} size={[DOOR_W, 0.5, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
    <ResWall from={[doorCx, -0.5]} to={[minX + 8.55, -0.5]}/>
    <ResWall from={[minX + 9.45, -0.5]} to={[maxX, -0.5]}/>
    <RBox position={[minX + 9, 2.35, -0.5]} size={[DOOR_W, 0.5, THICK]} radius={0.02} color={WALL} roughness={0.9}/>
    {/* Partisi kamar mandi/laundry: dinding x=minX+10,5 (z -0,5..2), celah z 0,3..1,2. */}
    <ResWall from={[minX + 10.5, -0.5]} to={[minX + 10.5, 0.3]}/>
    <ResWall from={[minX + 10.5, 1.2]} to={[minX + 10.5, maxZ]}/>
    <RBox position={[minX + 10.5, 2.35, 0.75]} size={[THICK, 0.5, DOOR_W]} radius={0.02} color={WALL} roughness={0.9}/>
    {/* Ruang Keluarga (barat, x minX..doorCx, z -5,2..-0,5): sofa menghadap selatan + meja kopi + rak buku + tanaman. */}
    <Sofa position={[minX + 3.5, 0, -4.5]}/>
    <CoffeeTable position={[minX + 3.5, 0, -3.3]}/>
    <Bookshelf position={[minX + 0.5, 0, -2.5]} rotation={Math.PI / 2}/>
    <Plant position={[minX + 6.2, 0, -4.6]}/>
    <RoomNamePlate position={[minX + 3.5, 2.3, -0.375]} text="Ruang Keluarga" width={1.2}/>
    {/* Ruang Makan (x minX..doorCx, z -0,5..2): meja makan + 4 kursi RBox.
        Fase 4a: meja digeser ke z 0,3 (dulu 0,7) supaya strip tangga
        (z 1,2..2,0) bersih. Fase 4c: 2 kursi utara PINDAH ke ujung
        meja (x minX+2,4 / minX+4,6, z 0,3, menghadap meja) — kursi utara di
        z 0,95 menutup penuh jalur utara (z 0,8..1,2), satu-satunya
        jalur L1 mess ke tangga (Fase 4b: 76 cek tabrakan). Kursi
        selatan tetap di z -0,45 (sandaran z -0,65, di luar dinding
        z -0,5). */}
    <RBox position={[minX + 3.5, 0.74, 0.3]} size={[1.8, 0.07, 1.0]} radius={0.03} color="#6b4a32" roughness={0.5}/>
    {[[minX + 2.8, -0.1], [minX + 4.2, -0.1], [minX + 2.8, 0.7], [minX + 4.2, 0.7]].map(([x, z]) => <RBox key={`${x}${z}`} position={[x, 0.37, z]} size={[0.08, 0.72, 0.08]} radius={0.01} color="#2a2f33"/>)}
    {/* Kursi ujung barat (menghadap timur, sandaran di sisi barat). */}
    <group>
      <RBox position={[minX + 2.4, 0.45, 0.3]} size={[0.45, 0.08, 0.45]} radius={0.03} color="#5b6f8c" roughness={0.9}/>
      <RBox position={[minX + 2.2, 0.75, 0.3]} size={[0.06, 0.5, 0.45]} radius={0.03} color="#5b6f8c" roughness={0.9}/>
      <RBox position={[minX + 2.4, 0.225, 0.12]} size={[0.4, 0.45, 0.05]} radius={0.01} color="#2a2f33"/>
      <RBox position={[minX + 2.4, 0.225, 0.48]} size={[0.4, 0.45, 0.05]} radius={0.01} color="#2a2f33"/>
    </group>
    {/* Kursi ujung timur (menghadap barat, sandaran di sisi timur). */}
    <group>
      <RBox position={[minX + 4.6, 0.45, 0.3]} size={[0.45, 0.08, 0.45]} radius={0.03} color="#5b6f8c" roughness={0.9}/>
      <RBox position={[minX + 4.8, 0.75, 0.3]} size={[0.06, 0.5, 0.45]} radius={0.03} color="#5b6f8c" roughness={0.9}/>
      <RBox position={[minX + 4.6, 0.225, 0.12]} size={[0.4, 0.45, 0.05]} radius={0.01} color="#2a2f33"/>
      <RBox position={[minX + 4.6, 0.225, 0.48]} size={[0.4, 0.45, 0.05]} radius={0.01} color="#2a2f33"/>
    </group>
    {[minX + 2.9, minX + 4.1].map((x) => <group key={x}>
      <RBox position={[x, 0.45, -0.45]} size={[0.45, 0.08, 0.45]} radius={0.03} color="#5b6f8c" roughness={0.9}/>
      <RBox position={[x, 0.75, -0.65]} size={[0.45, 0.5, 0.06]} radius={0.03} color="#5b6f8c" roughness={0.9}/>
      <RBox position={[x - 0.18, 0.225, -0.45]} size={[0.05, 0.45, 0.4]} radius={0.01} color="#2a2f33"/>
      <RBox position={[x + 0.18, 0.225, -0.45]} size={[0.05, 0.45, 0.4]} radius={0.01} color="#2a2f33"/>
    </group>)}
    <RoomNamePlate position={[minX + 7.125, 2.3, 1.0]} rotation={Math.PI / 2} text="Ruang Makan" width={1.2}/>
    {/* Tangga lurus (Fase 4a) di dinding selatan ruang makan: 17 anak
        tangga (naik 2,8/17 ≈ 0,16 m per anak, injakan 4/17 ≈ 0,24 m),
        anak pertama [22,62, 0,08, 1,6] anak terakhir [26,38, 2,72, 1,6],
        pendaratan (26,5, 2,8, 1,5) di koridor L2. Pegangan miring di
        sisi terbuka (z 1,2): rel atas + rel tengah + 5 tiang tegak. */}
    {Array.from({ length: 17 }, (_, i) => {
      const topY = ((i + 1) * 2.8) / 17
      const x = RES_STAIRS.minX + ((i + 0.5) * 4) / 17
      return <RBox key={i} position={[x, topY - 0.085, 1.6]} size={[0.25, 0.17, 0.8]} radius={0.02} color="#6b4a32" roughness={0.8}/>
    })}
    <RBox position={[(RES_STAIRS.minX + RES_STAIRS.maxX) / 2, 2.3, 1.2]} size={[4.88, 0.06, 0.08]} radius={0.02} rotation={[0, 0, RES_STAIRS_SLOPE]} color="#3a3f44" metalness={0.5} roughness={0.4}/>
    <RBox position={[(RES_STAIRS.minX + RES_STAIRS.maxX) / 2, 1.9, 1.2]} size={[4.88, 0.03, 0.04]} radius={0.01} rotation={[0, 0, RES_STAIRS_SLOPE]} color="#3a3f44" metalness={0.5}/>
    {[[RES_STAIRS.minX + 0.4, 0.73], [RES_STAIRS.minX + 1.4, 1.43], [RES_STAIRS.minX + 2.4, 2.13], [RES_STAIRS.minX + 3.4, 2.83], [RES_STAIRS.minX + 3.9, 3.18]].map(([x, y]) => <RBox key={x} position={[x, y, 1.2]} size={[0.05, 0.9, 0.05]} radius={0.01} color="#3a3f44" metalness={0.5}/>)}
    {/* Dapur (timur, x doorCx..maxX, z -5,2..-0,5): counter sepanjang dinding utara + kompor + wastafel + kulkas. */}
    <RBox position={[minX + 10.5, 0.425, -4.75]} size={[4.6, 0.85, 0.6]} radius={0.02} color="#f2eee6" roughness={0.8}/>
    <RBox position={[minX + 10.5, 0.88, -4.75]} size={[4.7, 0.06, 0.68]} radius={0.01} color="#3a3f44" roughness={0.3}/>
    {[[minX + 10.8, -4.9], [minX + 11.2, -4.9], [minX + 10.8, -4.6], [minX + 11.2, -4.6]].map(([x, z]) => <Cyl key={`${x}${z}`} position={[x, 0.92, z]} radius={0.09} height={0.02} color="#2a2f33"/>)}
    <RBox position={[minX + 12.3, 0.9, -4.75]} size={[0.7, 0.05, 0.4]} radius={0.01} color="#9aa0a6" metalness={0.6}/>
    <Cyl position={[minX + 12.3, 1.06, -4.95]} radius={0.02} height={0.3} color="#9aa0a6" metalness={0.6}/>
    <RBox position={[minX + 12.3, 1.2, -4.85]} size={[0.02, 0.02, 0.25]} radius={0.005} color="#9aa0a6" metalness={0.6}/>
    <Cyl position={[minX + 8.8, 1.03, -4.75]} radius={0.16} height={0.24} color="#f5f5f2"/>
    <Cyl position={[minX + 8.8, 1.17, -4.75]} radius={0.14} height={0.05} color="#d64545"/>
    <Fridge position={[minX + 13.3, 0, -3.5]} rotation={-Math.PI / 2}/>
    <RoomNamePlate position={[minX + 9, 2.3, -0.375]} text="Dapur" width={1.2}/>
    {/* Laundry (timur, x doorCx..minX+10,5, z -0,5..2): 2 mesin cuci di dinding utara. */}
    {[minX + 7.55, minX + 8.2].map((x) => <group key={x}>
      <RBox position={[x, 0.425, -0.05]} size={[0.6, 0.85, 0.6]} radius={0.03} color="#ffffff" roughness={0.6}/>
      <RBox position={[x, 0.5, 0.26]} size={[0.45, 0.45, 0.02]} radius={0.01} color="#2a2f33" roughness={0.4}/>
      <RBox position={[x, 0.865, -0.05]} size={[0.58, 0.03, 0.58]} radius={0.01} color="#d9dde0" roughness={0.5}/>
    </group>)}
    <RoomNamePlate position={[minX + 7.9, 2.3, -0.375]} text="Laundry" width={1.2}/>
    {/* Kamar Mandi L1 (timur, x minX+10,5..maxX, z -0,5..2): toilet + wastafel sederhana (gaya kamar mandi L2). */}
    <RBox position={[maxX - 0.38, 0.45, 0.0]} size={[0.16, 0.7, 0.5]} radius={0.02} color="#ffffff" roughness={0.6}/>
    <RBox position={[maxX - 0.68, 0.2, 0.0]} size={[0.45, 0.4, 0.5]} radius={0.03} color="#ffffff" roughness={0.6}/>
    <RBox position={[maxX - 0.68, 0.42, 0.0]} size={[0.48, 0.06, 0.52]} radius={0.03} color="#f3f1ec" roughness={0.9}/>
    <RBox position={[minX + 12.3, 0.3, -0.12]} size={[0.7, 0.6, 0.45]} radius={0.03} color="#d9cdb8" roughness={0.8}/>
    <RBox position={[minX + 12.3, 0.62, -0.12]} size={[0.6, 0.08, 0.38]} radius={0.03} color="#ffffff" roughness={0.5}/>
    <Cyl position={[minX + 12.3, 0.75, -0.3]} radius={0.05} height={0.18} color="#9aa0a6" metalness={0.6}/>
    <RoomNamePlate position={[minX + 10.375, 2.3, 0.75]} rotation={-Math.PI / 2} text="Kamar Mandi" width={1.2}/>
    {/* Cahaya dalam lantai 1: lampu lama dipindah dari tengah (x 29 menembus partisi baru) ke ruang keluarga + 1 lampu baru di timur (dapur/laundry). */}
    <OfficeLight position={[minX + 3.5, 2.4, -2.85]} night={night}/>
    <OfficeLight position={[minX + 10.5, 2.4, -1.6]} night={night}/>
  </group>
}

/** Interior lantai 2 mess (Fase 4 Campus): partisi kamar, dinding koridor,
    kamar mandi, 16 kasur, plang nama kamar + 1 lampu dalam. Railing lubang
    tangga + pelat + dinding luar + plang nama gedung TETAP di shell
    Residence. Nama prop (rooms/doorCenters/corridorSegs/beds) sengaja sama
    dengan tabel receiver penghitung mesh (verify-fase7b2). */
export function ResL2Interior({ rooms, doorCenters, corridorSegs, beds, night, cx, cz, maxX, minZ, maxZ }: { rooms: { name: string; minX: number; maxX: number }[]; doorCenters: number[]; corridorSegs: [number, number][]; beds: { position: Vec3; color: string }[]; night: boolean; cx: number; cz: number; maxX: number; minZ: number; maxZ: number }) {
  return <group>
    {/* Partisi antar kamar (x minX+3,5 / doorCx / minX+10,5, z -5,2..-0,8). */}
    {rooms.slice(1).map((r) => <ResWall key={r.minX} from={[r.minX, minZ]} to={[r.minX, CORRIDOR_Z]} baseY={L2_Y}/>)}
    {/* Dinding koridor (z -0,8) dengan celah pintu tiap kamar + ambang atas. */}
    {corridorSegs.map(([x1, x2]) => <ResWall key={x1} from={[x1, CORRIDOR_Z]} to={[x2, CORRIDOR_Z]} baseY={L2_Y}/>)}
    {doorCenters.map((x) => <RBox key={x} position={[x, L2_Y + 2.35, CORRIDOR_Z]} size={[DOOR_W, 0.5, THICK]} radius={0.02} color={WALL} roughness={0.9}/>)}
    {/* Kamar mandi: dinding barat (x 28,7) dengan celah pintu z 0,6..1,5. */}
    <ResWall from={[BATHROOM.minX, CORRIDOR_Z]} to={[BATHROOM.minX, 0.6]} baseY={L2_Y}/>
    <ResWall from={[BATHROOM.minX, 1.5]} to={[BATHROOM.minX, maxZ]} baseY={L2_Y}/>
    <RBox position={[BATHROOM.minX, L2_Y + 2.35, 1.05]} size={[THICK, 0.5, DOOR_W]} radius={0.02} color={WALL} roughness={0.9}/>
    {/* Kamar mandi: toilet (dinding timur utara) + wastafel (dinding
        timur selatan — pindah dari utara di Fase 4c karena kamar
        mandi menyempit), kotak sederhana. */}
    <RBox position={[maxX - 0.38, 3.25, -0.3]} size={[0.16, 0.7, 0.5]} radius={0.02} color="#ffffff" roughness={0.6}/>
    <RBox position={[maxX - 0.68, 3.0, -0.3]} size={[0.45, 0.4, 0.5]} radius={0.03} color="#ffffff" roughness={0.6}/>
    <RBox position={[maxX - 0.68, 3.22, -0.3]} size={[0.48, 0.06, 0.52]} radius={0.03} color="#f3f1ec" roughness={0.9}/>
    <RBox position={[maxX - 0.7, 3.1, 1.55]} size={[0.7, 0.6, 0.45]} radius={0.03} color="#d9cdb8" roughness={0.8}/>
    <RBox position={[maxX - 0.7, 3.42, 1.55]} size={[0.6, 0.08, 0.38]} radius={0.03} color="#ffffff" roughness={0.5}/>
    <RBox position={[maxX - 0.7, 3.55, 1.38]} size={[0.05, 0.18, 0.05]} radius={0.01} color="#9aa0a6" metalness={0.6}/>
    {/* 16 kasur (komponen <Bed> dorm, selimut berputar). */}
    {beds.map((bed, i) => <Bed key={i} position={bed.position} color={bed.color}/>)}
    {/* Plang nama kamar di atas pintu (sisi koridor) + kamar mandi. */}
    {doorCenters.map((x, i) => <RoomNamePlate key={i} position={[x, L2_Y + 2.3, CORRIDOR_Z + 0.125]} text={rooms[i].name} width={1.2}/>)}
    <RoomNamePlate position={[BATHROOM.minX - 0.125, L2_Y + 2.3, 1.05]} rotation={-Math.PI / 2} text="Kamar Mandi" width={1.2}/>
    {/* Cahaya dalam lantai 2. */}
    <OfficeLight position={[cx, 5.2, cz]} night={night}/>
  </group>
}

export function Residence({ night, hideInterior = false, hideRoof = false }: { night: boolean; hideInterior?: boolean; hideRoof?: boolean }) {
  const { minX, maxX, minZ, maxZ } = RESIDENCE
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const doorCx = (RESIDENCE_DOOR.minX + RESIDENCE_DOOR.maxX) / 2
  const wood = useMemo(() => woodFloor([4, 4]), [])
  /** 4 kamar tidur × 3,5 m di sisi utara (z -5,2..-0,8). */
  const rooms = [0, 1, 2, 3].map((i) => ({ name: `Kamar ${i + 1}`, minX: minX + i * 3.5, maxX: minX + (i + 1) * 3.5 }))
  /**
   * Pusat celah pintu tiap kamar (di tengah kamar — termasuk Kamar 4,
   * x 28,25, sejak Fase 4c). Dulu Kamar 4 digeser ke x 27,0 karena
   * dinding barat kamar mandi di x 27,5; tapi pintu di 27,0 membuka ke
   * kasur depan-barat sehingga 3 kasur Kamar 4 tak terjangkau (Fase 4b).
   * Kamar mandi kini menyempit (dinding barat x 28,7) supaya pintu
   * tengah kamar bisa dicapai dari koridor.
   */
  const doorCenters = rooms.map((r) => (r.minX + r.maxX) / 2)
  /** Segmen dinding koridor di antara celah-celah pintu. */
  const corridorSegs: [number, number][] = []
  {
    let cursor = minX
    for (const c of doorCenters) {
      corridorSegs.push([cursor, c - DOOR_W / 2])
      cursor = c + DOOR_W / 2
    }
    corridorSegs.push([cursor, maxX])
  }
  /** 16 kasur: 2 baris × 2 kolom per kamar, kepala ke utara (-z) seperti dorm.
   *  Fase 4c: kolom kasur pusat ±0,80 (dulu ±0,75) supaya celah tengah
   *  antar kolom 0,55 m — lebih lebar dari badan agent 0,48 m, tanpa
   *  gesekan (dulu 0,45 m, selisih 0,03 m). */
  const beds: { position: Vec3; color: string }[] = []
  rooms.forEach((room, ri) => {
    const rcx = (room.minX + room.maxX) / 2
    RES_BED_ROWS_Z.forEach((z, zi) => {
      ;[-0.8, 0.8].forEach((dx, ci) => {
        beds.push({ position: [rcx + dx, L2_Y, z], color: BLANKETS[(ri * 4 + zi * 2 + ci) % BLANKETS.length] })
      })
    })
  })
  /**
   * Cutaway atap: kamera di dalam batas mess yang diperluas
   * (RESIDENCE.minX−2..maxX+2, z -7..4) → y >= 3,5 sembunyikan atap saja (interior L2
   * terlihat dari atas), y < 3,5 sembunyikan atap + lantai 2 (interior
   * L1 terlihat). Di luar batas semua terlihat. Hanya .visible via ref.
   * Batas diturunkan dari RESIDENCE (Fase 1 AI Campus).
   * Perintah user 2026-11-24 ~11:06 (screenshot): saat agent tidur
   * (hideRoof), atap mess JUGA disembunyikan meski kamera di luar batas —
   * supaya aktivitas tidur di kasur L2 terlihat dari view kantor/kampus.
   */
  const roofRef = useRef<Group>(null)
  const floor2Ref = useRef<Group>(null)
  const cutawayRef = useRef<'all' | 'noRoof' | 'ground'>('all')
  const roofVisibleRef = useRef(true)
  const l1InteriorRef = useRef<Group>(null)
  const l2InteriorRef = useRef<Group>(null)
  const interiorVisibleRef = useRef(true)
  useFrame(({ camera }) => {
    const { x, y, z } = camera.position
    const inside = x >= RESIDENCE.minX - 2 && x <= RESIDENCE.maxX + 2 && z >= -7 && z <= 4
    const mode: 'all' | 'noRoof' | 'ground' = !inside ? 'all' : y >= 3.5 ? 'noRoof' : 'ground'
    if (mode !== cutawayRef.current) {
      cutawayRef.current = mode
      if (floor2Ref.current) floor2Ref.current.visible = mode !== 'ground'
    }
    // Atap terlihat hanya saat mode 'all' DAN tidak tidur. Dilacak ref
    // sendiri supaya perubahan hideRoof (toggle Tidur) langsung berlaku
    // tanpa menunggu mode cutaway berubah.
    const roofVisible = mode === 'all' && !hideRoof
    if (roofVisible !== roofVisibleRef.current) {
      roofVisibleRef.current = roofVisible
      if (roofRef.current) roofRef.current.visible = roofVisible
    }
    // Fase 4 Campus: interior mess disembunyikan saat building === 'office'
    // (hideInterior) — KECUALI kamera sudah masuk batas mess (pengecualian
    // kamera-dalam): saat user mengorbit ke dalam mess dari mode kantor,
    // cutaway yang sama berlaku dan interior harus terlihat lagi. Hanya
    // .visible via ref (tanpa setState per frame), seperti cutaway.
    const interiorVisible = !hideInterior || inside
    if (interiorVisible !== interiorVisibleRef.current) {
      interiorVisibleRef.current = interiorVisible
      if (l1InteriorRef.current) l1InteriorRef.current.visible = interiorVisible
      if (l2InteriorRef.current) l2InteriorRef.current.visible = interiorVisible
    }
  })
  return <group>
    {/* ===== Grup lantai 1 (shell Fase 1 + interior Fase 2b) ===== */}
    <group>
      {/* Pondasi beton + lantai kayu lantai 1. */}
      <RBox position={[cx, 0.075, cz]} size={[maxX - minX + 0.4, 0.15, maxZ - minZ + 0.4]} radius={0.02} color="#a9a294" roughness={0.9}/>
      <mesh position={[cx, 0.16, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[maxX - minX, maxZ - minZ]}/>
        <meshStandardMaterial map={wood} roughness={0.55}/>
      </mesh>
      {/* Dinding lantai 1 (y 0..2,6). Selatan: KACA PENUH (lobi + ruang
          makan, perintah user 2026-11-24) — ResGlassDoorWall, bukan
          ResDoorWall; jendela selatan L1 dihapus. */}
      <ResGlassDoorWall z={maxZ} fromX={minX} toX={maxX}/>
      <ResWall from={[minX, minZ]} to={[maxX, minZ]}/>
      <ResWall from={[maxX, minZ]} to={[maxX, maxZ]}/>
      <ResWall from={[minX, minZ]} to={[minX, maxZ]}/>
      {/* Pintu selatan: BUKAAN TERBUKA (tanpa panel) — sama seperti pintu
          depan kantor (dinding depan hanya 0,55 m + celah terbuka di
          ENTRANCE_X) dan DoorWall interior kantor: celah di
          ResGlassDoorWall di atas dibiarkan terbuka supaya agent bisa
          lewat. Panel kayu solid Fase 1 dihapus (Fase 4a) — agent
          sebelumnya menembus panel. */}
      <RBox position={[doorCx, 0.06, maxZ + 0.3]} size={[2.4, 0.12, 0.6]} radius={0.02} color="#a9a294" roughness={0.9}/>
      {/* Lampu teras di atas pintu mess (Fase 5 AI Campus): braket + bola
          hangat di depan ambang pintu (ambang y 2,1..2,6, muka selatan
          z maxZ+0,125) — menyala saat night, pola sama dengan lampu taman
          Fase 2 (intensity 4, distance 5). Di SHELL (bukan interior)
          supaya tetap terlihat di mode office (Fase 4) — pintu + jalur
          pejalan terlihat dari luar, dan stop demo 'jalur' butuh titik
          terang di frame malam. Posisi diturunkan dari RESIDENCE_DOOR
          via doorCx. Audit pointLight malam: ~51 total (43 OfficeLight
          pra-existing + 4 jalan + 2 taman + 1 gerobak + 1 string);
          lampu ini +1 (≈2%) — lihat FASE5_CAMPUS_DESIGN §Audit. */}
      <group position={[doorCx, 0, maxZ]}>
        <RBox position={[0, 2.32, 0.14]} size={[0.12, 0.06, 0.16]} radius={0.02} color="#2f3336" metalness={0.5}/>
        <mesh position={[0, 2.22, 0.2]} castShadow>
          <sphereGeometry args={[0.09, 12, 8]}/>
          <meshStandardMaterial color="#f5e6b8" emissive="#ffd98a" emissiveIntensity={night ? 2.5 : 0.15}/>
        </mesh>
        {night && <pointLight position={[0, 2.22, 0.2]} color="#ffd08a" intensity={4} distance={5} decay={2}/>}
      </group>
      {/* Jendela lantai 1 (y 1,5), kaca menghadap keluar. Selatan dihapus
          2026-11-24: fasad selatan L1 kini kaca penuh (ResGlassDoorWall). */}
      {[minX + 3, minX + 11].map((x) => <ResWindow key={x} position={[x, 1.5, minZ - 0.14]} rotation={Math.PI} night={night}/>)}
      {[-3.5, -0.5].map((z) => <ResWindow key={z} position={[maxX + 0.14, 1.5, z]} rotation={Math.PI / 2} night={night}/>)}
      {[-3.5, -0.5].map((z) => <ResWindow key={z} position={[minX - 0.14, 1.5, z]} rotation={-Math.PI / 2} night={night}/>)}
      {/* Interior lantai 1 (Fase 4 Campus): grup terpisah supaya bisa
          disembunyikan saat building === 'office' — isi di ResL1Interior.
          Lobi sengaja TETAP di shell (terlihat lewat celah pintu dari luar). */}
      <group ref={l1InteriorRef}>
        <ResL1Interior minX={minX} maxX={maxX} minZ={minZ} maxZ={maxZ} doorCx={doorCx} night={night}/>
      </group>
      {/* Lobi (x minX+5..minX+9, z 0..2): bangku di dinding selatan + meja kecil + tanaman pot. */}
      <RBox position={[minX + 9.3, 0.45, 1.6]} size={[1.4, 0.12, 0.45]} radius={0.03} color="#6b4a32" roughness={0.8}/>
      {[minX + 8.7, minX + 9.9].map((x) => <RBox key={x} position={[x, 0.225, 1.6]} size={[0.08, 0.45, 0.4]} radius={0.01} color="#2a2f33"/>)}
      <RBox position={[minX + 9.3, 0.75, 1.79]} size={[1.4, 0.5, 0.08]} radius={0.03} color="#6b4a32" roughness={0.8}/>
      <RBox position={[minX + 8.9, 0.6, 0.7]} size={[0.7, 0.05, 0.7]} radius={0.02} color="#8a5a3a" roughness={0.5}/>
      <RBox position={[minX + 8.9, 0.3, 0.7]} size={[0.08, 0.6, 0.08]} radius={0.01} color="#2a2f33"/>
      <RBox position={[minX + 8.9, 0.015, 0.7]} size={[0.4, 0.03, 0.4]} radius={0.01} color="#2a2f33"/>
      <Plant position={[minX + 5.3, 0, 1.6]}/>
      <RoomNamePlate position={[minX + 5, 2.3, 1.875]} rotation={Math.PI} text="Lobi" width={1.2}/>
      {/* (Ruang keluarga, ruang makan, tangga — pindah ke ResL1Interior, Fase 4 Campus.) */}
      {/* (Dapur, laundry, kamar mandi L1 — pindah ke ResL1Interior, Fase 4 Campus.) */}
      {/* Area santai luar (timur bangunan, x maxX..maxX+3, z -2..2): paving + 2 kursi santai + meja kecil + tanaman. Tiang bendera [31,5, 0, 2,6] di luar strip (z maks 2). */}
      <RBox position={[maxX + 1.5, 0.05, 0]} size={[3, 0.1, 4]} radius={0.02} color="#bdb6a8" roughness={0.9}/>
      <Armchair position={[maxX + 1.2, 0, -1.3]} color="#5b6f8c"/>
      <Armchair position={[maxX + 1.2, 0, 1.3]} rotation={Math.PI} color="#5b6f8c"/>
      <RBox position={[maxX + 1.2, 0.6, 0]} size={[0.7, 0.05, 0.7]} radius={0.02} color="#8a5a3a" roughness={0.5}/>
      <RBox position={[maxX + 1.2, 0.3, 0]} size={[0.08, 0.6, 0.08]} radius={0.01} color="#2a2f33"/>
      <RBox position={[maxX + 1.2, 0.015, 0]} size={[0.4, 0.03, 0.4]} radius={0.01} color="#2a2f33"/>
      <Plant position={[maxX + 2.4, 0, 1.5]}/>
      {/* (Lampu dalam lantai 1 — pindah ke ResL1Interior, Fase 4 Campus.) */}
    </group>
    {/* ===== Grup lantai 2 (shell + interior Fase 2a) ===== */}
    <group ref={floor2Ref}>
      {/* Pelat tengah (lantai 2 / plafon lantai 1) — dipecah jadi 3 segmen
          di sekeliling lubang tangga (x minX+0,5..minX+4,5, z 1,2..2,0), pola
          floorSlabPieces kantor: barat lubang + timur lubang + utara lubang. */}
      <RBox position={[minX + 0.25, 2.7, cz]} size={[0.5, 0.2, maxZ - minZ]} radius={0.02} color={WALL} roughness={0.9}/>
      <RBox position={[(RES_STAIRS.maxX + maxX) / 2, 2.7, cz]} size={[maxX - RES_STAIRS.maxX, 0.2, maxZ - minZ]} radius={0.02} color={WALL} roughness={0.9}/>
      <RBox position={[(RES_STAIRS.minX + RES_STAIRS.maxX) / 2, 2.7, -2.0]} size={[4, 0.2, 6.4]} radius={0.02} color={WALL} roughness={0.9}/>
      {/* Lantai kayu lantai 2 — dibelah mengikuti segmen pelat (lubang tetap terbuka). */}
      <mesh position={[minX + 0.25, L2_FLOOR_Y, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.5, maxZ - minZ]}/>
        <meshStandardMaterial map={wood} roughness={0.55}/>
      </mesh>
      <mesh position={[(RES_STAIRS.maxX + maxX) / 2, L2_FLOOR_Y, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[maxX - RES_STAIRS.maxX, maxZ - minZ]}/>
        <meshStandardMaterial map={wood} roughness={0.55}/>
      </mesh>
      <mesh position={[(RES_STAIRS.minX + RES_STAIRS.maxX) / 2, L2_FLOOR_Y, -2.0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 6.4]}/>
        <meshStandardMaterial map={wood} roughness={0.55}/>
      </mesh>
      {/* Railing sekeliling lubang tangga di L2 (Fase 4a): sisi utara
          (z 1,2, x minX+0,5..minX+4,5) + sisi barat (x minX+0,5, z 1,2..2,0). Sisi
          timur (x minX+4,5) DIBUKA — pendaratan tangga; sisi selatan (z 2,0)
          adalah dinding luar. Koridor sisa z -0,8..1,2 = 2 m untuk jalan. */}
      <Railing position={[(RES_STAIRS.minX + RES_STAIRS.maxX) / 2, L2_Y, 1.2]} length={4}/>
      <Railing position={[RES_STAIRS.minX, L2_Y, 1.6]} length={0.8} rotation={Math.PI / 2}/>
      {/* Dinding lantai 2 (y 2,8..5,4). */}
      <ResWall from={[minX, maxZ]} to={[maxX, maxZ]} baseY={L2_Y}/>
      <ResWall from={[minX, minZ]} to={[maxX, minZ]} baseY={L2_Y}/>
      <ResWall from={[maxX, minZ]} to={[maxX, maxZ]} baseY={L2_Y}/>
      <ResWall from={[minX, minZ]} to={[minX, maxZ]} baseY={L2_Y}/>
      {/* Papan nama di dinding selatan di atas pintu (ikut grup lantai 2). */}
      <RoomNamePlate position={[doorCx, 3.3, maxZ + 0.125]} text="WOORK STAFF RESIDENCE" width={3.4}/>
      {/* Jendela lantai 2 (y 4,3) — utara ditambah x minX+5,5 & minX+9 supaya tiap kamar dapat jendela. */}
      {[minX + 2.5, minX + 4.5, minX + 7, minX + 9.5, minX + 11.5].map((x) => <ResWindow key={x} position={[x, 4.3, maxZ + 0.14]} night={night}/>)}
      {[minX + 3, minX + 5.5, minX + 9, minX + 11].map((x) => <ResWindow key={x} position={[x, 4.3, minZ - 0.14]} rotation={Math.PI} night={night}/>)}
      {[-3.5, -0.5].map((z) => <ResWindow key={z} position={[maxX + 0.14, 4.3, z]} rotation={Math.PI / 2} night={night}/>)}
      {[-3.5, -0.5].map((z) => <ResWindow key={z} position={[minX - 0.14, 4.3, z]} rotation={-Math.PI / 2} night={night}/>)}
      {/* Interior lantai 2 (Fase 4 Campus): grup terpisah supaya bisa
          disembunyikan saat building === 'office' — isi di ResL2Interior. */}
      <group ref={l2InteriorRef}>
        <ResL2Interior rooms={rooms} doorCenters={doorCenters} corridorSegs={corridorSegs} beds={beds} night={night} cx={cx} cz={cz} maxX={maxX} minZ={minZ} maxZ={maxZ}/>
      </group>
    </group>
    {/* ===== Grup atap (disembunyikan cutaway saat kamera masuk mess) ===== */}
    <group ref={roofRef}>
      {/* Atap pelana: dua pelat miring bertemu di bubungan (z -1,6, y 6,2). */}
      <RBox position={[cx, 5.756, 0.4]} size={[maxX - minX + 0.8, 0.12, 4.1]} radius={0.02} rotation={[0.219, 0, 0]} color={ROOF} roughness={0.85}/>
      <RBox position={[cx, 5.756, -3.6]} size={[maxX - minX + 0.8, 0.12, 4.1]} radius={0.02} rotation={[-0.219, 0, 0]} color={ROOF} roughness={0.85}/>
      {/* Gevel bertingkat di ujung timur + barat (di bawah atap, menutup celah segitiga). */}
      {[[5.4, 0.2, 2.6], [5.6, 0.25, 1.5], [5.85, 0.22, 0.5]].map(([y0, h, w]) => <group key={y0}>
        <RBox position={[minX, y0 + h / 2, cz]} size={[0.15, h, w * 2]} radius={0.01} color={WALL} roughness={0.9}/>
        <RBox position={[maxX, y0 + h / 2, cz]} size={[0.15, h, w * 2]} radius={0.01} color={WALL} roughness={0.9}/>
      </group>)}
    </group>
  </group>
}
