// Phase 6 — migrasi org legacy (woork_saas) ke database tenant.
//
// DUA MODE (opts.cutover pada migrateOrgToTenant):
// - DRY-RUN (default): semua PlatformUser dibuat dengan HASH TEST (bcrypt
//   dari TEST_MIGRATION_PASSWORD), BUKAN hash legacy — agar login pengguna
//   asli selama dry-run tetap jatuh ke legacy dan TIDAK PERNAH masuk
//   tenant dry-run. Tenant DIBERSIHKAN TOTAL oleh CLI di akhir.
// - CUTOVER (opts.cutover === true): PlatformUser.passwordHash = hash ASLI
//   legacy User.password per user (bcrypt, disimpan apa adanya — JANGAN
//   di-hash ulang). SATU-SATUNYA perbedaan dengan dry-run; semua langkah
//   lain (provisioning, salin, verifikasi, cleanup-on-failure) IDENTIK.
//   Mode cutover HANYA dijalankan parent di jendela maintenance, lewat
//   CLI dengan --cutover --confirm-cutover=<slug-org> — TIDAK PERNAH
//   di dry-run, TIDAK PERNAH tanpa konfirmasi slug yang cocok persis.
//
// Prinsip salin:
// - Semua baris disalin dengan ID ASLI legacy (user, role, customer, ...)
//   sehingga semua FK antar-baris tetap valid tanpa remapping. Satu-satunya
//   field yang ditulis ulang: `organizationId` (legacy org id -> tenant.id).
// - Baris hasil seed provisioning (Permission, Role, LeadStage, DealStage,
//   Channel, Subscription, Membership + mirror Organization/User) dibuat
//   dengan id BARU — semuanya DIHAPUS dulu, lalu disalin legacy dengan id
//   asli. Tanpa ini, FK (mis. Membership.roleId) akan menunjuk id seed
//   yang salah.
// - Skema tenant TIDAK punya FK ke User (semua userId skalar) — mirror
//   User hanya untuk tampilan nama (pola Phase 3). Yang di-mirror:
//   semua anggota (Membership) + semua user yang dirujuk data org.
// - `Session` TIDAK disalin (ephemeral; tenant tidak menulis Session).
// - `woork_saas` TIDAK PERNAH ditulis — hanya dibaca.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { legacyPrisma } from '../db';
import { masterPrisma } from './master';
import { hashPassword } from '../password';
import { runProvisioningSteps } from './provisioning';
import { generateTenantCode } from './tenant-code';
import { getTenantClientForCode } from './resolver';
import { disconnectTenantClient } from './tenant-db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';

const execFileAsync = promisify(execFile);

/** Password test dry-run — JANGAN dipakai untuk akun produksi. */
export const TEST_MIGRATION_PASSWORD = 'UjiPhase62026!';

/**
 * Urutan topologis salin (dihitung dari @relation skema tenant;
 * parent selalu sebelum child). `Organization`/`User` ditangani terpisah
 * (mirror), `Session` dilewati (tidak disalin).
 */
export const COPY_ORDER_DIRECT: string[] = [
  'agent', 'agentTask', 'announcement', 'archiveCategory', 'attendanceLocation',
  'auditLog', 'botConfig', 'botFlow', 'botUsage', 'briefingSession',
  'briefingSettings', 'calendarEvent', 'calendarUserPreference', 'campaign',
  'channel', 'companyDocument', 'companyTax', 'creditLedger', 'customer',
  'dailyPrayerSchedule', 'dailyWorkNote', 'dailyWorkspacePreference',
  'dealStage', 'department', 'esignDocument', 'esignTemplate',
  'esignWaSignSession', 'goldPriceHistory', 'goldSetting', 'hrVacancy',
  'kirimUrl', 'koperasiAnggota', 'koperasiSetting', 'leadStage',
  'masterLedger', 'meeting', 'meetingSetting', 'notification',
  'notificationPreference', 'overtimeRequest', 'prayerSession',
  'prayerTimeSettings', 'prayerUserSetting', 'quranBookmark', 'replyTemplate',
  'role', 'shift', 'simulation', 'subscription', 'tag', 'talAuditLog',
  'talBadge', 'talCuti', 'talDeadlineSetting', 'talHoliday', 'talLockReport',
  'talMonthlyLock', 'talRoutineTemplate', 'talSetting', 'talTask',
  'talTeamVisibility', 'talUserObligation', 'ticket', 'topUpRequest',
  'userBadgeProgress', 'userCustomFieldDef', 'userTrophy', 'activity',
  'agentActivity', 'agentMessage', 'approval', 'archiveDocument',
  'attendanceSetting', 'calendarSyncLog', 'channelAccount', 'conversation',
  'deal', 'followUp', 'hrCandidate', 'invitation', 'invoice', 'lead',
  'membership', 'note', 'officeLayout', 'taskEvent', 'workSchedule',
  'attendanceRecord', 'hrEmployee', 'attendanceCorrection', 'hrContract',
];

