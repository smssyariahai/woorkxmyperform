import { DocumentDetail } from '@/components/esign/DocumentDetail';

export const metadata = { title: 'Detail Dokumen E-Sign — WOORK' };

export default function EsignDetailPage({ params }: { params: { id: string } }) {
  return <DocumentDetail id={params.id} />;
}
