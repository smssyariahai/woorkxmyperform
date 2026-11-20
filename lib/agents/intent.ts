import { SENSITIVE_PATTERN } from './registry';
import { formatBulanTahun, parseMonthFromText } from './month';

/**
 * Intent parser Bahasa Indonesia untuk command bar.
 * Tanpa model AI eksternal: router berbasis kata kunci yang jujur dan dapat diprediksi.
 * Ketika penyedia AI terhubung nanti, ganti fungsi ini dengan pemanggilan model.
 */
export interface ParsedIntent {
  agentName: string;      // Aria | Bima | Citra | Dian | Eko
  title: string;
  description: string;
  toolKey: string | null; // tool utama yang akan dijalankan
  toolArgs: Record<string, any>;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requiresApproval: boolean;
  reply: string;          // konfirmasi cepat ke pengguna (acknowledgment)
  kind: 'task' | 'query' | 'control';
  control?: 'cancel' | 'retry' | 'approve' | 'list';
}

const AGENTS = ['aria', 'bima', 'citra', 'dian', 'eko'] as const;

function detectAgent(text: string): string | null {
  const t = text.toLowerCase();
  for (const a of AGENTS) {
    if (new RegExp(`\\b${a}\\b`).test(t)) return a[0].toUpperCase() + a.slice(1);
  }
  return null;
}

/** Semua nama agent yang disebut di perintah, sesuai urutan kemunculan. */
function detectAllAgents(text: string): string[] {
  const t = text.toLowerCase();
  const found: { name: string; idx: number }[] = [];
  for (const a of AGENTS) {
    const m = new RegExp(`\\b${a}\\b`).exec(t);
    if (m) found.push({ name: a[0].toUpperCase() + a.slice(1), idx: m.index });
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

export function parseCommand(raw: string): ParsedIntent {
  const text = raw.trim();
  const t = text.toLowerCase();
  const named = detectAgent(t);
  const priority = detectPriority(t);
  const sensitive = SENSITIVE_PATTERN.test(text);

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
    const names = detectAllAgents(t);
    if (names.length >= 2) {
      const [from, to] = names;
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
