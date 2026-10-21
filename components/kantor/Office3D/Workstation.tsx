'use client';

/**
 * Meja kerja prosedural: meja, monitor menyala, keyboard, kursi.
 * Pola furnitur prosedural terinspirasi proyek "ruang"
 * (https://github.com/yugienugraha/ruang) — MIT, Copyright (c) 2026 yugienugraha.
 */

import { useMemo } from 'react';
import * as THREE from 'three';

const DESK_TOP = '#c8a97e';
const DESK_LEG = '#8a6f4d';
const SCREEN_ON = '#9fd8ff';

export function Workstation({
  position,
  rotationY = 0,
  screenOn = true,
}: {
  position: [number, number, number];
  rotationY?: number;
  screenOn?: boolean;
}) {
  const screenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: screenOn ? '#0b3550' : '#1e293b',
        emissive: screenOn ? SCREEN_ON : '#000000',
        emissiveIntensity: screenOn ? 0.55 : 0,
        roughness: 0.4,
      }),
    [screenOn]
  );
  const topMat = useMemo(() => new THREE.MeshStandardMaterial({ color: DESK_TOP, roughness: 0.7 }), []);
  const legMat = useMemo(() => new THREE.MeshStandardMaterial({ color: DESK_LEG, roughness: 0.8 }), []);
  const chairMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3f5a7a', roughness: 0.7 }), []);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* daun meja */}
      <mesh material={topMat} position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.08, 0.9]} />
      </mesh>
      {/* kaki meja */}
      {[
        [-0.78, -0.38],
        [0.78, -0.38],
        [-0.78, 0.38],
        [0.78, 0.38],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} material={legMat} position={[x, 0.35, z]} castShadow>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
        </mesh>
      ))}
      {/* monitor */}
      <mesh material={legMat} position={[0, 0.86, -0.28]} castShadow>
        <boxGeometry args={[0.08, 0.16, 0.08]} />
      </mesh>
      <mesh material={screenMat} position={[0, 1.12, -0.3]} castShadow>
        <boxGeometry args={[0.85, 0.52, 0.05]} />
      </mesh>
      {/* keyboard */}
      <mesh material={legMat} position={[0, 0.8, 0.12]} castShadow>
        <boxGeometry args={[0.6, 0.03, 0.2]} />
      </mesh>
      {/* kursi */}
      <mesh material={chairMat} position={[0, 0.48, 0.85]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
      </mesh>
      <mesh material={chairMat} position={[0, 0.85, 1.08]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.08]} />
      </mesh>
      <mesh material={chairMat} position={[0, 0.24, 0.85]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.44, 10]} />
      </mesh>
    </group>
  );
}

/** Meja rapat panjang + 6 kursi. */
export function MeetingTable({ position }: { position: [number, number, number] }) {
  const topMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b98d5f', roughness: 0.65 }), []);
  const legMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6e5638', roughness: 0.8 }), []);
  const chairMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a6fa5', roughness: 0.7 }), []);
  return (
    <group position={position}>
      <mesh material={topMat} position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.1, 1.4]} />
      </mesh>
      {[
        [-1.6, -0.55],
        [1.6, -0.55],
        [-1.6, 0.55],
        [1.6, 0.55],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} material={legMat} position={[x, 0.35, z]} castShadow>
          <boxGeometry args={[0.1, 0.7, 0.1]} />
        </mesh>
      ))}
      {[-1.1, 0, 1.1].map((x) =>
        [-1.05, 1.05].map((z) => (
          <mesh key={`${x}${z}`} material={chairMat} position={[x, 0.45, z]} castShadow>
            <boxGeometry args={[0.45, 0.08, 0.45]} />
          </mesh>
        ))
      )}
    </group>
  );
}

/** Sofa santai + meja kecil. */
export function LoungeSet({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const sofaMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5b8c5a', roughness: 0.85 }), []);
  const tableMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a6f4d', roughness: 0.8 }), []);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={sofaMat} position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.35, 0.9]} />
      </mesh>
      <mesh material={sofaMat} position={[0, 0.65, -0.42]} castShadow>
        <boxGeometry args={[2.2, 0.6, 0.18]} />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} material={sofaMat} position={[x, 0.55, 0]} castShadow>
          <boxGeometry args={[0.18, 0.5, 0.9]} />
        </mesh>
      ))}
      <mesh material={tableMat} position={[0, 0.32, 1.1]} castShadow>
        <boxGeometry args={[1.1, 0.08, 0.6]} />
      </mesh>
      <mesh material={tableMat} position={[0, 0.15, 1.1]} castShadow>
        <boxGeometry args={[0.08, 0.3, 0.08]} />
      </mesh>
    </group>
  );
}

/** Tanaman hias sederhana. */
export function Plant({ position }: { position: [number, number, number] }) {
  const potMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b3543f', roughness: 0.8 }), []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3e7d44', roughness: 0.9 }), []);
  return (
    <group position={position}>
      <mesh material={potMat} position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.4, 12]} />
      </mesh>
      <mesh material={leafMat} position={[0, 0.75, 0]} castShadow>
        <sphereGeometry args={[0.34, 12, 10]} />
      </mesh>
      <mesh material={leafMat} position={[0.12, 1.0, 0.08]} castShadow>
        <sphereGeometry args={[0.22, 10, 8]} />
      </mesh>
    </group>
  );
}
