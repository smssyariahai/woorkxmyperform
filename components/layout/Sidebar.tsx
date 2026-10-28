'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/primitives';
import {
  LayoutDashboard,
  Inbox,
  Users,
  Bot,
  Megaphone,
  Plug,
  ShieldCheck,
  Building2,
  Settings,
  LifeBuoy,
  Briefcase,
  ChevronsUpDown,
  LogOut,
  KeyRound,
  Network,
  Crown,
  Globe2,
  Check,
  Settings2,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  badge?: string;
  /** permission yang dibutuhkan (salah satu). Kosong = selalu tampil. */
  perms?: string[];
  /** permission platform yang dibutuhkan (salah satu). Dipakai menu Administrator Pusat. */
  platformPerms?: string[];
  /** hanya Administrator Pusat (bukan Admin WOORK). */
  superOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: Inbox, badge: 'unread', perms: ['INBOX_VIEW'] },
  { href: '/crm', label: 'CRM', icon: Users, perms: ['CRM_VIEW'] },
  { href: '/hr', label: 'HR', icon: Briefcase, perms: ['HR_VIEW'] },
  { href: '/bot', label: 'Bot', icon: Bot, perms: ['BOT_MANAGE'] },
  { href: '/broadcast', label: 'Broadcast', icon: Megaphone, perms: ['BROADCAST_CREATE'] },
  { href: '/kantor', label: 'Kantor Virtual', icon: Building2 },
  { href: '/channels', label: 'Saluran', icon: Plug, perms: ['SETTINGS_MANAGE'] },
  { href: '/audit', label: 'Audit', icon: ShieldCheck, perms: ['AUDIT_VIEW'] },
];

