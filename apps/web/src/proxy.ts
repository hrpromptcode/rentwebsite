import { NextResponse, type NextRequest } from "next/server";
import { isPlatformHost, resolveTenantByHost } from "@rentweb/core/tenant";

export const config = {
  matcher: [
    // Internal tenant routes are ALWAYS guarded, also for asset-looking paths like /rw/<id>/x.png (SEC-004).
    "/rw",
    "/rw/:path*",
    // Everything except static assets and Next internals. The dot must reach the regex escaped
    // ("\\." in this string literal): with a bare "." a slug such as /services/pico or
    // /products/nodejs counted as an ".ico"/".js" file and skipped tenant resolution (SBR-008).
    "/((?!_next/|favicon\\.ico|uploads/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|map|woff2?|ttf|otf|mp4|webm)$).*)",
  ],
};

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/** /rw/* is the internal rewrite target; also catch encoded or doubled-slash spellings of it. */
function isInternalPath(pathname: string): boolean {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    /* keep raw */
  }
  return /^\/+rw(?:\/|$)/i.test(p);
}

export default async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();

  // Never allow direct access to internal route groups.
  if (isInternalPath(url.pathname)) {
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
  // public path ("/", "/cart" …) for the tenant layout: route kind on <html> + home-only preloader (no inline route script)
  headers.set("x-tenant-path", url.pathname);

  const res = NextResponse.rewrite(rewritten, { request: { headers } });
  res.headers.set("x-tenant-id", tenant.id);
  return res;
}
