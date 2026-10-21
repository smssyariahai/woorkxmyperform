'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareQuote, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  isActive: boolean;
  usageCount: number;
}

/** Ganti variabel {{nama}} dengan nama pelanggan */
export function renderTemplate(body: string, customerName: string) {
  return body.replace(/\{\{\s*nama\s*\}\}/gi, customerName || 'Kak');
}

export function TemplatePicker({
  customerName,
  onPick,
}: {
  customerName: string;
  onPick: (body: string, templateId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/templates')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setTemplates(j.data.items);
          setCategories(j.data.categories);
        }
      })
      .finally(() => setLoading(false));
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open ]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (cat && t.category !== cat) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.body.toLowerCase().includes(needle) ||
        t.category.toLowerCase().includes(needle)
      );
    });
  }, [templates, q, cat]);

  function pick(t: Template) {
    onPick(renderTemplate(t.body, customerName), t.id);
    fetch(`/api/templates/${t.id}/use`, { method: 'POST' }).catch(() => {});
    setOpen(false);
    setQ('');
    setCat('');
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors inline-flex items-center gap-1.5',
          open
            ? 'border-brand bg-brand-50 text-brand dark:bg-brand-900/30'
            : 'border-brand/40 text-brand hover:bg-brand-50 dark:hover:bg-brand-900/20'
        )}
        title="Sisipkan template balasan"
      >
        <MessageSquareQuote className="h-3.5 w-3.5" /> Template
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[min(92vw,380px)] card !p-0 shadow-pop z-30 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-line">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari template…"
                  className="input !py-1.5 !pl-8 !text-[13px] w-full"
                />
              </div>
              <button onClick={() => setOpen(false)} className="btn-ghost !px-2 !py-1.5" aria-label="Tutup template">
                <X className="h-4 w-4" />
              </button>
            </div>
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button
                  onClick={() => setCat('')}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[11.5px] font-medium border transition-colors',
                    !cat ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'
                  )}
                >
                  Semua
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(cat === c ? '' : c)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11.5px] font-medium border transition-colors',
                      cat === c ? 'bg-brand text-white border-brand' : 'border-line text-muted hover:text-ink'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {loading && <p className="px-3 py-4 text-[13px] text-muted">Memuat template…</p>}
            {!loading && filtered.length === 0 && (
              <p className="px-3 py-4 text-[13px] text-muted">Tidak ada template yang cocok.</p>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t)}
                className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink truncate">{t.name}</span>
                  <span className="badge !text-[10.5px] !py-0.5 !px-2 shrink-0">{t.category}</span>
                  {t.usageCount > 0 && (
                    <span className="ml-auto text-[10.5px] text-muted shrink-0">{t.usageCount}× dipakai</span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-muted line-clamp-2 whitespace-pre-wrap">
                  {renderTemplate(t.body, customerName)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
