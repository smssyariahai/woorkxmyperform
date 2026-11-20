// Tarif default Kalkulator Emas — porting dari backup
// src/lib/defaultSettings.ts (MyPerform). Dipakai sebagai fallback bila
// organisasi belum menyimpan tarif sendiri di GoldSetting (key 'tarif_biaya').
// Isi TIDAK diubah: tier biaya admin & jasa titip (ujrah) per jenis rahn.

export interface BiayaAdminTier {
  id: string;
  min: number;
  max: number | null;
  fee: number;
  isPercentage: boolean;
}

export interface JasaTitipTier {
  id: string;
  min: number;
  max: number | null;
  standar: number;
  promo: number;
}

export interface SettingsData {
  biayaAdmin: BiayaAdminTier[];
  biayaAdminElektronik?: BiayaAdminTier[];
  jasaTitip: {
    rahnRegular: JasaTitipTier[];
    rahnCicil: JasaTitipTier[];
    pke: JasaTitipTier[];
    elektronik?: JasaTitipTier[];
  };
}

export const defaultSettingsData: SettingsData = {
  biayaAdmin: [
    { id: '1', min: 0, max: 1000000, fee: 10000, isPercentage: false },
    { id: '2', min: 1000001, max: 2500000, fee: 25000, isPercentage: false },
    { id: '3', min: 2500001, max: 5000000, fee: 40000, isPercentage: false },
    { id: '4', min: 5000001, max: 10000000, fee: 60000, isPercentage: false },
    { id: '5', min: 10000001, max: 15000000, fee: 100000, isPercentage: false },
    { id: '6', min: 15000001, max: 20000000, fee: 150000, isPercentage: false },
    { id: '7', min: 20000001, max: 25000000, fee: 200000, isPercentage: false },
    { id: '8', min: 25000001, max: 50000000, fee: 250000, isPercentage: false },
    { id: '9', min: 50000001, max: 75000000, fee: 300000, isPercentage: false },
    { id: '10', min: 75000001, max: 100000000, fee: 375000, isPercentage: false },
    { id: '11', min: 100000001, max: 200000000, fee: 500000, isPercentage: false },
    { id: '12', min: 200000001, max: 300000000, fee: 900000, isPercentage: false },
    { id: '13', min: 300000001, max: 400000000, fee: 1200000, isPercentage: false },
    { id: '14', min: 400000001, max: 500000000, fee: 1400000, isPercentage: false },
    { id: '15', min: 50000001, max: null, fee: 0.3, isPercentage: true },
  ],
  biayaAdminElektronik: [
    { id: 'e1', min: 0, max: 1000000, fee: 10000, isPercentage: false },
    { id: 'e2', min: 1000001, max: 2000000, fee: 25000, isPercentage: false },
    { id: 'e3', min: 2000001, max: 3000000, fee: 45000, isPercentage: false },
    { id: 'e4', min: 3000001, max: 4000000, fee: 65000, isPercentage: false },
    { id: 'e5', min: 4000001, max: 5000000, fee: 100000, isPercentage: false },
    { id: 'e6', min: 5000001, max: 10000000, fee: 200000, isPercentage: false },
    { id: 'e7', min: 10000001, max: 20000000, fee: 400000, isPercentage: false },
    { id: 'e8', min: 20000001, max: null, fee: 500000, isPercentage: false },
  ],
  jasaTitip: {
    rahnRegular: [
      { id: '1', min: 0, max: 25000000, standar: 22.95, promo: 15 },
      { id: '2', min: 25000001, max: 50000000, standar: 20, promo: 14 },
      { id: '3', min: 50000001, max: 100000000, standar: 14, promo: 13 },
      { id: '4', min: 100000001, max: null, standar: 13, promo: 11.5 },
    ],
    rahnCicil: [
      { id: '1', min: 0, max: 25000000, standar: 12, promo: 8.5 },
      { id: '2', min: 25000001, max: 100000000, standar: 11, promo: 8 },
      { id: '3', min: 100000001, max: null, standar: 9.5, promo: 7 },
    ],
    pke: [
      { id: '1', min: 0, max: 25000000, standar: 12, promo: 0 },
      { id: '2', min: 25000001, max: 50000000, standar: 11, promo: 0 },
      { id: '3', min: 50000001, max: 100000000, standar: 8.5, promo: 0 },
      { id: '4', min: 100000001, max: null, standar: 8, promo: 0 },
    ],
    elektronik: [
      { id: '1', min: 0, max: 25000000, standar: 96, promo: 0 },
    ],
  },
};
