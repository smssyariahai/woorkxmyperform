'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { toast } from 'sonner';
import { registerSchema, type RegisterInput } from '@/lib/validation';
import { registerAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { Logo } from '@/components/ui/primitives';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuthConfig } from '@/components/auth/useAuthConfig';

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const authCfg = useAuthConfig();
  const googleEnabled = authCfg?.googleEnabled ?? false;
  const turnstileSiteKey = authCfg?.turnstileSiteKey ?? null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterInput) {
    setServerError('');
    if (turnstileSiteKey && !turnstileToken) {
      setServerError('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }
    const res = await registerAction(data, turnstileToken ?? undefined);
    if (!res.ok) {
      setServerError(res.message);
      return;
    }
    // langsung masuk setelah daftar
    const login = await signIn('credentials', {
      email: data.email,
      password: data.password,
      turnstileToken: turnstileToken ?? '',
      redirect: false,
    });
    if (login?.error) {
      toast.success('Akun berhasil dibuat. Silakan masuk.');
      router.push('/login');
      return;
    }
    toast.success('Workspace berhasil dibuat!');
    router.push('/onboarding');
    router.refresh();
  }

  return (
    <div>
      <div className="mb-8 hidden lg:block">
        <Logo />
      </div>
      <h1 className="text-[24px] font-bold text-ink">Buat workspace Anda</h1>
      <p className="mt-1 text-sm text-muted">Gratis 14 hari, tanpa kartu kredit</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && (
          <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
            {serverError}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nama lengkap" error={errors.name?.message}>
            <Input placeholder="Budi Santoso" autoComplete="name" {...register('name')} />
          </Field>
          <Field label="Nama perusahaan" error={errors.company?.message}>
            <Input placeholder="PT Maju Bersama" autoComplete="organization" {...register('company')} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" placeholder="nama@perusahaan.com" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Nomor WhatsApp" error={errors.phone?.message}>
            <Input placeholder="62812xxxxxxx" autoComplete="tel" {...register('phone')} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Password" error={errors.password?.message}>
            <PasswordInput placeholder="Minimal 8 karakter" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Konfirmasi password" error={errors.confirmPassword?.message}>
            <PasswordInput placeholder="Ulangi password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
        </div>

        <label className="flex items-start gap-2.5 text-[13px] text-muted cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-[#087BFF]" {...register('agree')} />
          <span>
            Saya menyetujui{' '}
            <a href="#" className="font-semibold text-brand hover:underline">Terms</a> &{' '}
            <a href="#" className="font-semibold text-brand hover:underline">Privacy Policy</a>
          </span>
        </label>
        {errors.agree && <p className="text-[12px] text-danger font-medium">{errors.agree.message}</p>}

        {turnstileSiteKey && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />
        )}

        <Button type="submit" loading={isSubmitting} className="w-full !py-3">
          Buat Workspace
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-[12px] text-muted">
            <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" className="w-full" onClick={() => signIn('google', { callbackUrl: '/onboarding' })}>
            Daftar dengan Google
          </Button>
        </>
      )}

      <p className="mt-8 text-center text-[13px] text-muted">
        Sudah memiliki akun?{' '}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
