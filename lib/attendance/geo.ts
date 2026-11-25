// WOORK ATTENDANCE — geofence (Haversine).
// Dipakai check-in/out website DAN (nanti) bot WhatsApp — satu engine.

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GeofenceLocation extends LatLng {
  id: string;
  name: string;
  radiusMeters: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Jarak (meter) antara dua titik lat/lng — rumus Haversine. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Apakah titik berada dalam radius lokasi. */
export function isWithinGeofence(point: LatLng, location: GeofenceLocation): boolean {
  return haversineMeters(point, location) <= location.radiusMeters;
}

export interface NearestLocationResult {
  location: GeofenceLocation;
  distanceMeters: number;
  within: boolean;
}

/** Lokasi aktif terdekat dari titik (null bila tidak ada lokasi aktif). */
export function findNearestLocation(
  point: LatLng,
  locations: GeofenceLocation[]
): NearestLocationResult | null {
  if (locations.length === 0) return null;
  let best: NearestLocationResult | null = null;
  for (const loc of locations) {
    const distanceMeters = haversineMeters(point, loc);
    if (!best || distanceMeters < best.distanceMeters) {
      best = { location: loc, distanceMeters, within: distanceMeters <= loc.radiusMeters };
    }
  }
  return best;
}

/** Validasi koordinat. */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Kembalikan titik valid atau null (dipakai agar TypeScript mempersempit tipe). */
export function toLatLng(lat: unknown, lng: unknown): LatLng | null {
  if (!isValidLatLng(lat, lng)) return null;
  return { latitude: lat as number, longitude: lng as number };
}
