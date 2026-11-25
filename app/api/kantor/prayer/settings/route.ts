// GET/PUT /api/kantor/prayer/settings — pengaturan Musala & jadwal
// salat kantor ini (PrayerTimeSettings).
//
// Guard: hanya OWNER / ADMIN kantor atau Super Admin (pola yang sama
// dengan Kelola Agent — canManageAgents). Lokasi default Jakarta
// (-6.2088, 106.8456), sama seperti modul Islami; admin WAJIB
// mengonfirmasi lokasi perusahaan (org WOORK.ID belum punya lat/lng).
//
// Validasi PUT: lat -90..90, lng -180..180, durasi sesi 1..30 mnt,
// koreksi waktu -30..30 mnt, timezone dari daftar yang didukung,
// calculationMethod 'kemenag' | 'astronomical', asrMethod 'shafii' |
// 'hanafi'. excludedAgentIds difilter ke agent yang ada di org ini;
// defaultImamAgentId harus agent aktif di org ini bila diisi.
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { canManageAgents } from '@/lib/agents/manage';
import { getPrayerSettings } from '@/lib/kantor/prayer';

export const dynamic = 'force-dynamic';

const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'WIB', 'WITA', 'WIT'];

function serialize(s: Awaited<ReturnType<typeof getPrayerSettings>>) {
  return {
    id: s.id,
    organizationId: s.organizationId,
    isEnabled: s.isEnabled,
    latitude: s.latitude,
    longitude: s.longitude,
    cityName: s.cityName,
    timezone: s.timezone,
    calculationMethod: s.calculationMethod,
    asrMethod: s.asrMethod,
    adjustmentMinutes: s.adjustmentMinutes,
    sessionDurationMinutes: s.sessionDurationMinutes,
    enableAnimation: s.enableAnimation,
    autoReturn: s.autoReturn,
    excludedAgentIds: s.excludedAgentIds,
    defaultImamAgentId: s.defaultImamAgentId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh melihat pengaturan salat.', 403);
    }
    const settings = await getPrayerSettings(ctx.organizationId);
    return apiOk({ settings: serialize(settings) });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan salat.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengubah pengaturan salat.', 403);
    }

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiErr('Body JSON tidak valid.', 400);
    const b = body as Record<string, unknown>;
    const errors: string[] = [];
    const data: Record<string, unknown> = {};

    if (b.isEnabled !== undefined) {
      if (typeof b.isEnabled !== 'boolean') errors.push('isEnabled harus boolean.');
      else data.isEnabled = b.isEnabled;
    }
    if (b.latitude !== undefined) {
      const v = Number(b.latitude);
      if (!Number.isFinite(v) || v < -90 || v > 90) errors.push('latitude harus angka -90..90.');
      else data.latitude = v;
    }
    if (b.longitude !== undefined) {
      const v = Number(b.longitude);
      if (!Number.isFinite(v) || v < -180 || v > 180) errors.push('longitude harus angka -180..180.');
      else data.longitude = v;
    }
    if (b.cityName !== undefined) {
      if (b.cityName !== null && (typeof b.cityName !== 'string' || b.cityName.length > 100)) {
        errors.push('cityName harus string (maks 100 karakter) atau null.');
      } else data.cityName = b.cityName;
    }
    if (b.timezone !== undefined) {
      if (typeof b.timezone !== 'string' || !TIMEZONES.includes(b.timezone)) {
        errors.push(`timezone harus salah satu dari: ${TIMEZONES.join(', ')}.`);
      } else data.timezone = b.timezone;
    }
    if (b.calculationMethod !== undefined) {
      if (b.calculationMethod !== 'kemenag' && b.calculationMethod !== 'astronomical') {
        errors.push("calculationMethod harus 'kemenag' atau 'astronomical'.");
      } else data.calculationMethod = b.calculationMethod;
    }
    if (b.asrMethod !== undefined) {
      if (b.asrMethod !== 'shafii' && b.asrMethod !== 'hanafi') {
        errors.push("asrMethod harus 'shafii' atau 'hanafi'.");
      } else data.asrMethod = b.asrMethod;
    }
    if (b.adjustmentMinutes !== undefined) {
      const v = Number(b.adjustmentMinutes);
      if (!Number.isInteger(v) || v < -30 || v > 30) errors.push('adjustmentMinutes harus bilangan bulat -30..30.');
      else data.adjustmentMinutes = v;
    }
    if (b.sessionDurationMinutes !== undefined) {
      const v = Number(b.sessionDurationMinutes);
      if (!Number.isInteger(v) || v < 1 || v > 30) errors.push('sessionDurationMinutes harus bilangan bulat 1..30.');
      else data.sessionDurationMinutes = v;
    }
    if (b.enableAnimation !== undefined) {
      if (typeof b.enableAnimation !== 'boolean') errors.push('enableAnimation harus boolean.');
      else data.enableAnimation = b.enableAnimation;
    }
    if (b.autoReturn !== undefined) {
      if (typeof b.autoReturn !== 'boolean') errors.push('autoReturn harus boolean.');
      else data.autoReturn = b.autoReturn;
    }

    // excludedAgentIds: array string, difilter ke agent yang ada di org ini.
    if (b.excludedAgentIds !== undefined) {
      if (!Array.isArray(b.excludedAgentIds) || !b.excludedAgentIds.every((x) => typeof x === 'string')) {
        errors.push('excludedAgentIds harus array string.');
      } else {
        const existing = await prisma.agent.findMany({
          where: { organizationId: ctx.organizationId, id: { in: b.excludedAgentIds } },
          select: { id: true },
        });
        data.excludedAgentIds = existing.map((a) => a.id);
      }
    }

    // defaultImamAgentId: harus agent aktif di org ini bila diisi.
    if (b.defaultImamAgentId !== undefined) {
      if (b.defaultImamAgentId === null) {
        data.defaultImamAgentId = null;
      } else if (typeof b.defaultImamAgentId !== 'string') {
        errors.push('defaultImamAgentId harus string atau null.');
      } else {
        const imam = await prisma.agent.findFirst({
          where: { organizationId: ctx.organizationId, id: b.defaultImamAgentId, isEnabled: true },
          select: { id: true },
        });
        if (!imam) errors.push('defaultImamAgentId bukan agent aktif di kantor ini.');
        else data.defaultImamAgentId = b.defaultImamAgentId;
      }
    }

    if (errors.length > 0) return apiErr('Pengaturan tidak valid.', 422, errors);
    if (Object.keys(data).length === 0) return apiErr('Tidak ada field yang diubah.', 400);

    // Lokasi berubah -> jadwal cache lama tidak berlaku (koordinat ikut
    // tersimpan per hari); hapus cache HARI INI ke depan supaya jadwal
    // dihitung ulang dari lokasi baru. Cache tanggal lampau dibiarkan
    // sebagai jejak.
    const locationChanged = data.latitude !== undefined || data.longitude !== undefined;
    if (locationChanged) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.dailyPrayerSchedule.deleteMany({
        where: { organizationId: ctx.organizationId, prayerDate: { gte: today } },
      });
    }

    const settings = await (async () => {
      // Baris settings selalu ada (getPrayerSettings membuat default bila
      // belum ada) — jadi PUT cukup update, tanpa upsert.
      await getPrayerSettings(ctx.organizationId);
      return prisma.prayerTimeSettings.update({
        where: { organizationId: ctx.organizationId },
        data: data as Prisma.PrayerTimeSettingsUpdateInput,
      });
    })();

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PRAYER_SETTINGS_UPDATE',
      module: 'KANTOR',
      description: `Pengaturan salat diubah (${Object.keys(data).join(', ')}).`,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return apiOk({ settings: serialize(settings) });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan salat.', 500);
  }
}
