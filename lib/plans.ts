// Definisi paket langganan WOORK — dipakai landing page & halaman billing.
// Harga/limit di sini adalah acuan manual (tanpa payment gateway).

export interface PlanDef {
  key: string;
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  popular?: boolean;
  limits: {
    workspaces: number; // -1 = tanpa batas
    conversationsPerMonth: number; // -1 = tanpa batas
    channels: number; // -1 = tanpa batas
    broadcastPerMonth: number; // -1 = tanpa batas
  };
}

export const PLANS: Record<string, PlanDef> = {
  FREE: {
    key: 'FREE',
    name: 'Free',
    price: 'Rp0',
    period: 'selamanya',
    desc: 'Untuk mencoba WOORK dengan tim kecil.',
    features: [
      '1 workspace',
      '100 percakapan / bulan',
      '1 channel WhatsApp',
      'CRM dasar',
      'Dukungan komunitas',
    ],
    limits: { workspaces: 1, conversationsPerMonth: 100, channels: 1, broadcastPerMonth: 0 },
  },
  STARTER: {
    key: 'STARTER',
    name: 'Starter',
    price: 'Rp149rb',
    period: '/ bulan',
    desc: 'Untuk bisnis yang mulai bertumbuh.',
    features: [
      '1 workspace',
      '2.000 percakapan / bulan',
      '3 channel (WA, IG, FB)',
      'Pipeline lead & follow up',
      'Broadcast 5.000 pesan / bulan',
      'Dukungan email',
    ],
    limits: { workspaces: 1, conversationsPerMonth: 2000, channels: 3, broadcastPerMonth: 5000 },
  },
  PROFESSIONAL: {
    key: 'PROFESSIONAL',
    name: 'Professional',
    price: 'Rp399rb',
    period: '/ bulan',
    desc: 'Untuk tim operasional yang serius.',
    popular: true,
    features: [
      '3 workspace',
      'Percakapan tanpa batas',
      'Semua channel + Website Chat',
      'Automasi Woo & bot builder',
      'Broadcast 25.000 pesan / bulan',
      'Laporan & audit lengkap',
      'Dukungan prioritas',
    ],
    limits: { workspaces: 3, conversationsPerMonth: -1, channels: -1, broadcastPerMonth: 25000 },
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    price: 'Hubungi kami',
    period: '',
    desc: 'Untuk perusahaan dengan kebutuhan khusus.',
    features: [
      'Workspace tanpa batas',
      'SSO & keamanan lanjutan',
      'Integrasi API & webhook khusus',
      'Manajer akun dedikasi',
      'SLA 99,9%',
    ],
    limits: { workspaces: -1, conversationsPerMonth: -1, channels: -1, broadcastPerMonth: -1 },
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

export function getPlan(key: string | null | undefined): PlanDef {
  return PLANS[key ?? ''] ?? PLANS.FREE;
}
