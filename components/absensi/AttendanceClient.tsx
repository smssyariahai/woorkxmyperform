// WOORK ATTENDANCE — klien utama: header + tab. Tiap tab dimuat saat
// dibuka (lazy), agar halaman awal ringan.
'use client';

import { useState } from 'react';
import {
  Clock,
  History,
  FileEdit,
  MoonStar,
  Users,
  LayoutDashboard,
  BarChart3,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CheckInCard } from './CheckInCard';
import { RecordsTable } from './RecordsTable';
import { CorrectionsSection } from './CorrectionsSection';
import { OvertimeSection } from './OvertimeSection';
import { TeamSection } from './TeamSection';
import { DashboardSection } from './DashboardSection';
import { ReportsSection } from './ReportsSection';
import { SettingsSection } from './SettingsSection';

type TabKey = 'today' | 'records' | 'corrections' | 'overtime' | 'team' | 'dashboard' | 'reports' | 'settings';

const ALL_TABS: Array<{ key: TabKey; label: string; icon: typeof Clock; manageOnly: boolean }> = [
  { key: 'today', label: 'Hari Ini', icon: Clock, manageOnly: false },
  { key: 'records', label: 'Riwayat', icon: History, manageOnly: false },
  { key: 'corrections', label: 'Koreksi', icon: FileEdit, manageOnly: false },
  { key: 'overtime', label: 'Lembur', icon: MoonStar, manageOnly: false },
  { key: 'team', label: 'Tim', icon: Users, manageOnly: true },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, manageOnly: true },
  { key: 'reports', label: 'Laporan', icon: BarChart3, manageOnly: true },
  { key: 'settings', label: 'Pengaturan', icon: Settings, manageOnly: true },
];

export function AttendanceClient({
  canCheckIn,
  canManage,
  userName,
  organizationName,
}: {
  canCheckIn: boolean;
  canManage: boolean;
  userName: string;
  organizationName: string;
}) {
  const [tab, setTab] = useState<TabKey>('today');
  const tabs = ALL_TABS.filter((t) => !t.manageOnly || canManage);

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4 sm:px-4">
      <header>
        <h1 className="text-[22px] font-bold leading-tight text-ink">Attendance</h1>
        <p className="mt-1 text-[13px] text-muted">
          Absensi {organizationName ? `· ${organizationName}` : ''} — check in/out dengan GPS, riwayat, koreksi,
          lembur, dan dashboard HRD.
        </p>
        <p className="mt-0.5 text-[12px] text-muted">Halo, {userName} — absensi hari ini ada di tab “Hari Ini”.</p>
      </header>

      <nav className="mt-4 flex gap-1 overflow-x-auto pb-1" aria-label="Tab Attendance">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === t.key
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-4">
        {tab === 'today' && (
          <CheckInCard canCheckIn={canCheckIn} onGoToSettings={() => setTab('settings')} />
        )}
        {tab === 'records' && <RecordsTable canManage={canManage} />}
        {tab === 'corrections' && <CorrectionsSection canManage={canManage} />}
        {tab === 'overtime' && <OvertimeSection canManage={canManage} />}
        {tab === 'team' && canManage && <TeamSection />}
        {tab === 'dashboard' && canManage && <DashboardSection />}
        {tab === 'reports' && canManage && <ReportsSection />}
        {tab === 'settings' && canManage && <SettingsSection />}
      </div>
    </div>
  );
}
