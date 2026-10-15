import { NextResponse, type NextRequest } from "next/server";
import { isPlatformHost, resolveTenantByHost } from "@rentweb/core/tenant";

export const config = {
  matcher: [
    // everything except static assets and Next internals
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|map|txt|woff2?|ttf|otf|mp4|webm|json)$).*)",
  ],
};

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export default async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();

  // Never allow direct access to internal route groups.
  if (url.pathname.startsWith("/rw/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Platform hosts (marketing site, admin redirects, api) pass through untouched.
  if (!host || isPlatformHost(host)) return NextResponse.next();

  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    const u = new URL("/site-status/no-site", req.url);
    u.searchParams.set("host", host.split(":")[0]!);
    return NextResponse.rewrite(u, { status: 404 });
  }
  if (!LIVE_STATUSES.has(tenant.status)) {
    return NextResponse.rewrite(new URL(`/site-status/suspended?status=${tenant.status}`, req.url), { status: 503 });
  }

  const rewritten = url.clone();
  rewritten.pathname = `/rw/${tenant.id}${url.pathname === "/" ? "" : url.pathname}`;

  const headers = new Headers(req.headers);
  headers.set("x-tenant-id", tenant.id);
  headers.set("x-tenant-slug", tenant.slug);
  headers.set("x-tenant-status", tenant.status);
  headers.set("x-tenant-host", host);

  const res = NextResponse.rewrite(rewritten, { request: { headers } });
  res.headers.set("x-tenant-id", tenant.id);
  return res;
}
