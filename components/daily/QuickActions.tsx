// Aksi Cepat — HANYA tindakan yang modulnya ada, user punya izin, dan
// benar-benar bisa dijalankan. (Tanpa Buat Project / Check Attendance —
// modulnya belum ada.)
'use client';

import Link from 'next/link';
import {
  ListChecks, CalendarDays, Video, Palmtree, Archive, Ticket,
} from 'lucide-react';

const ACTIONS = [
  { key: 'task', label: 'Buat Tugas', href: '/tal/tasks', Icon: ListChecks },
  { key: 'event', label: 'Buat Event', href: '/kalender', Icon: CalendarDays },
  { key: 'meeting', label: 'Jadwalkan Meeting', href: '/meet/new', Icon: Video },
  { key: 'leave', label: 'Ajukan Cuti', href: '/tal/kalender-kerja', Icon: Palmtree },
  { key: 'calendar', label: 'Buka Work Calendar', href: '/kalender', Icon: CalendarDays },
  { key: 'document', label: 'Upload Dokumen', href: '/earsip', Icon: Archive },
  { key: 'ticket', label: 'Buat Tiket', href: '/tiket', Icon: Ticket },
];

export function QuickActions() {
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="text-[15px] font-semibold text-ink">Aksi Cepat</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {ACTIONS.map(({ key, label, href, Icon }) => (
          <Link
            key={key}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-btn border border-line px-2 py-3 text-center transition-colors hover:border-brand hover:bg-brand-50/50 dark:hover:bg-slate-800"
          >
            <Icon className="h-5 w-5 text-brand" />
            <span className="text-[12px] font-medium leading-tight text-ink">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
