/** Serialisasi baris menjadi CSV (RFC 4180): kutip bila perlu, gandakan kutip dalam. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = String(v ?? '').replace(/\r\n|\r|\n/g, ' ');
    return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function csvResponse(csv: string, filename: string): Response {
  // BOM UTF-8 agar Excel membuka sebagai UTF-8.
  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
