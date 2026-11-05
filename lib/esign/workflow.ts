/**
 * Aturan giliran workflow penandatanganan.
 * - PARALLEL: semua penandatangan PENDING boleh menandatangani kapan saja.
 * - SEQUENTIAL: hanya penandatangan PENDING dengan signingOrder terkecil
 *   yang boleh menandatangani / menolak saat ini.
 */

export interface SignerTurn {
  signingOrder: number;
  signingStatus: string;
}

export function isSignerTurn(
  workflowType: string,
  signer: SignerTurn,
  signers: SignerTurn[]
): boolean {
  if (signer.signingStatus !== 'PENDING') return false;
  if (workflowType === 'PARALLEL') return true;
  const pending = signers.filter((s) => s.signingStatus === 'PENDING');
  if (!pending.length) return false;
  const minOrder = Math.min(...pending.map((s) => s.signingOrder));
  return signer.signingOrder === minOrder;
}

/** Status dokumen setelah satu penandatangan selesai (belum finalisasi PDF). */
export function statusAfterSign(remainingPending: number): 'PARTIALLY_SIGNED' | 'SIGNED' {
  return remainingPending > 0 ? 'PARTIALLY_SIGNED' : 'SIGNED';
}
