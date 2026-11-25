'use client';

// Pemilih lokasi kantor pusat — Leaflet + tile OpenStreetMap + geocoding
// Nominatim. Leaflet dimuat dinamis di dalam useEffect (butuh window),
// jadi aman untuk SSR. Marker memakai divIcon (tanpa URL gambar) supaya
// tidak ada masalah icon default Leaflet di Next.js.
// Lokasi pengguna TIDAK pernah diambil otomatis.

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = { lat: -6.2088, lng: 106.8456 }; // Jakarta

function pinHtml(): string {
  return (
    '<div style="width:30px;height:30px;background:#087bff;border:2px solid #fff;' +
    'border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
    'box-shadow:0 2px 6px rgba(0,0,0,.35);position:relative;">' +
    '<div style="width:10px;height:10px;background:#fff;border-radius:50%;' +
    'position:absolute;left:8px;top:8px;"></div></div>'
  );
}

export function MapPicker({
  latitude,
  longitude,
  onChange,
  disabled,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current =
    latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null;

  useEffect(() => {
    if (!open || !mapEl.current) return;
    let cancelled = false;
    (async () => {
      const mod = (await import('leaflet')) as unknown as Record<string, unknown>;
      const L = ((mod.default ?? mod) as typeof import('leaflet'));
      if (cancelled || !mapEl.current) return;
      const center = draft ?? current ?? DEFAULT_CENTER;
      const map = L.map(mapEl.current).setView([center.lat, center.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        className: '',
        html: pinHtml(),
        iconSize: [30, 42],
        iconAnchor: [15, 42],
      });
      const marker = L.marker([center.lat, center.lng], {
        draggable: !disabled,
        icon,
      }).addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        setDraft({ lat: ll.lat, lng: ll.lng });
      });
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        setDraft({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      mapRef.current = map;
      markerRef.current = marker;
      setDraft(center);
    })();
    return () => {
      cancelled = true;
      const map = mapRef.current as { remove?: () => void } | null;
      if (map?.remove) map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function doSearch(q: string) {
    const text = q.trim();
    if (text.length < 3) return;
    setSearching(true);
    setSearchError('');
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(text)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!r.ok) throw new Error('Pencarian alamat gagal.');
      const list = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (list.length === 0) {
        setSearchError('Alamat tidak ditemukan. Coba kata kunci lain.');
        return;
      }
      const first = list[0];
      const pos = { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
      const map = mapRef.current as {
        setView?: (c: [number, number], z: number) => void;
      } | null;
      const marker = markerRef.current as {
        setLatLng?: (c: [number, number]) => void;
      } | null;
      map?.setView?.([pos.lat, pos.lng], 16);
      marker?.setLatLng?.([pos.lat, pos.lng]);
      setDraft(pos);
    } catch {
      setSearchError('Pencarian alamat gagal. Periksa koneksi lalu coba lagi.');
    } finally {
      setSearching(false);
    }
  }

  function onQueryChange(v: string) {
    setQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void doSearch(v);
    }, 800);
  }

  function useLocation() {
    if (!draft) return;
    onChange(draft.lat, draft.lng);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="rounded-input border border-line bg-white dark:bg-slate-900 px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            {current ? (
              <>
                <span className="font-medium text-ink">Lokasi terpilih: </span>
                <span className="text-muted">
                  {current.lat.toFixed(6)}, {current.lng.toFixed(6)}
                </span>
              </>
            ) : (
              <span className="text-muted">Belum ada lokasi dipilih.</span>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary !py-2 !px-3 text-[13px]"
            onClick={() => setOpen(true)}
            disabled={disabled}
          >
            {current ? 'Ubah Lokasi' : 'Pilih Lokasi di Peta'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-input border border-line bg-white dark:bg-slate-900 p-3">
      <div className="flex gap-2">
        <input
          className="input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void doSearch(query);
            }
          }}
          placeholder="Cari alamat, mis. Jl. Sudirman Jakarta"
          disabled={disabled}
        />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => void doSearch(query)}
          disabled={disabled || searching}
        >
          {searching ? 'Mencari…' : 'Cari'}
        </button>
      </div>
      {searchError && <p className="text-[12px] text-danger">{searchError}</p>}
      <div ref={mapEl} className="h-[320px] w-full overflow-hidden rounded-input border border-line" />
      <p className="text-[12px] text-muted">
        Klik peta atau seret pin untuk memindahkan lokasi. Koordinat terpilih:{' '}
        <span className="font-medium text-ink">
          {draft ? `${draft.lat.toFixed(6)}, ${draft.lng.toFixed(6)}` : '—'}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={useLocation}
          disabled={disabled || !draft}
        >
          Gunakan Lokasi Ini
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setOpen(false);
            setDraft(current);
          }}
        >
          Batal
        </button>
      </div>
    </div>
  );
}