/** Model anak (tanpa organizationId) + filter relasi ke parent ber-org. */
export interface ChildSpec {
  model: string;
  /** where Prisma (relasi) untuk legacyPrisma[model].findMany. */
  where: (orgId: string) => Record<string, unknown>;
}
export const COPY_CHILDREN: ChildSpec[] = [
  { model: 'rolePermission', where: (o) => ({ role: { organizationId: o } }) },
  { model: 'userEmployment', where: (o) => ({ membership: { organizationId: o } }) },
  { model: 'userCustomValue', where: (o) => ({ membership: { organizationId: o } }) },
  { model: 'userModuleAccess', where: (o) => ({ membership: { organizationId: o } }) },
  { model: 'customerTag', where: (o) => ({ customer: { organizationId: o } }) },
  { model: 'conversationMessage', where: (o) => ({ conversation: { organizationId: o } }) },
  { model: 'campaignRecipient', where: (o) => ({ campaign: { organizationId: o } }) },
  { model: 'botNode', where: (o) => ({ flow: { organizationId: o } }) },
  { model: 'subscriptionModule', where: (o) => ({ subscription: { organizationId: o } }) },
  { model: 'invoiceItem', where: (o) => ({ invoice: { organizationId: o } }) },
  { model: 'esignSigner', where: (o) => ({ document: { organizationId: o } }) },
  { model: 'esignSignature', where: (o) => ({ document: { organizationId: o } }) },
  { model: 'esignAuditLog', where: (o) => ({ document: { organizationId: o } }) },
  { model: 'esignNotification', where: (o) => ({ document: { organizationId: o } }) },
  { model: 'ticketReply', where: (o) => ({ ticket: { organizationId: o } }) },
  { model: 'meetingParticipant', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'meetingGuestToken', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'meetingSession', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'meetingChatMessage', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'meetingRecording', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'meetingAgendaItem', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'meetingNote', where: (o) => ({ meeting: { organizationId: o } }) },
  { model: 'calendarAttendee', where: (o) => ({ event: { organizationId: o } }) },
  { model: 'calendarReminder', where: (o) => ({ event: { organizationId: o } }) },
  { model: 'prayerSessionParticipant', where: (o) => ({ session: { organizationId: o } }) },
  { model: 'briefingParticipant', where: (o) => ({ session: { organizationId: o } }) },
];

export interface TableCheck {
  table: string;
  legacy: number;
  tenant: number;
  pass: boolean;
}

export interface MigrateOrgResult {
  tenantId: string;
  tenantCode: string;
  companyName: string;
  legacyOrgId: string;
  adminEmail: string;
  membersMigrated: number;
  tables: TableCheck[];
  invoiceTotalLegacy: number | null;
  invoiceTotalTenant: number | null;
  referencedUsersMirrored: number;
  allPass: boolean;
}

type LogFn = (msg: string) => void;

function logDefault(msg: string): void {
  console.log(msg);
}

/**
 * GATE KEAMANAN (wajib sebelum dry-run/cutover): ada pengingat kalender
 * atau campaign terjadwal yang JATUH TEMPO dalam 2 jam ke depan untuk org
 * ini? Bila ada, kembalikan daftarnya — pemanggil HARUS berhenti (data
 * salinan bisa memicu pengiriman ganda).
 */
