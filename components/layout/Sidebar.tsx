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
  Camera,
  ChevronsUpDown,
  LogOut,
  KeyRound,
  Network,
  Crown,
  Globe2,
  Check,
  Settings2,
  Wallet,
  FileSignature,
  Receipt,
  Tag,
  CreditCard,
  User,
  ChevronDown,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { MODULAR_MODULES, type ModularKey, type ModularPageDef, type ModuleAccessLevel } from '@/lib/modular';

/** Ikon per halaman (kunci = href). */
const ICONS: Record<string, any> = {
  '/dashboard': LayoutDashboard,
  '/inbox': Inbox,
  '/crm': Users,
  '/broadcast': Megaphone,
  '/channels': Plug,
  '/bot': Bot,
  '/hr': Briefcase,
  '/kantor': Building2,
  '/admin-kantor/departments': Network,
  '/esign': FileSignature,
  '/audit': ShieldCheck,
  '/admin-kantor': LayoutDashboard,
  '/admin-kantor/users': Users,
  '/admin-kantor/roles': KeyRound,
  '/admin-kantor/office': Settings,
  '/settings': Settings,
  '/settings/profile': User,
  '/settings/team': Users,
  '/settings/help': LifeBuoy,
  '/upgrade': CreditCard,
  '/admin/dashboard': Crown,
  '/admin/offices': Globe2,
  '/admin/invoices': Receipt,
  '/admin/modul': Tag,
  '/admin/saldo-master': Wallet,
  '/admin/audit': ShieldCheck,
  '/admin/platform-admins': KeyRound,
  '/admin/pengaturan': Settings2,
};

export interface MembershipInfo {
  organizationId: string;
  organizationName: string;
  role: string;
  current: boolean;
  /** Foto profil kantor (logo) — null bila belum ada. */
  logoUrl: string | null;
}

