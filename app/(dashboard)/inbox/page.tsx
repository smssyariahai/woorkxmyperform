import { Suspense } from 'react';
import { InboxClient } from '@/components/inbox/InboxClient';

export const metadata = { title: 'Inbox — WOORK' };

export default function InboxPage() {
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6">
      <Suspense>
        <InboxClient />
      </Suspense>
    </div>
  );
}
