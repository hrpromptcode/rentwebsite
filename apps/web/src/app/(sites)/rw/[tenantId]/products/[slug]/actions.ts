"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createReview } from "@rentweb/module-commerce/services";
import type { ReviewState } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";

const schema = z.object({
  authorName: z.string().trim().min(1).max(80),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(2000).optional(),
});

/** Stores a pending review (the shop approves it in the admin). Bound to (tenantId, productId, slug). */
export async function createReviewAction(tenantId: string, productId: string, slug: string, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  const parsed = schema.safeParse({ authorName: form.get("authorName"), rating: form.get("rating"), title: form.get("title") || undefined, body: form.get("body") || undefined });
  if (!parsed.success) return { error: L.errRequired };
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) return { error: L.errGeneric };
  const customer = await getCurrentCustomer(tenantId);
  const r = await tenantTx(tenantId, (tx) => createReview(tx, tenantId, { productId, customerId: customer?.id ?? null, ...parsed.data }));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/products/${slug}`);
  return { done: true };
}
