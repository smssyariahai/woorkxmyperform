'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, Users, MessageSquare, Megaphone } from 'lucide-react';
import { SearchInput } from '@/components/ui/search';
import { timeAgo } from '@/lib/utils';

interface SearchResult {
  customers: Array<{ id: string; name: string; phone: string | null }>;
  conversations: Array<{ id: string; customerName: string; preview: string }>;
}

export function Topbar({
  onMenu,
  collapsed,
  onToggleCollapse,
  userName,
}: {
  onMenu: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userName: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark') ||
      localStorage.getItem('woork-theme') === 'dark';
    setDark(isDark);
    if (isDark) document.documentElement.classList.add('dark');
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('woork-theme', next ? 'dark' : 'light');
  }

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        if (j.success) {
          setResults(j.data);
          setOpen(true);
        }
      } catch {
        /* abaikan */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    fetch('/api/notifications?limit=8')
      .then((r) => r.json())
      .then((j) => j.success && setNotifs(j.data.items ?? j.data))
      .catch(() => {});
    const fn = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const unreadCount = notifs.filter((n) => !n.isRead).length;

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' }).catch(() => {});
    setNotifs((ns) => ns.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <header className="flex h-16 items-center gap-3 border-b border-line bg-white dark:bg-slate-900 px-4 shrink-0">
      <button className="btn-ghost !px-2 lg:hidden" onClick={onMenu} aria-label="Buka menu">
        <Menu className="h-5 w-5" />
      </button>
      <button
        className="btn-ghost !px-2 hidden lg:inline-flex"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar'}
        title={collapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar'}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>

      <div className="relative flex-1 max-w-xl" ref={boxRef}>
        <SearchInput
          placeholder="Cari pelanggan, percakapan…"
          onChange={setQ}
          className="w-full"
        />
        {open && results && (
          <div className="absolute top-full mt-2 w-full card p-2 shadow-pop z-50 max-h-[380px] overflow-auto">
            {results.customers.length === 0 && results.conversations.length === 0 && (
              <p className="px-3 py-4 text-[13px] text-muted text-center">Tidak ada hasil untuk “{q}”.</p>
            )}
            {results.customers.length > 0 && (
              <>
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Pelanggan</p>
                {results.customers.map((c) => (
                  <Link
                    key={c.id}
                    href={`/crm/customers/${c.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Users className="h-4 w-4 text-muted" />
                    <span className="text-[13px] font-medium text-ink">{c.name}</span>
                    <span className="text-[12px] text-muted">{c.phone}</span>
                  </Link>
                ))}
              </>
            )}
            {results.conversations.length > 0 && (
              <>
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Percakapan</p>
                {results.conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setOpen(false);
                      router.push(`/inbox?c=${c.id}`);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <MessageSquare className="h-4 w-4 text-muted shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{c.customerName}</span>
                      <span className="block truncate text-[12px] text-muted">{c.preview}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <button className="btn-ghost !px-2" onClick={toggleDark} aria-label="Mode gelap/terang" title="Mode gelap/terang">
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="relative" ref={boxRef}>
        <button
          className="btn-ghost !px-2 relative"
          onClick={() => {
            setNotifOpen((v) => !v);
            setOpen(false);
          }}
          aria-label="Notifikasi"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-[340px] card p-0 shadow-pop z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <span className="text-[14px] font-semibold text-ink">Notifikasi</span>
              <button onClick={markAllRead} className="text-[12px] font-semibold text-brand hover:underline">
                Tandai dibaca
              </button>
            </div>
            <div className="max-h-[380px] overflow-auto">
              {notifs.length === 0 && (
                <p className="px-4 py-8 text-center text-[13px] text-muted">Belum ada notifikasi.</p>
              )}
              {notifs.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-line/60 last:border-0 ${n.isRead ? '' : 'bg-brand-50/50 dark:bg-brand-900/20'}`}
                >
                  <div className="flex gap-2.5">
                    <Megaphone className="h-4 w-4 text-brand mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{n.title}</p>
                      {n.body && <p className="text-[12px] text-muted line-clamp-2">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <span className="hidden sm:block text-[13px] font-medium text-ink max-w-[140px] truncate" title={userName}>
        {userName}
      </span>
    </header>
  );
}
