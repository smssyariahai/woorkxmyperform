import { Logo } from '@/components/ui/primitives';

// Halaman pendaftaran fokus hanya pada form — tanpa panel branding/marketing.
// Logo di sini hanya tampil di layar kecil; di desktop logo sudah ada di dalam form.
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-[640px]">
        <div className="mb-6 flex justify-center lg:hidden">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
