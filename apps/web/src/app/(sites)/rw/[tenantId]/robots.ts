import type { MetadataRoute } from "next";
import { getRuntime } from "@/lib/tenant";
import { currentHost } from "@/lib/tenant";

export default async function robots({ params }: { params: Promise<{ tenantId: string }> }): Promise<MetadataRoute.Robots> {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  const host = await currentHost();
  const proto = host.includes("localhost") ? "http" : "https";
  const indexable = runtime?.config.status === "active";
  return {
    rules: indexable ? [{ userAgent: "*", allow: "/", disallow: ["/account", "/cart", "/checkout", "/api/", "/t/"] }] : [{ userAgent: "*", disallow: "/" }],
    sitemap: indexable ? `${proto}://${host}/sitemap.xml` : undefined,
  };
}
