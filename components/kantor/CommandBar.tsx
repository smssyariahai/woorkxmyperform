'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { friendlyFetchError } from './meta';

const SUGGESTIONS = [
  'Aria, buatkan laporan kinerja minggu ini',
  'Bima, tampilkan pekerjaan yang sedang berlangsung',
  'Bima koordinasi dengan Aria',
  'Citra, periksa error pada sistem aplikasi',
  'Dian, buatkan ringkasan pengeluaran operasional',
  'Eko, periksa status sistem',
];

export function CommandBar({ onCommand, onRefresh }: { onCommand: (reply: string) => void; onRefresh?: () => void }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastReply, setLastReply] = useState('');

  async function send(text: string) {
    const cmd = text.trim();
    if (!cmd || sending) return;
    setSending(true);
    try {
      const r = await fetch('/api/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const reply = j.data.reply || 'Perintah diterima.';
      setLastReply(reply);
      onCommand(reply);
      setInput('');
    } catch (e: any) {
      const msg = String(e?.message || '');
      const netFail = /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
      toast.error(
        netFail
          ? 'Koneksi ke server terputus sesaat — perintah mungkin sudah terkirim. Memeriksa daftar tugas…'
          : friendlyFetchError(e, 'Gagal mengirim perintah.')
      );
      // perintah mungkin sempat sampai ke server: refresh agar user bisa melihat
      if (netFail && onRefresh) setTimeout(onRefresh, 2000);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-brand" />
        <h3 className="text-[14px] font-semibold text-ink">Pusat Perintah</h3>
        <span className="badge !text-[10.5px]">Mode cerdas lokal</span>
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder='Contoh: "Aria, buatkan laporan kinerja minggu ini"'
          className="input flex-1"
          disabled={sending}
          aria-label="Perintah untuk agent"
        />
        <button onClick={() => send(input)} disabled={!input.trim() || sending} className="btn-primary shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Kirim</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={sending}
            className="rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:text-brand hover:border-brand/40 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
      {lastReply && (
        <p className="mt-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 px-3.5 py-2.5 text-[13px] text-ink">
          {lastReply}
        </p>
      )}
      <p className="mt-2 text-[11.5px] text-muted">
        Perintah sensitif (bayar, transfer, hapus) otomatis meminta persetujuan Anda sebelum dijalankan.
      </p>
    </div>
  );
}
