// Client helper Modul Emas — pengganti panggilan backup ke
// /api/pg/gold/*, /api/pg/simulations, /api/pg/kirim/* dan /api/auto-sync/*.
// Di WOORK semua lewat API /api/emas/* (NextAuth, session dibaca server dari
// cookie — user TIDAK perlu dioper ke API). Respons dibungkus
// { success, data: {...} }.

import type { SettingsData } from './defaultSettings';

/** Satu baris riwayat harga (bentuk yang sama dengan backup /api/pg/gold/history). */
export interface GoldHistoryItem {
  date: string; // YYYY-MM-DD
  hargaTaksir24K: number;
  prices: Record<string, number>;
  buybackPrices: Record<string, number>;
}

/** Satu simulasi tersimpan (bentuk yang sama dengan backup simMapRow). */
export interface SimulationItem {
  id: string;
  userId: string;
  name: string;
  type: string;
  dataString: string;
  createdAt: string;
  expiresAt: string | null;
  memberName: string;
  itemMerk: string;
  itemImei: string;
  plafond: number;
}

export interface SimulationInput {
  name: string;
  type: string;
  dataString?: string;
  expiresAt?: string | null;
  memberName?: string;
  itemMerk?: string;
  itemImei?: string;
  plafond?: number;
}

/** Satu URL tujuan kirim JSON (scope 'simulasi'). */
export interface KirimUrlItem {
  id: string;
  judul: string;
  url: string;
  deskripsi: string;
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Harga emas (/api/emas/prices)
// ---------------------------------------------------------------------------

export async function fetchGoldHistory(): Promise<{ history: GoldHistoryItem[]; latest: GoldHistoryItem | null }> {
  const body = await apiJson('/api/emas/prices');
  return {
    history: body?.data?.history || [],
    latest: body?.data?.latest || null,
  };
}

/** Simpan/entri manual satu tanggal (upsert). */
export async function saveGoldHistoryRow(row: {
  date: string;
  hargaTaksir24K?: number;
  prices?: Record<string, number>;
  buybackPrices?: Record<string, number>;
}): Promise<void> {
  await apiJson('/api/emas/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
}

/** Sync manual: tarik harga live semua sumber lalu simpan sebagai riwayat hari ini. */
export async function syncGoldPricesToday(): Promise<GoldHistoryItem> {
  const body = await apiJson('/api/emas/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sync: true }),
  });
  return body?.data as GoldHistoryItem;
}

/** Hapus satu tanggal riwayat. */
export async function deleteGoldHistoryDate(date: string): Promise<void> {
  await apiJson(`/api/emas/prices?date=${encodeURIComponent(date)}`, { method: 'DELETE' });
}

/** Hapus satu jenis emas dari seluruh riwayat. */
export async function removeGoldType(name: string): Promise<void> {
  await apiJson('/api/emas/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove-type', name }),
  });
}

// ---------------------------------------------------------------------------
// Tarif & pengaturan emas (/api/emas/settings)
// ---------------------------------------------------------------------------

export async function fetchGoldSettings(): Promise<{ tarif_biaya: SettingsData }> {
  const body = await apiJson('/api/emas/settings');
  return body?.data?.settings as { tarif_biaya: SettingsData };
}

export async function saveGoldSetting(key: string, value: unknown): Promise<void> {
  await apiJson('/api/emas/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
}

// ---------------------------------------------------------------------------
// Simulasi (/api/emas/simulations)
// ---------------------------------------------------------------------------

export async function fetchSimulations(type?: string): Promise<SimulationItem[]> {
  const q = type ? `?type=${encodeURIComponent(type)}` : '';
  const body = await apiJson(`/api/emas/simulations${q}`);
  return body?.data?.simulations || [];
}

export async function saveSimulation(input: SimulationInput): Promise<SimulationItem> {
  const body = await apiJson('/api/emas/simulations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return body?.data?.simulation as SimulationItem;
}

export async function deleteSimulation(id: string): Promise<void> {
  await apiJson(`/api/emas/simulations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// URL kirim JSON (/api/emas/kirim-urls)
// ---------------------------------------------------------------------------

export async function fetchKirimUrls(scope = 'simulasi'): Promise<{ urls: KirimUrlItem[]; canManage: boolean }> {
  const body = await apiJson(`/api/emas/kirim-urls?scope=${encodeURIComponent(scope)}`);
  return {
    urls: body?.data?.urls || [],
    canManage: !!body?.data?.canManage,
  };
}

export async function addKirimUrl(input: { scope?: string; judul: string; url: string; deskripsi?: string }): Promise<KirimUrlItem[]> {
  const body = await apiJson('/api/emas/kirim-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'simulasi', ...input }),
  });
  return body?.data?.urls || [];
}

export async function updateKirimUrl(input: { scope?: string; id: string; judul: string; url: string; deskripsi?: string }): Promise<KirimUrlItem[]> {
  const body = await apiJson('/api/emas/kirim-urls', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'simulasi', ...input }),
  });
  return body?.data?.urls || [];
}

export async function deleteKirimUrl(id: string, scope = 'simulasi'): Promise<KirimUrlItem[]> {
  const body = await apiJson(`/api/emas/kirim-urls?scope=${encodeURIComponent(scope)}&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return body?.data?.urls || [];
}
