import { NextResponse } from "next/server";
import { boardSnapshot } from "@rentweb/module-restaurant/admin";
import { getSession } from "@/lib/session";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { absolutizeSnapshot } from "../../_components/urls";

export const dynamic = "force-dynamic";

/** Live feed for the orders board (polled every 5s by the client). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) return NextResponse.json({ error: "module disabled" }, { status: 404 });
  const snap = await tenantTx(ctx.tenant.id, (tx) => boardSnapshot(tx, ctx.tenant.id));
  return NextResponse.json(absolutizeSnapshot(snap), { headers: { "cache-control": "no-store" } });
}
