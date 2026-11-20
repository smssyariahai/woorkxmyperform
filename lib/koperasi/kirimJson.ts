// lib/koperasi/kirimJson.ts — port dari backup MyPerform
// (src/components/koperasi/kirimJson.ts): pembangun payload JSON pendaftaran
// anggota untuk dikirim ke server tujuan. Bentuknya selalu
// { title: "PENDAFTARAN_ANGGOTA", data }.
// Foto (KTP, foto anggota, tanda tangan) dikirim sebagai base64 — persis
// seperti yang tersimpan di aplikasi, yaitu data URL
// ("data:image/jpeg;base64,..." / "data:image/png;base64,...").
// Field foto kosong ("") bila anggota tidak punya foto itu.
// Catatan WOORK: di list/detail, foto anggota tersimpan sebagai URL serve,
// bukan data URL — KirimJsonModal hanya mengirim foto bila nilainya data URL,
// bila tidak, field foto dikirim "" (server tujuan tidak bisa mengambil URL
// serve yang butuh login WOORK).

export interface AnggotaJsonSource {
  cabang?: string;
  nik?: string;
  namaLengkap?: string;
  tempatLahir?: string;
  tanggalLahir?: string;
  jenisKelamin?: string;
  alamatKtp?: string;
  noHp?: string;
  namaIbuKandung?: string;
  pekerjaan?: string;
  statusPerkawinan?: string;
  penghasilanBulanan?: string;
  tujuanKeanggotaan?: string;
  fotoKtp?: string;
  fotoAnggota?: string;
  tandaTangan?: string;
  setujuMobileBanking?: boolean;
  createdAt?: string;
}

export interface AnggotaJsonPayload {
  title: string;
  data: Record<string, unknown>;
}

/** Hanya data URL yang boleh ikut sebagai base64; URL serve/login dikosongkan. */
function fotoForJson(v?: string): string {
  return typeof v === 'string' && v.startsWith('data:image/') ? v : '';
}

export function buildAnggotaJson(src: AnggotaJsonSource): AnggotaJsonPayload {
  const data: Record<string, unknown> = {
    cabang: src.cabang || '',
    nama: src.namaLengkap || '',
    tempat_lahir: src.tempatLahir || '',
    tgllahir: src.tanggalLahir || '',
    jenis_kelamin: src.jenisKelamin || '',
    no_id: src.nik || '',
    alamat: src.alamatKtp || '',
    no_hp: src.noHp || '',
    nama_ibu_kandung: src.namaIbuKandung || '',
    pekerjaan: src.pekerjaan || '',
    status_perkawinan: src.statusPerkawinan || '',
    penghasilan_bulanan: src.penghasilanBulanan || '',
    tujuan_keanggotaan: src.tujuanKeanggotaan || '',
    setuju_mobile_banking: !!src.setujuMobileBanking,
    foto_ktp: fotoForJson(src.fotoKtp),
    foto_anggota: fotoForJson(src.fotoAnggota),
    tanda_tangan: fotoForJson(src.tandaTangan),
  };
  if (src.createdAt) {
    const d = new Date(src.createdAt);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      data.tanggal_daftar = `${y}-${m}-${day}`;
    }
  }
  return { title: 'PENDAFTARAN_ANGGOTA', data };
}
