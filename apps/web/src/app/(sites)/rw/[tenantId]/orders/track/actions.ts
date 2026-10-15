"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { findOrderByNumberAndContact } from "@rentweb/module-commerce/services";
import type { TrackState } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";

const schema = z.object({ number: z.string().trim().min(1).max(20), contact: z.string().trim().min(3).max(160) });

/** Guest lookup by order number + phone/email; redirects to the order page with its access key. */
export async function trackOrderAction(tenantId: string, _prev: TrackState, form: FormData): Promise<TrackState> {
  const parsed = schema.safeParse({ number: form.get("number"), contact: form.get("contact") });
  if (!parsed.success) return { error: L.trackNotFound };
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) return { error: L.errGeneric };
  const found = await tenantTx(tenantId, (tx) => findOrderByNumberAndContact(tx, tenantId, parsed.data.number, parsed.data.contact));
  if (!found) return { error: L.trackNotFound };
  redirect(`/orders/${found.id}${found.accessKey ? `?k=${encodeURIComponent(found.accessKey)}` : ""}`);
}
