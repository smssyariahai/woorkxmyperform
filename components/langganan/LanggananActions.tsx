'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Aksi langganan untuk pengguna tenant (Fase 4 §7).
 * - Unduh Data Saya: OWNER + NONAKTIF saja (tautan ke export API).
 * - Minta Berhenti Berlangganan: OWNER + TRIAL/AKTIF/MENUNGGAK saja.
 * Bukan OWNER → kedua tombol disembunyikan.
 */
export function LanggananActions({
  lifecycleStatus,
  isOwner,
}: {
  lifecycleStatus: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [showStop, setShowStop] = useState(false);

  const canStop = isOwner && ['TRIAL', 'AKTIF', 'MENUNGGAK'].includes(lifecycleStatus);
  const canExport = isOwner && lifecycleStatus === 'NONAKTIF';

  async function requestStop() {
    if (reason.trim().length < 10) {
      toast.error('Alasan wajib diisi minimal 10 karakter.');
      return;
    }
    if (
      !confirm(
        'Minta berhenti berlangganan? Tenant akan masuk masa retensi 60 hari dan semua pengguna tidak bisa login ke workspace selama masa itu.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/tenant/subscription/request-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal mengirim permintaan.');
      toast.success('Permintaan berhenti berlangganan dikirim. Tenant masuk masa retensi 60 hari.');
      setShowStop(false);
      setReason('');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim permintaan.');
    } finally {
      setBusy(false);
    }
  }

  if (!canStop && !canExport) {
    return (
      <p className="text-[13px] text-muted">
        {isOwner
          ? 'Tidak ada aksi yang tersedia untuk status langganan saat ini.'
          : 'Hanya Client Admin (OWNER) yang dapat meminta berhenti berlangganan atau mengunduh data perusahaan.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {canExport && (
        <div>
          <a href="/api/tenant/subscription/export" className="btn-primary !py-2 text-[13px] inline-flex items-center gap-2">
            Unduh Data Saya
          </a>
          <p className="mt-2 text-[12px] text-muted">
            Mengunduh backup SQL database perusahaan Anda (file terbaru). Simpan file ini sebelum masa retensi habis.
          </p>
        </div>
      )}

      {canStop && !showStop && (
        <button onClick={() => setShowStop(true)} disabled={busy} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
          Minta Berhenti Berlangganan
        </button>
      )}

      {canStop && showStop && (
        <div className="border border-line rounded-btn p-4 space-y-3">
          <h3 className="text-[13.5px] font-bold text-ink">Minta Berhenti Berlangganan</h3>
          <p className="text-[13px] text-muted">
            Tenant akan dinonaktifkan dan masuk masa retensi 60 hari. Selama retensi Anda masih bisa mengunduh data dari halaman ini.
            Setelah retensi habis dan dikonfirmasi Administrator Pusat, data dihapus permanen.
          </p>
          <div>
            <label className="label">Alasan (minimal 10 karakter)</label>
            <textarea
              className="input min-h-[72px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Perusahaan kami berhenti menggunakan WOORK karena merger dengan grup lain."
            />
          </div>
          <div className="flex gap-2">
            <button onClick={requestStop} disabled={busy} className="btn-danger !py-2 text-[13px] disabled:opacity-50">
              Kirim Permintaan Berhenti
            </button>
            <button
              onClick={() => {
                setShowStop(false);
                setReason('');
              }}
              disabled={busy}
              className="btn-ghost !py-2 text-[13px] disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
