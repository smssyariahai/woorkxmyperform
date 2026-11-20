'use client';

import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';

/** Tombol salin tautan (pola tombol "Salin Link" di pengumuman). */
export function CopyLinkButton({
  link,
  label = 'Salin Link',
  className = 'btn-secondary',
}: {
  link: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback untuk browser tanpa izin clipboard.
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success('Tautan berhasil disalin.');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={`${className} inline-flex items-center gap-1.5`}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? 'Disalin!' : label}
    </button>
  );
}

/** Tampilkan tautan undangan dalam kotak yang mudah disalin. */
export function InviteLinkBox({ link, hint }: { link: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <Link2 size={14} className="shrink-0" />
        <span className="break-all">{link}</span>
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2">
        <CopyLinkButton link={link} label="Salin Link Undangan" />
      </div>
    </div>
  );
}
