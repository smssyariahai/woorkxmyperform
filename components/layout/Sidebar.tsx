'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo, Avatar } from '@/components/ui/primitives';
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
  Database,
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
  BookOpen,
  BookMarked,
  Clock,
  Compass,
  CircleDot,
  Heart,
  Hand,
  HandCoins,
  UserPlus,
  Sparkles,
  ScrollText,
  Moon,
  Sun,
  Droplets,
  Scale,
  Landmark,
  CalendarDays,
  GraduationCap,
  MapPin,
  Coins,
  Banknote,
  Percent,
  Table,
  Ticket,
  Video,
  Smartphone,
  Archive,
  ListChecks,
  ClipboardList,
  LayoutTemplate,
  BarChart3,
  Trophy,
  Bell,
  BedDouble,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
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
  '/admin-kantor/residence': BedDouble,
  '/admin-kantor/departments': Network,
  '/esign': FileSignature,
  '/audit': ShieldCheck,
  '/admin-kantor': LayoutDashboard,
  '/admin-kantor/users': Users,
  '/admin-kantor/roles': KeyRound,
  '/admin-kantor/office': Settings,
  '/admin-kantor/catalog': Bot,
  '/settings': Settings,
  '/settings/profile': User,
  '/settings/team': Users,
  '/settings/help': LifeBuoy,
  '/upgrade': CreditCard,
  '/admin/dashboard': Crown,
  '/admin/offices': Globe2,
  '/admin/tenants': Database,
  '/admin/offices/new': Building2,
  '/admin/pengumuman': Megaphone,
  '/admin/pengguna': Users,
  '/admin/peran-platform': KeyRound,
  '/admin/tiket': Ticket,
  '/admin/invoices': Receipt,
  '/admin/modul': Tag,
  '/admin/saldo-master': Wallet,
  '/admin/audit': ShieldCheck,
  '/admin/platform-admins': KeyRound,
  '/admin/pengaturan': Settings2,
  '/islami': BookOpen,
  '/islami/al-quran': BookOpen,
  '/islami/hadits': BookMarked,
  '/islami/jadwal-shalat': Clock,
  '/islami/kompas-kiblat': Compass,
  '/islami/tasbih': CircleDot,
  '/islami/dzikir': Heart,
  '/islami/doa-harian': Hand,
  '/islami/asmaul-husna': Sparkles,
  '/islami/kitab-maulid': ScrollText,
  '/islami/panduan-shalat': Moon,
  '/islami/panduan-puasa': Sun,
  '/islami/thaharah': Droplets,
  '/islami/kalkulator-zakat': Scale,
  '/islami/kisah-nabi': Users,
  '/islami/malaikat-kitab': Landmark,
  '/islami/kalender-hijriah': CalendarDays,
  '/islami/adab-islami': GraduationCap,
  '/islami/tempat-bersejarah': MapPin,
  '/emas': Coins,
  '/emas/kalkulator-gadai-emas': Scale,
  '/emas/kalkulator-pelunasan-emas': Banknote,
  '/emas/pke': Wallet,
  '/emas/simulasi-emas': Percent,
  '/emas/simulasi-emas/pengaturan-url': Settings2,
  '/emas/tabel-harga-emas': Table,
  '/emas/calculator': Smartphone,
  '/pengumuman': Megaphone,
  '/tiket': Ticket,
  '/meet': Video,
  '/earsip': Archive,
  '/earsip/kategori': Archive,
  '/tal': ListChecks,
  '/tal/tasks': ClipboardList,
  '/tal/templates': LayoutTemplate,
  '/tal/rekapitulasi': BarChart3,
  '/tal/rekapitulasi-hr': Users,
  '/tal/badges': Trophy,
  '/tal/preferences': Bell,
  '/tal/tal-tim-saya': Users,
  '/tal/tal-tim-saya/pengaturan': Settings2,
  '/tal/kalender-kerja': CalendarDays,
  '/koperasi': Landmark,
  '/koperasi/anggota': Users,
  '/koperasi/anggota-baru': UserPlus,
  '/koperasi/simpanan-baru': Wallet,
  '/koperasi/pembiayaan-baru': HandCoins,
  '/koperasi/pengaturan': Settings2,
};

