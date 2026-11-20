import { HrDetailClient } from '@/components/hr/HrDetailClient';

export const metadata = { title: 'Detail Karyawan — HR Detail | WOORK' };

export default function HrDetailPage({ params }: { params: { id: string } }) {
  return <HrDetailClient id={params.id} />;
}
