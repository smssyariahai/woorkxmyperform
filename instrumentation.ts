/** Dijalankan sekali saat server Next.js (Node.js runtime) mulai. */
export async function register() {
  // CATATAN: register() berjalan di konteks modul TERPISAH dari API routes,
  // sehingga state in-memory (mis. sesi WhatsApp) tidak dibagi.
  // Jangan memanggil restoreSessions() di sini — pemulihan sesi WA dilakukan
  // secara lazy di konteks utama via getSessionInfo()/sendText() di lib/wa/manager.ts.
  // Dua konteks = dua socket = loop "connectionReplaced" 440.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Modul Kantor Virtual (engine agent di-restore 2026-11-20): sapu tugas
    // yatim — tugas RUNNING pasti terhenti oleh restart VM, tandai FAILED
    // dan kembalikan agent ke IDLE (lib/agents/scheduler.ts).
    // Dilewati saat build agar tidak menyentuh DB saat `next build`.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      import('@/lib/agents/scheduler')
        .then(({ sweepOrphanedTasks }) => sweepOrphanedTasks())
        .catch((e) => console.error('[agents] orphan sweep gagal:', e));
    }
  }
}
