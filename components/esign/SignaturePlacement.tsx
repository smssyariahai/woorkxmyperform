'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  GripVertical,
  Hand,
  MapPin,
  MousePointerClick,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PdfViewer, type EsignPosition, type EsignPositionBox } from './PdfViewer';

/** Warna kotak per penandatangan (diurutkan sesuai nomor urut). */
export const SIGNER_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
];

export interface PlacementSigner {
  userId: string;
  name: string;
  position?: string | null;
}

/**
 * Langkah "Posisi Tanda Tangan" di wizard buat dokumen E-Sign.
 *
 * Dua cara menempatkan (ala Privy):
 *  1. Seret — seret kartu nama penandatangan ke halaman PDF (desktop).
 *  2. Ketuk — ketuk nama penandatangan, lalu ketuk posisi di halaman PDF
 *     (jalan di HP; mengetuk nama yang sudah ditempatkan lalu mengetuk
 *     posisi baru akan memindahkannya).
 * Kotak yang sudah ditempatkan bisa digeser (seret kotaknya) dan dihapus.
 *
 * Posisi disimpan sebagai fraksi 0–1 dari lebar/tinggi halaman + nomor
 * halaman (EsignPosition) — satuan yang sama dengan yang dipakai API/model
 * EsignSigner, jadi posisi di layar sama dengan posisi di PDF final.
 * Posisi bersifat OPSIONAL di API: penandatangan yang belum ditempatkan
 * tetap bisa dikirim (server menempatkannya otomatis di halaman terakhir).
 */
