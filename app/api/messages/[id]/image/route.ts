import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** GET /api/messages/[id]/image — sajikan gambar lampiran pesan (butuh INBOX_VIEW) */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    // ConversationMessage TIDAK punya relasi `conversation.organization`
    // di tenant client — cek kepemilikan dua langkah: ambil pesan dulu,
    // lalu bandingkan organizationId skalar percakapannya (pola baku
    // Lapisan F). Pesan dari kantor lain tetap 404 (tidak bocor).
    const msg = await prisma.conversationMessage.findFirst({
      where: { id: params.id },
      select: { id: true, messageType: true, conversationId: true },
    });
    if (!msg || msg.messageType !== 'IMAGE') return apiErr('Gambar tidak ditemukan.', 404);
    const conv = await prisma.conversation.findUnique({
      where: { id: msg.conversationId },
      select: { organizationId: true },
    });
    if (!conv || conv.organizationId !== ctx.organizationId) return apiErr('Gambar tidak ditemukan.', 404);

    const dir = join(process.cwd(), 'uploads', 'messages');
    // cari file dengan ekstensi yang didukung
    let found: string | null = null;
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      const p = join(dir, `${msg.id}${ext}`);
      if (existsSync(p)) { found = p; break; }
    }
    if (!found) return apiErr('File gambar tidak ditemukan.', 404);

    const buf = await readFile(found);
    return new Response(buf as any, {
      headers: {
        'Content-Type': MIME[extname(found)] ?? 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return apiErr('Tidak diizinkan.', 403);
    return apiErr('Gagal memuat gambar.', 500);
  }
}
