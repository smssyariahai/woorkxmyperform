'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Building2, Users, Activity, ShieldCheck, ArrowRight } from 'lucide-react';

export function SuperDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/super/stats')
      .then((r) => r.json())
      .then((j) => j.success && setStats(j.data))
      .catch(() => {});
  }, []);

  const cards = [
    { label: 'Total Kantor', value: stats?.offices ?? '…', icon: Building2, tone: 'bg-brand-50 text-brand dark:bg-brand-900/30' },
    { label: 'Kantor Aktif', value: stats?.activeOffices ?? '…', icon: Building2, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' },
    { label: 'Total Pengguna', value: stats?.users ?? '…', icon: Users, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30' },
    { label: 'Aktivitas 24 Jam', value: stats?.auditToday ?? '…', icon: Activity, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-brand" /> Administrator Pusat
          </h1>
          <p className="text-sm text-muted">Kendali global seluruh kantor Woork.id.</p>
        </div>
        <Link href="/admin/offices" className="btn-primary !py-2 text-[13px]">
          Kelola Kantor <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="!p-5">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-btn ${c.tone}`}>
                <c.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[22px] font-bold text-ink leading-none">{c.value}</p>
                <p className="text-[12px] text-muted mt-1">{c.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Kantor terbaru</CardTitle>
        <div className="mt-4 space-y-2">
          {(stats?.recentOffices ?? []).map((o: any) => (
            <Link
              key={o.id}
              href={`/admin/offices/${o.id}`}
              className="flex items-center justify-between rounded-btn border border-line px-4 py-3 hover:border-brand/40 transition-colors"
            >
              <span>
                <span className="block text-[14px] font-semibold text-ink">{o.name}</span>
                <span className="block text-[12px] text-muted">{o.userCount} pengguna</span>
              </span>
              <span className={`badge ${o.isActive ? 'badge-green' : 'badge-gray'}`}>
                {o.isActive ? 'Aktif' : 'Nonaktif'}
              </span>
            </Link>
          ))}
          {stats && stats.recentOffices.length === 0 && (
            <p className="text-sm text-muted py-4 text-center">Belum ada kantor.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
