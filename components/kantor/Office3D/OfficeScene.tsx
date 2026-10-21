'use client';

/**
 * Scene 3D Kantor Virtual — ruangan + workstation + karakter agent.
 * Render prosedural (tanpa model eksternal), lazy-load via next/dynamic.
 * Pola terinspirasi proyek "ruang" (https://github.com/yugienugraha/ruang)
 * — MIT, Copyright (c) 2026 yugienugraha. Lihat NOTICE-KANTOR-3D.md.
 */

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { AgentFigure } from './AgentFigure';
import { Workstation, MeetingTable, LoungeSet, Plant } from './Workstation';
import { opStatusOf, type OpStatus } from '@/lib/agents/display-status';
import { ROOM_W, ROOM_D, layoutToWorld } from './layout3d';

export interface SceneAgent {
  id: string;
  name: string;
  role: string;
  isEnabled: boolean;
  currentStatus: string;
  opStatus?: OpStatus;
  currentTask?: { status: string } | null;
}

function Room() {
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8eef5', roughness: 0.95 }), []);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dbe7f3', roughness: 0.9 }), []);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0f2a4a', roughness: 0.6 }), []);
  return (
    <group>
      {/* lantai */}
      <mesh material={floorMat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
      </mesh>
      {/* garis grid karpet area kerja */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[ROOM_W - 2, ROOM_D - 2]} />
        <meshStandardMaterial color="#d5e2f0" roughness={1} transparent opacity={0.5} />
      </mesh>
      {/* dinding belakang & kiri */}
      <mesh material={wallMat} position={[0, 1.6, -ROOM_D / 2]} receiveShadow>
        <boxGeometry args={[ROOM_W, 3.2, 0.25]} />
      </mesh>
      <mesh material={wallMat} position={[-ROOM_W / 2, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.25, 3.2, ROOM_D]} />
      </mesh>
      {/* lis bawah dinding */}
      <mesh material={trimMat} position={[0, 0.12, -ROOM_D / 2 + 0.14]}>
        <boxGeometry args={[ROOM_W, 0.24, 0.06]} />
      </mesh>
      {/* tulisan WOORK di dinding */}
      <mesh position={[0, 2.1, -ROOM_D / 2 + 0.16]}>
        <boxGeometry args={[4.6, 0.7, 0.04]} />
        <meshStandardMaterial color="#087bff" roughness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Pembungkus karakter yang bisa BERJALAN ke titik target lalu kembali ke meja.
 * Target berasal dari tugas nyata yang baru dibuat (bukan simulasi).
 */
function WalkingAgent({
  base,
  target,
  agent,
  op,
}: {
  base: [number, number, number];
  target: { x: number; z: number } | null;
  agent: SceneAgent;
  op: OpStatus;
}) {
  const g = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(base[0], base[1], base[2]));

  useFrame((state, dt) => {
    const dest = target
      ? new THREE.Vector3(target.x, base[1], target.z)
      : new THREE.Vector3(base[0], base[1], base[2]);
    pos.current.lerp(dest, Math.min(1, dt * 1.4));
    const el = g.current;
    if (!el) return;
    const dx = dest.x - pos.current.x;
    const dz = dest.z - pos.current.z;
    const dist = Math.hypot(dx, dz);
    el.position.copy(pos.current);
    if (dist > 0.2) {
      // menghadap arah jalan + gerakan melangkah
      el.rotation.y = Math.atan2(dx, dz);
      el.position.y = base[1] + Math.abs(Math.sin(state.clock.elapsedTime * 9)) * 0.07;
    } else {
      el.rotation.y = THREE.MathUtils.lerp(el.rotation.y, 0, Math.min(1, dt * 5));
    }
  });

  return (
    <group ref={g} position={base}>
      <AgentFigure agentId={agent.id} name={agent.name} role={agent.role} opStatus={op} position={[0, 0, 0]} />
    </group>
  );
}

function SceneContent({
  agents,
  layout,
  walkTargets,
  controlsRef,
}: {
  agents: SceneAgent[];
  layout: Record<string, { x: number; y: number }>;
  walkTargets: Record<string, { x: number; z: number }>;
  controlsRef: React.RefObject<OrbitControlsImpl>;
}) {
  // posisi default melingkar bila belum ada layout tersimpan
  const fallback = useMemo(() => {
    const n = Math.max(agents.length, 1);
    const out: Record<string, { x: number; y: number }> = {};
    agents.forEach((a, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      out[a.id] = { x: 50 + Math.cos(ang) * 30, y: 50 + Math.sin(ang) * 28 };
    });
    return out;
  }, [agents]);

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <Room />

      {agents.map((a) => {
        const p = layout[a.id] ?? fallback[a.id] ?? { x: 50, y: 50 };
        const [wx, wz] = layoutToWorld(p.x, p.y);
        const op: OpStatus =
          a.opStatus ??
          opStatusOf({ isEnabled: a.isEnabled, currentStatus: a.currentStatus, currentTask: a.currentTask });
        const base: [number, number, number] = [wx, 0, wz + 0.85];
        return (
          <group key={a.id}>
            <Workstation position={[wx, 0, wz]} screenOn={op !== 'OFFLINE'} />
            <WalkingAgent base={base} target={walkTargets[a.id] ?? null} agent={a} op={op} />
          </group>
        );
      })}

      {/* ruang rapat */}
      <MeetingTable position={[6.5, 0, -4.6]} />
      {/* area santai */}
      <LoungeSet position={[-7.5, 0, -4.8]} rotationY={0.35} />
      <Plant position={[-10, 0, 5.5]} />
      <Plant position={[10.2, 0, 5.8]} />
      <Plant position={[10.2, 0, -6.2]} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0.8, 0]}
      />
    </>
  );
}

export function OfficeScene({
  agents,
  layout,
  walkTargets,
  controlsRef,
}: {
  agents: SceneAgent[];
  layout: Record<string, { x: number; y: number }>;
  walkTargets?: Record<string, { x: number; z: number }>;
  controlsRef: React.RefObject<OrbitControlsImpl>;
}) {
  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-50 to-slate-100 sm:h-[520px]">
      <Canvas shadows camera={{ position: [11, 9, 12], fov: 45 }} dpr={[1, 1.75]}>
        <Suspense fallback={null}>
          <SceneContent agents={agents} layout={layout} walkTargets={walkTargets ?? {}} controlsRef={controlsRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
