'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { Logo } from '@/components/ui/primitives';
import { ArrowLeft } from 'lucide-react';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuthConfig } from '@/components/auth/useAuthConfig';

const OAUTH_ERRORS: Record<string, string> = {
  OAuthSignin: 'Gagal memulai login Google. Coba lagi.',
  OAuthCallback: 'Gagal menyelesaikan login Google. Coba lagi.',
  OAuthCreateAccount: 'Gagal membuat akun dari Google.',
  CallbackRouteError: 'Terjadi kesalahan saat login Google.',
  AccessDenied: 'Akses ditolak. Akun Anda mungkin nonaktif.',
  OAuthAccountNotLinked: 'Email ini sudah terdaftar. Masuk dengan password lalu hubungkan akun Google.',
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const oauthError = searchParams.get('error');
  const [serverError, setServerError] = useState(
    oauthError ? OAUTH_ERRORS[oauthError] ?? 'Login Google gagal. Coba lagi.' : ''
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const authCfg = useAuthConfig();
  const googleEnabled = authCfg?.googleEnabled ?? false;
  const turnstileSiteKey = authCfg?.turnstileSiteKey ?? null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setServerError('');
    if (turnstileSiteKey && !turnstileToken) {
      setServerError('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }
    const res = await signIn('credentials', {
      ...data,
      turnstileToken: turnstileToken ?? '',
      redirect: false,
    });
    if (res?.error) {
      setServerError('Email atau password salah.');
      return;
    }
    toast.success('Selamat datang kembali!');
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke beranda
      </Link>
      <div className="mb-8 hidden lg:block">
        <Link href="/" aria-label="WOORK — beranda">
          <Logo />
        </Link>
      </div>
      <h1 className="text-[24px] font-bold text-ink">Selamat datang kembali</h1>
      <p className="mt-1 text-sm text-muted">Masuk ke workspace Anda</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && (
          <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
            {serverError}
          </div>
        )}
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" placeholder="nama@perusahaan.com" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <PasswordInput placeholder="••••••••" autoComplete="current-password" {...register('password')} />
        </Field>

        <div className="flex items-center justify-between text-[13px]">
          <label className="flex items-center gap-2 text-muted cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded accent-[#087BFF]" /> Ingat saya
          </label>
          <Link href="/forgot-password" className="font-semibold text-brand hover:underline">
            Lupa password?
          </Link>
        </div>

        {turnstileSiteKey && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />
        )}

        <Button type="submit" loading={isSubmitting} className="w-full !py-3">
          Masuk
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-[12px] text-muted">
            <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => signIn('google', { callbackUrl })}
          >
            Masuk dengan Google
          </Button>
        </>
      )}

      <p className="mt-8 text-center text-[13px] text-muted">
        Belum memiliki akun?{' '}
        <Link href="/register" className="font-semibold text-brand hover:underline">
          Daftar sekarang
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
