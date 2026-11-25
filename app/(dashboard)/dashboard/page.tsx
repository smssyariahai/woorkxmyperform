import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthContext } from '@/lib/auth-helpers';
import { Card, CardTitle, Badge, Avatar } from '@/components/ui/primitives';
import { SubscriptionBanner } from '@/components/dashboard/SubscriptionBanner';
import { ConversationChart, PipelineChart } from '@/components/dashboard/charts';
import { timeAgo } from '@/lib/utils';
import {
  Users, UserPlus, MessagesSquare, TrendingUp, CalendarClock,
  ArrowRight, Bot, Sparkles,
} from 'lucide-react';

async function getStats(baseUrl: string, cookie: string) {
  const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.success ? j.data : null;
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const { headers } = await import('next/headers');
  const cookie = headers().get('cookie') ?? '';
  const stats = await getStats(baseUrl, cookie);

  const firstName = ctx.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';

  const cards = stats
    ? [
        { label: 'Total Pelanggan', value: stats.cards.totalCustomers.toLocaleString('id-ID'), icon: Users, tone: 'bg-brand-50 text-brand dark:bg-brand-900/30' },
        { label: 'Lead Baru (7 hari)', value: stats.cards.newLeads.toLocaleString('id-ID'), icon: UserPlus, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' },
        { label: 'Percakapan Aktif', value: stats.cards.openConversations.toLocaleString('id-ID'), icon: MessagesSquare, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30' },
        { label: 'Conversion Rate', value: `${stats.cards.conversionRate}%`, icon: TrendingUp, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-muted">Berikut ringkasan aktivitas workspace Anda hari ini.</p>
        </div>
        {stats && stats.cards.pendingFollowUps > 0 && (
          <Link href="/crm?tab=followups" className="badge-amber !py-1.5 !px-3.5 hover:brightness-95">
            <CalendarClock className="h-3.5 w-3.5" />
            {stats.cards.pendingFollowUps} follow up jatuh tempo
          </Link>
        )}
      </div>

      <SubscriptionBanner />

      {!stats ? (
        <Card>
          <p className="text-sm text-muted">Gagal memuat statistik. Silakan muat ulang halaman.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map((c) => (
              <Card key={c.label} className="!p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.tone}`}>
                    <c.icon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-4 text-[28px] font-bold text-ink leading-none">{c.value}</p>
                <p className="mt-1.5 text-[13px] text-muted">{c.label}</p>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <CardTitle>Grafik Percakapan</CardTitle>
                <Badge tone="blue">7 hari terakhir</Badge>
              </div>
              <ConversationChart data={stats.conversationsByDay} />
            </Card>
            <Card>
              <div className="flex items-center justify-between mb-4">
                <CardTitle>Pipeline Lead</CardTitle>
                <Link href="/crm/leads" className="text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1">
                  Lihat kanban <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <PipelineChart data={stats.leadsByStage} />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardTitle className="mb-4">Aktivitas Terakhir</CardTitle>
              <div className="space-y-1">
                {stats.recentActivities.length === 0 && (
                  <p className="text-[13px] text-muted py-6 text-center">Belum ada aktivitas.</p>
                )}
                {stats.recentActivities.map((a: any) => (
                  <div key={a.id} className="flex gap-3 py-2.5 border-b border-line/60 last:border-0">
                    <Avatar name={a.actor?.name ?? 'Sistem'} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink">
                        <b>{a.actor?.name ?? 'Sistem'}</b> — {a.title}
                        {a.customer && <> · <span className="text-muted">{a.customer.name}</span></>}
                      </p>
                      {a.description && <p className="text-[12px] text-muted truncate">{a.description}</p>}
                      <p className="text-[11px] text-muted mt-0.5">{timeAgo(a.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardTitle className="mb-4">Performa Tim</CardTitle>
                <div className="space-y-3">
                  {stats.topAgents.map((a: any, i: number) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="text-[12px] font-bold text-muted w-5">#{i + 1}</span>
                      <Avatar name={a.name} size={32} />
                      <span className="flex-1 text-[13px] font-medium text-ink truncate">{a.name}</span>
                      <span className="text-[12px] text-muted">{a.messages} pesan</span>
                      <span className="text-[12px] text-muted">{a.leads} lead</span>
                    </div>
                  ))}
                  {stats.topAgents.length === 0 && (
                    <p className="text-[13px] text-muted py-4 text-center">Belum ada data tim.</p>
                  )}
                </div>
              </Card>
              <Card className="!bg-brand-900 !border-brand-900">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white shrink-0">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-white">Woo sedang menangani percakapan</p>
                    <p className="mt-1 text-[13px] text-white/70">
                      Biarkan Woo menyapa pelanggan baru dan mengkualifikasi lead otomatis.
                    </p>
                    <Link
                      href="/bot"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-btn bg-white px-4 py-2 text-[13px] font-semibold text-brand-900 hover:bg-brand-50"
                    >
                      <Sparkles className="h-4 w-4" /> Kelola Bot
                    </Link>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
