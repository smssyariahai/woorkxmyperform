'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { Facebook, Instagram, Check } from 'lucide-react';

interface PageItem {
  id: string;
  name: string;
  igUsername: string | null;
}

export function MetaPagePicker({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/channels/meta/pages');
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !ct.includes('application/json')) {
        throw new Error(`Server mengembalikan status ${r.status}.`);
      }
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setPages(j.data);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat Halaman.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function pick(pageId: string) {
    setBusyId(pageId);
    try {
      const r = await fetch('/api/channels/meta/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const names = (j.data.connected as Array<{ type: string; displayName: string }>)
        .map((c) => `${c.type === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} (${c.displayName})`)
        .join(' & ');
      toast.success(`${names} terhubung.`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghubungkan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pilih Halaman Facebook">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : pages.length === 0 ? (
        <EmptyState
          title="Tidak ada Halaman"
          description="Akun Meta Anda tidak memiliki Halaman Facebook. Buat Halaman dulu di Facebook, lalu ulangi."
        />
      ) : (
        <div className="space-y-2.5">
          <p className="text-[13px] text-muted">
            Pilih Halaman yang akan dihubungkan. Akun Instagram Bisnis yang tertaut akan ikut terhubung otomatis.
          </p>
          {pages.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-line p-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10 text-[#1877F2]">
                <Facebook className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{p.name}</p>
                {p.igUsername && (
                  <p className="flex items-center gap-1 text-[12px] text-muted">
                    <Instagram className="h-3.5 w-3.5 text-pink-600" /> @{p.igUsername}
                  </p>
                )}
              </div>
              <Button size="sm" onClick={() => pick(p.id)} loading={busyId === p.id}>
                <Check className="h-4 w-4" /> Hubungkan
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
