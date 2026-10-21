import { cookies } from 'next/headers';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { getUserPages } from '@/lib/meta';
import { unsealToken } from '@/lib/oauth-state';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function readOAuth(): { token: string; provider: string; orgId: string; userId: string } | null {
  const sealed = cookies().get('meta_oauth')?.value;
  if (!sealed) return null;
  const raw = unsealToken(sealed);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** GET /api/channels/meta/pages — daftar Halaman dari token OAuth sementara. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const sess = readOAuth();
    if (!sess || sess.orgId !== ctx.organizationId) {
      return apiErr('Sesi login Meta kedaluwarsa. Silakan login ulang.', 401);
    }
    const pages = await getUserPages(sess.token);
    return apiOk(pages.map((p) => ({ id: p.id, name: p.name, igUsername: p.igUsername ?? null })));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal mengambil daftar Halaman.', 500);
  }
}

/**
 * POST /api/channels/meta/pages — pilih Halaman -> hubungkan channel.
 * Body: { pageId }
 * Membuat/memperbarui ChannelAccount Facebook (+ Instagram bila tertaut).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const sess = readOAuth();
    if (!sess || sess.orgId !== ctx.organizationId) {
      return apiErr('Sesi login Meta kedaluwarsa. Silakan login ulang.', 401);
    }
    const body = await req.json();
    const pageId = String(body.pageId || '');
    if (!pageId) return apiErr('pageId wajib diisi.', 422);

    const pages = await getUserPages(sess.token);
    const page = pages.find((p) => p.id === pageId);
    if (!page) return apiErr('Halaman tidak ditemukan.', 404);

    const results: Array<{ type: string; displayName: string }> = [];

    // --- Facebook Page ---
    const fbChannel = await prisma.channel.upsert({
      where: { organizationId_type: { organizationId: ctx.organizationId, type: 'FACEBOOK' } },
      update: { status: 'CONNECTED' },
      create: { organizationId: ctx.organizationId, type: 'FACEBOOK', name: 'Facebook', status: 'CONNECTED' },
    });
    await prisma.channelAccount.upsert({
      where: { id: `meta-fb-${ctx.organizationId}-${page.id}` },
      update: {
        displayName: page.name,
        externalId: page.id,
        credentials: JSON.stringify({ pageAccessToken: page.access_token, userToken: sess.token }),
        status: 'CONNECTED',
        connectedAt: new Date(),
        lastError: null,
      },
      create: {
        id: `meta-fb-${ctx.organizationId}-${page.id}`,
        organizationId: ctx.organizationId,
        channelId: fbChannel.id,
        displayName: page.name,
        externalId: page.id,
        credentials: JSON.stringify({ pageAccessToken: page.access_token, userToken: sess.token }),
        status: 'CONNECTED',
        connectedAt: new Date(),
      },
    });
    results.push({ type: 'FACEBOOK', displayName: page.name });

    // --- Instagram (bila Halaman tertaut ke akun IG Bisnis) ---
    if (page.instagram_business_account?.id) {
      const igChannel = await prisma.channel.upsert({
        where: { organizationId_type: { organizationId: ctx.organizationId, type: 'INSTAGRAM' } },
        update: { status: 'CONNECTED' },
        create: { organizationId: ctx.organizationId, type: 'INSTAGRAM', name: 'Instagram', status: 'CONNECTED' },
      });
      await prisma.channelAccount.upsert({
        where: { id: `meta-ig-${ctx.organizationId}-${page.instagram_business_account.id}` },
        update: {
          displayName: page.igUsername ? `@${page.igUsername}` : 'Instagram',
          externalId: page.instagram_business_account.id,
          credentials: JSON.stringify({ pageAccessToken: page.access_token, igId: page.instagram_business_account.id }),
          status: 'CONNECTED',
          connectedAt: new Date(),
          lastError: null,
        },
        create: {
          id: `meta-ig-${ctx.organizationId}-${page.instagram_business_account.id}`,
          organizationId: ctx.organizationId,
          channelId: igChannel.id,
          displayName: page.igUsername ? `@${page.igUsername}` : 'Instagram',
          externalId: page.instagram_business_account.id,
          credentials: JSON.stringify({ pageAccessToken: page.access_token, igId: page.instagram_business_account.id }),
          status: 'CONNECTED',
          connectedAt: new Date(),
        },
      });
      results.push({ type: 'INSTAGRAM', displayName: page.igUsername ? `@${page.igUsername}` : 'Instagram' });
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'META_CONNECT',
      module: 'CHANNELS',
      description: `Menghubungkan ${results.map((r) => `${r.type} (${r.displayName})`).join(' & ')} via Meta Login`,
      ipAddress: getClientIp(req),
    });

    // hapus cookie sementara
    const { NextResponse } = await import('next/server');
    const res = NextResponse.json({ success: true, data: { connected: results } });
    res.cookies.delete('meta_oauth');
    return res;
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal menghubungkan Halaman.', 500);
  }
}