export async function checkMigrationGate(legacyOrgId: string): Promise<string[]> {
  const blocked: string[] = [];
  const reminders = await legacyPrisma.$queryRaw<{ id: string; title: string; remindAt: Date }[]>`
    SELECT cr."id", ce."title", cr."remindAt"
    FROM "CalendarReminder" cr JOIN "CalendarEvent" ce ON ce."id" = cr."eventId"
    WHERE cr."deliveryStatus" = 'PENDING' AND cr."remindAt" <= now() + interval '2 hours'
      AND ce."status" = 'SCHEDULED' AND ce."organizationId" = ${legacyOrgId}
    ORDER BY cr."remindAt" ASC LIMIT 10`;
  for (const r of reminders) {
    blocked.push(`pengingat "${r.title}" jatuh tempo ${r.remindAt.toISOString()}`);
  }
  const campaigns = await legacyPrisma.$queryRaw<{ id: string; name: string; scheduledAt: Date }[]>`
    SELECT "id", "name", "scheduledAt" FROM "Campaign"
    WHERE "scheduledAt" IS NOT NULL AND "scheduledAt" <= now() + interval '2 hours'
      AND "status" NOT IN ('SENT', 'CANCELLED') AND "organizationId" = ${legacyOrgId}
    ORDER BY "scheduledAt" ASC LIMIT 10`;
  for (const c of campaigns) {
    blocked.push(`campaign "${c.name}" terjadwal ${c.scheduledAt.toISOString()}`);
  }
  return blocked;
}

/** Kumpulkan id user yang dirujuk data org (untuk mirror tampilan nama). */
export async function collectReferencedUserIds(legacyOrgId: string): Promise<string[]> {
  const rows = await legacyPrisma.$queryRaw<{ uid: string }[]>`
    SELECT DISTINCT uid FROM (
      SELECT "userId" AS uid FROM "AuditLog" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "createdById" FROM "AgentTask" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "reviewedById" FROM "Approval" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "createdById" FROM "Campaign" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "createdById" FROM "CalendarEvent" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "Notification" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "actorId" FROM "Activity" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "assigneeId" FROM "Conversation" WHERE "organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "CalendarAttendee" ca JOIN "CalendarEvent" ce ON ce."id" = ca."eventId" WHERE ce."organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "CalendarReminder" cr JOIN "CalendarEvent" ce ON ce."id" = cr."eventId" WHERE ce."organizationId" = ${legacyOrgId}
      UNION SELECT "senderId" FROM "ConversationMessage" cm JOIN "Conversation" c ON c."id" = cm."conversationId" WHERE c."organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "EsignSigner" es JOIN "EsignDocument" ed ON ed."id" = es."documentId" WHERE ed."organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "EsignAuditLog" ea JOIN "EsignDocument" ed ON ed."id" = ea."documentId" WHERE ed."organizationId" = ${legacyOrgId}
      UNION SELECT "recipientId" FROM "EsignNotification" en JOIN "EsignDocument" ed ON ed."id" = en."documentId" WHERE ed."organizationId" = ${legacyOrgId}
      UNION SELECT "authorId" FROM "TicketReply" tr JOIN "Ticket" t ON t."id" = tr."ticketId" WHERE t."organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "MeetingParticipant" mp JOIN "Meeting" mt ON mt."id" = mp."meetingId" WHERE mt."organizationId" = ${legacyOrgId}
      UNION SELECT "userId" FROM "MeetingSession" ms JOIN "Meeting" mt ON mt."id" = ms."meetingId" WHERE mt."organizationId" = ${legacyOrgId}
      UNION SELECT "senderId" FROM "MeetingChatMessage" mcm JOIN "Meeting" mt ON mt."id" = mcm."meetingId" WHERE mt."organizationId" = ${legacyOrgId}
      UNION SELECT "uploaderId" FROM "MeetingRecording" mr JOIN "Meeting" mt ON mt."id" = mr."meetingId" WHERE mt."organizationId" = ${legacyOrgId}
      UNION SELECT "presenterId" FROM "MeetingAgendaItem" mai JOIN "Meeting" mt ON mt."id" = mai."meetingId" WHERE mt."organizationId" = ${legacyOrgId}
      UNION SELECT "authorId" FROM "MeetingNote" mn JOIN "Meeting" mt ON mt."id" = mn."meetingId" WHERE mt."organizationId" = ${legacyOrgId}
    ) t WHERE uid IS NOT NULL`;
  return rows.map((r) => r.uid);
}

