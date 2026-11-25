// Wilayah administratif Indonesia — API publik emsifa.
// Dipakai dari client (RegionPicker). Cache sederhana di memori per sesi;
// bila fetch gagal, pemanggil memakai fallback input teks (jangan blokir form).

const BASE = 'https://www.emsifa.com/api-wilayah-indonesia/api';

export interface RegionItem {
  id: string;
  name: string;
}

const cache = new Map<string, Promise<RegionItem[]>>();

async function fetchList(url: string): Promise<RegionItem[]> {
  const cached = cache.get(url);
  if (cached) return cached;
  const p = fetch(url, { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Wilayah: HTTP ${r.status}`);
      const data = (await r.json()) as Array<{ id: string; name: string }>;
      return data.map((d) => ({ id: String(d.id), name: d.name }));
    })
    .catch((e) => {
      cache.delete(url);
      throw e;
    });
  cache.set(url, p);
  return p;
}

export function getProvinces(): Promise<RegionItem[]> {
  return fetchList(`${BASE}/provinces.json`);
}

export function getRegencies(provinceId: string): Promise<RegionItem[]> {
  return fetchList(`${BASE}/regencies/${provinceId}.json`);
}

export function getDistricts(regencyId: string): Promise<RegionItem[]> {
  return fetchList(`${BASE}/districts/${regencyId}.json`);
}

export function getVillages(districtId: string): Promise<RegionItem[]> {
  return fetchList(`${BASE}/villages/${districtId}.json`);
}
