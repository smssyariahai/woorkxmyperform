import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { metaConfigured, metaAuthUrl, type MetaProvider } from '@/lib/meta';
import { signState } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

/**
 * GET /api/channels/meta/login?provider=facebook|instagram
 * Mulai OAuth Login Meta — redirect ke dialog otorisasi Facebook.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!metaConfigured()) {
      return apiErr('Integrasi Meta belum dikonfigurasi (META_APP_ID/SECRET).', 500);
    }
    const provider = new URL(req.url).searchParams.get('provider');
    if (provider !== 'facebook' && provider !== 'instagram') {
      return apiErr('Provider harus facebook atau instagram.', 422);
    }
    const state = signState({
      orgId: ctx.organizationId,
      userId: ctx.userId,
      provider,
    });
    const url = metaAuthUrl(provider as MetaProvider, state);
    return NextResponse.redirect(url);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memulai login Meta.', 500);
  }
}
