'use server';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { audit } from '@/lib/audit';
import { onboardingSchema } from '@/lib/validation';

const CHANNEL_MAP: Record<string, string> = {
  whatsapp: 'WHATSAPP',
  instagram: 'INSTAGRAM',
  facebook: 'FACEBOOK',
  website: 'WEBSITE',
};

export async function completeOnboardingAction(input: unknown) {
  const ctx = await requireAuth();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: 'Lengkapi data onboarding dengan benar.' };
  }
  const { company, industry, teamSize, channels, invites } = parsed.data;

  await prisma.organization.update({
    where: { id: ctx.organizationId },
    data: { name: company, industry: industry || null, teamSize: teamSize || null },
  });

  for (const c of channels) {
    const type = CHANNEL_MAP[c];
    if (!type) continue;
    await prisma.channel.updateMany({
      where: { organizationId: ctx.organizationId, type },
      data: { status: 'CONNECTED' },
    });
  }

  const role = await prisma.role.findFirst({
    where: { organizationId: ctx.organizationId, name: 'AGENT' },
  });
  for (const email of invites ?? []) {
    const normalized = email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: normalized } });
    if (exists) continue;
    await prisma.invitation.upsert({
      where: { organizationId_email: { organizationId: ctx.organizationId, email: normalized } },
      update: {},
      create: {
        organizationId: ctx.organizationId,
        email: normalized,
        roleId: role!.id,
        token: randomUUID().replace(/-/g, ''),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        invitedById: ctx.userId,
      },
    });
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ONBOARDING_COMPLETED',
    module: 'WORKSPACE',
    description: `${ctx.name} menyelesaikan onboarding workspace`,
  });

  return { ok: true as const };
}
