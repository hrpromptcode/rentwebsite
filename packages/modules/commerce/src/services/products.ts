import { and, arrayOverlaps, asc, count, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { categories, productVariants, products, reviews, type Tx } from "@rentweb/db";

export type ProductRow = typeof products.$inferSelect;
export type VariantRow = typeof productVariants.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;

export type ProductSort = "newest" | "price_asc" | "price_desc" | "best_selling";
export const PRODUCT_SORTS: ProductSort[] = ["newest", "price_asc", "price_desc", "best_selling"];

export interface ListProductsInput {
  /** category slug */
  category?: string | null;
  categoryId?: string | null;
  q?: string | null;
  tags?: string[];
  /** satang */
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: ProductSort | null;
  page?: number;
  perPage?: number;
  featured?: boolean;
  status?: "active" | "draft" | "archived" | "all";
  excludeId?: string | null;
}

/** Serializable card data used by sections, listing pages and the cart. */
export interface ProductCard {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  images: Array<{ url: string; alt?: string }>;
  hasVariants: boolean;
  trackInventory: boolean;
  type: string;
  /** null = not tracked (unlimited) */
  stock: number | null;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  tags: string[];
  featured: boolean;
  categoryId: string | null;
  publishedAt: string | null;
}

export interface ProductListResult {
  items: ProductCard[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

/** Available quantity: null when inventory is not tracked (services / unlimited). */
export function availableStock(
  p: Pick<ProductRow, "trackInventory" | "hasVariants" | "stock" | "type">,
  variants?: Array<Pick<VariantRow, "stock" | "active">> | null,
): number | null {
  if (!p.trackInventory || p.type === "service") return null;
  if (p.hasVariants) return (variants ?? []).filter((v) => v.active).reduce((s, v) => s + Math.max(0, v.stock), 0);
  return Math.max(0, p.stock);
}

export function variantAvailable(p: Pick<ProductRow, "trackInventory" | "type">, v: Pick<VariantRow, "stock" | "active">): number | null {
  if (!v.active) return 0;
  if (!p.trackInventory || p.type === "service") return null;
  return Math.max(0, v.stock);
}

export function isPurchasable(stock: number | null): boolean {
  return stock === null || stock > 0;
}

export function toCard(p: ProductRow, stock: number | null): ProductCard {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    images: p.images ?? [],
    hasVariants: p.hasVariants,
    trackInventory: p.trackInventory,
    type: p.type,
    stock,
    soldCount: p.soldCount,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    tags: p.tags ?? [],
    featured: p.featured,
    categoryId: p.categoryId,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  };
}

/** Sum of active variant stock per product (one query for a page of products). */
export async function variantStockByProduct(tx: Tx, tenantId: string, productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!productIds.length) return map;
  const rows = await tx
    .select({ productId: productVariants.productId, stock: sql<number>`coalesce(sum(greatest(${productVariants.stock}, 0)), 0)::int` })
    .from(productVariants)
    .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.active, true), inArray(productVariants.productId, productIds)))
    .groupBy(productVariants.productId);
  for (const r of rows) map.set(r.productId, Number(r.stock));
  return map;
}

export async function toCards(tx: Tx, tenantId: string, rows: ProductRow[]): Promise<ProductCard[]> {
  const variantIds = rows.filter((r) => r.hasVariants).map((r) => r.id);
  const vstock = await variantStockByProduct(tx, tenantId, variantIds);
  return rows.map((p) => toCard(p, p.hasVariants ? (p.trackInventory && p.type !== "service" ? (vstock.get(p.id) ?? 0) : null) : availableStock(p)));
}

function sortClause(sort: ProductSort | null | undefined): SQL[] {
  switch (sort) {
    case "price_asc":
      return [asc(products.price), asc(products.sort)];
    case "price_desc":
      return [desc(products.price), asc(products.sort)];
    case "best_selling":
      return [desc(products.soldCount), asc(products.sort)];
    case "newest":
      return [desc(sql`coalesce(${products.publishedAt}, ${products.createdAt})`), desc(products.createdAt)];
    default:
      return [asc(products.sort), desc(sql`coalesce(${products.publishedAt}, ${products.createdAt})`)];
  }
}

