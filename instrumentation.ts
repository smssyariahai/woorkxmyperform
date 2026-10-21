/** Dijalankan sekali saat server Next.js (Node.js runtime) mulai. */
export async function register() {
  // CATATAN: register() berjalan di konteks modul TERPISAH dari API routes,
  // sehingga state in-memory (mis. sesi WhatsApp) tidak dibagi.
  // Jangan memanggil restoreSessions() di sini — pemulihan sesi WA dilakukan
  // secara lazy di konteks utama via getSessionInfo()/sendText() di lib/wa/manager.ts.
  // Dua konteks = dua socket = loop "connectionReplaced" 440.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // sengaja kosong — hook dipertahankan untuk kebutuhan masa depan
  }
}
