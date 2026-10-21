import { Logo } from '@/components/ui/primitives';
import { CheckCircle2 } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Kiri: branding */}
      <div className="hidden lg:flex flex-col justify-between bg-brand-900 text-white p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 30%, #fff 0, transparent 40%), radial-gradient(circle at 80% 70%, #fff 0, transparent 40%)',
          }}
        />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[32px] font-bold leading-tight">
            Kelola pelanggan lebih mudah bersama WOORK.
          </h1>
          <p className="mt-4 text-white/70">
            Satu workspace untuk WhatsApp, Instagram, Facebook, lead, dan follow up tim Anda.
          </p>
          {/* Mini mockup dashboard */}
          <div className="mt-8 rounded-card bg-white/10 backdrop-blur border border-white/15 p-4">
            <div className="flex gap-3">
              <div className="w-24 space-y-2">
                {['Inbox', 'CRM', 'Bot', 'Broadcast'].map((m) => (
                  <div key={m} className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] text-white/80">
                    {m}
                  </div>
                ))}
              </div>
              <div className="flex-1 space-y-2">
                {[
                  ['Bu Sari', 'Toko kue, mau terima pesanan online', true],
                  ['Pak Andi', 'Kalau beli 20 unit ada diskon?', false],
                  ['Bu Rina', 'Saya sudah transfer ya', true],
                ].map(([n, p, unread]) => (
                  <div key={n as string} className="rounded-lg bg-white/95 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-ink">{n}</span>
                      {unread ? (
                        <span className="h-2 w-2 rounded-full bg-wa" />
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-muted">{p}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="relative space-y-2">
          {['Inbox omnichannel terpadu', 'Otomasi follow up cerdas', 'Laporan performa tim'].map((t) => (
            <div key={t} className="flex items-center gap-2 text-[13px] text-white/80">
              <CheckCircle2 className="h-4 w-4 text-wa" /> {t}
            </div>
          ))}
        </div>
      </div>

      {/* Kanan: form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
