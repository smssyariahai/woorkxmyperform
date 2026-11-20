// components/tal/dashboard/TalDashboardShortcuts.tsx — "NAVIGASI HALAMAN
// TAL": 6 kartu shortcut ke halaman-halaman TAL.
// Porting src/components/tal/dashboard/TalDashboardShortcuts.tsx (backup
// MyPerform). Adaptasi WOORK:
// - Link react-router-dom -> next/link.
// - Filter izin berbasis useAuth/modulePermissions backup DIHAPUS: semua user
//   login yang bisa membuka hub TAL melihat ke-6 kartu (akses modul ditegakkan
//   AppShell; halaman tujuan masing-masing tetap memvalidasi aksesnya).
// - Kartu "Tim Saya" (/tal-tim-saya) TIDAK ditampilkan di hub — sesuai
//   screenshot referensi & spesifikasi grup 1 (6 kartu); halaman Tim Saya
//   tetap ada di /tal/tal-tim-saya dan ditautkan dari tempat lain.
// - Varian dark: backup dibuang (WOORK tidak memakai dark mode).
'use client';

import React from 'react';
import Link from 'next/link';
import { ListTodo, Sparkles, BarChart3, BarChart2, Award, Sliders, type LucideIcon } from 'lucide-react';

interface ShortcutItem {
  id: string;
  to: string;
  label: string;
  subLabel: string;
  icon: LucideIcon;
  title?: string;
  bgColor: string;
  textColor: string;
  hoverBorderColor: string;
  hoverBgColor: string;
  hoverTextColor: string;
}

const ALL_SHORTCUT_ITEMS: ShortcutItem[] = [
  {
    id: 'tal-tasks',
    to: '/tal/tasks',
    label: 'Task',
    subLabel: 'Kelola Tugas',
    icon: ListTodo,
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-600',
    hoverBorderColor: 'hover:border-indigo-400',
    hoverBgColor: 'group-hover:bg-indigo-600 group-hover:text-white',
    hoverTextColor: 'group-hover:text-indigo-600'
  },
  {
    id: 'tal-templates',
    to: '/tal/templates',
    label: 'Template Rutinitas',
    subLabel: 'Preset Kerja',
    icon: Sparkles,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    hoverBorderColor: 'hover:border-amber-400',
    hoverBgColor: 'group-hover:bg-amber-600 group-hover:text-white',
    hoverTextColor: 'group-hover:text-amber-600'
  },
  {
    id: 'tal-rekapitulasi',
    to: '/tal/rekapitulasi',
    label: 'Rekap Karyawan',
    subLabel: 'Laporan Saya',
    icon: BarChart3,
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
    hoverBorderColor: 'hover:border-cyan-400',
    hoverBgColor: 'group-hover:bg-cyan-600 group-hover:text-white',
    hoverTextColor: 'group-hover:text-cyan-600'
  },
  {
    id: 'tal-rekapitulasi-hr',
    to: '/tal/rekapitulasi-hr',
    label: 'Rekap TAL (HR)',
    subLabel: 'Monitoring Tim',
    icon: BarChart2,
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    hoverBorderColor: 'hover:border-emerald-400',
    hoverBgColor: 'group-hover:bg-emerald-600 group-hover:text-white',
    hoverTextColor: 'group-hover:text-emerald-600'
  },
  {
    id: 'tal-badges',
    to: '/tal/badges',
    label: 'Trophy Room',
    subLabel: 'Galeri Lencana',
    icon: Award,
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    hoverBorderColor: 'hover:border-amber-400',
    hoverBgColor: 'group-hover:bg-amber-500 group-hover:text-white',
    hoverTextColor: 'group-hover:text-amber-700'
  },
  {
    id: 'tal-preferences',
    to: '/tal/preferences',
    label: 'Preferensi TAL',
    subLabel: 'Notifikasi & DND',
    icon: Sliders,
    title: 'Preferensi TAL: Personalisasi & Pengaturan Notifikasi TAL',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    hoverBorderColor: 'hover:border-purple-400',
    hoverBgColor: 'group-hover:bg-purple-600 group-hover:text-white',
    hoverTextColor: 'group-hover:text-purple-600'
  }
];

export const TalDashboardShortcuts: React.FC = () => {
  const permittedShortcuts = ALL_SHORTCUT_ITEMS;

  // Dynamic grid class based on visible count
  const getGridColsClass = () => {
    switch (permittedShortcuts.length) {
      case 1:
        return 'grid-cols-1 sm:grid-cols-1 max-w-xs';
      case 2:
        return 'grid-cols-2 sm:grid-cols-2 max-w-lg';
      case 3:
        return 'grid-cols-2 sm:grid-cols-3';
      case 4:
        return 'grid-cols-2 sm:grid-cols-4';
      case 5:
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';
      case 6:
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';
      case 7:
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7';
      default:
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Navigasi Halaman TAL
        </span>
      </div>
      <div className={`grid ${getGridColsClass()} gap-2 sm:gap-2.5`}>
        {permittedShortcuts.map(item => {
          const IconComponent = item.icon;
          return (
            <Link
              key={item.id}
              href={item.to}
              title={item.title || item.label}
              className={`bg-white rounded-xl border border-slate-200/90 p-2.5 shadow-sm hover:shadow-md ${item.hoverBorderColor} transition-all group flex items-center gap-2`}
            >
              <div className={`w-8 h-8 rounded-lg ${item.bgColor} ${item.textColor} flex items-center justify-center group-hover:scale-105 ${item.hoverBgColor} transition shrink-0`}>
                <IconComponent size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={`text-xs font-bold text-slate-800 ${item.hoverTextColor} transition block truncate`}>
                  {item.label}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {item.subLabel}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