/** Ikon header tiap modul di sidebar (satu ikon per seksi, bukan per halaman). */
const MODULE_ICONS: Record<ModularKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  tal: ListChecks,
  koperasi: Landmark,
  emas: Coins,
  islami: BookOpen,
  pengumuman: Megaphone,
  tiket: Ticket,
  kantor: Building2,
  meet: Video,
  chat: Inbox,
  hris: Users,
  esign: FileSignature,
  earsip: Archive,
  perusahaan: Briefcase,
  kalender: CalendarDays,
  daily: Sun,
  absensi: Clock,
  audit: ScrollText,
  setting: Settings,
  pusat: Crown,
};

/** Urutan kelompok di sidebar: modul harian di "Menu Utama", admin di "Sistem". */
const SIDEBAR_GROUPS = [
  { key: 'utama' as const, label: 'Menu Utama' },
  { key: 'sistem' as const, label: 'Sistem' },
];

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
  userAvatar,
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
  /** Foto profil pengguna — null bila belum ada. */
  userAvatar: string | null;
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
  /** Area /admin (bukan /admin-kantor): sidebar hanya menampilkan modul
   *  Administrator Pusat — modul kantor (TAL, Emas, Islami, ...) disembunyikan
   *  agar admin fokus. */
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const init = Object.fromEntries(MODULAR_MODULES.map((m) => [m.key, true]));
    // Muatan pertama di area /admin: Administrator Pusat langsung terbuka.
    if (pathname === '/admin' || pathname.startsWith('/admin/')) delete init.pusat;
    return init;
  });
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
    // Di area /admin, Administrator Pusat selalu terbuka (abaikan simpanan lama).
    if (
      typeof window !== 'undefined' &&
      (window.location.pathname === '/admin' ||
        window.location.pathname.startsWith('/admin/'))
    ) {
      setCollapsedSections((prev) => {
        if (!prev.pusat) return prev;
        const next = { ...prev };
        delete next.pusat;
        return next;
      });
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
          'flex items-center gap-2.5 rounded-btn px-3 py-2 text-[12.5px] font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
            : 'text-muted hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink',
          collapsed && 'justify-center px-0'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1">{page.label}</span>}
        {!collapsed && page.href === '/inbox' && unread > 0 && (
          <span className="badge-red !px-2">{unread > 99 ? '99+' : unread}</span>
        )}
      </Link>
    );
  };

  /** Kelompokkan halaman menurut `page.section` (urutan kemunculan pertama
   *  dipertahankan). Halaman tanpa section masuk satu kelompok tanpa header,
   *  sehingga modul lain tampil persis seperti sebelumnya (flat). */
  const groupedPages = (pages: ModularPageDef[]): { section: string | null; pages: ModularPageDef[] }[] => {
    const groups: { section: string | null; pages: ModularPageDef[] }[] = [];
    for (const p of pages) {
      const key = p.section ?? null;
      const g = groups.find((x) => x.section === key);
      if (g) g.pages.push(p);
      else groups.push({ section: key, pages: [p] });
    }
    return groups;
  };

  const section = (moduleKey: ModularKey, title: string, pages: ModularPageDef[]) => {
    const visible = pages.filter((p) => canItem(p, moduleKey));
    if (visible.length === 0) return null;
    const ModuleIcon = MODULE_ICONS[moduleKey] ?? LayoutDashboard;
    // Satu halaman saja: tampilkan langsung sebagai tautan (tanpa header
    // grup + chevron). Menghindari "Dashboard > Dashboard" yang mubazir.
    if (visible.length === 1) {
      const p = visible[0];
      const active = isActive(p.href, visible);
      return (
        <Link
          key={p.href}
          href={p.href}
          onClick={onNavigate}
          title={p.label}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-[13px] font-semibold transition-colors',
            active
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
              : 'text-ink/85 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink',
            collapsed && 'justify-center px-0'
          )}
        >
          <ModuleIcon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="flex-1 text-left">{p.label}</span>}
        </Link>
      );
    }
    // Mode ikon (sidebar menciut): seksi selalu terbuka, judul disembunyikan seperti sebelumnya.
    const isCollapsed = !collapsed && !!collapsedSections[moduleKey];
    // Seksi ikut menyala bila salah satu halamannya sedang dibuka.
    const sectionActive = visible.some((p) => isActive(p.href, visible));
    // Halaman utama modul sama dengan judul grup (mis. TAL > TAL):
    // jadikan judul grup sebagai tautan ke halaman utama, dan sembunyikan
    // anak pertama yang duplikat (hanya saat sidebar terbuka; saat menciut
    // semua ikon halaman tetap tampil).
    const hasMainLink = visible.length > 1 && visible[0].label === title;
    const mainPage = hasMainLink ? visible[0] : null;
    const listPages = hasMainLink && !collapsed ? visible.slice(1) : visible;
    const mainActive = mainPage ? isActive(mainPage.href, visible) : false;
    return (
      <div key={moduleKey}>
        {!collapsed && (
          mainPage ? (
            <div
              className={cn(
                'flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-[13px] font-semibold transition-colors',
                mainActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
                  : sectionActive
                    ? 'text-brand-700 dark:text-brand-100'
                    : 'text-ink/85 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <Link
                href={mainPage.href}
                onClick={onNavigate}
                title={title}
                className="flex min-w-0 flex-1 items-center gap-2.5"
              >
                <ModuleIcon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 text-left">{title}</span>
              </Link>
              <button
                type="button"
                onClick={() => toggleSection(moduleKey)}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `Buka submenu ${title}` : `Tutup submenu ${title}`}
                className="shrink-0 rounded-btn p-0.5 text-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')}
                />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => toggleSection(moduleKey)}
              aria-expanded={!isCollapsed}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-[13px] font-semibold transition-colors',
                // Seksi aktif HANYA diwarnai teksnya (tanpa background): kalau
                // header ikut ber-background biru, bloknya menempel dengan
                // item anak yang aktif dan terlihat seperti satu blok bug.
                sectionActive
                  ? 'text-brand-700 dark:text-brand-100'
                  : 'text-ink/85 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <ModuleIcon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left">{title}</span>
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 text-muted transition-transform', isCollapsed && '-rotate-90')}
              />
            </button>
          )
        )}
        {!isCollapsed && (
          <div className={cn('mt-1 space-y-0.5 pb-1', !collapsed && 'pl-5')}>
            {groupedPages(listPages).map((group) => (
              <div key={group.section ?? ''}>
                {group.section && (
                  <p className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted/70">
                    {group.section}
                  </p>
                )}
                {group.pages.map((p) => item(p, moduleKey, visible))}
              </div>
            ))}
          </div>
        )}
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

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Navigasi utama">
        {isAdminArea ? (
          <div className="space-y-1">
            {section(
              'pusat',
              'Administrator Pusat',
              MODULAR_MODULES.find((m) => m.key === 'pusat')!.pages
            )}
            {!collapsed && <div className="mx-2 mb-2 mt-2 border-t border-line" />}
            <Link
              href="/dashboard"
              onClick={onNavigate}
              title="Dashboard Kantor"
              className={cn(
                'flex items-center gap-2.5 rounded-btn px-3 py-2 text-[12.5px] font-medium transition-colors text-muted hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-ink',
                collapsed && 'justify-center px-0'
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">Dashboard Kantor</span>}
            </Link>
          </div>
        ) : (
          SIDEBAR_GROUPS.map((group, gi) => {
          const mods = MODULAR_MODULES.filter((m) => (m.group ?? 'utama') === group.key);
          const rendered = mods.map((mod) => section(mod.key, mod.label, mod.pages));
          if (rendered.every((r) => r === null)) return null;
          return (
            <div key={group.key} className={gi === 0 ? undefined : 'mt-2'}>
              {gi > 0 && !collapsed && <div className="mx-2 mb-2 border-t border-line" />}
              {!collapsed && (
                <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted/60">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">{rendered}</div>
            </div>
          );
          })
        )}
      </nav>

      <div className="p-3 relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-btn px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left'
          )}
        >
          <Avatar name={userName} size={36} src={userAvatar} />
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
                  // Logout lewat rute server /api/auth/logout: cookie sesi
                  // dihapus di server (kedua nama cookie) lalu redirect
                  // PENUH ke pintu login — sesi tidak bisa "nyangkut".
                  window.location.href = `/api/auth/logout?door=${pathname.startsWith('/admin') ? 'admin' : 'office'}`;
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
