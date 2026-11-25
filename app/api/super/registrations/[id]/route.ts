import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type SnapshotTier = { name?: string; monthlyPrice?: number | null } | null;
type SnapshotModule = { name?: string; monthlyPrice?: number | null } | null;

/**
 * Normalisasi snapshot paket tersimpan (bentuk BERSARANG: userTier.name,
 * storageTier.name, modules[].name, basePrice, ppnRateBps) ke bentuk DATAR
 * yang dipakai RegistrationDetailClient (userTierName, storageTierName,
 * moduleNames, monthlyPrice, total) — sama seperti yang sudah dilakukan
 * endpoint antrean (GET /api/super/registrations).
 *
 * Tanpa normalisasi ini, halaman detail selalu menampilkan "—" untuk batas
 * pengguna / storage / modul dan tidak pernah menampilkan baris harga,
 * padahal paketnya tersimpan dengan benar saat pendaftaran (ditemukan dari
 * screenshot user 2026-11-24 ~18:28).
 */
function buildPackageSnapshotView(raw: string): Record<string, unknown> {
  const snap = safeParse(raw);
  const userTier = (snap.userTier ?? null) as SnapshotTier;
  const storageTier = (snap.storageTier ?? null) as SnapshotTier;
  const modules = (Array.isArray(snap.modules) ? snap.modules : []) as SnapshotModule[];
  const monthlyParts: (number | null | undefined)[] = [
    userTier?.monthlyPrice,
    storageTier?.monthlyPrice,
    ...modules.map((m) => m?.monthlyPrice),
  ];
  const monthlyPrice =
    snap.hasCustomPrice === true || monthlyParts.some((p) => p == null)
      ? null
      : monthlyParts.reduce<number>((a, b) => a + (b ?? 0), 0);
  // basePrice tersimpan per siklus yang dipilih (bulanan untuk MONTHLY,
  // tahunan untuk YEARLY); total = dasar + PPN pada siklus yang sama.
  const basePrice = typeof snap.basePrice === 'number' ? snap.basePrice : null;
  const ppnRateBps = typeof snap.ppnRateBps === 'number' ? snap.ppnRateBps : null;
  const total =
    basePrice != null && ppnRateBps != null
      ? basePrice + Math.round((basePrice * ppnRateBps) / 10000)
      : null;
  return {
    userTierName: userTier?.name ?? null,
    storageTierName: storageTier?.name ?? null,
    moduleNames: modules.map((m) => m?.name ?? '').filter(Boolean),
    monthlyPrice,
    total,
    ppnRateBps,
  };
}

/**
 * GET /api/super/registrations/[id] — detail pendaftaran (guard VIEW).
 * selfAssessment + packageSnapshot sebagai object; documents TANPA
 * storedPath; tenant bila sudah disetujui; viewerIsSuperAdmin untuk
 * menentukan tombol unduh KTP di UI.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_REGISTRATIONS_VIEW',
      req,
    );
    const reg = await masterPrisma.tenantRegistration.findUnique({
      where: { id: params.id },
      include: { documents: { orderBy: { createdAt: 'asc' } } },
    });
    if (!reg) {
      return apiErr('Pendaftaran tidak ditemukan.', 404);
    }
    let tenant = null;
    if (reg.tenantId) {
      tenant = await masterPrisma.tenant.findUnique({
        where: { id: reg.tenantId },
        select: {
          id: true,
          tenantCode: true,
          tenantStatus: true,
          databaseStatus: true,
        },
      });
    }
    return apiOk({
      id: reg.id,
      companyName: reg.companyName,
      legalEntityType: reg.legalEntityType,
      businessField: reg.businessField,
      companyAddress: reg.companyAddress,
      city: reg.city,
      companyPhone: reg.companyPhone,
      picName: reg.picName,
      picPosition: reg.picPosition,
      picEmail: reg.picEmail,
      picPhone: reg.picPhone,
      nib: reg.nib,
      userTierId: reg.userTierId,
      storageTierId: reg.storageTierId,
      moduleKeys: reg.moduleKeys,
      billingCycle: reg.billingCycle,
      startChoice: reg.startChoice,
      npwpStatus: reg.npwpStatus,
      npwpStatement: reg.npwpStatement,
      selfAssessment: safeParse(reg.selfAssessmentJson),
      packageSnapshot: buildPackageSnapshotView(reg.packageSnapshotJson),
      status: reg.status,
      decidedByUserId: reg.decidedByUserId,
      decidedAt: reg.decidedAt,
      decisionReason: reg.decisionReason,
      tenantId: reg.tenantId,
      createdAt: reg.createdAt,
      updatedAt: reg.updatedAt,
      documents: reg.documents.map((d) => ({
        id: d.id,
        docType: d.docType,
        docSubtype: d.docSubtype,
        fileName: d.fileName,
        fileSize: d.fileSize,
        createdAt: d.createdAt,
      })),
      tenant,
      viewerIsSuperAdmin: ctx.isSuperAdmin,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('[super/registrations/[id]] GET gagal:', e);
    return apiErr('Gagal memuat detail pendaftaran.', 500);
  }
}
