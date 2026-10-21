'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@/lib/validation';
import { resetPasswordAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { Logo } from '@/components/ui/primitives';
import { z } from 'zod';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuthConfig } from '@/components/auth/useAuthConfig';

type FormInput = z.infer<typeof resetPasswordSchema>;

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState(
    token ? '' : 'Link reset tidak valid.'
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const authCfg = useAuthConfig();
  const turnstileSiteKey = authCfg?.turnstileSiteKey ?? null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  async function onSubmit(data: FormInput) {
    setServerError('');
    if (turnstileSiteKey && !turnstileToken) {
      setServerError('Mohon selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }
    const res = await resetPasswordAction(data.token, data.password, data.confirmPassword, turnstileToken ?? undefined);
    if (!res.ok) {
      setServerError(res.message);
      return;
    }
    toast.success('Password berhasil diubah. Silakan masuk.');
    router.push('/login');
  }

  return (
    <div>
      <div className="mb-8 hidden lg:block">
        <Logo />
      </div>
      <h1 className="text-[24px] font-bold text-ink">Buat password baru</h1>
      <p className="mt-1 text-sm text-muted">Password minimal 8 karakter.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && (
          <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
            {serverError}
          </div>
        )}
        <input type="hidden" {...register('token')} />
        <Field label="Password baru" error={errors.password?.message}>
          <PasswordInput placeholder="Minimal 8 karakter" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Konfirmasi password" error={errors.confirmPassword?.message}>
          <PasswordInput placeholder="Ulangi password" autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
        {turnstileSiteKey && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />
        )}
        <Button type="submit" loading={isSubmitting} className="w-full !py-3" disabled={!token}>
          Simpan Password Baru
        </Button>
      </form>

      <p className="mt-8 text-center text-[13px] text-muted">
        <Link href="/login" className="font-semibold text-brand hover:underline">
          ← Kembali masuk
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
