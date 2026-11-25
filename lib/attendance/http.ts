// WOORK ATTENDANCE — helper kecil untuk route API (parsing + scope manager).

import type { AuthContext } from '../auth-helpers';
import { getViewerDepartmentId } from '../calendar/visibility';

/** Validasi kunci tanggal YYYY-MM-DD. */
export function parseDateKey(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

export function parsePagination(sp: URLSearchParams): { page: number; limit: number; skip: number } {
  const page = Math.max(parseInt(sp.get('page') ?? '1', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '20', 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Scope pengelola: OWNER/ADMIN melihat seluruh organisasi; peran lain yang
 * punya ATTENDANCE_MANAGE (SUPERVISOR/Manager) hanya departemennya sendiri.
 */
export async function getManageScope(ctx: AuthContext): Promise<{
  orgWide: boolean;
  departmentId: string | null;
}> {
  if (ctx.role === 'OWNER' || ctx.role === 'ADMIN' || ctx.isSuperAdmin) {
    return { orgWide: true, departmentId: null };
  }
  const departmentId = await getViewerDepartmentId(ctx.userId, ctx.organizationId);
  return { orgWide: false, departmentId };
}

/** Tanggal hari ini (Asia/Jakarta) sebagai kunci YYYY-MM-DD. */
export function todayKeyJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
