// components/tal/TalNotificationDropdown.tsx — lonceng notifikasi TAL.
// Porting src/components/tal/TalNotificationDropdown.tsx (backup MyPerform).
// Adaptasi WOORK (besar, karena model notifikasi berbeda):
// - tal_notifications backup TIDAK dibuat di WOORK (lihat prisma/schema.prisma
//   § "Modul TAL"): notifikasi TAL memakai model Notification generik WOORK
//   (type 'TAL_*', field id/type/title/body/isRead/createdAt) dan dibaca
//   lewat GET /api/notifications?limit= — BUKAN fetchTalNotifications
//   (talService/Firestore) yang tidak ada di WOORK.
// - Tandai dibaca: PATCH /api/notifications/[id] (markNotificationRead di
//   lib/tal/client.ts) dan PATCH /api/notifications (tandai semua).
// - Tidak ada senderName/senderPhoto/taskId di model WOORK, jadi avatar
//   pengirim & navigasi ke tugas backup DIHILANGKAN; klik notifikasi hanya
//   menandai dibaca. Prop onNavigateToTask backup tidak dipertahankan.
// - onOpenSettings tetap ada; bila tidak diberikan, tombol pengaturan
//   mengarah ke /tal/preferences.
// - currentUserEmail/currentUserName diterima (kompatibilitas API backup)
//   namun tidak dipakai: API WOORK sudah session-scoped.
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  Inbox,
  Clock,
  Sliders,
  X,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { markNotificationRead } from '@/lib/tal/client';

interface WoorkNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface TalNotificationDropdownProps {
  currentUserEmail?: string;
  currentUserName?: string;
  onOpenSettings?: () => void;
}

export const TalNotificationDropdown: React.FC<TalNotificationDropdownProps> = ({
  onOpenSettings
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<WoorkNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=10', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      const data = body.data ?? body;
      setNotifications(((data.items ?? []) as WoorkNotification[]));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
    } catch (err) {
      console.error(err);
    }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotificationClick = async (notif: WoorkNotification) => {
    if (!notif.isRead) {
      try {
        await markNotificationRead(notif.id);
      } catch (err) {
        console.error(err);
      }
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    setIsOpen(false);
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 2) return 'Baru saja';
      if (diffMins < 60) return `${diffMins} mnt lalu`;
      if (diffHours < 24) return `${diffHours} jam lalu`;
      if (diffDays === 1) return 'Kemarin';
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case 'TAL_DEADLINE_PLAN':
      case 'TAL_PLAN_LOCK':
        return <ShieldAlert size={12} className="text-indigo-600" />;
      case 'TAL_DEADLINE_REPORT':
      case 'TAL_REPORT_SCORE':
        return <CheckCircle2 size={12} className="text-emerald-600" />;
      case 'TAL_BLOCKER':
        return <AlertTriangle size={12} className="text-amber-600" />;
      case 'TAL_ASSIGNMENT':
        return <Clock size={12} className="text-blue-600" />;
      default:
        return <Sparkles size={12} className="text-blue-500" />;
    }
  };

  const settingsButton = onOpenSettings ? (
    <button
      type="button"
      onClick={() => {
        setIsOpen(false);
        onOpenSettings();
      }}
      className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-200/60 transition cursor-pointer"
      title="Pengaturan Notifikasi & Personalisasi"
    >
      <Sliders size={14} />
    </button>
  ) : (
    <Link
      href="/tal/preferences"
      onClick={() => setIsOpen(false)}
      className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-200/60 transition cursor-pointer"
      title="Pengaturan Notifikasi & Personalisasi"
    >
      <Sliders size={14} />
    </Link>
  );

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        className={`relative p-2 rounded-xl border transition cursor-pointer ${
          isOpen
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
        title="Pemberitahuan Tugas"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white font-extrabold text-[10px] rounded-full flex items-center justify-center border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popup */}
      {isOpen && (
        <>
          {/* Backdrop overlay to close when clicked outside */}
          <div
            className="fixed inset-0 bg-slate-900/20 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none z-40 animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed left-1/2 -translate-x-1/2 top-20 sm:top-auto sm:left-auto sm:right-0 sm:translate-x-0 sm:absolute sm:mt-2 w-[calc(100vw-28px)] max-w-sm sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50/90 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Pemberitahuan Tugas</span>
                {unreadCount > 0 && (
                  <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    <CheckCheck size={13} />
                    <span>Tandai dibaca</span>
                  </button>
                )}
                {settingsButton}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 sm:hidden cursor-pointer"
                  title="Tutup"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {loading && notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Memuat pemberitahuan...
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                    <Inbox size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Tidak ada pemberitahuan</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Notifikasi jadwal pengerjaan, assignment tugas, pengingat rencana & evaluasi akan muncul di sini.
                  </p>
                </div>
              ) : (
                notifications.map((n, idx) => (
                  <div
                    key={n.id ? `tal-notif-${n.id}-${idx}` : `tal-notif-${idx}`}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 flex items-start gap-3 transition cursor-pointer hover:bg-slate-50 ${
                      !n.isRead ? 'bg-blue-50/40 font-medium' : 'bg-white'
                    }`}
                  >
                    {/* Icon */}
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs overflow-hidden border border-slate-200">
                        {getNotificationIcon(n.type)}
                      </div>
                      {!n.isRead && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-600 rounded-full ring-2 ring-white" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="text-xs font-bold text-slate-800 truncate flex items-center gap-1">
                          <span className="truncate">{n.title}</span>
                        </p>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatTimestamp(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                          {n.body}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {n.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 px-3">
              <span>Notifikasi & Pengingat TAL</span>
              {onOpenSettings ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenSettings();
                  }}
                  className="font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Sliders size={12} />
                  <span>Atur Preferensi</span>
                </button>
              ) : (
                <Link
                  href="/tal/preferences"
                  onClick={() => setIsOpen(false)}
                  className="font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Sliders size={12} />
                  <span>Atur Preferensi</span>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
