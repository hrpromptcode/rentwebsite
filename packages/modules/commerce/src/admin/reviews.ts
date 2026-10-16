import { and, count, desc, eq, sql } from "drizzle-orm";
import { products, reviews, type Tx } from "@rentweb/db";
import { audit, emitEvent, fail, ok, type Result } from "@rentweb/core";
import type { Actor } from "./orders";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface AdminReviewRow {
  id: string;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  productImage: string | null;
  authorName: string;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  status: string;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  orderId: string | null;
}

export async function listReviews(tx: Tx, tenantId: string, f: { status?: ReviewStatus | "all"; productId?: string | null; page?: number; perPage?: number } = {}): Promise<{ rows: AdminReviewRow[]; total: number; page: number; pages: number }> {
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 20));
  const page = Math.max(1, f.page ?? 1);
  const conds = [eq(reviews.tenantId, tenantId)];
  if (f.status && f.status !== "all") conds.push(eq(reviews.status, f.status));
  if (f.productId) conds.push(eq(reviews.productId, f.productId));
  const where = and(...conds);
  const [rows, [c]] = await Promise.all([
    tx
      .select({
        id: reviews.id,
        productId: reviews.productId,
        productName: products.name,
        productSlug: products.slug,
        productImages: products.images,
        authorName: reviews.authorName,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        images: reviews.images,
        status: reviews.status,
        reply: reviews.reply,
        repliedAt: reviews.repliedAt,
        createdAt: reviews.createdAt,
        orderId: reviews.orderId,
      })
      .from(reviews)
      .leftJoin(products, eq(products.id, reviews.productId))
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(reviews).where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map((r) => ({ ...r, productImage: r.productImages?.[0]?.url ?? null, images: r.images ?? [] })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function reviewStatusCounts(tx: Tx, tenantId: string): Promise<Record<ReviewStatus | "all", number>> {
  const [r] = await tx
    .select({
      all: count(),
      pending: sql<number>`count(*) filter (where ${reviews.status} = 'pending')::int`,
      approved: sql<number>`count(*) filter (where ${reviews.status} = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where ${reviews.status} = 'rejected')::int`,
    })
    .from(reviews)
    .where(eq(reviews.tenantId, tenantId));
  return { all: Number(r?.all ?? 0), pending: Number(r?.pending ?? 0), approved: Number(r?.approved ?? 0), rejected: Number(r?.rejected ?? 0) };
}

/** Recomputes products.ratingAvg (x100) and ratingCount from approved reviews. */
export async function recomputeProductRating(tx: Tx, tenantId: string, productId: string): Promise<{ ratingAvg: number; ratingCount: number }> {
  const [agg] = await tx
    .select({ n: count(), avg: sql<number>`coalesce(avg(${reviews.rating}), 0)` })
    .from(reviews)
    .where(and(eq(reviews.tenantId, tenantId), eq(reviews.productId, productId), eq(reviews.status, "approved")));
  const ratingCount = Number(agg?.n ?? 0);
  const ratingAvg = Math.round(Number(agg?.avg ?? 0) * 100);
  await tx.update(products).set({ ratingAvg, ratingCount }).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)));
  return { ratingAvg, ratingCount };
}

export async function setReviewStatus(tx: Tx, tenantId: string, id: string, status: ReviewStatus, actor: Actor): Promise<Result<{ status: ReviewStatus }>> {
  const [row] = await tx.select().from(reviews).where(and(eq(reviews.tenantId, tenantId), eq(reviews.id, id))).limit(1).for("update");
  if (!row) return fail("ไม่พบรีวิว", "not_found");
  if (row.status !== status) {
    await tx.update(reviews).set({ status }).where(and(eq(reviews.tenantId, tenantId), eq(reviews.id, id)));
    await recomputeProductRating(tx, tenantId, row.productId);
    await emitEvent(tx, { tenantId, type: status === "approved" ? "review.approved" : "review.rejected", payload: { reviewId: id, productId: row.productId, customerId: row.customerId } });
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: `review.${status}`, targetType: "review", targetId: id, diff: { productId: row.productId, rating: row.rating } });
  }
  return ok({ status });
}

export async function replyReview(tx: Tx, tenantId: string, id: string, reply: string | null, actor: Actor): Promise<Result<{ reply: string | null }>> {
  const text = reply?.trim() || null;
  const r = await tx
    .update(reviews)
    .set({ reply: text, repliedAt: text ? new Date() : null })
    .where(and(eq(reviews.tenantId, tenantId), eq(reviews.id, id)))
    .returning({ id: reviews.id, productId: reviews.productId, customerId: reviews.customerId });
  if (!r.length) return fail("ไม่พบรีวิว", "not_found");
  if (text) await emitEvent(tx, { tenantId, type: "review.replied", payload: { reviewId: id, productId: r[0]!.productId, customerId: r[0]!.customerId } });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "review.reply", targetType: "review", targetId: id });
  return ok({ reply: text });
}

export async function deleteReview(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const r = await tx.delete(reviews).where(and(eq(reviews.tenantId, tenantId), eq(reviews.id, id))).returning({ productId: reviews.productId });
  if (!r.length) return false;
  await recomputeProductRating(tx, tenantId, r[0]!.productId);
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "review.delete", targetType: "review", targetId: id });
  return true;
}
