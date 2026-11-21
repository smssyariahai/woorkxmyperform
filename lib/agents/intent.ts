import { SENSITIVE_PATTERN } from './registry';
import { formatBulanTahun, parseMonthFromText } from './month';

/**
 * Intent parser Bahasa Indonesia untuk command bar.
 * Tanpa model AI eksternal: router berbasis kata kunci yang jujur dan dapat diprediksi.
 * Ketika penyedia AI terhubung nanti, ganti fungsi ini dengan pemanggilan model.
 */
export interface ParsedIntent {
  agentName: string;      // nama agent tujuan — dari daftar agent kantor
  /** Nama agent yang benar-benar disebut di perintah (null bila tidak ada). */
  namedAgent?: string | null;
  title: string;
  description: string;
  toolKey: string | null; // tool utama yang akan dijalankan
  toolArgs: Record<string, any>;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requiresApproval: boolean;
  reply: string;          // konfirmasi cepat ke pengguna (acknowledgment)
  kind: 'task' | 'query' | 'control';
  control?: 'cancel' | 'retry' | 'approve' | 'list' | 'wake' | 'sleep';
}

/** Nama agent bawaan — fallback bila pemanggil tidak mengirim daftar. */
const DEFAULT_AGENT_NAMES = ['Aria', 'Bima', 'Citra', 'Dian', 'Eko'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectAgent(text: string, names: string[]): string | null {
  const t = text.toLowerCase();
  for (const name of names) {
    if (new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`).test(t)) return name;
  }
  return null;
}

/** Semua nama agent yang disebut di perintah, sesuai urutan kemunculan. */
function detectAllAgents(text: string, names: string[]): string[] {
  const t = text.toLowerCase();
  const found: { name: string; idx: number }[] = [];
  for (const name of names) {
    const m = new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`).exec(t);
    if (m) found.push({ name, idx: m.index });
  }
  return found.sort((x, y) => x.idx - y.idx).map((f) => f.name);
}

function detectPriority(text: string): ParsedIntent['priority'] {
  const t = text.toLowerCase();
  if (/\b(segera|urgent|darurat|penting banget)\b/.test(t)) return 'URGENT';
  if (/\b(prioritas|penting|deadline hari ini)\b/.test(t)) return 'HIGH';
  if (/\b(nanti|santai|kapan-kapan)\b/.test(t)) return 'LOW';
  return 'NORMAL';
}

/**
 * Parse perintah. `agentNames` = nama semua agent kantor ini (dari DB) —
 * WAJIB dikirim pemanggil API supaya agent baru (mis. Fathan) ikut dikenali;
 * bila tidak dikirim, hanya 5 nama bawaan yang dikenali dan perintah ke
 * agent baru jatuh ke Aria (bug yang dilaporkan user 2026-11-20).
 */
export function parseCommand(raw: string, agentNames: string[] = DEFAULT_AGENT_NAMES): ParsedIntent {
  const text = raw.trim();
  const t = text.toLowerCase();
  const names = agentNames.length > 0 ? agentNames : DEFAULT_AGENT_NAMES;
  const named = detectAgent(t, names);
  const priority = detectPriority(t);
  const sensitive = SENSITIVE_PATTERN.test(text);

  // --- perintah kontrol: bangun / tidur ---
  // Mode Tidur berlaku untuk SELURUH kantor (state bersama per org,
  // lib/kantor/sleep.ts), jadi "Fathan, bangun" membangunkan semua agent
  // — balasan di route menjelaskannya dengan jujur.
  // Hanya bila kata bangun/tidur adalah kata kerja utama perintah (sisa
  // teks setelahnya ≤ 3 kata, mis. "bangun dong"); bila ada tugas lain
  // setelahnya ("bangun dan buatkan laporan..."), jatuh ke parsing tugas
  // biasa dengan agent yang tetap terdeteksi.
  const nameAlt = names
    .map((n) => escapeRegExp(n.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const wakeSleep = new RegExp(`^(?:(?:${nameAlt}),?\\s+)?(bangun|bangunkan|bangunlah|tidur|tidurlah)\\b`).exec(t);
  if (wakeSleep) {
    const rest = t.slice(wakeSleep[0].length).trim();
    if (!rest || rest.split(/\s+/).length <= 3) {
      const sleep = wakeSleep[1].startsWith('tidur');
      return {
        agentName: named ?? 'Aria', namedAgent: named,
        title: sleep ? 'Tidurkan agent' : 'Bangunkan agent', description: text,
        toolKey: null, toolArgs: {}, priority, requiresApproval: false,
        reply: sleep ? 'Siap, mode Tidur dinyalakan.' : 'Siap, membangunkan agent.',
        kind: 'control', control: sleep ? 'sleep' : 'wake',
      };
    }
  }

  // --- perintah kontrol ---
  if (/\b(hentikan|batalkan|cancel)\b/.test(t) && /\btugas\b/.test(t)) {
    return {
      agentName: named ?? 'Aria', title: 'Batalkan tugas berjalan', description: text,
      toolKey: null, toolArgs: {}, priority, requiresApproval: false,
      reply: 'Siap, saya hentikan tugas yang sedang berjalan.',
      kind: 'control', control: 'cancel',
    };
  }
  if (/\b(lanjut|lanjutkan|retry|coba lagi)\b/.test(t) && /\b(tugas|pekerjaan)\b/.test(t)) {
    return {
      agentName: named ?? 'Aria', title: 'Lanjutkan tugas tertunda', description: text,
      toolKey: null, toolArgs: {}, priority, requiresApproval: false,
      reply: 'Siap, saya lanjutkan pekerjaan yang tertunda.',
      kind: 'control', control: 'retry',
    };
  }
  if (/\b(setuju|approve)\b/.test(t)) {
    return {
      agentName: named ?? 'Aria', title: 'Setujui pengajuan', description: text,
      toolKey: null, toolArgs: {}, priority, requiresApproval: false,
      reply: 'Baik, saya teruskan persetujuan Anda.',
      kind: 'control', control: 'approve',
    };
  }
  if (/\b(tampilkan|tampil|lihat|daftar|semua)\b/.test(t) && /\b(pekerjaan|tugas)\b/.test(t) && /\b(berlangsung|berjalan|aktif)\b/.test(t)) {
    return {
      agentName: named ?? 'Aria', title: 'Tampilkan pekerjaan berlangsung', description: text,
      toolKey: 'daftar_tugas', toolArgs: { status: 'RUNNING' }, priority: 'LOW', requiresApproval: false,
      reply: `Perintah diterima — ${named ?? 'Aria'} sedang menampilkan pekerjaan yang sedang berlangsung.`,
      kind: 'query',
    };
  }

  // --- koordinasi antar agent: "Bima koordinasi dengan Aria" ---
  // Agent pertama berjalan ke meja agent kedua (delegasi sebagai mekanisme).
  if (/\b(koordinasi|berkoordinasi|hubungi|temui|samperin|ajak bicara|diskusi dengan|bicara dengan|ke meja)\b/.test(t)) {
    const mentioned = detectAllAgents(t, names);
    if (mentioned.length >= 2) {
      const [from, to] = mentioned;
      return {
        agentName: from, title: `Koordinasi: ${from} → ${to}`, description: text,
        toolKey: 'delegasi_tugas',
        toolArgs: { agentName: to, title: `Koordinasi dengan ${from}: ${text.slice(0, 60)}` },
        priority, requiresApproval: false,
        reply: `${from} berjalan menuju meja ${to} untuk berkoordinasi.`,
        kind: 'task',
      };
    }
  }

  // --- perintah tugas berdasar kata kunci ---
  // Keuangan dicek DULU karena "rekap keuangan"/"laporan keuangan" mengandung
  // kata "rekap"/"laporan" yang juga cocok dengan pola laporan kinerja.
  // --- keuangan: rekap NYATA dari Invoice (tagihan langganan modul WOORK) ---
  // Data keuangan yang ADA di aplikasi HANYA Invoice + InvoiceItem.
  // TIDAK ADA data kas/pengeluaran/pemasukan operasional — jadi perintah
  // "pengeluaran operasional"/"kas" pun diarahkan ke Rekap Tagihan WOORK
  // dengan penjelasan jujur (di deskripsi + balasan), bukan jalan buntu.
  // Label hasil: "Rekap Tagihan WOORK", bukan "laporan keuangan lengkap".
  if (/\b(kas|keuangan|pengeluaran|anggaran|uang|pembayaran|tagihan)\b/.test(t)) {
    const agent = named ?? 'Dian';
    const { year, month } = parseMonthFromText(t);
    const periode = formatBulanTahun(year, month);
    const mintaKasOperasional = /\b(pengeluaran|kas|operasional)\b/.test(t);
    const catatanKas = mintaKasOperasional
      ? ' Catatan jujur: aplikasi ini tidak punya data kas/pengeluaran operasional, jadi yang dibuat adalah Rekap Tagihan WOORK (tagihan langganan modul) — bukan laporan kas.'
      : '';
    return {
      agentName: agent, title: `Rekap Tagihan WOORK: ${periode}`,
      description: `Permintaan: ${text}. Sumber data nyata: tagihan langganan modul WOORK (Invoice) kantor ini untuk ${periode}.${catatanKas}`,
      toolKey: 'rekap_keuangan', toolArgs: { year, month },
      priority,
      requiresApproval: true, // Dian: finansial selalu butuh persetujuan
      reply: `${agent} mencatat permintaan dan akan menyusun Rekap Tagihan WOORK untuk ${periode} dari data tagihan langganan kantor ini.${catatanKas} Mohon persetujuan Anda dulu.`,
      kind: 'task',
    };
  }
  if (/\b(lapor|ringkas|kinerja|rekapitulasi|minggu ini|bulan ini)\b/.test(t)) {
    const agent = named ?? 'Aria';
    return {
      agentName: agent, title: `Laporan: ${text.slice(0, 60)}`, description: text,
      toolKey: 'laporan_kinerja', toolArgs: {}, priority, requiresApproval: sensitive,
      reply: `${agent} menerima perintah dan mulai menyusun laporan.`,
      kind: 'task',
    };
  }
  if (/\b(pelanggan|customer|crm|prospek|lead)\b/.test(t)) {
    const agent = named ?? 'Aria';
    return {
      agentName: agent, title: `Rekap pelanggan: ${text.slice(0, 60)}`, description: text,
      toolKey: 'rekap_pelanggan', toolArgs: {}, priority, requiresApproval: sensitive,
      reply: `${agent} mulai merekap data pelanggan dari CRM.`,
      kind: 'task',
    };
  }
  if (/\b(kampanye|campaign|broadcast|siaran)\b/.test(t)) {
    const agent = named ?? 'Aria';
    return {
      agentName: agent, title: `Status kampanye: ${text.slice(0, 60)}`, description: text,
      toolKey: 'status_kampanye', toolArgs: {}, priority, requiresApproval: sensitive,
      reply: `${agent} memeriksa status kampanye.`,
      kind: 'task',
    };
  }
  if (/\b(error|sistem|aplikasi|bug|server|it\b|teknis)\b/.test(t)) {
    const agent = named ?? 'Citra';
    return {
      agentName: agent, title: `Pemeriksaan teknis: ${text.slice(0, 60)}`, description: text,
      toolKey: 'status_sistem', toolArgs: {}, priority, requiresApproval: sensitive,
      reply: `${agent} mulai pemeriksaan teknis.`,
      kind: 'task',
    };
  }
  if (/\b(rapat|meeting|kumpul)\b/.test(t)) {
    const agent = named ?? 'Aria';
    return {
      agentName: agent, title: `Rapat virtual: ${text.slice(0, 60)}`, description: text,
      toolKey: 'delegasi_tugas', toolArgs: { agentName: 'Bima', title: 'Siapkan agenda rapat virtual' },
      priority, requiresApproval: sensitive,
      reply: `${agent} menyiapkan rapat virtual dan mendelegasikan agenda ke Bima.`,
      kind: 'task',
    };
  }

  // --- fallback: ke Aria sebagai orkestrator ---
  const agent = named ?? 'Aria';
  return {
    agentName: agent, title: text.slice(0, 80), description: text,
    toolKey: 'laporan_kinerja', toolArgs: {}, priority, requiresApproval: sensitive,
    reply: `${agent} menerima perintah "${text.slice(0, 50)}" dan mulai mengerjakan.`,
    kind: 'task',
  };
}
