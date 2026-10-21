import { CustomerDetailClient } from '@/components/crm/CustomerDetailClient';

export const metadata = { title: 'Detail Pelanggan — WOORK' };

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return <CustomerDetailClient id={params.id} />;
}
