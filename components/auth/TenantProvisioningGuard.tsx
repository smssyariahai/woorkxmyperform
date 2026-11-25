'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Rute yang TIDAK BOLEH kena backstop provisioning:
// - /provisioning sendiri (tujuan redirect — tanpa ini terjadi redirect loop)
// - halaman auth (/login, /register, /forgot-password, /reset-password,
//   /admin): pengguna yang belum selesai provisioning harus tetap bisa
//   membuka halaman login, dan Administrator Pusat tidak diblokir.
const EXCLUDED_PREFIXES = [
  '/provisioning',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/admin',
  '/langganan',
];

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

interface TenantProvisioningGuardProps {
  tenantCode: string;
  /** Status tenant dari master DB; null bila baris tenant tidak ditemukan. */
  tenantStatus: string | null;
  loginDoor: string;
}

/**
 * Backstop LAPISAN D (database-per-tenant), pasangan client dari pengecekan
 * server di app/layout.tsx: bila tenant sesi belum ACTIVE, arahkan ke
 * /provisioning?tenant=<code> — KECUALI:
 * - SUSPENDED (Fase 4): JANGAN redirect — OWNER tetap boleh membuka
 *   workspace (banner memberitahu ia ditangguhkan; penolakan Standar
 *   ditangani requireAuth). Redirect akan mengunci OWNER keluar dari
 *   halaman statusnya sendiri.
 * - DEACTIVATED/DELETED (Fase 4): redirect ke /langganan (tenant berhenti
 *   bukan sedang provisioning).
 *
 * Kenapa navigasinya di sini (client), bukan redirect() di layout server:
 * root layout membungkus SEMUA rute termasuk /provisioning dan /login, dan
 * server component tidak bisa membaca pathname — Next.js menghapus header
 * `Next-Url` sebelum render (kecuali interception route), dan middleware
 * tidak boleh diedit lapisan ini. redirect() buta di layout akan
 * mengarahkan /provisioning ke dirinya sendiri (redirect loop). Karena itu
 * layout server hanya melakukan auth() + query master, lalu guard ini yang
 * memutuskan navigasi berdasarkan usePathname() yang akurat.
 *
 * Sesi pintu admin dilewati (Administrator Pusat bekerja di platform, bukan
 * di workspace tenant). Bila tenantStatus null (baris tenant tidak ada di
 * master) guard fail-open: tidak mengarahkan, supaya tidak mengunci user
 * karena data yang belum konsisten.
 */
export function TenantProvisioningGuard({ tenantCode, tenantStatus, loginDoor }: TenantProvisioningGuardProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!tenantCode || !tenantStatus || tenantStatus === 'ACTIVE') return;
    if (loginDoor === 'admin') return;
    if (isExcluded(pathname)) return;
    // Fase 4: tenant ditangguhkan bukan alasan mengusir OWNER dari
    // workspace — ia tetap boleh melihat status (banner) dan /langganan.
    if (tenantStatus === 'SUSPENDED') return;
    if (tenantStatus === 'DEACTIVATED' || tenantStatus === 'DELETED') {
      router.replace('/langganan');
      return;
    }
    router.replace(`/provisioning?tenant=${tenantCode}`);
  }, [tenantCode, tenantStatus, loginDoor, pathname, router]);

  return null;
}
