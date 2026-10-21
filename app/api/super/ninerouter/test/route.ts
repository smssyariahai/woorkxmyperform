import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getNineRouterConfig, listModels, chatCompletion } from '@/lib/bot/ninerouter';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

/**
 * POST /api/super/ninerouter/test — uji koneksi ke 9Router.
 * Body opsional: { baseUrl, apiKey } untuk menguji nilai yang belum disimpan.
 */
export async function POST(req: Request) {
  try {
    await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    const cfg = await getNineRouterConfig();
    const baseUrl = (p.success && p.data.baseUrl) || cfg.baseUrl;
    const apiKey = p.success && p.data.apiKey !== undefined ? p.data.apiKey : cfg.apiKey;

    // 1. daftar model
    const models = await listModels(baseUrl, apiKey);
    if (!models.ok) {
      return apiOk({ ok: false, step: 'models', error: `Gagal mengambil daftar model: ${models.error}` });
    }

    // 1b. pastikan model yang dikonfigurasi tersedia
    const wantModel = (p.success && (body as any)?.model) || cfg.model;
    if (models.models && models.models.length > 0 && !models.models.includes(wantModel)) {
      return apiOk({
        ok: false, step: 'model',
        models: models.models,
        error: `Model "${wantModel}" tidak tersedia di server. Pilih salah satu: ${models.models.slice(0, 8).join(', ')}${models.models.length > 8 ? '…' : ''}`,
      });
    }

    // 2. uji chat singkat
    const chat = await chatCompletion(
      { ...cfg, baseUrl, apiKey },
      [{ role: 'user', content: 'Balas dengan tepat satu kata: OK' }],
      { maxTokens: 100, timeoutMs: 20000 }
    );
    if (!chat.ok) {
      return apiOk({ ok: false, step: 'chat', models: models.models, error: `Model OK, chat gagal: ${chat.error}` });
    }
    return apiOk({ ok: true, models: models.models, reply: chat.text?.slice(0, 100) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menguji koneksi.', 500);
  }
}
