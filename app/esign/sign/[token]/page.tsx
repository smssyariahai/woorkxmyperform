import { SignPage } from '@/components/esign/SignPage';

export const metadata = { title: 'Tanda Tangani Dokumen — WOORK' };

/**
 * Halaman sign publik (DI LUAR (dashboard)): tautan dari WhatsApp harus
 * bisa dicek kedaluwarsanya SEBELUM login. Layout (dashboard) memaksa
 * redirect ke /login sebelum halaman dirender, jadi halaman ini sengaja
 * ditempatkan di luar grup tersebut. Validasi token + auth dilakukan
 * di dalam SignPage / API.
 */
export default function EsignSignPage({ params }: { params: { token: string } }) {
  return <SignPage token={params.token} />;
}
