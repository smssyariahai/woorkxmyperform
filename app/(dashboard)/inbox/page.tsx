import { Suspense } from 'react';
import { InboxClient } from '@/components/inbox/InboxClient';

export const metadata = { title: 'Inbox — WOORK' };

export default function InboxPage() {
  return (
    <Suspense>
      <InboxClient />
    </Suspense>
  );
}
