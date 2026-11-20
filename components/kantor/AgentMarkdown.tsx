// Renderer Markdown ringan untuk laporan AI di bubble agent
// (Wave 4). Tanpa dependensi baru — laporan AI hanya butuh heading,
// bold/italic, list, tabel dasar, dan code. Semua teks dirender lewat
// JSX (bukan dangerouslySetInnerHTML), jadi tidak ada injeksi HTML.
'use client';

import type { ReactNode } from 'react';

/** Inline: **tebal**, *miring*, `kode`, [teks](url). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-brand underline">
          {link[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function isTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|');
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function AgentMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blok kode ```...```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // lewati penutup
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-lg bg-muted p-2.5 text-xs">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Tabel | a | b | (+ baris pemisah |---|---|)
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {headers.map((h, j) => (
                  <th key={j} className="border-b bg-muted/50 px-2 py-1 text-left font-medium text-muted">
                    {renderInline(h, `th-${key}-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b last:border-0">
                  {headers.map((_, j) => (
                    <td key={j} className="px-2 py-1 align-top">
                      {renderInline(row[j] ?? '', `td-${key}-${r}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Heading # .. ####
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${key}`);
      const cls =
        level === 1
          ? 'text-base font-semibold'
          : level === 2
            ? 'text-sm font-semibold'
            : 'text-sm font-medium';
      blocks.push(
        <p key={key++} className={cls}>
          {content}
        </p>,
      );
      i += 1;
      continue;
    }

    // List (unordered -/*, ordered 1.)
    if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^[-*]\s+/.test(lines[i].trim()) || /^\d+[.)]\s+/.test(lines[i].trim()))
      ) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={key++} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-0.5 pl-4 text-sm`}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `li-${key}-${j}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Baris kosong -> pemisah blok
    if (trimmed === '') {
      i += 1;
      continue;
    }

    // Paragraf: gabung baris berurutan sampai baris kosong / blok lain.
    const paraLines: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('```') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={key++} className="text-sm">
        {paraLines.map((pl, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(pl, `p-${key}-${j}`)}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="min-w-0 space-y-2 break-words">{blocks}</div>;
}
