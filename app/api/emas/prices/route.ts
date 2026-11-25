import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  ALL_GOLD_SOURCES,
  fetchAllLiveMarketPrices,
  getTodayWibDateString,
  parsePrimaryPriceFromItems,
} from '@/lib/islami/logamMuliaApi';

export const dynamic = 'force-dynamic';

/** Bentuk satu baris riwayat — sama dengan backup GET /api/pg/gold/history. */
function mapHistoryRow(r: any) {
  const date =
    r.priceDate instanceof Date
      ? r.priceDate.toISOString().slice(0, 10)
      : String(r.priceDate).slice(0, 10);
  return {
    date,
    hargaTaksir24K: r.hargaTaksir24K ? Number(r.hargaTaksir24K) : 0,
    prices: (r.prices || {}) as Record<string, number>,
    buybackPrices: (r.buybackPrices || {}) as Record<string, number>,
  };
}

/** GET /api/emas/prices — riwayat harga emas organisasi (terbaru dulu) + baris terbaru. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'READ');
    const rows = await prisma.goldPriceHistory.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { priceDate: 'desc' },
    });
    const history = rows.map(mapHistoryRow);
    return apiOk({ history, latest: history[0] || null });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat riwayat harga emas.', 500);
  }
}

/** POST /api/emas/prices — 3 mode (lihat body):
 *  { sync: true } → tarik harga live semua sumber, simpan sebagai riwayat hari ini (WIB).
 *  { date, hargaTaksir24K?, prices?, buybackPrices? } → entri/upsert manual satu tanggal.
 *  { action: 'remove-type', name } → hapus satu jenis emas dari seluruh riwayat.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const b = await req.json().catch(() => ({}));

    if (b.action === 'remove-type') {
      const name = String(b.name || '').trim();
      if (!name) return apiErr('Nama jenis emas wajib diisi.', 400);
      const rows = await prisma.goldPriceHistory.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, prices: true, buybackPrices: true },
      });
      for (const r of rows) {
        const prices = { ...(r.prices as Record<string, number>) };
        const buybackPrices = { ...(r.buybackPrices as Record<string, number>) };
        if (!(name in prices) && !(name in buybackPrices)) continue;
        delete prices[name];
        delete buybackPrices[name];
        await prisma.goldPriceHistory.update({
          where: { id: r.id },
          data: { prices, buybackPrices },
        });
      }
      return apiOk({ success: true });
    }

    if (b.sync === true) {
      const today = getTodayWibDateString();
      const live = await fetchAllLiveMarketPrices();
      const prices: Record<string, number> = {};
      const buybackPrices: Record<string, number> = {};
      let hargaTaksir24K = 0;
      for (const s of ALL_GOLD_SOURCES) {
        const parsed = parsePrimaryPriceFromItems(live[s.id] || [], s.id);
        if (parsed.sellPrice && parsed.sellPrice > 0) {
          prices[s.name] = parsed.sellPrice;
          if (s.id === 'logammulia' || hargaTaksir24K === 0) hargaTaksir24K = parsed.sellPrice;
        }
        if (parsed.buybackPrice && parsed.buybackPrice > 0) {
          buybackPrices[s.name] = parsed.buybackPrice;
        }
      }
      if (Object.keys(prices).length === 0) {
        return apiErr('Gagal menarik harga live dari semua sumber. Coba lagi nanti.', 502);
      }
      // Pertahankan taksir manual hari ini bila sudah ada (perilaku backup):
      // sync hanya memperbarui harga pasar, bukan menimpa taksir yang diisi manual.
      const existingToday = await prisma.goldPriceHistory.findUnique({
        where: {
          organizationId_priceDate: {
            organizationId: ctx.organizationId,
            priceDate: new Date(`${today}T00:00:00.000Z`),
          },
        },
        select: { hargaTaksir24K: true, source: true },
      });
      if (
        existingToday?.source === 'manual' &&
        existingToday.hargaTaksir24K != null &&
        Number(existingToday.hargaTaksir24K) > 0
      ) {
        hargaTaksir24K = Number(existingToday.hargaTaksir24K);
      }
      const saved = await prisma.goldPriceHistory.upsert({
        where: {
          organizationId_priceDate: {
            organizationId: ctx.organizationId,
            priceDate: new Date(`${today}T00:00:00.000Z`),
          },
        },
        create: {
          organizationId: ctx.organizationId,
          priceDate: new Date(`${today}T00:00:00.000Z`),
          prices,
          buybackPrices,
          hargaTaksir24K,
          source: 'logam-mulia-api',
        },
        update: { prices, buybackPrices, hargaTaksir24K, source: 'logam-mulia-api' },
      });
      return apiOk(mapHistoryRow(saved));
    }

    const date = String(b.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('Tanggal wajib diisi (YYYY-MM-DD).', 400);
    }
    const saved = await prisma.goldPriceHistory.upsert({
      where: {
        organizationId_priceDate: {
          organizationId: ctx.organizationId,
          priceDate: new Date(`${date}T00:00:00.000Z`),
        },
      },
      create: {
        organizationId: ctx.organizationId,
        priceDate: new Date(`${date}T00:00:00.000Z`),
        prices: b.prices || {},
        buybackPrices: b.buybackPrices || {},
        hargaTaksir24K: b.hargaTaksir24K != null ? Number(b.hargaTaksir24K) : null,
        source: 'manual',
      },
      update: {
        prices: b.prices || {},
        buybackPrices: b.buybackPrices || {},
        hargaTaksir24K: b.hargaTaksir24K != null ? Number(b.hargaTaksir24K) : null,
        source: 'manual',
      },
    });
    return apiOk(mapHistoryRow(saved));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan harga emas.', 500);
  }
}

/** DELETE /api/emas/prices?date=YYYY-MM-DD — hapus satu tanggal riwayat. */
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const { searchParams } = new URL(req.url);
    const date = String(searchParams.get('date') || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('Tanggal wajib diisi (YYYY-MM-DD).', 400);
    }
    await prisma.goldPriceHistory.deleteMany({
      where: {
        organizationId: ctx.organizationId,
        priceDate: new Date(`${date}T00:00:00.000Z`),
      },
    });
    return apiOk({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus riwayat harga emas.', 500);
  }
}
