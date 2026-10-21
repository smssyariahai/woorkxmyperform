import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { setSystemSettings, invalidateSettingsCache } from '@/lib/system-settings';
import { getNineRouterConfig, getNineRouterPublicConfig, DEFAULT_NINEROUTER } from '@/lib/bot/ninerouter';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** GET /api/super/ninerouter — konfigurasi 9Router (apiKey di-masking) */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    return apiOk(await getNineRouterPublicConfig());
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat konfigurasi.', 500);
  }
}

const schema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().max(200).optional(),
  apiKey: z.string().max(500).optional(), // kosong = tidak diubah
  model: z.string().max(100).optional(),
  systemPrompt: z.string().max(4000).optional(),
  maxTokens: z.number().int().min(50).max(8000).optional(),
  timeoutMs: z.number().int().min(5000).max(120000).optional(),
  fallbackMessage: z.string().max(1000).optional(),
  pricePerReply: z.number().int().min(0).max(100000).optional(),
});

/** PUT /api/super/ninerouter — simpan konfigurasi (hanya Administrator Pusat) */
export async function PUT(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Data tidak valid.', 422);
    const d = p.data;

    if (d.baseUrl !== undefined && d.baseUrl.trim()) {
      try {
        const u = new URL(d.baseUrl.trim());
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        return apiErr('Base URL tidak valid (harus http(s)://...).', 422);
      }
    }

    const values: Record<string, string> = {};
    if (d.enabled !== undefined) values['ninerouter.enabled'] = d.enabled ? '1' : '0';
    if (d.baseUrl !== undefined) values['ninerouter.baseUrl'] = d.baseUrl.trim() || DEFAULT_NINEROUTER.baseUrl;
    if (d.apiKey !== undefined && d.apiKey !== '') values['ninerouter.apiKey'] = d.apiKey;
    if (d.model !== undefined) values['ninerouter.model'] = d.model.trim() || DEFAULT_NINEROUTER.model;
    if (d.systemPrompt !== undefined) values['ninerouter.systemPrompt'] = d.systemPrompt;
    if (d.maxTokens !== undefined) values['ninerouter.maxTokens'] = String(d.maxTokens);
    if (d.timeoutMs !== undefined) values['ninerouter.timeoutMs'] = String(d.timeoutMs);
    if (d.fallbackMessage !== undefined) values['ninerouter.fallbackMessage'] = d.fallbackMessage;
    if (d.pricePerReply !== undefined) values['ninerouter.pricePerReply'] = String(d.pricePerReply);

    await setSystemSettings(values as any);
    invalidateSettingsCache();

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_NINEROUTER',
      module: 'BOT',
      description: `Administrator Pusat memperbarui konfigurasi 9Router (${Object.keys(values).join(', ')})`,
      ipAddress: getClientIp(req),
    });
    return apiOk(await getNineRouterPublicConfig());
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan konfigurasi.', 500);
  }
}
