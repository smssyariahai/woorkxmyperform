'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-8 max-w-[720px] mx-auto">
      <div className="card text-center py-14">
        <h2 className="text-[18px] font-bold text-ink">Terjadi kesalahan</h2>
        <p className="mt-2 text-sm text-muted">
          Terjadi kesalahan. Silakan coba lagi.
        </p>
        {true && (
          <pre className="mx-auto mt-4 max-w-full overflow-auto rounded-xl bg-slate-100 p-3 text-left text-[11px] text-danger">
            {error.message}
            {error.digest ? `\n(digest: ${error.digest})` : ''}
          </pre>
        )}
        <button className="btn-primary mt-6" onClick={reset}>
          Coba lagi
        </button>
      </div>
    </div>
  );
}
