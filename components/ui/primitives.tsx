import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('card p-5', className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn('text-[15px] font-semibold text-ink', className)}>{children}</h3>;
}

export function Badge({
  tone = 'gray',
  className,
  children,
}: {
  tone?: 'green' | 'amber' | 'blue' | 'red' | 'gray';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        tone === 'green' && 'badge-green',
        tone === 'amber' && 'badge-amber',
        tone === 'blue' && 'badge-blue',
        tone === 'red' && 'badge-red',
        tone === 'gray' && 'badge-gray',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Logo({ size = 40, withText = true }: { size?: number; withText?: boolean }) {
  // Logo resmi woork.id (wordmark + maskot, sudah ber-teks). withText dipertahankan
  // agar API pemanggil tidak berubah; saat false (sidebar collapsed) logo
  // ditampilkan lebih kecil.
  return (
    <span className="inline-flex items-center justify-center rounded-lg bg-white px-2 py-1.5 shadow-sm">
      <Image
        src="/logo.png"
        alt="woork.id"
        width={2081}
        height={509}
        priority
        style={
          withText
            ? { height: size, width: 'auto' }
            : { height: Math.round(size * 0.6), width: 'auto', maxWidth: 64 }
        }
      />
    </span>
  );
}

export function Avatar({
  name,
  size = 36,
  color,
  src,
}: {
  name: string;
  size?: number;
  color?: string;
  /** Foto profil (URL) — bila ada, foto yang tampil, bukan huruf awal. */
  src?: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover shrink-0 bg-slate-100"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = name.replace(/^(Bu|Pak)\s+/i, '').charAt(0).toUpperCase() || '?';
  const palette = ['#087BFF', '#8B5CF6', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4'];
  const bg = color ?? palette[(name.charCodeAt(0) + name.length) % palette.length];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
