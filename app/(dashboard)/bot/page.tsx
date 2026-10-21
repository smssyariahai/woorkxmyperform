import { getAuthContext } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { BotTabs } from '@/components/bot/BotTabs';

export const metadata = { title: 'Bot — WOORK' };

export default async function BotPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return <BotTabs isSuperAdmin={ctx.isSuperAdmin} />;
}
