import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { getNineRouterConfig, chatCompletion } from '@/lib/bot/ninerouter';

/**
 * Mesin AI Kantor Virtual (Wave 4) — menghubungkan agent ke AI nyata (9Router).
 *
 * Dua fungsi export, keduanya HANYA memanggil AI dan mengembalikan teks/JSON:
 * - TIDAK PERNAH menulis DB (kecuali pencatatan pemakaian best-effort, lihat bawah).
 * - TIDAK PERNAH memanggil tool sendiri — eksekusi tool tetap di tangan pemanggil
 *   (scheduler / intent router kata kunci sebagai fallback).
 *
 * Pola: two-step prompt, karena `chatCompletion` tidak mendukung function
 * calling — (1) AI memilih SATU tool + argumennya sebagai JSON,
 * (2) AI menyusun laporan Markdown dari hasil tool yang sudah dieksekusi.
 *
 * AI nyata hanya lewat `lib/bot/ninerouter.ts`. `lib/ai.ts` adalah MOCK (regex)
 * dan TIDAK dipakai di sini. Nilai `ninerouter.apiKey` TIDAK PERNAH dicetak
 * di log / laporan / error message mana pun.
 *
 * Pencatatan pemakaian: pola reservasi + tagih `lib/bot/credits.ts`
 * (reserveCredit / finalizeCharge / refundCredit) TIDAK cocok di sini —
 * pola itu menagih saldo kredit kantor per balasan WhatsApp pelanggan dan
 * butuh `messageId` WA + `conversationId` untuk idempotency, sementara
 * perintah agent adalah pekerjaan internal staf tanpa pesan WA. Jadi
 * pemakaian dicatat di `BotUsage` TANPA menagih: satu baris per panggilan AI
 * yang berhasil, `status: 'CHARGED'`, `amount: 0` (nol rupiah, tidak
 * menyentuh BotConfig.creditBalance / CreditLedger / Saldo Master),
 * `messageId` sintetis berawalan `kantor-ai-` supaya bisa dibedakan dari
 * balasan bot WA. Pencatatan dibungkus try/catch dan tidak pernah
 * menggagalkan panggilan AI. Bila `organizationId` tidak tersedia (tidak
 * dipasok pemanggil lewat `agent.organizationId`), pencatatan dilewati —
 * BotUsage wajib punya organizationId.
 */

/** Profil agent yang dibutuhkan mesin AI (diambil pemanggil dari row Agent di DB). */
export interface AgentAiProfile {
  name: string;
  role: string;
  systemInstructions?: string | null;
  tools?: string[];
  /** Id kantor pemilik agent — dipakai HANYA untuk pencatatan pemakaian (BotUsage). */
  organizationId?: string | null;
}

/** Satu tool yang boleh dipilih AI, beserta deskripsi + argumennya. */
export interface AgentAiToolInfo {
  key: string;
  name: string;
  description: string;
  args?: string;
}

/** Hasil perencanaan AI: tool yang dipilih + argumennya + alasan singkat. */
export interface AgentAiPlan {
  toolKey: string | null;
  toolArgs: Record<string, any>;
  reasoning: string;
}

export interface AgentAiReportContext {
  monthLabel?: string;
  organizationId?: string | null;
}

/** Batas JSON hasil tool yang dikirim ke AI (karakter) — cegah prompt membengkak. */
const MAX_TOOL_JSON_CHARS = 12000;

/**
 * Catat satu panggilan AI agent ke BotUsage tanpa menagih (amount 0).
 * Best-effort: gagal catat = lanjut, tidak pernah melempar.
 */
async function recordAiUsage(opts: {
  organizationId?: string | null;
  kind: 'plan' | 'report';
  model: string;
}): Promise<void> {
  if (!opts.organizationId) return;
  try {
    await prisma.botUsage.create({
      data: {
        organizationId: opts.organizationId,
        conversationId: null,
        messageId: `kantor-ai-${opts.kind}-${randomUUID()}`,
        status: 'CHARGED',
        amount: 0,
        model: opts.model,
        error: null,
      },
    });
  } catch {
    // Pencatatan tidak boleh menggagalkan panggilan AI.
  }
}

/**
 * Ambil objek JSON pertama yang valid dari teks balasan AI.
 * Toleran: blok ```json bila ada, bila tidak substring `{...}` pertama
 * (pencarian kurung berimbang, sadar string) — dengan fallback buang
 * koma berlebih sebelum `}` / `]`.
 */
function extractJsonObject(text: string): Record<string, any> | null {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  // Substring { ... } pertama yang berimbang (abaikan kurung di dalam string).
  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Coba sekali lagi dengan koma berlebih dibersihkan.
      try {
        const cleaned = raw.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {
        // Lanjut ke kandidat berikut.
      }
    }
  }
  return null;
}

/**
 * Minta AI memilih SATU tool yang paling cocok untuk perintah user.
 * Kembalikan `null` bila AI tidak tersedia / gagal / timeout / `ninerouter`
 * nonaktif / jawaban tidak bisa diparse / toolKey tidak dikenal — pemanggil
 * memakai fallback router kata kunci. TIDAK PERNAH throw.
 */
