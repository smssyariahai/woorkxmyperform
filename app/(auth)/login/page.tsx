import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  // Sudah login: arahkan ke beranda sesuai peran. Middleware (edge) tidak
  // bisa melihat peran dari token, jadi pengecekan dilakukan di sini.
  const ctx = await getAuthContext();
  if (ctx) {
    const isAdmin = ctx.isSuperAdmin || (await getUserPlatformPermissions(ctx)).size > 0;
    redirect(isAdmin ? '/admin/dashboard' : '/dashboard');
  }
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
