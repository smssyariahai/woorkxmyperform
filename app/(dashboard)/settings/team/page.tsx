import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { TeamClient } from '@/components/settings/TeamClient';

export const metadata = { title: 'Tim — WOORK' };

export default async function TeamPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return <TeamClient selfId={ctx.userId} />;
}