export function SignaturePlacement({
  fileUrl,
  signers,
  placements,
  onPlacementsChange,
}: {
  fileUrl: string;
  signers: PlacementSigner[];
  placements: Record<string, EsignPosition>;
  onPlacementsChange: (next: Record<string, EsignPosition>) => void;
}) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const placedCount = signers.filter((s) => placements[s.userId]).length;
  const unplacedCount = signers.length - placedCount;

  // Penandatangan aktif: yang pertama belum ditempatkan; bila semua sudah,
  // yang pertama. Bila file diganti, kembali ke halaman 1.
  useEffect(() => {
    setPage(1);
  }, [fileUrl]);

  useEffect(() => {
    if (signers.length === 0) {
      setActiveUserId(null);
      return;
    }
    if (!activeUserId || !signers.some((s) => s.userId === activeUserId)) {
      const firstUnplaced = signers.find((s) => !placements[s.userId]);
      setActiveUserId((firstUnplaced ?? signers[0]).userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signers.length, fileUrl]);

  const boxes: EsignPositionBox[] = useMemo(
    () =>
      signers
        .map((s, i) => {
          const pos = placements[s.userId];
          if (!pos) return null;
          return {
            id: s.userId,
            label: `${i + 1}. ${s.name}`,
            color: SIGNER_COLORS[i % SIGNER_COLORS.length],
            position: pos,
          } as EsignPositionBox;
        })
        .filter((b): b is EsignPositionBox => b !== null),
    [signers, placements]
  );

  const activeSigner = signers.find((s) => s.userId === activeUserId) ?? null;
  const activeIndex = activeSigner ? signers.findIndex((s) => s.userId === activeSigner.userId) : -1;
  const activeColor = activeIndex >= 0 ? SIGNER_COLORS[activeIndex % SIGNER_COLORS.length] : '#2563eb';

  function nextUnplacedId(exceptUserId?: string): string | null {
    const next = signers.find((s) => s.userId !== exceptUserId && !placements[s.userId]);
    return next ? next.userId : null;
  }

  function placeFor(userId: string, pos: EsignPosition) {
    onPlacementsChange({ ...placements, [userId]: pos });
    // Lanjut otomatis ke penandatangan berikutnya yang belum ditempatkan.
    const next = nextUnplacedId(userId);
    if (next) setActiveUserId(next);
  }

  function removeFor(userId: string) {
    const next = { ...placements };
    delete next[userId];
    onPlacementsChange(next);
    setActiveUserId(userId);
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Tentukan di mana setiap penandatangan harus menandatangani di dokumen. Pilih satu cara di
        bawah — keduanya menghasilkan kotak yang sama.
      </p>

      {/* Dua cara menempatkan */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-slate-50 p-3 dark:bg-slate-800/60">
          <Hand className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
          <p className="text-[13px] text-ink">
            <b>Cara 1 — Seret.</b>{' '}
            <span className="text-muted">
              Seret kartu nama di bawah ke halaman PDF (di komputer).
            </span>
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-slate-50 p-3 dark:bg-slate-800/60">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
          <p className="text-[13px] text-ink">
            <b>Cara 2 — Ketuk.</b>{' '}
            <span className="text-muted">
              Ketuk nama, lalu ketuk posisi di dokumen. Cara ini yang paling mudah di HP.
            </span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Daftar penandatangan + status penempatan */}
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-ink">
            Penandatangan{' '}
            <span className="font-normal text-muted">
              · {placedCount} dari {signers.length} sudah ditempatkan
            </span>
          </p>
          {signers.map((s, i) => {
            const pos = placements[s.userId];
            const color = SIGNER_COLORS[i % SIGNER_COLORS.length];
            const active = s.userId === activeUserId;
            return (
              <div
                key={s.userId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-esign-signer', s.userId);
                  e.dataTransfer.setData('text/plain', s.userId);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => setActiveUserId(s.userId)}
                className={cn(
                  'flex cursor-grab items-center gap-2.5 rounded-xl border p-3 transition-colors active:cursor-grabbing',
                  active
                    ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600 dark:bg-brand-900/20'
                    : 'border-line bg-white hover:border-brand/50 dark:bg-slate-900'
                )}
                style={active ? { borderColor: color } : undefined}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted" />
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{s.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {pos ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Halaman {pos.page}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Belum ditempatkan
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[12px] font-medium',
                      active ? 'text-white' : 'bg-slate-100 text-ink dark:bg-slate-800'
                    )}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    {pos ? 'Pindah' : 'Tempatkan'}
                  </span>
                  {pos && (
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFor(s.userId);
                      }}
                      title={`Hapus posisi ${s.name}`}
                      aria-label={`Hapus posisi ${s.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {activeSigner && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-[12px] text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
              {placements[activeSigner.userId]
                ? `Memindahkan kotak ${activeSigner.name} — ketuk posisi baru di dokumen, atau seret kotaknya.`
                : `Menempatkan kotak untuk ${activeSigner.name} — ketuk posisi di dokumen, atau seret kartunya ke dokumen.`}
            </p>
          )}
          <p className="text-[12px] text-muted">
            Kotak yang sudah ada di dokumen bisa digeser langsung dengan menyeretnya, atau dihapus
            lewat tombol × di kotaknya.
          </p>
        </div>

        {/* Pratinjau PDF + kotak-kotak */}
        <div>
          <PdfViewer
            src={fileUrl}
            boxes={boxes}
            activeBoxId={activeUserId}
            onBoxSelect={setActiveUserId}
            onBoxMove={(id, pos) => onPlacementsChange({ ...placements, [id]: pos })}
            onBoxRemove={removeFor}
            onPlace={activeUserId ? (pos) => placeFor(activeUserId, pos) : undefined}
            onDropSigner={(signerId, pos) => {
              if (!signers.some((s) => s.userId === signerId)) return;
              placeFor(signerId, pos);
            }}
            page={page}
            onPageChange={setPage}
          />
          <p className="mt-2 text-[12px] text-muted">
            Gunakan tombol halaman di atas untuk berpindah halaman — setiap kotak tersimpan di
            halamannya masing-masing.
            {activeSigner && (
              <>
                {' '}
                Kotak aktif: <b style={{ color: activeColor }}>{activeSigner.name}</b>.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Peringatan / konfirmasi */}
      {unplacedCount > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <b>{unplacedCount} dari {signers.length} penandatangan belum ditempatkan.</b> Tidak
            apa-apa — kamu tetap bisa lanjut dan mengirim; posisinya akan ditentukan otomatis di
            halaman terakhir saat PDF final dibuat. Posisi masih bisa diatur nanti di halaman
            detail dokumen.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-[13px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <b>Semua penandatangan sudah ditempatkan.</b> Tanda tangan akan muncul persis di kotak
            yang kamu tentukan di PDF final.
          </p>
        </div>
      )}
    </div>
  );
}
