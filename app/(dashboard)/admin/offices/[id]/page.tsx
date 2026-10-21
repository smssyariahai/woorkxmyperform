import { OfficeDetailClient } from '@/components/super/OfficeDetailClient';

export const metadata = { title: 'Detail Kantor — Administrator Pusat' };

export default function OfficeDetailPage({ params }: { params: { id: string } }) {
  return <OfficeDetailClient id={params.id} />;
}
