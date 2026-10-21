'use client';

import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Cari…',
  debounceMs = 350,
  className,
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const [inner, setInner] = useState(value ?? '');
  useEffect(() => setInner(value ?? ''), [value]);
  useEffect(() => {
    const t = setTimeout(() => onChange(inner), debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inner]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={inner}
        onChange={(e) => setInner(e.target.value)}
        placeholder={placeholder}
        className="input !pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );
  return (
    <nav className="flex items-center justify-center gap-1.5 py-4" aria-label="Pagination">
      <button
        className="btn-secondary !px-3 !py-1.5 text-[13px]"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ‹ Sebelumnya
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1] < p - 1 && <span className="text-muted">…</span>}
          <button
            onClick={() => onPage(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'min-w-[34px] rounded-btn px-2 py-1.5 text-[13px] font-semibold transition-colors',
              p === page
                ? 'bg-brand text-white'
                : 'text-muted hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        className="btn-secondary !px-3 !py-1.5 text-[13px]"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Berikutnya ›
      </button>
    </nav>
  );
}