export async function listProducts(tx: Tx, tenantId: string, input: ListProductsInput = {}): Promise<ProductListResult> {
  const perPage = Math.min(48, Math.max(1, input.perPage ?? 24));
  const page = Math.max(1, input.page ?? 1);
  const conds: SQL[] = [eq(products.tenantId, tenantId)];
  const status = input.status ?? "active";
  if (status !== "all") conds.push(eq(products.status, status));
  if (input.featured) conds.push(eq(products.featured, true));
  if (input.excludeId) conds.push(ne(products.id, input.excludeId));
  if (input.categoryId) conds.push(eq(products.categoryId, input.categoryId));
  if (input.category) {
    const sub = tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), or(eq(categories.slug, input.category), eq(categories.parentId, tx.select({ id: categories.id }).from(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.slug, input.category))).limit(1)))));
    conds.push(inArray(products.categoryId, sub));
  }
  if (input.q && input.q.trim()) {
    const q = `%${input.q.trim().replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(products.name, q), ilike(products.shortDescription, q), ilike(products.sku, q))!);
  }
  if (input.tags?.length) conds.push(arrayOverlaps(products.tags, input.tags));
  if (input.minPrice != null && input.minPrice > 0) conds.push(gte(products.price, input.minPrice));
  if (input.maxPrice != null && input.maxPrice > 0) conds.push(lte(products.price, input.maxPrice));

  const where = and(...conds);
  const [[totalRow], rows] = await Promise.all([
    tx.select({ n: count() }).from(products).where(where),
    tx
      .select()
      .from(products)
      .where(where)
      .orderBy(...sortClause(input.sort))
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);
  const total = Number(totalRow?.n ?? 0);
  const items = await toCards(tx, tenantId, rows);
  return { items, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export interface ProductDetail {
  product: ProductRow;
  variants: VariantRow[];
  reviews: ReviewRow[];
  category: CategoryRow | null;
  stock: number | null;
}

export async function getProductBySlug(tx: Tx, tenantId: string, slug: string, opts: { includeDraft?: boolean } = {}): Promise<ProductDetail | null> {
  const conds = [eq(products.tenantId, tenantId), eq(products.slug, slug)];
  if (!opts.includeDraft) conds.push(eq(products.status, "active"));
  const [product] = await tx.select().from(products).where(and(...conds)).limit(1);
  if (!product) return null;
  const [variants, productReviews, cats] = await Promise.all([
    product.hasVariants
      ? tx
          .select()
          .from(productVariants)
          .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, product.id), eq(productVariants.active, true)))
          .orderBy(asc(productVariants.position))
      : Promise.resolve([] as VariantRow[]),
    tx
      .select()
      .from(reviews)
      .where(and(eq(reviews.tenantId, tenantId), eq(reviews.productId, product.id), eq(reviews.status, "approved")))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
    product.categoryId ? tx.select().from(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.id, product.categoryId))).limit(1) : Promise.resolve([] as CategoryRow[]),
  ]);
  return { product, variants, reviews: productReviews, category: cats[0] ?? null, stock: availableStock(product, variants) };
}

export async function getProductById(tx: Tx, tenantId: string, id: string): Promise<ProductRow | null> {
  const [row] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id))).limit(1);
  return row ?? null;
}

/** Same category first, then best sellers; never the product itself. */
export async function getRelatedProducts(tx: Tx, tenantId: string, product: Pick<ProductRow, "id" | "categoryId">, limit = 4): Promise<ProductCard[]> {
  let rows: ProductRow[] = [];
  if (product.categoryId) {
    rows = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.status, "active"), eq(products.categoryId, product.categoryId), ne(products.id, product.id)))
      .orderBy(desc(products.soldCount))
      .limit(limit);
  }
  if (rows.length < limit) {
    const ids = [product.id, ...rows.map((r) => r.id)];
    const more = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.status, "active"), sql`${products.id} not in ${ids}`))
      .orderBy(desc(products.soldCount))
      .limit(limit - rows.length);
    rows = [...rows, ...more];
  }
  return toCards(tx, tenantId, rows);
}

/** Lightweight search for the header / API: top matches by name. */
export async function searchProducts(tx: Tx, tenantId: string, q: string, limit = 8): Promise<ProductCard[]> {
  const term = q.trim();
  if (!term) return [];
  const r = await listProducts(tx, tenantId, { q: term, perPage: limit, sort: "best_selling" });
  return r.items;
}

/** Badge helpers shared by cards (ใหม่ / ขายดี / หมด). */
export const NEW_WINDOW_DAYS = 14;
export const BEST_SELLER_MIN = 150;

export function productBadge(p: Pick<ProductCard, "stock" | "soldCount" | "publishedAt" | "tags" | "type">): "soldout" | "best" | "new" | "preorder" | null {
  if (p.stock !== null && p.stock <= 0) return "soldout";
  if (p.type === "preorder") return "preorder";
  if (p.soldCount >= BEST_SELLER_MIN || p.tags.includes("ขายดี")) return "best";
  if (p.tags.includes("ใหม่")) return "new";
  if (p.publishedAt && Date.now() - new Date(p.publishedAt).getTime() < NEW_WINDOW_DAYS * 86_400_000) return "new";
  return null;
}
