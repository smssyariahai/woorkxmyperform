import { GuestJoin } from '@/components/meet/GuestJoin';

export const metadata = { title: 'Gabung Meeting — WOORK MEET' };

/**
 * Halaman tamu PUBLIK (DI LUAR (dashboard)): tautan undangan harus bisa
 * dibuka tanpa login. Layout (dashboard) memaksa redirect ke /login sebelum
 * halaman dirender, jadi halaman ini sengaja ditempatkan di luar grup
 * tersebut — pola yang sama dengan app/esign/sign/[token].
 * '/meet/guest' didaftarkan di PUBLIC_PATHS middleware.ts.
 */
export default function MeetGuestPage({ params }: { params: { token: string } }) {
  return <GuestJoin token={params.token} />;
}
