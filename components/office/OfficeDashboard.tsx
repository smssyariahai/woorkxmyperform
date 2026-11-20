'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Users, KeyRound, Network, Activity, ArrowRight } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export function OfficeDashboard() {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((r) => r.json())
      .then((j) => j.success && setD(j.data))
      .catch(() => {});
  }, []);

  const perms: string[] = d?.permissions ?? [];
  const has = (...ks: string[]) => perms.includes('*') || ks.some((k) => perms.includes(k));

  const cards = [
    { label: 'Pengguna', value: d?.users ?? '…', sub: `${d?.activeUsers ?? '…'} aktif`, icon: Users, tone: 'bg-brand-50 text-brand dark:bg-brand-900/30', href: has('USERS_VIEW') ? '/admin-kantor/users' : null },
    { label: 'Role', value: d?.roles ?? '…', sub: 'termasuk template divisi', icon: KeyRound, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30', href: has('ROLES_VIEW') ? '/admin-kantor/roles' : null },
    { label: 'Divisi', value: d?.departments ?? '…', sub: 'struktur organisasi', icon: Network, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30', href: has('DEPARTMENTS_VIEW') ? '/admin-kantor/departments' : null },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Dashboard Kantor</h1>
        <p className="text-sm text-muted">Kelola pengguna, role, divisi, dan pengaturan kantor Anda.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => {
          const inner = (
            <Card className="!p-5">
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-btn ${c.tone}`}>
                  <c.icon className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-[22px] font-bold text-ink leading-none">{c.value}</p>
                  <p className="text-[12px] text-muted mt-1">{c.label} · {c.sub}</p>
                </div>
                {c.href && <ArrowRight className="h-4 w-4 text-muted" />}
              </div>
            </Card>
          );
          return c.href ? <Link key={c.label} href={c.href}>{inner}</Link> : <div key={c.label}>{inner}</div>;
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Komposisi Role</CardTitle>
          <div className="mt-3 space-y-2">
            {(d?.byRole ?? []).map((b: any) => (
              <div key={b.role} className="flex items-center justify-between text-[13.5px]">
                <span className="inline-flex items-center gap-2">
                  <Badge tone="blue">{b.role}</Badge>
                </span>
                <span className="font-semibold text-ink">{b.count} orang</span>
              </div>
            ))}
            {d && d.byRole.length === 0 && <p className="text-sm text-muted">Belum ada data.</p>}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Aktivitas Terakhir</CardTitle>
            {has('AUDIT_VIEW') && (
              <Link href="/audit" className="text-[12.5px] text-brand hover:underline">Lihat semua</Link>
            )}
          </div>
          <div className="mt-3 space-y-2.5">
            {(d?.recentAudit ?? []).map((a: any) => (
              <div key={a.id} className="flex gap-3 text-[13px]">
                <Activity className="h-4 w-4 mt-0.5 text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-ink truncate">{a.description ?? a.action}</p>
                  <p className="text-[11.5px] text-muted">{a.actor} · {formatDateTime(a.createdAt)}</p>
                </div>
              </div>
            ))}
            {d && d.recentAudit.length === 0 && <p className="text-sm text-muted">Belum ada aktivitas.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