/** Menu Admin Kantor — tampil bila punya salah satu permission terkait. */
const ADMIN_OFFICE: NavItem[] = [
  { href: '/admin-kantor', label: 'Dashboard Kantor', icon: LayoutDashboard, perms: ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'] },
  { href: '/admin-kantor/users', label: 'Pengguna', icon: Users, perms: ['USERS_VIEW'] },
  { href: '/admin-kantor/roles', label: 'Role & Permission', icon: KeyRound, perms: ['ROLES_VIEW'] },
  { href: '/admin-kantor/departments', label: 'Divisi', icon: Network, perms: ['DEPARTMENTS_VIEW'] },
  { href: '/admin-kantor/office', label: 'Pengaturan Kantor', icon: Settings, perms: ['SETTINGS_MANAGE'] },
];

/** Menu Administrator Pusat. Item ber-platformPerms tampil untuk Admin WOORK
 *  yang memegang salah satu permission tersebut; superOnly hanya untuk super admin. */
const SUPERADMIN: NavItem[] = [
  { href: '/admin', label: 'Dashboard Pusat', icon: Crown, platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_MASTER_VIEW', 'PLATFORM_AUDIT_VIEW'] },
  { href: '/admin/offices', label: 'Kantor', icon: Globe2, platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
  { href: '/admin/saldo-master', label: 'Saldo Master', icon: Wallet, platformPerms: ['PLATFORM_MASTER_VIEW', 'PLATFORM_MASTER_MANAGE'] },
  { href: '/admin/audit', label: 'Audit Global', icon: ShieldCheck, platformPerms: ['PLATFORM_AUDIT_VIEW'] },
  { href: '/admin/platform-admins', label: 'Admin WOORK', icon: KeyRound, superOnly: true },
  { href: '/admin/pengaturan', label: 'Pengaturan Sistem', icon: Settings2, superOnly: true },
];

const BOTTOM: NavItem[] = [
  { href: '/settings', label: 'Pengaturan', icon: Settings },
  { href: '/settings/help', label: 'Bantuan', icon: LifeBuoy },
];

export interface MembershipInfo {
  organizationId: string;
  organizationName: string;
  role: string;
  current: boolean;
}

export function Sidebar({
  orgName,
  orgId,
  userName,
  userEmail,
  role,
  isSuperAdmin,
  permissions,
  platformPermissions,
  memberships,
  unread,
  collapsed,
  onNavigate,
}: {
  orgName: string;
  orgId: string;
  userName: string;
  userEmail: string;
  role: string;
  isSuperAdmin: boolean;
  permissions: string[];
  platformPermissions: string[];
  memberships: MembershipInfo[];
  unread: number;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { update } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const can = (perms?: string[]) => {
    if (!perms || perms.length === 0) return true;
    if (isSuperAdmin) return true;
    const set = new Set(permissions);
    return perms.some((p) => set.has(p));
  };

  /** Visibilitas satu item menu: superOnly > platformPerms > perms tenant. */
  const canItem = (n: NavItem) => {
    if (n.superOnly) return isSuperAdmin;
    if (n.platformPerms) {
      if (isSuperAdmin) return true;
      const set = new Set(platformPermissions);
      return n.platformPerms.some((p) => set.has(p));
    }
    return can(n.perms);
  };

  async function switchOrg(targetOrgId: string) {
    if (targetOrgId === orgId || switching) return;
    setSwitching(true);
    try {
      const r = await fetch('/api/auth/switch-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      await update({ organizationId: targetOrgId });
      setOrgOpen(false);
      router.refresh();
      if (onNavigate) onNavigate();
    } catch (e: any) {
      alert(e.message || 'Gagal berganti kantor.');
    } finally {
      setSwitching(false);
    }
  }

  // Satu item aktif saja: href terpanjang yang cocok dengan pathname.
  // Mencegah induk (mis. /admin-kantor) ikut biru saat anaknya (/admin-kantor/departments) dibuka.
  const isActive = (href: string, all: NavItem[]) => {
    const match = (h: string) => pathname === h || pathname.startsWith(h + '/');
    if (!match(href)) return false;
    return !all.some((o) => o.href !== href && o.href.length > href.length && match(o.href));
  };

  const item = (n: NavItem, all: NavItem[]) => {
    if (!canItem(n)) return null;
    const active = isActive(n.href, all);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        title={n.label}
        className={cn(
          'flex items-center gap-3 rounded-btn px-3 py-2.5 text-[13.5px] font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
            : 'text-muted hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink',
          collapsed && 'justify-center px-0'
        )}
      >
        <n.icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="flex-1">{n.label}</span>}
        {!collapsed && n.badge === 'unread' && unread > 0 && (
          <span className="badge-red !px-2">{unread > 99 ? '99+' : unread}</span>
        )}
      </Link>
    );
  };

  const section = (title: string, items: NavItem[]) => {
    const visible = items.filter((n) => canItem(n));
    if (visible.length === 0) return null;
    return (
      <div className="pt-1">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-muted/70">
            {title}
          </p>
        )}
        <div className="space-y-1">{visible.map((n) => item(n, visible))}</div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-white dark:bg-slate-900 border-r border-line transition-all',
        collapsed ? 'w-[68px]' : 'w-[248px]'
      )}
    >
      <div className={cn('flex items-center px-4 h-16 border-b border-line', collapsed && 'justify-center px-0')}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="WOORK Dashboard">
          <Logo withText={!collapsed} />
        </Link>
      </div>

      {/* Pemilih kantor (multi-kantor) */}
      <div className="px-3 pt-3 relative">
        <button
          onClick={() => setOrgOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-btn border border-line bg-canvas px-3 py-2.5 text-left hover:border-brand/40 transition-colors',
            collapsed && 'justify-center px-0'
          )}
          title={orgName}
          aria-label="Ganti kantor"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-brand-900 text-white text-[13px] font-bold">
            {orgName.charAt(0).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{orgName}</span>
                <span className="block text-[11px] text-muted capitalize">
                  {role.toLowerCase()}
                  {isSuperAdmin ? ' · pusat' : ''}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-muted shrink-0" />
            </>
          )}
        </button>
        {orgOpen && !collapsed && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOrgOpen(false)} />
            <div className="absolute left-3 right-3 top-full z-50 card p-1.5 shadow-pop mt-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Kantor saya
              </p>
              {memberships.map((m) => (
                <button
                  key={m.organizationId}
                  disabled={switching || m.current}
                  onClick={() => switchOrg(m.organizationId)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                    m.current
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30'
                      : 'text-ink hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-900 text-white text-[11px] font-bold">
                    {m.organizationName.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{m.organizationName}</span>
                    <span className="block text-[11px] text-muted capitalize">{m.role.toLowerCase()}</span>
                  </span>
                  {m.current && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1" aria-label="Navigasi utama">
        {NAV.map((n) => item(n, NAV))}
        {section('Admin Kantor', ADMIN_OFFICE)}
        {section('Administrator Pusat', SUPERADMIN)}
      </nav>

      <div className="px-3 pb-2 space-y-1 border-t border-line pt-3">
        {BOTTOM.map((n) => item(n, BOTTOM))}
      </div>

      <div className="p-3 relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-btn px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left'
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white text-[13px] font-bold">
            {userName.charAt(0).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="flex-1 min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{userName}</span>
              <span className="block truncate text-[11px] text-muted">{userEmail}</span>
            </span>
          )}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full left-3 right-3 z-50 card p-1.5 shadow-pop mb-2">
              <Link
                href="/settings/profile"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] text-ink hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setMenuOpen(false)}
              >
                <Settings className="h-4 w-4" /> Profil saya
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut className="h-4 w-4" /> Keluar
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
