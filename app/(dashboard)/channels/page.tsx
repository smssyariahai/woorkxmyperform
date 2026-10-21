import { Suspense } from 'react';
import { ChannelsClient } from '@/components/channels/ChannelsClient';

export const metadata = { title: 'Saluran — WOORK' };

export default function ChannelsPage() {
  return (
    <Suspense>
      <ChannelsClient />
    </Suspense>
  );
}
