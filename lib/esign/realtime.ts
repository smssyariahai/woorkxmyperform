import { publishAgent } from '@/lib/realtime';

/**
 * Publish event realtime E-Sign (Fase 8) via SSE in-process yang sudah ada.
 * Best-effort: kegagalan publish TIDAK PERNAH menggagalkan transaksi
 * dokumen — pemanggil memanggil fungsi ini setelah transaksi + audit sukses,
 * tanpa await yang bisa melempar (fungsi ini sinkron dan menelan error).
 */

export type EsignRealtimeEvent =
  | 'esign:document:created'
  | 'esign:document:sent'
  | 'esign:document:viewed'
  | 'esign:approval:completed'
  | 'esign:signature:completed'
  | 'esign:signature:rejected'
  | 'esign:document:partially_signed'
  | 'esign:document:completed'
  | 'esign:document:cancelled'
  | 'esign:document:expired';

export interface EsignRealtimePayload {
  documentId: string;
  documentNumber: string;
  status: string;
  signerId?: string | null;
  signerName?: string | null;
}

export function publishEsignEvent(
  organizationId: string,
  event: EsignRealtimeEvent,
  payload: EsignRealtimePayload
): void {
  try {
    publishAgent(organizationId, event, payload);
  } catch (e) {
    console.error('[esign-realtime] publish gagal:', event, (e as Error).message);
  }
}
