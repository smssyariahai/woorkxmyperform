'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F8FAFC', color: '#16324F' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Terjadi kesalahan</h1>
            <p style={{ color: '#64748B', marginTop: 8 }}>
              Maaf, aplikasi mengalami masalah. Silakan coba lagi.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 20, background: '#087BFF', color: '#fff', border: 0,
                borderRadius: 9, padding: '10px 20px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Coba lagi
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
