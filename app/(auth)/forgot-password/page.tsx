'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { z } from 'zod';
import { forgotPasswordSchema } from '@/lib/validation';
import { forgotPasswordAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Logo } from '@/components/ui/primitives';
import { CheckCircle2 } from 'lucide-react';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuthConfig } from '@/components/auth/useAuthConfig';

type FormInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [devLink, setDevLink] = useState('');
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const authCfg = useAuthConfig();
  const turnstileSiteKey = authCfg?.turnstileSiteKey ?? null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(data: FormInput) {
    setError('');
    if (turnstileSiteKey && !turnstileToken) {
      setError('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }
    const res = await forgotPasswordAction(data.email, turnstileToken ?? undefined);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDone(true);
    if (res.devLink) setDevLink(res.devLink);
  }

  return (
    <div>
      <div className="mb-8 hidden lg:block">
        <Logo />
      </div>
      {done ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-wa" />
          <h1 className="mt-4 text-[22px] font-bold text-ink">Periksa email Anda</h1>
          <p className="mt-2 text-sm text-muted">
            Jika email terdaftar, link reset password telah dikirim dan berlaku 1 jam.
          </p>
          {devLink && (
            <p className="mt-4 rounded-input bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-800 break-all">
              Mode pengembangan — <a className="font-semibold underline" href={devLink}>buka link reset</a>
            </p>
          )}
          <Link href="/login" className="btn-secondary mt-6 inline-flex">
            Kembali masuk
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-[24px] font-bold text-ink">Lupa password?</h1>
          <p className="mt-1 text-sm text-muted">
            Masukkan email akun Anda, kami akan mengirimkan link reset password.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            {error && (
              <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
                {error}
              </div>
            )}
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="nama@perusahaan.com" {...register('email')} />
            </Field>
            {turnstileSiteKey && (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
              />
            )}
            <Button type="submit" loading={isSubmitting} className="w-full !py-3">
              Kirim Link Reset Password
            </Button>
          </form>
          <p className="mt-8 text-center text-[13px] text-muted">
            <Link href="/login" className="font-semibold text-brand hover:underline">
              ← Kembali masuk
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
