// Seed Sistem Modular untuk data lama (2026-11-07).
// - ModulePrice default untuk 3 modul berbayar.
// - Untuk tiap kantor yang ada: Subscription AKTIF (MONTHLY, kuota =
//   member aktif + 50, mulai hari ini s.d. +1 tahun) + SubscriptionModule
//   dari Organization.modules yang ada ([] = semua aktif).
// TIDAK menyentuh baris lain (User, Membership, AuditLog, dsb).
// Idempotent: aman dijalankan ulang.

import { prisma } from '../lib/db';
import { DEFAULT_MODULE_PRICES } from '../lib/modular';

async function main() {
  // 1. Harga default
  for (const [moduleKey, d] of Object.entries(DEFAULT_MODULE_PRICES)) {
    await prisma.modulePrice.upsert({
      where: { moduleKey },
      update: {},
      create: {
        moduleKey,
        monthlyPerUser: d.monthlyPerUser,
        yearlyPerUser: d.yearlyPerUser,
        currency: 'IDR',
        isActive: true,
      },
    });
    console.log(`ModulePrice ${moduleKey}: Rp${d.monthlyPerUser}/user/bulan, Rp${d.yearlyPerUser}/user/tahun`);
  }

  // 2. Langganan tiap kantor
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, modules: true },
    orderBy: { name: 'asc' },
  });
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);

  for (const org of orgs) {
    const memberCount = await prisma.membership.count({
      where: { organizationId: org.id, status: 'ACTIVE' },
    });
    const quota = memberCount + 50;
    // Organization.modules [] = semua aktif (grandfathering)
    let legacyModules: string[] = [];
    try {
      legacyModules = JSON.parse(org.modules || '[]');
    } catch {
      legacyModules = [];
    }
    const LEGACY_TO_MODULAR: Record<string, string> = {
      inbox: 'chat', crm: 'chat', broadcast: 'chat', bot: 'chat', channels: 'chat',
      hr: 'hris', kantor: 'hris', esign: 'hris',
    };
    const billable =
      legacyModules.length === 0
        ? ['chat', 'hris', 'audit']
        : [...new Set(legacyModules.map((k) => LEGACY_TO_MODULAR[k]).filter(Boolean))];

    const sub = await prisma.subscription.upsert({
      where: { organizationId: org.id },
      update: {
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        userQuota: quota,
        startDate: now,
        endDate: end,
      },
      create: {
        organizationId: org.id,
        plan: 'FREE',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        userQuota: quota,
        startDate: now,
        endDate: end,
      },
    });

    for (const moduleKey of billable) {
      const price = DEFAULT_MODULE_PRICES[moduleKey];
      await prisma.subscriptionModule.upsert({
        where: { subscriptionId_moduleKey: { subscriptionId: sub.id, moduleKey } },
        update: { status: 'ACTIVE', pricePerUserSnapshot: price.monthlyPerUser },
        create: {
          subscriptionId: sub.id,
          moduleKey,
          pricePerUserSnapshot: price.monthlyPerUser,
          status: 'ACTIVE',
        },
      });
    }
    console.log(
      `${org.name}: Subscription ACTIVE, kuota ${quota} (member ${memberCount} + 50), modul: ${billable.join(', ')}, ${now.toISOString().slice(0, 10)} s.d. ${end.toISOString().slice(0, 10)}`
    );
  }
  console.log('Seed modular selesai.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
