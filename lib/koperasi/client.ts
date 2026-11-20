// lib/koperasi/client.ts — helper client modul Koperasi.
// Port pola lib/tal/client.ts: halaman memanggil helper ini, bukan fetch
// mentah. Respons API dibungkus { success, data } (apiOk / apiErr dari
// lib/utils) — helper ini toleran terhadap bentuk { items } maupun
// { anggota } agar halaman tidak pecah bila API mengembalikan salah satunya.
// Sumber backup: src/pages/KoperasiAnggotaList.tsx,
// src/pages/KoperasiAnggotaForm.tsx, src/pages/KoperasiPengaturan.tsx
// (dulu via pgJson ke /api/pg/koperasi/*; di WOORK lewat /api/koperasi/*).

export interface KoperasiAnggota {
  id: string;
  cabang: string;
  nik: string;
  namaLengkap: string;
  tempatLahir: string;
  // Tanggal lahir: API mengembalikan ISO (DateTime) atau "YYYY-MM-DD".
  tanggalLahir: string;
  jenisKelamin: string;
  alamatKtp: string;
  noHp: string;
  namaIbuKandung: string;
  pekerjaan: string;
  statusPerkawinan: string;
  penghasilanBulanan: string;
  tujuanKeanggotaan: string;
  // Foto: URL serve /api/koperasi/anggota/[id]/foto?type=... (bukan data URL).
  fotoKtp: string;
  fotoAnggota: string;
  tandaTangan: string;
  setujuMobileBanking: boolean;
  setujuPernyataan: boolean;
  hasSimpanan: boolean;
  hasPinjaman: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type KoperasiAnggotaInput = Omit<
  KoperasiAnggota,
  'id' | 'hasSimpanan' | 'hasPinjaman' | 'createdBy' | 'createdAt' | 'updatedAt'
> & {
  // Saat edit: kirim data URL hanya untuk foto yang berubah, string kosong
  // untuk menghapus, atau hilangkan field-nya (undefined) untuk
  // mempertahankan foto lama. Helper saveKoperasiAnggota menangani ini.
  fotoKtp?: string;
  fotoAnggota?: string;
  tandaTangan?: string;
};

export interface KoperasiCabangRow {
  nama: string;
  jumlah: number;
}

export interface KoperasiUrlRow {
  id: string;
  judul: string;
  url: string;
  deskripsi: string;
}

export interface KoperasiPengaturan {
  urls: KoperasiUrlRow[];
  defaultUrlId: string | null;
  cabang: string[];
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data ?? body;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

/** Normalisasi satu baris anggota dari bentuk API apa pun ke KoperasiAnggota. */
export function normalizeAnggota(a: any): KoperasiAnggota {
  const foto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id: String(a?.id ?? ''),
    cabang: a?.cabang ?? '',
    nik: a?.nik ?? '',
    namaLengkap: a?.namaLengkap ?? a?.nama ?? '',
    tempatLahir: a?.tempatLahir ?? '',
    tanggalLahir:
      typeof a?.tanggalLahir === 'string' ? a.tanggalLahir.slice(0, 10) : '',
    jenisKelamin: a?.jenisKelamin ?? '',
    alamatKtp: a?.alamatKtp ?? a?.alamat ?? '',
    noHp: a?.noHp ?? '',
    namaIbuKandung: a?.namaIbuKandung ?? '',
    pekerjaan: a?.pekerjaan ?? '',
    statusPerkawinan: a?.statusPerkawinan ?? '',
    penghasilanBulanan: a?.penghasilanBulanan ?? '',
    tujuanKeanggotaan: a?.tujuanKeanggotaan ?? '',
    fotoKtp: foto(a?.fotoKtpUrl ?? a?.fotoKtp),
    fotoAnggota: foto(a?.fotoAnggotaUrl ?? a?.fotoAnggota),
    tandaTangan: foto(a?.tandaTanganUrl ?? a?.tandaTangan),
    setujuMobileBanking: !!a?.setujuMobileBanking,
    setujuPernyataan: !!a?.setujuPernyataan,
    hasSimpanan: !!a?.hasSimpanan,
    hasPinjaman: !!a?.hasPinjaman,
    createdBy: a?.createdBy,
    createdAt: a?.createdAt,
    updatedAt: a?.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Anggota
// ---------------------------------------------------------------------------
export async function fetchKoperasiAnggota(params?: {
  search?: string;
  cabang?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: KoperasiAnggota[]; total: number; page: number }> {
  const data = await apiJson(
    `/api/koperasi/anggota${qs({
      search: params?.search,
      cabang: params?.cabang,
      page: params?.page,
      pageSize: params?.pageSize,
    })}`
  );
  const raw = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.anggota)
      ? data.anggota
      : [];
  return {
    items: raw.map(normalizeAnggota),
    total: typeof data.total === 'number' ? data.total : raw.length,
    page: typeof data.page === 'number' ? data.page : (params?.page ?? 1),
  };
}

export async function fetchKoperasiAnggotaDetail(id: string): Promise<KoperasiAnggota> {
  const data = await apiJson(`/api/koperasi/anggota/${encodeURIComponent(id)}`);
  const raw = data.anggota ?? data;
  if (!raw || !raw.id) throw new Error('Data anggota tidak ditemukan.');
  return normalizeAnggota(raw);
}

export async function createKoperasiAnggota(
  input: KoperasiAnggotaInput
): Promise<KoperasiAnggota> {
  const data = await apiJson('/api/koperasi/anggota', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return normalizeAnggota(data.anggota ?? data);
}

export async function updateKoperasiAnggota(
  id: string,
  input: Partial<KoperasiAnggotaInput>
): Promise<KoperasiAnggota> {
  // Kontrak: PATCH /api/koperasi/anggota/[id].
  const data = await apiJson(`/api/koperasi/anggota/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return normalizeAnggota(data.anggota ?? data);
}

export async function deleteKoperasiAnggota(id: string): Promise<void> {
  await apiJson(`/api/koperasi/anggota/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function checkNik(nik: string): Promise<{
  exists: boolean;
  anggota?: { id: string; namaLengkap: string; cabang: string };
}> {
  const data = await apiJson(`/api/koperasi/check-nik${qs({ nik })}`);
  const a = data.anggota;
  return {
    exists: !!data.exists,
    anggota: a
      ? {
          id: String(a.id ?? ''),
          namaLengkap: a.namaLengkap ?? a.nama ?? '',
          cabang: a.cabang ?? '',
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Cabang — API WOORK hanya menyediakan GET /api/koperasi/cabang (daftar
// nama) dan tulis lewat POST /api/koperasi/pengaturan { cabang: string[] }
// (mengganti SELURUH daftar). Tidak ada endpoint rename/hapus cabang di
// API, jadi ubah-nama & hapus diimplementasikan di sini sebagai operasi
// daftar + cascade manual per anggota (PATCH tiap anggota yang memakai
// cabang lama). Jumlah anggota per cabang tidak disediakan API — halaman
// Pengaturan menghitungnya dari daftar anggota (lihat
// fetchKoperasiAnggotaCounts).
// ---------------------------------------------------------------------------
export async function fetchKoperasiCabang(): Promise<KoperasiCabangRow[]> {
  const data = await apiJson('/api/koperasi/cabang');
  const raw: any[] = Array.isArray(data.cabang)
    ? data.cabang
    : Array.isArray(data)
      ? data
      : [];
  return raw.map((c) =>
    typeof c === 'string'
      ? { nama: c, jumlah: 0 }
      : { nama: String(c?.nama ?? ''), jumlah: Number(c?.jumlah ?? 0) }
  );
}

/** Simpan daftar cabang utuh (POST /api/koperasi/pengaturan). */
export async function saveKoperasiCabangList(namaList: string[]): Promise<void> {
  await apiJson('/api/koperasi/pengaturan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cabang: namaList }),
  });
}

export async function addKoperasiCabang(nama: string): Promise<void> {
  const list = (await fetchKoperasiCabang()).map((c) => c.nama);
  if (list.includes(nama)) throw new Error(`Cabang "${nama}" sudah ada.`);
  await saveKoperasiCabangList([...list, nama]);
}

/** Ubah nama cabang di daftar + cascade ke semua anggota pemakai. */
export async function renameKoperasiCabang(
  lama: string,
  baru: string
): Promise<{ diubah: number; gagal: number }> {
  const list = (await fetchKoperasiCabang()).map((c) => c.nama);
  if (!list.includes(lama)) throw new Error(`Cabang "${lama}" tidak ditemukan.`);
  if (list.includes(baru)) throw new Error(`Cabang "${baru}" sudah ada.`);
  await saveKoperasiCabangList(list.map((c) => (c === lama ? baru : c)));
  return cascadeCabang(lama, baru);
}

/** Hapus cabang dari daftar + pindahkan/kosongkan cabang anggotanya. */
export async function deleteKoperasiCabang(
  nama: string,
  opts?: { aksi: 'pindah' | 'kosongkan'; tujuan?: string }
): Promise<{ dipindah: number; gagal: number }> {
  const list = (await fetchKoperasiCabang()).map((c) => c.nama);
  if (!list.includes(nama)) throw new Error(`Cabang "${nama}" tidak ditemukan.`);
  await saveKoperasiCabangList(list.filter((c) => c !== nama));
  if (!opts) return { dipindah: 0, gagal: 0 };
  const r = await cascadeCabang(nama, opts.aksi === 'pindah' ? (opts.tujuan ?? '') : '');
  return { dipindah: r.diubah, gagal: r.gagal };
}

/** PATCH semua anggota dari cabang lama ke cabang baru ('' = kosongkan). */
async function cascadeCabang(
  lama: string,
  baru: string
): Promise<{ diubah: number; gagal: number }> {
  let diubah = 0;
  let gagal = 0;
  let page = 1;
  for (;;) {
    const r = await fetchKoperasiAnggota({ cabang: lama, page, pageSize: 100 });
    for (const a of r.items) {
      try {
        await updateKoperasiAnggota(a.id, { cabang: baru });
        diubah += 1;
      } catch {
        gagal += 1;
      }
    }
    if (page * 100 >= r.total || r.items.length === 0) break;
    page += 1;
  }
  return { diubah, gagal };
}

/** Hitung anggota per cabang (dipakai halaman Pengaturan; API tidak menyediakan). */
export async function fetchKoperasiAnggotaCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let page = 1;
  for (;;) {
    const r = await fetchKoperasiAnggota({ page, pageSize: 100 });
    for (const a of r.items) {
      if (a.cabang) counts[a.cabang] = (counts[a.cabang] ?? 0) + 1;
    }
    if (page * 100 >= r.total || r.items.length === 0) break;
    page += 1;
    if (page > 20) break; // batas pengaman: maks 2000 baris
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Pengaturan kirim JSON + URL tujuan
// ---------------------------------------------------------------------------
export async function fetchKoperasiPengaturan(): Promise<KoperasiPengaturan> {
  const data = await apiJson('/api/koperasi/pengaturan');
  // Kontrak: { kirimJson: { urls, defaultUrlId }, cabang }.
  // Bentuk backup: { pengaturan: { urls }, defaultUrlId } — dukung keduanya.
  const kj = data.kirimJson ?? data.pengaturan ?? {};
  const urls: any[] = Array.isArray(kj.urls)
    ? kj.urls
    : Array.isArray(data.urls)
      ? data.urls
      : [];
  const cabangRaw: any[] = Array.isArray(data.cabang)
    ? data.cabang
    : Array.isArray(kj.cabang)
      ? kj.cabang
      : [];
  return {
    urls: urls.map((u) => ({
      id: String(u?.id ?? ''),
      judul: u?.judul ?? '',
      url: u?.url ?? '',
      deskripsi: u?.deskripsi ?? '',
    })),
    defaultUrlId:
      typeof kj.defaultUrlId === 'string' && kj.defaultUrlId
        ? kj.defaultUrlId
        : typeof data.defaultUrlId === 'string' && data.defaultUrlId
          ? data.defaultUrlId
          : null,
    cabang: cabangRaw.map((c) => (typeof c === 'string' ? c : String(c?.nama ?? ''))).filter(Boolean),
  };
}

/** Simpan URL default kirim JSON (level organisasi, via POST pengaturan). */
export async function saveKoperasiDefaultUrl(id: string): Promise<void> {
  await apiJson('/api/koperasi/pengaturan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kirimJson: { defaultUrlId: id } }),
  });
}

export async function fetchKoperasiUrls(): Promise<KoperasiUrlRow[]> {
  const data = await apiJson('/api/koperasi/urls');
  const raw: any[] = Array.isArray(data.urls)
    ? data.urls
    : Array.isArray(data)
      ? data
      : [];
  return raw.map((u) => ({
    id: String(u?.id ?? ''),
    judul: u?.judul ?? '',
    url: u?.url ?? '',
    deskripsi: u?.deskripsi ?? '',
  }));
}

export async function addKoperasiUrl(input: {
  judul: string;
  url: string;
  deskripsi?: string;
}): Promise<KoperasiUrlRow[]> {
  const data = await apiJson('/api/koperasi/urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (data.urls ?? []) as KoperasiUrlRow[];
}

export async function updateKoperasiUrl(input: KoperasiUrlRow): Promise<KoperasiUrlRow[]> {
  // PUT /api/koperasi/urls?id= — id lewat query, bukan body.
  const data = await apiJson(`/api/koperasi/urls${qs({ id: input.id })}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      judul: input.judul,
      url: input.url,
      deskripsi: input.deskripsi,
    }),
  });
  return (data.urls ?? []) as KoperasiUrlRow[];
}

export async function deleteKoperasiUrl(id: string): Promise<KoperasiUrlRow[]> {
  const data = await apiJson(`/api/koperasi/urls${qs({ id })}`, {
    method: 'DELETE',
  });
  return (data.urls ?? []) as KoperasiUrlRow[];
}

// ---------------------------------------------------------------------------
// Kirim JSON + OCR KTP (ditunda)
// ---------------------------------------------------------------------------
export async function kirimAnggotaJson(
  anggotaId: string,
  urlId?: string
): Promise<{ success: boolean; status?: number; tujuan?: string; detail?: string }> {
  const data = await apiJson('/api/koperasi/kirim-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anggotaId, urlId: urlId || undefined }),
  });
  return {
    success: data.success !== false,
    status: data.status,
    tujuan: data.tujuan,
    detail: data.detail,
  };
}

/** OCR KTP DITUNDA (kontrak Gelombang 5): API selalu 200 { configured: false }. */
export async function ocrKtp(): Promise<{ configured: false; message: string }> {
  const data = await apiJson('/api/koperasi/anggota/ocr-ktp', { method: 'POST' });
  return {
    configured: false,
    message:
      data?.message ||
      'OCR KTP belum dikonfigurasi — membutuhkan kunci AI (modul API keys, Gelombang 6). Isi data anggota secara manual.',
  };
}

/** URL serve untuk satu foto anggota (dipakai <img> di list/detail/form). */
export function fotoServeUrl(
  anggotaId: string,
  type: 'ktp' | 'anggota' | 'ttd'
): string {
  return `/api/koperasi/anggota/${encodeURIComponent(anggotaId)}/foto?type=${type}`;
}
