'use client';

/** Ukuran ruangan 3D (satuan dunia). Tanpa dependensi three.js. */
export const ROOM_W = 22;
export const ROOM_D = 15;

/** Petakan posisi layout persen (0–100) ke koordinat dunia 3D. */
export function layoutToWorld(x: number, y: number): [number, number] {
  return [(x / 100 - 0.5) * (ROOM_W - 4), (y / 100 - 0.5) * (ROOM_D - 4)];
}
