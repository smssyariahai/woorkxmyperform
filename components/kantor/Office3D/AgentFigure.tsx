'use client';

/**
 * Karakter 3D prosedural — humanoid blocky tanpa file model eksternal.
 * Warna dari agentLook() (hash deterministik).
 * Animasi mengikuti status operasional ASLI:
 *  - WORKING: duduk mengetik (lengan bergerak)
 *  - IDLE:    duduk, napas halus
 *  - ERROR:   bergoyang + rona merah
 *  - OFFLINE: abu-abu, diam
 *
 * Pola scene prosedural terinspirasi proyek "ruang"
 * (https://github.com/yugienugraha/ruang) — MIT, Copyright (c) 2026 yugienugraha.
 * Lihat NOTICE-KANTOR-3D.md.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { agentLook } from '../agent-look';
import { type OpStatus } from '@/lib/agents/display-status';

const STATUS_DOT: Record<OpStatus, string> = {
  WORKING: '#3b82f6',
  IDLE: '#22c55e',
  ERROR: '#ef4444',
  OFFLINE: '#9ca3af',
};

export function AgentFigure({
  agentId,
  name,
  role,
  opStatus,
  position,
}: {
  agentId: string;
  name: string;
  role: string;
  opStatus: OpStatus;
  position: [number, number, number];
}) {
  const look = agentLook(agentId || name);
  const grey = opStatus === 'OFFLINE';
  const group = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);

  const mat = useMemo(
    () => ({
      hair: new THREE.MeshStandardMaterial({ color: grey ? '#9ca3af' : look.hair, roughness: 0.8 }),
      skin: new THREE.MeshStandardMaterial({ color: grey ? '#b6bcc7' : look.skin, roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: grey ? '#a7afbb' : look.shirt, roughness: 0.8 }),
      pants: new THREE.MeshStandardMaterial({ color: grey ? '#8d95a3' : look.pants, roughness: 0.8 }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grey, agentId]
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // mengetik
    if (armL.current && armR.current) {
      if (opStatus === 'WORKING') {
        armL.current.rotation.x = -0.7 + Math.sin(t * 9) * 0.28;
        armR.current.rotation.x = -0.7 + Math.sin(t * 9 + Math.PI) * 0.28;
      } else {
        armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, 0, 0.1);
        armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, 0, 0.1);
      }
    }
    if (group.current) {
      if (opStatus === 'IDLE') {
        group.current.position.y = position[1] + Math.sin(t * 1.6) * 0.03;
        group.current.rotation.z = 0;
      } else if (opStatus === 'ERROR') {
        group.current.rotation.z = Math.sin(t * 7) * 0.07;
      } else {
        group.current.position.y = position[1];
        group.current.rotation.z = 0;
      }
    }
  });

  return (
    <group position={position}>
      <group ref={group}>
        {/* kaki */}
        <mesh material={mat.pants} position={[-0.11, 0.28, 0.12]} castShadow>
          <boxGeometry args={[0.16, 0.56, 0.16]} />
        </mesh>
        <mesh material={mat.pants} position={[0.11, 0.28, 0.12]} castShadow>
          <boxGeometry args={[0.16, 0.56, 0.16]} />
        </mesh>
        {/* badan */}
        <mesh material={mat.shirt} position={[0, 0.86, 0]} castShadow>
          <boxGeometry args={[0.52, 0.62, 0.3]} />
        </mesh>
        {/* lengan */}
        <mesh ref={armL} material={mat.shirt} position={[-0.34, 0.86, 0.05]} castShadow>
          <boxGeometry args={[0.14, 0.52, 0.14]} />
        </mesh>
        <mesh ref={armR} material={mat.shirt} position={[0.34, 0.86, 0.05]} castShadow>
          <boxGeometry args={[0.14, 0.52, 0.14]} />
        </mesh>
        {/* kepala */}
        <mesh material={mat.skin} position={[0, 1.38, 0]} castShadow>
          <boxGeometry args={[0.34, 0.32, 0.3]} />
        </mesh>
        {/* rambut */}
        <mesh material={mat.hair} position={[0, 1.56, -0.02]} castShadow>
          <boxGeometry args={[0.36, 0.12, 0.32]} />
        </mesh>
      </group>
      {/* label nama melayang */}
      <Html position={[0, 1.95, 0]} center distanceFactor={10} zIndexRange={[20, 0]}>
        <div className="pointer-events-none flex flex-col items-center">
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900/85 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[opStatus] }} />
            {name}
          </div>
          <div className="mt-0.5 whitespace-nowrap rounded-full bg-white/85 px-2 py-px text-[9px] font-medium text-slate-600 shadow">
            {role}
          </div>
        </div>
      </Html>
    </group>
  );
}
