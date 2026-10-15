import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Load the monorepo root .env so every app shares one configuration file.
loadEnv({ path: path.resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@rentweb/core", "@rentweb/db", "@rentweb/ui", "@rentweb/storefront", "@rentweb/templates", "@rentweb/i18n", "@rentweb/integrations", "@rentweb/module-commerce", "@rentweb/module-booking", "@rentweb/module-topup", "@rentweb/module-restaurant"],
  serverExternalPackages: ["postgres"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "localhost" }],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  poweredByHeader: false,
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  outputFileTracingRoot: path.resolve(process.cwd(), "../../"),
};

export default nextConfig;