/** Avatar kantor: foto logo bila ada, huruf awal bila belum. */
function OrgAvatar({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: 'md' | 'sm' }) {
  const cls = size === 'md' ? 'h-8 w-8 rounded-btn text-[13px]' : 'h-7 w-7 rounded-md text-[11px]';
  if (logoUrl) {
    return <img src={logoUrl} alt={name} className={`${cls} shrink-0 object-cover bg-white`} />;
  }
  return (
    <span className={`flex items-center justify-center shrink-0 bg-brand-900 text-white font-bold ${cls}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
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
  activeModules,
  moduleLevels,
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
  /** modul yang aktif dalam langganan kantor (super admin = semua). */
  activeModules: ModularKey[];
  /** level akses per pengguna, kunci = kunci modul baru atau kunci lama. */
  moduleLevels: Record<string, ModuleAccessLevel>;
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

  /** Foto profil kantor (logo) di kartu atas: yang boleh ganti hanya pemegang
   *  SETTINGS_MANAGE (Admin Kantor, IT Support) — Administrator Pusat lolos. */
  const canUploadLogo =
    isSuperAdmin || permissions.includes('SETTINGS_MANAGE') || permissions.includes('*');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoTick, setLogoTick] = useState(0);
  const currentOrg = memberships.find((m) => m.current);
  const orgLogoUrl = currentOrg?.logoUrl ?? null;
  // `t=` membatalkan cache browser tepat setelah upload (di luar `v=` dari server).
  const logoSrc = orgLogoUrl ? (logoTick ? `${orgLogoUrl}&t=${logoTick}` : orgLogoUrl) : null;

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast.error('Format gambar harus PNG, JPG, WEBP, atau SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran gambar maksimal 2MB.');
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const r = await fetch('/api/admin/office/branding', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Foto profil kantor diperbarui.');
      setLogoTick(Date.now());
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengunggah foto.');
    } finally {
      setUploadingLogo(false);
    }
  }

  /** Status lipat seksi modul — tersimpan di sessionStorage (per tab):
   *  refresh mempertahankan seksi yang sedang terbuka, sedangkan login
   *  selalu mulai terlipat (halaman login + tombol Keluar menghapus kunci ini). */
  const SIDEBAR_SECTIONS_KEY = 'woork-sidebar-sections';
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MODULAR_MODULES.map((m) => [m.key, true]))
  );
  const [sectionsHydrated, setSectionsHydrated] = useState(false);
  const firstNav = useRef(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SIDEBAR_SECTIONS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, boolean>;
        setCollapsedSections((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* abaikan */
    }
    setSectionsHydrated(true);
  }, []);

  useEffect(() => {
    if (!sectionsHydrated) return;
    try {
      sessionStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(collapsedSections));
    } catch {
      /* abaikan */
    }
  }, [collapsedSections, sectionsHydrated]);

  /** Seksi halaman aktif otomatis terbuka saat PINDAH halaman — tapi tidak
   *  pada muatan pertama (login), agar semua tetap terlipat dulu. */
  useEffect(() => {
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    const active = MODULAR_MODULES.find((mod) =>
      mod.pages.some((p) => pathname === p.href || pathname.startsWith(p.href + '/'))
    );
    if (active) {
      setCollapsedSections((prev) => {
        if (!prev[active.key]) return prev;
        const next = { ...prev };
        delete next[active.key];
        return next;
      });
    }
  }, [pathname]);

  const toggleSection = (key: ModularKey) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const can = (perms?: string[]) => {
    if (!perms || perms.length === 0) return true;
    if (isSuperAdmin) return true;
    const set = new Set(permissions);
    return perms.some((p) => set.has(p));
  };

  /** Level efektif satu halaman: baris modul baru diutamakan, lalu baris kunci lama. */
  const pageLevel = (page: ModularPageDef, moduleKey: ModularKey): ModuleAccessLevel => {
    if (moduleLevels[moduleKey]) return moduleLevels[moduleKey];
    if (page.legacyKey && moduleLevels[page.legacyKey]) return moduleLevels[page.legacyKey];
    return 'WRITE';
  };

  /** Visibilitas satu item menu: langganan > level pengguna > platformPerms > perms tenant. */
  const canItem = (page: ModularPageDef, moduleKey: ModularKey) => {
    if (page.superOnly) return isSuperAdmin;
    // Modul langganan: seksi hanya tampil bila modul aktif; super admin bypass.
    if (!isSuperAdmin && !activeModules.includes(moduleKey)) return false;
    // Hak akses modul per pengguna: NONE = sembunyikan; super admin bypass.
    if (!isSuperAdmin && pageLevel(page, moduleKey) === 'NONE') return false;
    if (page.platformPerms) {
      if (isSuperAdmin) return true;
      const set = new Set(platformPermissions);
      return page.platformPerms.some((p) => set.has(p));
    }
    return can(page.perms);
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
  const isActive = (href: string, all: ModularPageDef[]) => {
    const match = (h: string) => pathname === h || pathname.startsWith(h + '/');
    if (!match(href)) return false;
    return !all.some((o) => o.href !== href && o.href.length > href.length && match(o.href));
  };

  const item = (page: ModularPageDef, moduleKey: ModularKey, all: ModularPageDef[]) => {
    if (!canItem(page, moduleKey)) return null;
    const active = isActive(page.href, all);
    const Icon = ICONS[page.href] ?? LayoutDashboard;
    return (
      <Link
        key={page.href}
        href={page.href}
        onClick={onNavigate}
        title={page.label}
        className={cn(
          'flex items-center gap-3 rounded-btn px-3 py-2.5 text-[13.5px] font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
            : 'text-muted hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink',
          collapsed && 'justify-center px-0'
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="flex-1">{page.label}</span>}
        {!collapsed && page.href === '/inbox' && unread > 0 && (
          <span className="badge-red !px-2">{unread > 99 ? '99+' : unread}</span>
        )}
      </Link>
    );
  };

  const section = (moduleKey: ModularKey, title: string, pages: ModularPageDef[]) => {
    const visible = pages.filter((p) => canItem(p, moduleKey));
    if (visible.length === 0) return null;
    // Mode ikon (sidebar menciut): seksi selalu terbuka, judul disembunyikan seperti sebelumnya.
    const isCollapsed = !collapsed && !!collapsedSections[moduleKey];
    return (
      <div className="pt-1" key={moduleKey}>
        {!collapsed && (
          <button
            type="button"
            onClick={() => toggleSection(moduleKey)}
            aria-expanded={!isCollapsed}
            className="flex w-full items-center justify-between rounded-md px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-muted/70 hover:text-muted"
          >
            <span>{title}</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
            />
          </button>
        )}
        {!isCollapsed && <div className="space-y-1">{visible.map((p) => item(p, moduleKey, visible))}</div>}
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
        <div
          className={cn(
            'w-full flex items-center gap-2.5 rounded-btn border border-line bg-canvas px-3 py-2.5 text-left hover:border-brand/40 transition-colors',
            collapsed && 'justify-center px-0'
          )}
          title={orgName}
        >
          {canUploadLogo ? (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="relative shrink-0 rounded-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              title="Ganti foto profil kantor"
              aria-label="Ganti foto profil kantor"
            >
              <OrgAvatar name={orgName} logoUrl={logoSrc} size="md" />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white shadow">
                <Camera className="h-2.5 w-2.5" />
              </span>
            </button>
          ) : (
            <OrgAvatar name={orgName} logoUrl={logoSrc} size="md" />
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={onLogoFile}
            aria-hidden
            tabIndex={-1}
          />
          {!collapsed && (
            <button
              type="button"
              onClick={() => setOrgOpen((v) => !v)}
              className="flex flex-1 min-w-0 items-center gap-2.5 text-left"
              aria-label="Ganti kantor"
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{orgName}</span>
                <span className="block text-[11px] text-muted capitalize">
                  {role.toLowerCase()}
                  {isSuperAdmin ? ' · pusat' : ''}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-muted shrink-0" />
            </button>
          )}
        </div>
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
                  <OrgAvatar name={m.organizationName} logoUrl={m.logoUrl ?? null} size="sm" />
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
        {MODULAR_MODULES.map((mod) => section(mod.key, mod.label, mod.pages))}
      </nav>

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
                onClick={() => {
                  try {
                    sessionStorage.removeItem(SIDEBAR_SECTIONS_KEY);
                  } catch {
                    /* abaikan */
                  }
                  signOut({ callbackUrl: pathname.startsWith('/admin') ? '/admin' : '/login' });
                }}
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
