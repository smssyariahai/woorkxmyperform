'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { friendlyFetchError, timeAgo } from './meta';

export interface Approval {
  id: string;
  approvalType: string;
  description: string;
  status: string;
  createdAt: string;
  task: { id: string; title: string; status: string };
  requestedBy: { id: string; name: string; avatarColor: string } | null;
}

export function ApprovalPanel({ items, onRefresh }: { items: Approval[]; onRefresh: () => void }) {
  const [busy, setBusy] = useState('');

  async function review(id: string, approve: boolean) {
    setBusy(id);
    try {
      const r = await fetch(`/api/approvals/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(approve ? 'Disetujui — tugas dilanjutkan.' : 'Ditolak — tugas dibatalkan.');
      onRefresh();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal memproses.'));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold text-ink mb-3">
        Persetujuan{' '}
        {items.length > 0 && (
          <span className="badge-red !text-[10.5px] !px-2 ml-1">{items.length}</span>
        )}
      </h3>
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="text-[13px] text-muted py-3 text-center">Tidak ada pengajuan menunggu.</p>
        )}
        {items.map((a) => (
          <div key={a.id} className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 p-3">
            <div className="flex items-center gap-2">
              {a.requestedBy && (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold"
                  style={{ backgroundColor: a.requestedBy.avatarColor }}
                >
                  {a.requestedBy.name.charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{a.task.title}</p>
                <p className="text-[11px] text-muted">
                  {a.requestedBy?.name} · {timeAgo(a.createdAt)}
                </p>
              </div>
            </div>
            {a.description && (
              <p className="mt-1.5 text-[12.5px] text-muted line-clamp-2">{a.description}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => review(a.id, true)}
                disabled={!!busy}
                className="btn-primary !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5" /> {busy === a.id ? '…' : 'Setujui'}
              </button>
              <button
                onClick={() => review(a.id, false)}
                disabled={!!busy}
                className="btn-secondary !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" /> Tolak
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
