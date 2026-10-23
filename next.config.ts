import type { NextConfig } from "next";

const securityHeaders = [
  // Nobody may frame these pages (stops clickjacking a signer into signing).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Signing links carry a secret token; never leak it via the Referer header.
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  // The `postgres` driver uses Node APIs; keep it out of the bundler.
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  // Self-contained server build for Docker (ignored by Vercel).
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
