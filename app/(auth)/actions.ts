'use server';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { seedOrgDefaults } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { slugify } from '@/lib/utils';
import { verifyTurnstile } from '@/lib/system-settings';
import { trialEndsAtFromNow } from '@/lib/trial';
import {
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type RegisterInput,
} from '@/lib/validation';

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || 'workspace';
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.organization.findUnique({ where: { slug } });
    if (!exists) return slug;
    slug = `${slugify(base)}-${randomUUID().slice(0, 6)}`;
  }
  return `${slugify(base)}-${Date.now().toString(36)}`;
}

export async function registerAction(input: RegisterInput, turnstileToken?: string) {
  if (!(await verifyTurnstile(turnstileToken))) {
    return { ok: false as const, message: 'Verifikasi keamanan gagal. Silakan coba lagi.' };
  }
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors, message: 'Periksa kembali form Anda.' };
  }
  const { name, company, email, phone, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { ok: false as const, message: 'Email sudah terdaftar. Silakan masuk.' };
  }

  const slug = await uniqueSlug(company);
  const org = await prisma.organization.create({
    data: {
      name: company,
      slug,
      subscription: { create: { plan: 'FREE', status: 'ACTIVE', trialEndsAt: trialEndsAtFromNow() } },
    },
  });
  await seedOrgDefaults(org.id);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      password: await hashPassword(password),
      phone: phone.trim(),
    },
  });
  const role = await prisma.role.findFirst({
    where: { organizationId: org.id, name: 'OWNER' },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: org.id, roleId: role!.id },
  });
  await audit({
    organizationId: org.id,
    userId: user.id,
    action: 'REGISTER',
    module: 'AUTH',
    description: `${name} membuat workspace ${company}`,
  });

  return { ok: true as const, email: normalizedEmail };
}

export async function forgotPasswordAction(email: string, turnstileToken?: string) {
  if (!(await verifyTurnstile(turnstileToken))) {
    return { ok: false as const, message: 'Verifikasi keamanan gagal. Silakan coba lagi.' };
  }
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false as const, message: 'Format email tidak valid.' };
  }
  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Selalu balas sukses agar tidak membocorkan email terdaftar
  if (user) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const link = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    console.log(`[auth] reset link untuk ${normalizedEmail}: ${link}`);
    if (process.env.NODE_ENV !== 'production') {
      return { ok: true as const, devLink: link };
    }
  }
  return { ok: true as const };
}

export async function resetPasswordAction(token: string, password: string, confirmPassword: string, turnstileToken?: string) {
  if (!(await verifyTurnstile(turnstileToken))) {
    return { ok: false as const, message: 'Verifikasi keamanan gagal. Silakan coba lagi.' };
  }
  const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors, message: 'Periksa kembali form Anda.' };
  }
  const rec = await prisma.passwordResetToken.findUnique({
    where: { token: parsed.data.token },
    include: { user: true },
  });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
    return { ok: false as const, message: 'Link reset tidak valid atau sudah kedaluwarsa.' };
  }
  await prisma.user.update({
    where: { id: rec.userId },
    data: { password: await hashPassword(parsed.data.password) },
  });
  await prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  const membership = await prisma.membership.findFirst({
    where: { userId: rec.userId, status: 'ACTIVE' },
    orderBy: { joinedAt: 'asc' },
  });
  if (membership) {
    await audit({
      organizationId: membership.organizationId,
      userId: rec.userId,
      action: 'PASSWORD_RESET',
      module: 'AUTH',
      description: `${rec.user.email} mereset password`,
    });
  }
  return { ok: true as const };
}
