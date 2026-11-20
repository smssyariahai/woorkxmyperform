/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    instrumentationHook: true,
  },
  // Redirect untuk URL TAL lama yang salah (tanpa prefix "tal-"): link di
  // dalam aplikasi sempat mengarah ke /tal/tim-saya/* sehingga 404.
  // Link sudah diperbaiki ke /tal/tal-tim-saya/*; redirect ini menjaga
  // bookmark/riwayat yang masih memakai URL lama.
  async redirects() {
    return [
      {
        source: '/tal/tim-saya/:path*',
        destination: '/tal/tal-tim-saya/:path*',
        permanent: false,
      },
      {
        source: '/karir/:path*',
        destination: '/jobs/:path*',
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
