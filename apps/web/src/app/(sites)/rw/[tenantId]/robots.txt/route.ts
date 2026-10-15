import { currentHost, getRuntime } from "@/lib/tenant";

export async function GET(_req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  const host = await currentHost();
  const proto = host.includes("localhost") ? "http" : "https";
  const indexable = runtime?.config.status === "active";
  const body = indexable
    ? ["User-agent: *", "Allow: /", "Disallow: /account", "Disallow: /cart", "Disallow: /checkout", "Disallow: /api/", "Disallow: /t/", "", `Sitemap: ${proto}://${host}/sitemap.xml`, ""].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
