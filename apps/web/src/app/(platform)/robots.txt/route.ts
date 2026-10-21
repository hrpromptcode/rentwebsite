import { platformLinks } from "@/components/platform/platform-data";

/** robots.txt for the platform host (tenant hosts are rewritten to /rw/<id>/robots.txt by the proxy). */
export function GET() {
  const { origin } = platformLinks();
  const body = ["User-agent: *", "Allow: /", "Disallow: /lab", "Disallow: /site-status", "Disallow: /api/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
