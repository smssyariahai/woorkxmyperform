// app/(dashboard)/koperasi/anggota-baru/[id]/page.tsx — form edit anggota.
// Port dari backup MyPerform (src/pages/KoperasiAnggotaForm.tsx, mode edit):
// form yang sama, memuat data via GET /api/koperasi/anggota/[id]; foto lama
// tampil dari URL serve; foto baru dikirim sebagai data URL; hapus foto =
// kirim string kosong; foto tak berubah tidak dikirim (dipertahankan).
'use client';

import { useParams } from 'next/navigation';
import AnggotaForm from '@/components/koperasi/AnggotaForm';

export default function KoperasiAnggotaEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  return <AnggotaForm anggotaId={id} />;
}
