import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  matchMutations,
  parseBankCsv,
  saveStatementFile,
} from '@/lib/tenant/bank-reconciliation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/billing/statements/upload — unggah CSV rekening koran
 *  (guard BILLING_MANAGE). Multipart: bankCode, uploadMethod
 *  ('CSV_UPLOAD'|'MANUAL_PULL' — MANUAL_PULL = Master sudah menyelesaikan
 *  OTP di kanal bank yang sah, lalu mengunggah berkasnya; cadangan a §9.5),
 *  file CSV (<=5 MB). Kembalikan {statement, summary, parseErrors}. */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const form = await req.formData();
    const bankCode = String(form.get('bankCode') ?? '');
    const uploadMethodRaw = String(form.get('uploadMethod') ?? 'CSV_UPLOAD');
    const uploadMethod =
      uploadMethodRaw === 'MANUAL_PULL' ? 'MANUAL_PULL' : 'CSV_UPLOAD';
    const file = form.get('file');
    if (!(file instanceof File)) {
      return apiErr('Berkas CSV wajib diunggah.', 400);
    }
    const saved = await saveStatementFile(bankCode, file);
    const parsed = parseBankCsv(saved.text, bankCode);
    const statement = await masterPrisma.bankStatement.create({
      data: {
        bankCode,
        fileName: saved.fileName,
        storedPath: saved.storedPath,
        rowCount: parsed.rows.length,
        skippedRows: parsed.skipped,
        uploadedByUserId: ctx.userId,
        uploadMethod,
      },
    });
    const summary = await matchMutations({
      statementId: statement.id,
      bankCode,
      rows: parsed.rows,
      uploadedByUserId: ctx.userId,
    });
    const fresh = await masterPrisma.bankStatement.findUnique({
      where: { id: statement.id },
    });
    return apiOk(
      {
        statement: fresh
          ? {
              id: fresh.id,
              bankCode: fresh.bankCode,
              fileName: fresh.fileName,
              rowCount: fresh.rowCount,
              matchedCount: fresh.matchedCount,
              queuedCount: fresh.queuedCount,
              skippedRows: fresh.skippedRows,
              uploadMethod: fresh.uploadMethod,
              createdAt: fresh.createdAt,
            }
          : null,
        summary: { ...summary, skipped: parsed.skipped },
        parseErrors: parsed.errors,
      },
      201,
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal mengunggah rekening koran.', 500);
  }
}
