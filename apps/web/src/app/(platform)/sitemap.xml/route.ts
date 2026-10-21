import { listTemplates } from "@rentweb/templates";
import { platformLinks } from "@/components/platform/platform-data";

/** sitemap.xml for the platform host: marketing pages + one page per template (tenant hosts: /rw/<id>/sitemap.xml). */
export function GET() {
  const { origin } = platformLinks();
  const paths = ["/", "/templates", "/features", "/pricing", ...listTemplates().map((t) => `/templates/${t.key}`)];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((p) => `  <url><loc>${origin}${p === "/" ? "" : p}</loc><changefreq>weekly</changefreq><priority>${p === "/" ? "1.0" : p.split("/").length > 2 ? "0.7" : "0.8"}</priority></url>`),
    "</urlset>",
    "",
  ].join("\n");
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
