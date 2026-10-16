import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Load the monorepo root .env so every app shares one configuration file.
loadEnv({ path: path.resolve(process.cwd(), "../../.env") });

/**
 * User uploads (/uploads/**: slips, media, logos) are attacker-influenced bytes served from every tenant origin:
 * never let the browser sniff them into HTML and never let them run script (an SVG/HTML opened directly is
 * sandboxed into an opaque origin). PDFs download instead of opening in the (sandbox-blocked) viewer.
 */
const UPLOAD_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@rentweb/core", "@rentweb/db", "@rentweb/ui", "@rentweb/storefront", "@rentweb/templates", "@rentweb/i18n", "@rentweb/module-commerce", "@rentweb/module-booking", "@rentweb/module-topup", "@rentweb/module-restaurant"],
  serverExternalPackages: ["postgres"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "localhost" }],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
    serverActions: { bodySizeLimit: "12mb" },
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/uploads/:path*", headers: UPLOAD_HEADERS },
      { source: "/uploads/:path(.*\\.pdf)", headers: [{ key: "Content-Disposition", value: "attachment" }] },
    ];
  },
};

export default nextConfig;