export async function planWithAI(
  command: string,
  agent: AgentAiProfile,
  tools: AgentAiToolInfo[]
): Promise<AgentAiPlan | null> {
  try {
    if (!command?.trim() || !Array.isArray(tools) || tools.length === 0) return null;

    const cfg = await getNineRouterConfig();
    if (!cfg.enabled || !cfg.baseUrl) return null;

    const toolList = tools
      .map((t) => `- ${t.key} (${t.name}): ${t.description}${t.args ? ` Argumen: ${t.args}` : ''}`)
      .join('\n');
    const instructions = agent.systemInstructions?.trim()
      ? `\nInstruksi khusus agent ini: ${agent.systemInstructions.trim()}`
      : '';
    const systemPrompt =
      `Kamu adalah ${agent.name}, seorang ${agent.role} di kantor virtual WOORK. ` +
      `Tugasmu hanya satu: memilih tool yang paling cocok untuk menjalankan perintah pengguna.${instructions}\n\n` +
      `Tool yang tersedia:\n${toolList}\n\n` +
      `Aturan:\n` +
      `- Pilih SATU tool yang paling cocok untuk perintah pengguna, beserta argumennya sesuai deskripsi argumen tool itu.\n` +
      `- Bila tidak ada tool yang cocok, kembalikan toolKey null.\n` +
      `- JANGAN menjalankan tool itu sendiri dan JANGAN mengarang data — kamu hanya merencanakan.\n` +
      `- Kembalikan HANYA JSON valid, tanpa teks lain, tanpa blok kode tambahan:\n` +
      `{"toolKey": "<kunci tool atau null>", "toolArgs": {...}, "reasoning": "<alasan singkat dalam Bahasa Indonesia>"}`;

    const ai = await chatCompletion(
      cfg,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: command.trim() },
      ],
      { maxTokens: 500, timeoutMs: 30000 }
    );
    if (!ai.ok || !ai.text) return null;

    const parsed = extractJsonObject(ai.text);
    if (!parsed) return null;
    const toolKey = parsed.toolKey ?? null;
    if (toolKey !== null && (typeof toolKey !== 'string' || !tools.some((t) => t.key === toolKey))) {
      return null;
    }
    const toolArgs =
      parsed.toolArgs && typeof parsed.toolArgs === 'object' && !Array.isArray(parsed.toolArgs)
        ? parsed.toolArgs
        : {};
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
    await recordAiUsage({ organizationId: agent.organizationId, kind: 'plan', model: cfg.model });
    return { toolKey, toolArgs, reasoning };
  } catch {
    return null;
  }
}

/**
 * Minta AI menyusun laporan DETAIL Bahasa Indonesia (Markdown) dari hasil
 * tool yang SUDAH dieksekusi pemanggil. Kembalikan teks laporan, atau `null`
 * bila AI gagal / timeout / tidak tersedia — pemanggil memakai ringkasan
 * tool lama. TIDAK PERNAH throw.
 */
export async function composeReportWithAI(
  agent: AgentAiProfile,
  command: string,
  toolKey: string | null,
  toolResult: { summary: string; data: any },
  context?: AgentAiReportContext
): Promise<string | null> {
  try {
    const cfg = await getNineRouterConfig();
    if (!cfg.enabled || !cfg.baseUrl) return null;

    let toolJson = '';
    try {
      toolJson = JSON.stringify(toolResult?.data ?? null);
    } catch {
      toolJson = '"(data tidak bisa diserialisasi)"';
    }
    if (toolJson.length > MAX_TOOL_JSON_CHARS) {
      toolJson = toolJson.slice(0, MAX_TOOL_JSON_CHARS) + '\n...(data dipotong — hanya bagian awal yang disertakan)...';
    }
    const monthLine = context?.monthLabel ? `\nPeriode laporan: ${context.monthLabel}.` : '';
    const toolLine = toolKey ? `Tool yang dipakai: ${toolKey}.` : 'Tidak ada tool yang dipakai.';
    const systemPrompt =
      `Kamu adalah ${agent.name}, seorang ${agent.role} di kantor virtual WOORK. ` +
      `Tulis laporan DETAIL dalam Bahasa Indonesia dengan format Markdown, berdasarkan HASIL TOOL yang diberikan di bawah.${monthLine}\n\n` +
      `Struktur laporan:\n` +
      `1. Ringkasan eksekutif\n` +
      `2. Temuan / angka kunci\n` +
      `3. Tabel bila relevan\n` +
      `4. Analisis singkat\n` +
      `5. Rekomendasi / tindak lanjut\n\n` +
      `Aturan keras — WAJIB dipatuhi:\n` +
      `- Angka HANYA dari data yang diberikan. JANGAN mengarang angka, nama, tanggal, atau fakta apa pun.\n` +
      `- Bila data kosong atau tidak ada, katakan terus terang bahwa tidak ada data tercatat — jangan isi dengan angka karangan.\n` +
      `- Jangan klaim data yang tidak ada di hasil tool (misalnya jangan menyajikan rekap tagihan sebagai laporan kas/pengeluaran bila datanya hanya tagihan).\n` +
      `- Gunakan Bahasa Indonesia yang rapi dan profesional.`;

    const userMessage =
      `Perintah pengguna: ${command?.trim() || '(tidak ada)'}\n` +
      `${toolLine}\n` +
      `Ringkasan hasil tool: ${toolResult?.summary ?? '(tidak ada ringkasan)'}\n\n` +
      `Hasil tool (JSON):\n${toolJson}`;

    const ai = await chatCompletion(
      cfg,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { maxTokens: 3000, timeoutMs: 60000 }
    );
    if (!ai.ok || !ai.text) return null;

    await recordAiUsage({
      organizationId: agent.organizationId ?? context?.organizationId,
      kind: 'report',
      model: cfg.model,
    });
    return ai.text.trim();
  } catch {
    return null;
  }
}
