/**
 * Security headers.
 *
 * No Content-Security-Policy is set here, deliberately. Next's App Router
 * injects inline bootstrap scripts, so a useful CSP needs per-request nonces
 * via middleware — and a `unsafe-inline` CSP added to look thorough would
 * provide no XSS protection while implying it does. Adding a real nonce-based
 * CSP is tracked work, not a one-line config.
 *
 * Everything below is enforced by the browser regardless of framework
 * internals and costs nothing.
 */
const securityHeaders = [
  // Never let a browser second-guess a declared content type — this is what
  // turns an uploaded "image" into executable script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The app has no legitimate reason to be framed; blocks clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak the path a user came from (which can name an opportunity id)
  // to third-party origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Shuru asks for notification permission only. Nothing else is used, so
  // everything else is denied outright.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Force HTTPS for two years, subdomains included. Vercel serves HTTPS only;
  // this stops a downgrade on any custom domain.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Never ship the framework version in a response header.
  poweredByHeader: false,
  experimental: {
    // pdf-parse's internal requires break when webpack bundles them in dev;
    // resolve these natively in Node instead (server-side only).
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must not be cached, or a stale copy keeps
        // handling push events after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
