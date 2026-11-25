// Seed katalog paket & harga (Bab 9.1) — Fase 1 Alur Pendaftaran Tenant Baru.
// Idempotent: upsert per nama/moduleKey; aman dijalankan ulang.
// Harga = DATA awal yang dikonfirmasi user 2 Nov 2026 ("untuk saat ini OK");
// Master bisa mengubahnya lewat UI Paket & Harga.
import { masterPrisma } from '../lib/tenant/master';

const USER_TIERS = [
  { name: 'Sampai 10 pengguna', maxUsers: 10, monthlyPrice: 250000, yearlyPrice: 2500000, isCustomPrice: false, minStorageGb: 100, sortOrder: 1 },
  { name: 'Sampai 25 pengguna', maxUsers: 25, monthlyPrice: 450000, yearlyPrice: 4500000, isCustomPrice: false, minStorageGb: 100, sortOrder: 2 },
  { name: 'Sampai 50 pengguna', maxUsers: 50, monthlyPrice: 750000, yearlyPrice: 7500000, isCustomPrice: false, minStorageGb: 250, sortOrder: 3 },
  { name: 'Sampai 100 pengguna', maxUsers: 100, monthlyPrice: 1250000, yearlyPrice: 12500000, isCustomPrice: false, minStorageGb: 250, sortOrder: 4 },
  { name: 'Sampai 200 pengguna', maxUsers: 200, monthlyPrice: 2000000, yearlyPrice: 20000000, isCustomPrice: false, minStorageGb: 500, sortOrder: 5 },
  { name: 'Sampai 500 pengguna', maxUsers: 500, monthlyPrice: 4000000, yearlyPrice: 40000000, isCustomPrice: false, minStorageGb: 1000, sortOrder: 6 },
  { name: 'Di atas 500 pengguna', maxUsers: null, monthlyPrice: null, yearlyPrice: null, isCustomPrice: true, minStorageGb: 1000, sortOrder: 7 },
];

const STORAGE_TIERS = [
  { name: '100 GB', capacityGb: 100, monthlyPrice: 100000, yearlyPrice: 1000000, isCustomPrice: false, sortOrder: 1 },
  { name: '250 GB', capacityGb: 250, monthlyPrice: 200000, yearlyPrice: 2000000, isCustomPrice: false, sortOrder: 2 },
  { name: '500 GB', capacityGb: 500, monthlyPrice: 350000, yearlyPrice: 3500000, isCustomPrice: false, sortOrder: 3 },
  { name: '1 TB', capacityGb: 1000, monthlyPrice: 600000, yearlyPrice: 6000000, isCustomPrice: false, sortOrder: 4 },
  { name: '2 TB', capacityGb: 2000, monthlyPrice: 1000000, yearlyPrice: 10000000, isCustomPrice: false, sortOrder: 5 },
  { name: 'Di atas 2 TB', capacityGb: null, monthlyPrice: null, yearlyPrice: null, isCustomPrice: true, sortOrder: 6 },
];

const MODULE_PRICES = [
  { moduleKey: 'tal', name: 'TAL', monthlyPrice: 300000, yearlyPrice: 3000000, sortOrder: 1 },
  { moduleKey: 'koperasi', name: 'Koperasi Keanggotaan', monthlyPrice: 250000, yearlyPrice: 2500000, sortOrder: 2 },
  { moduleKey: 'emas', name: 'Simulasi Emas', monthlyPrice: 250000, yearlyPrice: 2500000, sortOrder: 3 },
  { moduleKey: 'islami', name: 'Ekosistem Islami', monthlyPrice: 100000, yearlyPrice: 1000000, sortOrder: 4 },
  // AI Workspace -> kunci modul `kantor` (PROVISIONAL, lihat FASE1_DESIGN §6).
  { moduleKey: 'kantor', name: 'AI Workspace', monthlyPrice: 150000, yearlyPrice: 1500000, sortOrder: 5 },
];

async function main() {
  for (const t of USER_TIERS) {
    await masterPrisma.packageUserTier.upsert({
      where: { name: t.name },
      update: { maxUsers: t.maxUsers, monthlyPrice: t.monthlyPrice, yearlyPrice: t.yearlyPrice, isCustomPrice: t.isCustomPrice, minStorageGb: t.minStorageGb, sortOrder: t.sortOrder },
      create: { ...t, status: 'ACTIVE' },
    });
  }
  for (const t of STORAGE_TIERS) {
    await masterPrisma.packageStorageTier.upsert({
      where: { name: t.name },
      update: { capacityGb: t.capacityGb, monthlyPrice: t.monthlyPrice, yearlyPrice: t.yearlyPrice, isCustomPrice: t.isCustomPrice, sortOrder: t.sortOrder },
      create: { ...t, status: 'ACTIVE' },
    });
  }
  for (const m of MODULE_PRICES) {
    await masterPrisma.packageModulePrice.upsert({
      where: { moduleKey: m.moduleKey },
      update: { name: m.name, monthlyPrice: m.monthlyPrice, yearlyPrice: m.yearlyPrice, sortOrder: m.sortOrder },
      create: { ...m, status: 'ACTIVE' },
    });
  }
  const settings = await masterPrisma.billingSettings.findFirst();
  if (!settings) {
    await masterPrisma.billingSettings.create({ data: { ppnRateBps: 1100, invoiceValidityHours: 24 } });
  }
  const counts = {
    userTiers: await masterPrisma.packageUserTier.count(),
    storageTiers: await masterPrisma.packageStorageTier.count(),
    modules: await masterPrisma.packageModulePrice.count(),
    settings: await masterPrisma.billingSettings.count(),
  };
  console.log('SEED_PRICING_OK', JSON.stringify(counts));
}

main().catch((e) => {
  console.error('SEED_PRICING_FAIL', e);
  process.exit(1);
});
