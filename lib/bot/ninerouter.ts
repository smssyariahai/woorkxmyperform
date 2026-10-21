import { getSystemSettings } from '@/lib/system-settings';

/**
 * Klien 9Router — gateway AI OpenAI-compatible.
 * Konfigurasi global tersimpan di SystemSetting (hanya Administrator Pusat).
 */

export interface NineRouterConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string; // tidak pernah dikirim ke frontend
  model: string;
  systemPrompt: string;
  maxTokens: number;
  timeoutMs: number;
  fallbackMessage: string;
  pricePerReply: number; // Rupiah per balasan
}

export const DEFAULT_NINEROUTER: NineRouterConfig = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:20128',
  apiKey: '',
  model: 'muse-spark',
  systemPrompt:
    'Kamu adalah asisten customer service yang ramah dan membantu. Jawab dalam Bahasa Indonesia yang sopan dan ringkas (maksimal 3 kalimat kecuali diminta lebih).',
  maxTokens: 500,
  timeoutMs: 30000,
  fallbackMessage: 'Mohon maaf, asisten AI sedang tidak tersedia. Tim kami akan segera membantu Anda.',
  pricePerReply: 500,
};

function normalizeBaseUrl(raw: string, fallback: string): string {
  const v = (raw || fallback).trim().replace(/\/+$/, '');
  // Terima input dengan /v1 di akhir — strip agar tidak dobel
  return v.replace(/\/v1$/, '');
}

export async function getNineRouterConfig(): Promise<NineRouterConfig> {
  const s = await getSystemSettings();
  return {
    enabled: s['ninerouter.enabled'] === '1',
    baseUrl: normalizeBaseUrl(s['ninerouter.baseUrl'] || '', DEFAULT_NINEROUTER.baseUrl),
    apiKey: s['ninerouter.apiKey'] || '',
    model: s['ninerouter.model'] || DEFAULT_NINEROUTER.model,
    systemPrompt: s['ninerouter.systemPrompt'] || DEFAULT_NINEROUTER.systemPrompt,
    maxTokens: parseInt(s['ninerouter.maxTokens'] || '', 10) || DEFAULT_NINEROUTER.maxTokens,
    timeoutMs: parseInt(s['ninerouter.timeoutMs'] || '', 10) || DEFAULT_NINEROUTER.timeoutMs,
    fallbackMessage: s['ninerouter.fallbackMessage'] || DEFAULT_NINEROUTER.fallbackMessage,
    pricePerReply: parseInt(s['ninerouter.pricePerReply'] || '', 10) || DEFAULT_NINEROUTER.pricePerReply,
  };
}

/** Versi aman untuk frontend — tanpa apiKey. */
export async function getNineRouterPublicConfig() {
  const c = await getNineRouterConfig();
  const { apiKey, ...rest } = c;
  return { ...rest, apiKeySet: apiKey.length > 0, apiKeyMasked: apiKey ? maskKey(apiKey) : '' };
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export interface ChatResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Panggil 9Router /v1/chat/completions. Tidak melempar — kembalikan { ok, text/error }. */
export async function chatCompletion(
  cfg: NineRouterConfig,
  messages: Array<{ role: string; content: string }>,
  override?: { model?: string; maxTokens?: number; timeoutMs?: number }
): Promise<ChatResult> {
  const model = override?.model || cfg.model;
  const maxTokens = override?.maxTokens || cfg.maxTokens;
  const timeoutMs = override?.timeoutMs || cfg.timeoutMs;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const base = normalizeBaseUrl(cfg.baseUrl, DEFAULT_NINEROUTER.baseUrl);
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7, stream: false }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (res.status === 429) return { ok: false, error: 'Rate limit 9Router tercapai. Coba lagi nanti.' };
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `9Router error ${res.status}: ${t.slice(0, 200)}` };
    }
    const ct = res.headers.get('content-type') || '';
    const rawText = await res.text().catch(() => '');

    // Respons bisa berupa JSON biasa atau SSE stream (text/event-stream)
    let text = '';
    let j: any = null;
    if (ct.includes('text/event-stream') || rawText.startsWith('data:')) {
      // Parse SSE: gabungkan delta.content dari tiap chunk
      for (const line of rawText.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.message?.content ?? '';
          if (delta) text += delta;
        } catch {}
      }
    } else {
      j = (() => { try { return JSON.parse(rawText); } catch { return null; } })();
      text = j?.choices?.[0]?.message?.content?.trim() ?? '';
    }
    if (!text) {
      const hint = j?.error ? ` Error: ${JSON.stringify(j.error).slice(0, 200)}` : '';
      return { ok: false, error: `Respons AI kosong.${hint} [${res.status} ${ct}] Mentah: ${rawText.slice(0, 300) || '(kosong)'}` };
    }
    return { ok: true, text: text.trim() };
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') return { ok: false, error: `Timeout ${timeoutMs}ms tercapai.` };
    return { ok: false, error: `Koneksi 9Router gagal: ${e?.message ?? e}` };
  }
}

/** Ambil daftar model dari 9Router. */
export async function listModels(baseUrl: string, apiKey: string): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl, '')}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = await res.json().catch(() => null);
    const models = (j?.data ?? []).map((m: any) => m.id).filter(Boolean);
    return { ok: true, models };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: e?.name === 'AbortError' ? 'Timeout.' : (e?.message ?? 'Koneksi gagal.') };
  }
}
