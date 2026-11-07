'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuthConfig } from '@/components/auth/useAuthConfig';

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/dashboard';
  const notice = searchParams.get('notice');
  const [serverError, setServerError] = useState('');
  const [wrongDoor, setWrongDoor] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const authCfg = useAuthConfig();
  const turnstileSiteKey = authCfg?.turnstileSiteKey ?? null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setServerError('');
    setWrongDoor(false);
    if (turnstileSiteKey && !turnstileToken) {
      setServerError('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }
    const res = await signIn('credentials', {
      ...data,
      loginType: 'admin',
      turnstileToken: turnstileToken ?? '',
      redirect: false,
    });
    if (res?.error) {
      // Kode 'wrong-door-office' hanya muncul bila password BENAR tapi akun
      // ini akun pengguna kantor — arahkan ke pintu yang benar.
      if ((res as any)?.code === 'wrong-door-office') {
        setWrongDoor(true);
        setServerError('Akun ini bukan akun Administrator WOORK.');
        return;
      }
      setServerError('Email atau password salah.');
      return;
    }
    toast.success('Selamat datang kembali!');
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
          <ShieldCheck className="h-3.5 w-3.5" /> Khusus Admin
        </span>
      </div>
      <h1 className="text-[24px] font-bold text-ink">Administrator WOORK</h1>
      <p className="mt-1 text-sm text-muted">
        Login khusus pengelola platform WOORK — pengelolaan kantor, finance, dan pengaturan sistem.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {notice === 'admin-login' && (
          <div className="rounded-input border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800" role="alert">
            Akun Administrator WOORK login lewat halaman ini. Silakan masuk dengan email &amp; password.
          </div>
        )}
        {serverError && (
          <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
            {serverError}{' '}
            {wrongDoor && (
              <Link href="/login" className="font-semibold underline">
                Login sebagai pengguna kantor
              </Link>
            )}
          </div>
        )}
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" placeholder="nama@woork.id" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <PasswordInput placeholder="••••••••" autoComplete="current-password" {...register('password')} />
        </Field>

        <div className="flex items-center justify-end text-[13px]">
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
          Masuk sebagai Administrator
        </Button>
      </form>

      <p className="mt-8 text-center text-[13px] text-muted">
        Bukan administrator?{' '}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Login pengguna kantor
        </Link>
      </p>
    </div>
  );
}
