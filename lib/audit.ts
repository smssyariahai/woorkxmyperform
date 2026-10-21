import { prisma } from './db';

interface AuditInput {
  organizationId: string;
  userId?: string | null;
  action: string;
  module: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Catat aktivitas penting ke AuditLog (PostgreSQL). */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data: input });
  } catch (e) {
    console.error('[audit] gagal mencatat:', (e as Error).message);
  }
}

export function getClientIp(req: Request): string {
  const h = (n: string) => req.headers.get(n);
  return (
    h('x-forwarded-for')?.split(',')[0]?.trim() ||
    h('x-real-ip') ||
    'unknown'
  );
}
