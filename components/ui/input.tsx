import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  )
);
Input.displayName = 'Input';

/** Input password dengan tombol lihat/sembunyikan. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={cn('input pr-11', className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? 'Sembunyikan password' : 'Lihat password'}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[12px] text-danger font-medium">{message}</p>;
}

export function Field({
  label,
  error,
  children,
  optional,
}: {
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label} {optional && <span className="text-muted font-normal">(opsional)</span>}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
}
