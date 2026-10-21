import { NextResponse } from 'next/server';
import { exchangeCode, extendToken } from '@/lib/meta';
import { verifyState, sealToken } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

/**
 * GET /api/channels/meta/callback?code=...&state=...
 * Callback OAuth Meta — tukar code -> long-lived token, simpan di cookie
 * sementara, lalu arahkan ke halaman Saluran untuk memilih Halaman.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  const appBase =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://woork-saas.xsramazys.dev').replace(/\/$/, '');

  const fail = (msg: string) =>
    NextResponse.redirect(`${appBase}/channels?meta_error=${encodeURIComponent(msg)}`);

  if (err) return fail('Login Meta dibatalkan.');
  const state = stateRaw ? verifyState(stateRaw) : null;
  if (!state?.orgId || !state?.userId || !code) return fail('State OAuth tidak valid.');

  try {
    const short = await exchangeCode(code);
    const long = await extendToken(short.access_token);
    const sealed = sealToken(
      JSON.stringify({ token: long.access_token, provider: state.provider, orgId: state.orgId, userId: state.userId })
    );
    const res = NextResponse.redirect(`${appBase}/channels?metapick=1`);
    res.cookies.set('meta_oauth', sealed, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 menit untuk memilih Halaman
    });
    return res;
  } catch (e: any) {
    return fail(e.message || 'Gagal menyelesaikan login Meta.');
  }
}
