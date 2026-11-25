// WOORK WORK CALENDAR — aturan visibilitas & otorisasi event.
//
// Catatan skema: departmentId TIDAK ada di UserEmployment — adanya di
// Membership (prisma/schema.prisma:418). Jadi departemen dibaca dari
// Membership user di organisasi tersebut.

import { prisma } from '../db';

export interface ViewerInfo {
  id: string;
  /** departmentId dari Membership (null = tidak punya departemen). */
  departmentId: string | null;
}

export interface VisibleEventLike {
  createdById: string;
  visibility: string;
  /** userId para attendee event. */
  attendeeIds: string[];
}

export async function getViewerDepartmentId(
  userId: string,
  organizationId: string
): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId, status: 'ACTIVE' },
    select: { departmentId: true },
  });
  return m?.departmentId ?? null;
}

/** departmentId para pembuat event, sekali jalan (hindari N+1 di list). */
export async function getCreatorDepartmentIds(
  organizationId: string,
  creatorIds: string[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = [...new Set(creatorIds)];
  if (uniq.length === 0) return out;
  const rows = await prisma.membership.findMany({
    where: { organizationId, userId: { in: uniq }, status: 'ACTIVE' },
    select: { userId: true, departmentId: true },
  });
  for (const id of uniq) out.set(id, null);
  for (const r of rows) out.set(r.userId, r.departmentId ?? null);
  return out;
}

/**
 * Apakah viewer boleh MELIHAT event ini?
 * - PRIVATE: hanya pembuat + attendee.
 * - CUSTOM: hanya attendee (+ pembuat, agar pembuat tetap bisa mengelola
 *   eventnya sendiri — tanpa ini pembuat bisa mengunci dirinya sendiri).
 * - TEAM / DEPARTMENT: anggota departemen yang sama dengan pembuat; bila
 *   pembuat ATAU viewer tidak punya departemen, perlakukan sebagai COMPANY.
 * - COMPANY: semua anggota organisasi.
 */
export function canSeeEvent(
  viewer: ViewerInfo,
  event: VisibleEventLike,
  creatorDepartmentId?: string | null
): boolean {
  if (viewer.id === event.createdById) return true;
  const isAttendee = event.attendeeIds.includes(viewer.id);
  switch (event.visibility) {
    case 'PRIVATE':
      return isAttendee;
    case 'CUSTOM':
      return isAttendee;
    case 'TEAM':
    case 'DEPARTMENT': {
      if (isAttendee) return true;
      const dep = creatorDepartmentId ?? null;
      if (!viewer.departmentId || !dep) return true; // tanpa departemen = COMPANY
      return viewer.departmentId === dep;
    }
    case 'COMPANY':
    default:
      return true;
  }
}

export interface EditCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Apakah user boleh MENGEDIT event ini?
 * - Event dari modul sumber TIDAK boleh diedit langsung — ubah lewat modul
 *   sumbernya (sinkronisasi yang memperbarui kalender).
 * - Selain itu: pembuat, atau pemegang CALENDAR_MANAGE.
 */
export function canEditEvent(
  viewerId: string,
  event: { createdById: string; sourceModule: string | null },
  hasManage: boolean
): EditCheck {
  if (event.sourceModule) {
    return {
      allowed: false,
      reason:
        'Event ini berasal dari modul sumber dan tidak bisa diubah dari kalender. Ubah lewat modul sumbernya, kalender akan tersinkronisasi otomatis.',
    };
  }
  if (viewerId === event.createdById || hasManage) return { allowed: true };
  return { allowed: false, reason: 'Hanya pembuat event atau pengelola kalender yang bisa mengubah event ini.' };
}

/**
 * Apakah user boleh MENGHAPUS event ini?
 * Sama seperti edit: event sumber tidak boleh dihapus dari kalender
 * (penghapusan sumber ditangani sync engine), selain itu pembuat / MANAGE.
 */
export function canDeleteEvent(
  viewerId: string,
  event: { createdById: string; sourceModule: string | null },
  hasManage: boolean
): EditCheck {
  if (event.sourceModule) {
    return {
      allowed: false,
      reason:
        'Event ini berasal dari modul sumber dan tidak bisa dihapus dari kalender. Hapus atau batalkan lewat modul sumbernya.',
    };
  }
  if (viewerId === event.createdById || hasManage) return { allowed: true };
  return { allowed: false, reason: 'Hanya pembuat event atau pengelola kalender yang bisa menghapus event ini.' };
}

export function hasCalendarManage(perms: Set<string>): boolean {
  return perms.has('*') || perms.has('CALENDAR_MANAGE');
}