async function createManyBatched(
  client: TenantPrismaClient,
  model: string,
  rows: Record<string, unknown>[],
  batchSize: number,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await (client as any)[model].createMany({ data: batch });
    written += batch.length;
  }
  return written;
}

/**
 * Migrasi SATU org legacy ke tenant DB baru.
 * Mode dry-run (default) atau cutover (opts.cutover === true) — satu-satunya
 * perbedaan: sumber hash password PlatformUser (hash test vs hash ASLI
 * legacy). TIDAK menulis apa pun ke woork_saas. Mengembalikan hasil +
 * per-tabel. Throw bila ada langkah gagal — pemanggil WAJIB cleanup di
 * finally (cutover: cleanup hanya bila GAGAL; bila sukses tenant
 * DIPERTAHANKAN).
 */
export async function migrateOrgToTenant(
  legacyOrgId: string,
  opts: { log?: LogFn; cutover?: boolean } = {},
): Promise<MigrateOrgResult> {
  const log = opts.log ?? logDefault;
  const legacy = legacyPrisma as any;

  // Kolom Tenant.legacyOrganizationId hanya ada setelah migrasi master
  // 20261123135400 di-apply (Tahap 1: ditulis, BELUM di-apply). Dry-run
  // tetap jalan tanpanya: guard duplikat memakai slug saja, dan penulisan
  // pemetaan dilewati dengan peringatan. Cutover WAJIB apply dulu.
  const [colCheck] = await masterPrisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Tenant'
      AND column_name = 'legacyOrganizationId'`;
  const hasLegacyOrgColumn = Number(colCheck.c) === 1;
  if (!hasLegacyOrgColumn) {
    log('[migrasi] PERINGATAN: kolom Tenant.legacyOrganizationId belum ada di woork_master (migrasi belum di-apply) — pemetaan org dilewati di dry-run ini');
  }

  // --- 0. Org legacy + guard duplikat ------------------------------------
  const org = await legacy.organization.findUnique({ where: { id: legacyOrgId } });
  if (!org) throw new Error(`Organization legacy tidak ditemukan: ${legacyOrgId}`);
  const existing = hasLegacyOrgColumn
    ? await masterPrisma.tenant.findFirst({
        where: { OR: [{ legacyOrganizationId: legacyOrgId }, { companySlug: org.slug }] },
        select: { id: true, tenantCode: true, companySlug: true },
      })
    : await masterPrisma.tenant.findFirst({
        where: { companySlug: org.slug },
        select: { id: true, tenantCode: true, companySlug: true },
      });
  if (existing) {
    throw new Error(
      `Org sudah punya tenant di master: ${existing.tenantCode} (slug ${existing.companySlug}) — hapus dulu sebelum migrasi ulang.`,
    );
  }

  // --- 1. Gate keamanan ----------------------------------------------------
  const blocked = await checkMigrationGate(legacyOrgId);
  if (blocked.length > 0) {
    throw new Error(
      `GATE BERHENTI — ada pengiriman jatuh tempo ≤2 jam: ${blocked.join('; ')}. Jangan dry-run sekarang.`,
    );
  }
  log(`[migrasi] gate lolos untuk "${org.name}" (tidak ada pengiriman ≤2 jam)`);

  // --- 2. Admin org (OWNER pertama) + hash test ---------------------------
  const ownerMembership = await legacy.membership.findFirst({
    where: { organizationId: legacyOrgId, status: 'ACTIVE' },
    include: { role: { select: { name: true } }, user: true },
    orderBy: { joinedAt: 'asc' },
  });
  const adminUser =
    ownerMembership?.user ??
    (await legacy.user.findFirst({
      where: { memberships: { some: { organizationId: legacyOrgId } } },
      orderBy: { createdAt: 'asc' },
    }));
  if (!adminUser) throw new Error(`Org "${org.name}" tidak punya user sama sekali.`);
  // Sumber hash password — SATU-SATUNYA perbedaan cutover vs dry-run:
  // - dry-run: hash test (TEST_MIGRATION_PASSWORD) untuk SEMUA PlatformUser.
  // - cutover: hash ASLI legacy User.password PER USER (bcrypt, disimpan
  //   apa adanya — JANGAN di-hash ulang; verifyPassword di authorize
  //   membandingkan langsung dengan hash ini). Admin tanpa password legacy
  //   (Google-only) -> null, sama seperti di legacy.
  const useLegacyHash = opts.cutover === true;
  const testHash = useLegacyHash ? null : await hashPassword(TEST_MIGRATION_PASSWORD);
  const passwordHashFor = (u: { password?: string | null }): string | null =>
    useLegacyHash ? (u.password ?? null) : testHash;
  log(`[migrasi] admin: ${adminUser.email} (hash ${useLegacyHash ? 'ASLI legacy (CUTOVER)' : 'TEST, bukan hash legacy (dry-run)'})`);

  // --- 3. Tenant record + provisioning --------------------------------------
  // TIDAK memakai createTenantRecord: (a) ia menolak bila email admin
  // sudah ada di master — padahal migrasi HARUS pre-create PlatformUser
  // admin dengan id legacy SEBELUM provisioning, karena seed provisioning
  // (upsert by email) membuat PlatformUser dengan id ACAK bila belum ada;
  // id PlatformUser HARUS sama dengan id legacy (dipakai TenantMembership,
  // mirror User, dan token.sub). Jadi record dibuat di sini dengan bentuk
  // yang sama (agar retryProvisioning tetap bisa membaca inputJson-nya).
  let tenantCode = generateTenantCode();
  for (let i = 0; i < 3; i++) {
    const clash = await masterPrisma.tenant.findUnique({ where: { tenantCode } });
    if (!clash) break;
    tenantCode = generateTenantCode();
  }
  const tenant = await masterPrisma.tenant.create({
    data: {
      tenantCode,
      companyName: org.name,
      companySlug: org.slug,
      databaseName: tenantCode,
      databaseHost: 'localhost',
      databasePort: 5432,
      databaseStatus: 'PROVISIONING',
      tenantStatus: 'PENDING_PROVISIONING',
      ...(hasLegacyOrgColumn ? { legacyOrganizationId: legacyOrgId } : {}),
    },
  });
  const job = await masterPrisma.provisioningJob.create({
    data: {
      tenantId: tenant.id,
      status: 'PENDING',
      step: '',
      attempts: 0,
      inputJson: JSON.stringify({
        companyName: org.name,
        slug: org.slug,
        adminName: adminUser.name,
        adminEmail: adminUser.email,
        adminPasswordHash: passwordHashFor(adminUser) ?? undefined,
      }),
    },
  });
  await masterPrisma.platformAuditLog.create({
    data: {
      action: 'TENANT_PROVISION_STARTED',
      tenantId: tenant.id,
      metadata: JSON.stringify({ companyName: org.name, companySlug: org.slug, tenantCode, migrationFromLegacyOrgId: legacyOrgId }),
    },
  });
  // Pre-create PlatformUser admin dengan id legacy — seed provisioning
  // (upsert by email) akan memakai baris ini apa adanya (id legacy).
  await masterPrisma.platformUser.upsert({
    where: { id: adminUser.id },
    update: {},
    create: {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      passwordHash: passwordHashFor(adminUser),
      status: adminUser.status,
      isSuperAdmin: adminUser.isSuperAdmin,
    },
  });
  log(`[migrasi] tenant record dibuat: ${tenantCode} (${tenant.id})`);
  await runProvisioningSteps(tenant, job, {
    adminEmail: adminUser.email,
    adminName: adminUser.name,
    adminPasswordHash: passwordHashFor(adminUser) ?? undefined,
  });
  log(`[migrasi] provisioning DONE — tenant ACTIVE`);
  if (!hasLegacyOrgColumn) {
    log('[migrasi] PERINGATAN: pemetaan legacyOrganizationId TIDAK ditulis (kolom belum ada) — wajib diisi saat cutover setelah migrasi master di-apply');
  }
  const tenantId = tenant.id;
  const client = await getTenantClientForCode(tenantCode);

  // Semua langkah setelah provisioning dibungkus agar id tenant ikut
  // dilempar saat gagal — pemanggil (CLI) bisa cleanup di finally.
  try {
  // --- 4. Identitas: PlatformUser + TenantMembership + mirror --------------
  const memberships = await legacy.membership.findMany({
    where: { organizationId: legacyOrgId },
    include: { role: { select: { name: true } }, user: true },
    orderBy: { joinedAt: 'asc' },
  });
  const memberUsers = new Map<string, any>();
  for (const m of memberships) memberUsers.set(m.user.id, m.user);
  // User yang dirujuk data (bukan member) — mirror untuk tampilan nama.
  const referencedIds = await collectReferencedUserIds(legacyOrgId);
  const referencedUsers = referencedIds.length
    ? await legacy.user.findMany({ where: { id: { in: referencedIds } } })
    : [];
  const mirrorUsers = new Map<string, any>(memberUsers);
  for (const u of referencedUsers) if (!mirrorUsers.has(u.id)) mirrorUsers.set(u.id, u);
  log(`[migrasi] mirror User: ${mirrorUsers.size} (anggota ${memberUsers.size} + dirujuk ${referencedUsers.length})`);

  for (const u of mirrorUsers.values()) {
    await masterPrisma.platformUser.upsert({
      where: { id: u.id },
      update: { name: u.name, status: u.status, isSuperAdmin: u.isSuperAdmin },
      create: {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: passwordHashFor(u),
        status: u.status,
        isSuperAdmin: u.isSuperAdmin,
      },
    });
    await client.user.upsert({
      where: { id: u.id },
      update: {
        email: u.email, name: u.name, username: u.username ?? null,
        avatar: u.avatar ?? null, phone: u.phone ?? null, status: u.status,
        emailVerified: u.emailVerified ?? null, isSuperAdmin: u.isSuperAdmin,
      },
      create: {
        id: u.id, email: u.email, name: u.name, username: u.username ?? null,
        avatar: u.avatar ?? null, phone: u.phone ?? null, status: u.status,
        emailVerified: u.emailVerified ?? null, isSuperAdmin: u.isSuperAdmin,
      },
    });
  }
  let membersMigrated = 0;
  for (const m of memberships) {
    if (m.status !== 'ACTIVE') continue; // INACTIVE: tidak boleh login tenant
    await masterPrisma.tenantMembership.upsert({
      where: { userId_tenantId: { userId: m.userId, tenantId } },
      update: { roleReference: m.role.name, membershipStatus: 'ACTIVE' },
      create: { userId: m.userId, tenantId, roleReference: m.role.name, membershipStatus: 'ACTIVE' },
    });
    membersMigrated += 1;
  }
  // Mirror Organization: timpa baris seed dengan field legacy lengkap.
  await client.organization.update({
    where: { id: tenantId },
    data: {
      name: org.name, slug: org.slug, logo: org.logo ?? null,
      industry: org.industry ?? null, teamSize: org.teamSize ?? null,
      isActive: org.isActive, modules: org.modules, subdomain: org.subdomain ?? null,
      description: org.description ?? null, tagline: org.tagline ?? null,
      phone: org.phone ?? null, email: org.email ?? null, address: org.address ?? null,
      website: org.website ?? null, logoPath: org.logoPath ?? null,
      coverPath: org.coverPath ?? null, subdomainChangedAt: org.subdomainChangedAt ?? null,
      businessType: org.businessType ?? null, entityForm: org.entityForm ?? null,
      country: org.country ?? null, province: org.province ?? null,
      city: org.city ?? null, district: org.district ?? null,
      village: org.village ?? null, postalCode: org.postalCode ?? null,
      latitude: org.latitude ?? null, longitude: org.longitude ?? null,
      profileStatus: org.profileStatus ?? 'BELUM_LENGKAP',
      profileCompletedAt: org.profileCompletedAt ?? null,
    },
  });
  log(`[migrasi] identitas selesai: ${membersMigrated} membership ACTIVE di master`);

  // --- 5. Hapus baris seed (id baru) agar salinan legacy ber-id asli ------
  // Urutan penting: Membership seed mereferensi Role (roleId) — hapus
  // Membership dulu sebelum Role, kalau tidak FK Membership_roleId_fkey
  // menolak. RolePermission dihapus paling dulu (mereferensi Role+Permission).
  await (client as any).rolePermission.deleteMany({});
  await (client as any).membership.deleteMany({ where: { organizationId: tenantId } });
  await (client as any).role.deleteMany({ where: { organizationId: tenantId } });
  await (client as any).permission.deleteMany({});
  await (client as any).leadStage.deleteMany({ where: { organizationId: tenantId } });
  await (client as any).dealStage.deleteMany({ where: { organizationId: tenantId } });
  await (client as any).channel.deleteMany({ where: { organizationId: tenantId } });
  await (client as any).subscription.deleteMany({ where: { organizationId: tenantId } });

  // --- 6. Katalog Permission (tanpa organizationId — salin semua) ----------
  // Harus sebelum RolePermission (anak) disalin; id asli dipertahankan
  // agar RolePermission bisa disalin verbatim.
  const tables: TableCheck[] = [];
  {
    const rows = await legacy.permission.findMany({ orderBy: { key: 'asc' } });
    const written = await createManyBatched(client, 'permission', rows, 1000);
    // Lengkapi kunci ROLE_PERMISSIONS yang tidak ada di legacy DB
    // (mis. 'CRM', 'HR') agar katalog tetap lengkap untuk edit role.
    const { ROLE_PERMISSIONS } = await import('../permissions');
    const allKeys = [...new Set(Object.values(ROLE_PERMISSIONS).flat() as string[])];
    const have = new Set(rows.map((r: any) => r.key));
    const missing = allKeys.filter((k) => !have.has(k));
    for (const k of missing) {
      await (client as any).permission.upsert({ where: { key: k }, update: {}, create: { key: k } });
    }
    const tenantCount = await (client as any).permission.count();
    tables.push({ table: 'Permission', legacy: rows.length, tenant: tenantCount, pass: tenantCount >= rows.length && written === rows.length });
    log(`[migrasi] permission: ${rows.length} -> ${tenantCount} (+${missing.length} kunci katalog)`);
  }

  // --- 7. Salin tabel direct (urutan topologis) ----------------------------
  for (const model of COPY_ORDER_DIRECT) {
    const rows = await legacy[model].findMany({ where: { organizationId: legacyOrgId } });
    if (rows.length === 0) {
      tables.push({ table: model, legacy: 0, tenant: 0, pass: true });
      continue;
    }
    const mapped = rows.map((r: any) => ({ ...r, organizationId: tenantId }));
    const batch = model === 'auditLog' ? 5000 : 1000;
    await createManyBatched(client, model, mapped, batch);
    const tenantCount = await (client as any)[model].count({ where: { organizationId: tenantId } });
    tables.push({ table: model, legacy: rows.length, tenant: tenantCount, pass: tenantCount === rows.length });
    log(`[migrasi] ${model}: ${rows.length} -> ${tenantCount}`);
  }

  // --- 8. Salin tabel anak (tanpa organizationId) --------------------------
  for (const child of COPY_CHILDREN) {
    const rows = await legacy[child.model].findMany({ where: child.where(legacyOrgId) });
    if (rows.length === 0) {
      tables.push({ table: child.model, legacy: 0, tenant: 0, pass: true });
      continue;
    }
    await createManyBatched(client, child.model, rows, 1000);
    const tenantCount = await (client as any)[child.model].count({ where: child.where(tenantId) });
    tables.push({ table: child.model, legacy: rows.length, tenant: tenantCount, pass: tenantCount === rows.length });
    log(`[migrasi] ${child.model}: ${rows.length} -> ${tenantCount}`);
  }

  // --- 9. Langganan master: timpa FREE trial dengan nilai legacy ----------
  const legacySub = await legacy.subscription.findUnique({ where: { organizationId: legacyOrgId } });
  if (legacySub) {
    await masterPrisma.subscription.update({
      where: { tenantId },
      data: {
        plan: legacySub.plan, status: legacySub.status,
        trialEndsAt: legacySub.trialEndsAt ?? null,
        billingCycle: legacySub.billingCycle, userQuota: legacySub.userQuota,
      },
    });
    log(`[migrasi] langganan master: ${legacySub.plan}/${legacySub.status}/kuota ${legacySub.userQuota}`);
  }

  // --- 10. Verifikasi checksum ----------------------------------------------
  const invoiceLegacy = await legacy.invoice.aggregate({
    where: { organizationId: legacyOrgId }, _sum: { total: true },
  });
  const invoiceTenant = await (client as any).invoice.aggregate({
    where: { organizationId: tenantId }, _sum: { total: true },
  });
  const invoiceTotalLegacy = invoiceLegacy._sum.total ?? null;
  const invoiceTotalTenant = invoiceTenant._sum.total ?? null;

  const allPass = tables.every((t) => t.pass) && invoiceTotalLegacy === invoiceTotalTenant;
  return {
    tenantId, tenantCode, companyName: org.name, legacyOrgId,
    adminEmail: adminUser.email, membersMigrated, tables,
    invoiceTotalLegacy, invoiceTotalTenant,
    referencedUsersMirrored: mirrorUsers.size, allPass,
  };
  } catch (e: unknown) {
    (e as any).tenantId = tenantId;
    (e as any).tenantCode = tenantCode;
    throw e;
  }
}

/**
 * Cleanup TOTAL tenant hasil migrasi (dry-run): baris master + DROP
 * DATABASE + DROP ROLE + file backup. Pola yang sama dengan
 * scripts/phase8-isolation-test.ts (termasuk chmod 0644 agar user
 * postgres bisa membaca file SQL sementara).
 */
export async function cleanupMigratedTenant(tenantId: string, tenantCode: string): Promise<string[]> {
  const leftovers: string[] = [];
  // Catat dulu id User mirror di tenant DB SEBELUM disconnect — dipakai
  // untuk menghapus PlatformUser yang dibuat migrasi (anggota + user
  // yang dirujuk data). User yang masih jadi member tenant lain dipertahankan.
  let mirrorUserIds: string[] = [];
  try {
    const tc = await getTenantClientForCode(tenantCode);
    mirrorUserIds = (await (tc as any).user.findMany({ select: { id: true } })).map((u: any) => u.id);
  } catch { /* tenant DB sudah tidak ada — lanjut ke baris master */ }
  await disconnectTenantClient(tenantCode).catch(() => undefined);
  try {
    await masterPrisma.platformAuditLog.deleteMany({ where: { tenantId } });
  } catch { /* abaikan */ }
  await masterPrisma.provisioningJob.deleteMany({ where: { tenantId } });
  await masterPrisma.tenantMembership.deleteMany({ where: { tenantId } });
  await masterPrisma.subscription.deleteMany({ where: { tenantId } });
  await masterPrisma.tenantDatabaseRegistry.deleteMany({ where: { tenantId } });
  // PlatformUser yang dibuat migrasi: hapus yang TIDAK dipakai tenant lain.
  await masterPrisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  for (const userId of mirrorUserIds) {
    const stillUsed = await masterPrisma.tenantMembership.count({ where: { userId } });
    if (stillUsed === 0) {
      await masterPrisma.platformUser.delete({ where: { id: userId } }).catch(() => undefined);
    }
  }
  const dir = path.join(process.cwd(), '..', 'woorkxmyperform-docs', 'db-restore', 'tenant-backups');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(tenantCode)) fs.unlinkSync(path.join(dir, f));
    }
  } catch { /* direktori tidak ada */ }
  const sqlFile = path.join(os.tmpdir(), `phase6-drop-${tenantCode}.sql`);
  const sql = [
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${tenantCode}';`,
    `DROP DATABASE IF EXISTS "${tenantCode}";`,
    `DROP ROLE IF EXISTS "${tenantCode}";`,
  ].join('\n');
  fs.writeFileSync(sqlFile, sql);
  fs.chmodSync(sqlFile, 0o644);
  try {
    await execFileAsync('su', ['postgres', '-c', `psql -v ON_ERROR_STOP=1 -q -f ${sqlFile}`]);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    leftovers.push(`DB/role ${tenantCode} (su postgres gagal: ${String(err.stderr ?? err.stdout ?? err.message ?? e).trim().slice(0, 400)})`);
  } finally {
    try { fs.unlinkSync(sqlFile); } catch { /* abaikan */ }
  }
  return leftovers;
}
