'use client';

import { useRouter } from 'next/navigation';
import { RegistrationForm } from '@/components/auth/RegistrationForm';

export default function RegisterPage() {
  const router = useRouter();
  return (
    <RegistrationForm
      mode="create"
      onSuccess={(data) =>
        router.push(`/register/status?ref=${encodeURIComponent(data.registrationId)}&token=${encodeURIComponent(data.statusToken)}`)
      }
    />
  );
}
