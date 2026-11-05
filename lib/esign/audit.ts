import { prisma } from '@/lib/db';
import { audit, getClientIp } from '@/lib/audit';

/**
 * Audit trail E-Sign: tulis ke EsignAuditLog (append-only, per dokumen)
 * DAN ke AuditLog umum (module 'ESIGN') supaya tampil di menu Audit.
 */
export async function esignAudit(input: {
  organizationId: string;
  documentId: string;
  userId?: string | null;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
  documentHash?: string | null;
  req?: Request;
}): Promise<void> {
  const meta = JSON.stringify(input.metadata ?? {});
  const ip = input.req ? getClientIp(input.req) : undefined;
  const ua = input.req ? input.req.headers.get('user-agent') ?? undefined : undefined;
  try {
    await prisma.esignAuditLog.create({
      data: {
        documentId: input.documentId,
        userId: input.userId ?? null,
        action: input.action,
        metadata: meta,
        ipAddress: ip,
        userAgent: ua,
        documentHash: input.documentHash ?? null,
      },
    });
  } catch (e) {
    console.error('[esign-audit] gagal mencatat:', (e as Error).message);
  }
  await audit({
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    action: input.action,
    module: 'ESIGN',
    description: input.description,
    ipAddress: ip,
    userAgent: ua,
  });
}
