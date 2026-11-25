'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { audit } from '@/lib/audit';
import { verifyTurnstile } from '@/lib/system-settings';
import { registerCompany } from '@/lib/tenant/registration';
import {
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type RegisterInput,
} from '@/lib/validation';

export async function registerAction(input: RegisterInput, turnstileToken?: string) {
  if (!(await verifyTurnstile(turnstileToken))) {
    return { ok: false as const, message: 'Verifikasi keamanan gagal. Silakan coba lagi.' };
  }
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors, message: 'Periksa kembali form Anda.' };
  }
  const { name, company, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // LAPISAN B: registrasi self-service kini lewat provisioning engine
  // (database-per-tenant). TIDAK ADA lagi tulis ke woork_saas di sini:
  // tidak ada Organization/Subscription/seedOrgDefaults/User/Membership
  // legacy. Slug dicek unik di Tenant.companySlug di dalam registerCompany
  // (uniqueSlug lama yang mengecek Organization woork_saas sudah dihapus —
  // ia hanya dipakai di sini, bukan di tempat lain).
  // CATATAN: `phone` dari form masih divalidasi schema, tapi tidak lagi
  // disimpan di mana pun — PlatformUser (master) tidak punya kolom phone.
  let result: { tenantId: string; tenantCode: string; platformUserId: string };
  try {
    result = await registerCompany({
      companyName: company,
      adminName: name.trim(),
      adminEmail: normalizedEmail,
      adminPassword: password,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (msg.includes('slug sudah dipakai')) {
      return { ok: false as const, message: 'Nama perusahaan sudah dipakai. Silakan pilih nama lain.' };
    }
    if (msg.includes('email sudah terdaftar')) {
      return { ok: false as const, message: 'Email sudah terdaftar. Silakan masuk.' };
    }
    // Pesan validasi registerCompany sudah ramah — teruskan apa adanya.
    if (
      msg.startsWith('Nama perusahaan') ||
      msg.startsWith('Nama admin') ||
      msg.startsWith('format email') ||
      msg.startsWith('Password minimal') ||
      msg.startsWith('slug tidak valid') ||
      msg.startsWith('Terjadi bentrok kode tenant')
    ) {
      return { ok: false as const, message: msg };
    }
    console.error('[registerAction] registrasi gagal:', e);
    return { ok: false as const, message: 'Pendaftaran gagal. Silakan coba lagi.' };
  }

  // Sukses: provisioning database tenant sedang berjalan async.
  // BUKAN auto-login — arahkan ke halaman status provisioning; halaman itu
  // yang mengarahkan ke /login?tenant=<code> setelah database ACTIVE.
  // redirect() melempar NEXT_REDIRECT; server action yang dipanggil dari
  // client component akan menavigasi browser ke URL tersebut.
  redirect(`/provisioning?tenant=${result.tenantCode}`);
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
