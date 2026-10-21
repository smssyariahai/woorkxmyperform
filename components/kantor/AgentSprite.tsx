'use client';

import { agentLook } from './agent-look';
import { cn } from '@/lib/utils';
import type { OpStatus } from '@/lib/agents/display-status';

/**
 * Karakter 2D CSS — humanoid blocky prosedural.
 * Warna dari agentLook() (hash nama, deterministik).
 * Pose mengikuti status operasional ASLI:
 *  - WORKING: mengetik (pantulan cepat + titik-titik)
 *  - IDLE:    bernapas (naik-turun halus)
 *  - ERROR:   bergoyang + rona merah
 *  - OFFLINE: abu-abu, diam
 */
export function AgentSprite({
  agentId,
  name,
  opStatus,
  size = 40,
}: {
  agentId: string;
  name: string;
  opStatus: OpStatus;
  size?: number;
}) {
  const look = agentLook(agentId || name);
  const grey = opStatus === 'OFFLINE';
  const c = (hex: string) => (grey ? '#9ca3af' : hex);
  const s = size / 40; // skala

  return (
    <span
      className={cn(
        'relative block select-none',
        opStatus === 'WORKING' && 'animate-[kantor-type_0.9s_ease-in-out_infinite]',
        opStatus === 'IDLE' && 'animate-[kantor-breathe_3s_ease-in-out_infinite]',
        opStatus === 'ERROR' && 'animate-[kantor-shake_0.6s_ease-in-out_infinite]'
      )}
      style={{ width: size, height: size * 1.25 }}
      aria-label={name}
    >
      {/* kepala */}
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-[35%] border border-black/10"
        style={{
          width: 16 * s, height: 15 * s, top: 1 * s,
          backgroundColor: c(look.skin),
        }}
      />
      {/* rambut */}
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-t-[45%]"
        style={{
          width: 16 * s, height: 7 * s, top: 0,
          backgroundColor: c(look.hair),
        }}
      />
      {/* badan (baju) */}
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-[22%] border border-black/10"
        style={{
          width: 20 * s, height: 18 * s, top: 17 * s,
          backgroundColor: c(look.shirt),
        }}
      />
      {/* lengan kiri/kanan */}
      <span className="absolute rounded-full" style={{ width: 5 * s, height: 13 * s, left: 3 * s, top: 18 * s, backgroundColor: c(look.shirt) }} />
      <span className="absolute rounded-full" style={{ width: 5 * s, height: 13 * s, right: 3 * s, top: 18 * s, backgroundColor: c(look.shirt) }} />
      {/* kaki (celana) */}
      <span className="absolute rounded-b-md" style={{ width: 7 * s, height: 13 * s, left: 11 * s, top: 35 * s, backgroundColor: c(look.pants) }} />
      <span className="absolute rounded-b-md" style={{ width: 7 * s, height: 13 * s, right: 11 * s, top: 35 * s, backgroundColor: c(look.pants) }} />
      {/* indikator mengetik */}
      {opStatus === 'WORKING' && (
        <span className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[4px] w-[4px] rounded-full bg-blue-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )}
      {/* indikator error */}
      {opStatus === 'ERROR' && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow">
          !
        </span>
      )}
    </span>
  );
}
