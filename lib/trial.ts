import { prisma } from './db';

/**
 * Batasan trial 14 hari untuk pendaftar baru (manual / Google).
 *
 * - trialEndsAt == null  → bukan trial (grandfathered / paket berbayar): akses penuh
 * - trialEndsAt > now     → trial aktif: akses dibatasi
 * - trialEndsAt <= now && plan == 'FREE' → trial habis: read-only sampai upgrade
 * - plan != 'FREE'        → berbayar: akses penuh
 *
 * Administrator Pusat (isSuperAdmin) dikecualikan dari semua batasan.
 */

export const TRIAL_DAYS = 14;
export const TRIAL_BROADCAST_MAX_RECIPIENTS = 20;
export const TRIAL_BROADCAST_MAX_PER_DAY = 1;
export const TRIAL_MAX_TEAM_MEMBERS = 2; // termasuk owner

export interface TrialStatus {
  plan: string;
  isTrial: boolean;
  trialExpired: boolean;
  daysLeft: number; // 0 bila bukan trial / sudah habis
  readOnly: boolean; // true bila trial habis
  trialEndsAt: Date | null;
}

export async function getTrialStatus(organizationId: string): Promise<TrialStatus> {
  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { plan: true, trialEndsAt: true },
  });
  const plan = sub?.plan ?? 'FREE';
  const trialEndsAt = sub?.trialEndsAt ?? null;
  if (plan !== 'FREE' || !trialEndsAt) {
    return { plan, isTrial: false, trialExpired: false, daysLeft: 0, readOnly: false, trialEndsAt };
  }
  const now = new Date();
  if (trialEndsAt.getTime() <= now.getTime()) {
    return { plan, isTrial: false, trialExpired: true, daysLeft: 0, readOnly: true, trialEndsAt };
  }
  const daysLeft = Math.max(1, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
  return { plan, isTrial: true, trialExpired: false, daysLeft, readOnly: false, trialEndsAt };
}

/** Permission tulis = semua kecuali yang berakhiran _VIEW. */
export function isWritePermission(key: string): boolean {
  return !key.endsWith('_VIEW');
}

export function trialEndsAtFromNow(): Date {
  return new Date(Date.now() + TRIAL_DAYS * 86_400_000);
}

/** Jumlah campaign yang dikirim hari ini (untuk batas trial). */
export async function countCampaignsSentToday(organizationId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.campaign.count({
    where: {
      organizationId,
      status: { in: ['SENT', 'SENDING'] },
      createdAt: { gte: start },
    },
  });
}

/** Jumlah anggota tim aktif (untuk batas trial). */
export async function countActiveMembers(organizationId: string): Promise<number> {
  return prisma.membership.count({
    where: { organizationId, status: 'ACTIVE' },
  });
}
