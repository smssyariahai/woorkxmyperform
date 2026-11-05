import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** SHA-256 (hex) dari Buffer. */
export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** SHA-256 (hex) dari string (utf-8). */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SHA-256 (hex) dari file di disk. */
export async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return sha256(buf);
}
