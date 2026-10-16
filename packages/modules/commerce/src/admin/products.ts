import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { categories, inventoryMovements, productVariants, products, type Tx } from "@rentweb/db";
import { audit, fail, ok, slugify, type Result } from "@rentweb/core";
import type { CategoryRow, ProductRow, VariantRow } from "../services/products";
import type { Actor } from "./orders";
import { descriptionToHtml, type ProductValues } from "./schemas";
import type { z } from "zod";
import type { categorySchema } from "./schemas";
import { qualified } from "./sql";

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export interface ProductListFilters {
  q?: string | null;
  status?: string | null;
  categoryId?: string | null;
  page?: number;
  perPage?: number;
}

export interface ProductListRow {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  image: string | null;
  price: number;
  minPrice: number;
  maxPrice: number;
  status: string;
  featured: boolean;
  hasVariants: boolean;
  trackInventory: boolean;
  type: string;
  /** null = not tracked */
  stock: number | null;
  variantCount: number;
  categoryName: string | null;
  lowStockThreshold: number;
  updatedAt: Date;
}

export async function listAdminProducts(tx: Tx, tenantId: string, f: ProductListFilters = {}): Promise<{ rows: ProductListRow[]; total: number; page: number; pages: number; perPage: number }> {
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(products.tenantId, tenantId)];
  if (f.status && f.status !== "all") conds.push(eq(products.status, f.status));
  else if (!f.status) conds.push(ne(products.status, "archived"));
  if (f.categoryId) conds.push(eq(products.categoryId, f.categoryId));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.slug, like), sql`exists (select 1 from ${productVariants} v where v.product_id = ${qualified(products.id)} and v.sku ilike ${like})`)!);
  }
  const where = and(...conds)!;
  const vstock = sql<number>`coalesce((select sum(greatest(v.stock,0)) from ${productVariants} v where v.product_id = ${qualified(products.id)} and v.active = true), 0)::int`;
  const vcount = sql<number>`(select count(*) from ${productVariants} v where v.product_id = ${qualified(products.id)})::int`;
  const vmin = sql<number>`coalesce((select min(v.price) from ${productVariants} v where v.product_id = ${qualified(products.id)} and v.active = true), ${products.price})::int`;
  const vmax = sql<number>`coalesce((select max(v.price) from ${productVariants} v where v.product_id = ${qualified(products.id)} and v.active = true), ${products.price})::int`;
  const [rows, [c]] = await Promise.all([
    tx
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        sku: products.sku,
        images: products.images,
        price: products.price,
        status: products.status,
        featured: products.featured,
        hasVariants: products.hasVariants,
        trackInventory: products.trackInventory,
        type: products.type,
        stock: products.stock,
        lowStockThreshold: products.lowStockThreshold,
        updatedAt: products.updatedAt,
        categoryName: categories.name,
        vstock,
        vcount,
        vmin,
        vmax,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.sort), desc(products.updatedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(products).where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sku: r.sku,
      image: r.images?.[0]?.url ?? null,
      price: r.price,
      minPrice: r.hasVariants ? Number(r.vmin) : r.price,
      maxPrice: r.hasVariants ? Number(r.vmax) : r.price,
      status: r.status,
      featured: r.featured,
      hasVariants: r.hasVariants,
      trackInventory: r.trackInventory,
      type: r.type,
      stock: r.trackInventory && r.type !== "service" ? (r.hasVariants ? Number(r.vstock) : r.stock) : null,
      variantCount: Number(r.vcount),
      categoryName: r.categoryName,
      lowStockThreshold: r.lowStockThreshold,
      updatedAt: r.updatedAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  };
}

export async function productStatusCounts(tx: Tx, tenantId: string): Promise<Record<"all" | "active" | "draft" | "archived", number>> {
  const [r] = await tx
    .select({
      active: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
      draft: sql<number>`count(*) filter (where ${products.status} = 'draft')::int`,
      archived: sql<number>`count(*) filter (where ${products.status} = 'archived')::int`,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  const active = Number(r?.active ?? 0);
  const draft = Number(r?.draft ?? 0);
  const archived = Number(r?.archived ?? 0);
  return { all: active + draft, active, draft, archived };
}

// ---------------------------------------------------------------------------
// detail + save
// ---------------------------------------------------------------------------

export interface AdminProduct {
  product: ProductRow;
  variants: VariantRow[];
}

export async function getAdminProduct(tx: Tx, tenantId: string, id: string): Promise<AdminProduct | null> {
  const [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id))).limit(1);
  if (!product) return null;
  const variants = await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, id))).orderBy(asc(productVariants.position), asc(productVariants.createdAt));
  return { product, variants };
}

async function slugTaken(tx: Tx, tenantId: string, slug: string, excludeId?: string | null): Promise<boolean> {
  const conds = [eq(products.tenantId, tenantId), eq(products.slug, slug)];
  if (excludeId) conds.push(ne(products.id, excludeId));
  const [r] = await tx.select({ id: products.id }).from(products).where(and(...conds)).limit(1);
  return !!r;
}

export async function uniqueProductSlug(tx: Tx, tenantId: string, base: string, excludeId?: string | null): Promise<string> {
  let slug = slugify(base);
  let n = 2;
  while (await slugTaken(tx, tenantId, slug, excludeId)) slug = `${slugify(base)}-${n++}`;
  return slug;
}

export type SaveProductError = { field: string; message: string };

export interface SaveProductResult {
  id: string;
  slug: string;
  /** live stock after the save (the form shows it and uses it as the next baseline) */
  stock: number;
  variants: Array<{ id: string; title: string; stock: number }>;
}

/**
 * Stock to write for one row (COR-32). New rows (`live` null) take the form value. Existing rows only change by
 * what the user changed in the form: `loaded` is the value the form was opened with and the difference is applied
 * as a delta on the live value, so sales made while the form was open are kept and an unchanged field is not
 * written. Without `loaded` (a stale form from before this fix) live stock is never overwritten.
 * Returns null when nothing should be written.
 */
export function stockWrite(live: number | null, wanted: number, loaded: number | null | undefined): { next: number; delta: number } | null {
  if (live === null) return { next: wanted, delta: wanted };
  if (loaded === null || loaded === undefined) return null;
  if (wanted === loaded) return null;
  const next = Math.max(0, live + (wanted - loaded));
  return next === live ? null : { next, delta: next - live };
}

/** Creates or updates a product and syncs its variant rows (insert / update / delete missing). */
export async function saveProduct(tx: Tx, tenantId: string, id: string | null, v: ProductValues, actor: Actor): Promise<Result<SaveProductResult, SaveProductError>> {
  const slug = slugify(v.slug);
  if (await slugTaken(tx, tenantId, slug, id)) return fail({ field: "slug", message: "slug นี้ถูกใช้แล้ว กรุณาเปลี่ยน" }, "slug");
  if (v.categoryId) {
    const [cat] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.id, v.categoryId))).limit(1);
    if (!cat) return fail({ field: "categoryId", message: "ไม่พบหมวดหมู่" }, "category");
  }
  const skus = [v.sku, ...v.variants.map((x) => x.sku)].filter((s): s is string => !!s && s.trim().length > 0).map((s) => s.trim());
  if (new Set(skus).size !== skus.length) return fail({ field: "variants", message: "SKU ซ้ำกันภายในสินค้า" }, "sku");
  if (skus.length) {
    const conds = [eq(productVariants.tenantId, tenantId), inArray(productVariants.sku, skus)];
    if (id) conds.push(ne(productVariants.productId, id));
    const [dup] = await tx.select({ sku: productVariants.sku }).from(productVariants).where(and(...conds)).limit(1);
    if (dup) return fail({ field: "variants", message: `SKU ${dup.sku} ถูกใช้โดยสินค้าอื่นแล้ว` }, "sku");
  }

  const hasVariants = v.options.length > 0 && v.variants.length > 0;
  const activeVariants = v.variants.filter((x) => x.active);
  const basePrice = hasVariants && activeVariants.length ? Math.min(...activeVariants.map((x) => x.price)) : v.price;
  if (id) {
    // row locks: checkout decrements stock under the same locks, so the delta below is applied to the live value
    await tx.select({ id: products.id }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id))).for("update");
    await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, id))).orderBy(asc(productVariants.id)).for("update");
  }
  const existing = id ? await getAdminProduct(tx, tenantId, id) : null;
  if (id && !existing) return fail({ field: "_", message: "ไม่พบสินค้า" }, "not_found");
  const now = new Date();
  const publishedAt = v.status === "active" ? (existing?.product.publishedAt ?? now) : (existing?.product.publishedAt ?? null);

  const movements: Array<{ variantId: string | null; delta: number }> = [];
  // product-level stock (only used without variants); a switch between simple/variants is written absolutely
  let productStock: number | undefined;
  if (hasVariants) productStock = 0;
  else {
    // switching a variant product back to a simple one: the product-level stock was 0, the form value is absolute
    const sameShape = !!existing && !existing.product.hasVariants;
    const w = stockWrite(existing && sameShape ? existing.product.stock : null, v.stock, v.stockLoaded);
    if (w) {
      productStock = w.next;
      if (existing && w.delta !== 0) movements.push({ variantId: null, delta: w.delta });
    }
  }

  const values = {
    name: v.name,
    slug,
    shortDescription: v.shortDescription,
    description: descriptionToHtml(v.description),
    categoryId: v.categoryId,
    images: v.images.map((im) => ({ url: im.url, alt: im.alt || v.name, ...(im.mediaId ? { mediaId: im.mediaId } : {}) })),
    price: basePrice,
    compareAtPrice: v.compareAtPrice,
    costPrice: v.costPrice,
    type: v.type,
    status: v.status,
    hasVariants,
    options: hasVariants ? v.options.map((o) => ({ name: o.name.trim(), values: o.values.map((x) => x.trim()).filter(Boolean) })) : [],
    trackInventory: v.trackInventory,
    ...(productStock !== undefined ? { stock: productStock } : {}),
    lowStockThreshold: v.lowStockThreshold,
    weightGrams: v.weightGrams,
    sku: v.sku,
    tags: [...new Set(v.tags.map((t) => t.trim()).filter(Boolean))],
    featured: v.featured,
    seo: { ...(existing?.product.seo ?? {}), title: v.seoTitle ?? undefined, description: v.seoDescription ?? undefined },
    publishedAt,
  };

  let productId = id;
  if (productId) {
    await tx.update(products).set(values).where(and(eq(products.tenantId, tenantId), eq(products.id, productId)));
  } else {
    const [row] = await tx
      .insert(products)
      .values({ tenantId, ...values, stock: productStock ?? 0 })
      .returning({ id: products.id });
    productId = row!.id;
  }

  // ---- variants sync -------------------------------------------------------
  const existingById = new Map((existing?.variants ?? []).map((x) => [x.id, x]));
  const keep = new Set<string>();
  if (hasVariants) {
    let pos = 0;
    for (const x of v.variants) {
      const live = x.id ? existingById.get(x.id) : undefined;
      const wanted = v.trackInventory ? x.stock : 0;
      const w = !v.trackInventory ? (live && live.stock === 0 ? null : { next: 0, delta: 0 - (live?.stock ?? 0) }) : stockWrite(live ? live.stock : null, wanted, x.stockLoaded);
      const data = {
        title: x.title.trim(),
        optionValues: x.optionValues,
        sku: x.sku?.trim() || null,
        price: x.price,
        compareAtPrice: x.compareAtPrice,
        ...(w ? { stock: w.next } : {}),
        active: x.active,
        position: pos++,
      };
      if (live) {
        await tx.update(productVariants).set(data).where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, live.id)));
        if (w && w.delta !== 0) movements.push({ variantId: live.id, delta: w.delta });
        keep.add(live.id);
      } else {
        const [row] = await tx
          .insert(productVariants)
          .values({ tenantId, productId, ...data, stock: w?.next ?? wanted })
          .returning({ id: productVariants.id });
        keep.add(row!.id);
      }
    }
  }
  const toDelete = [...existingById.keys()].filter((x) => !keep.has(x));
  if (toDelete.length) await tx.delete(productVariants).where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, toDelete)));
  if (movements.length && v.trackInventory) {
    await tx.insert(inventoryMovements).values(
      movements.map((m) => ({ tenantId, productId: productId!, variantId: m.variantId, delta: m.delta, reason: "adjustment", refType: "product", refId: productId!, note: "แก้ไขสต็อกในหน้าสินค้า", createdBy: actor.userId })),
    );
  }

  await audit(tx, {
    tenantId,
    actorType: actor.actorType,
    actorId: actor.userId,
    action: id ? "product.update" : "product.create",
    targetType: "product",
    targetId: productId,
    diff: { name: v.name, status: v.status, price: basePrice, variants: hasVariants ? v.variants.length : 0, stockChanges: movements },
  });
  const fresh = (await getAdminProduct(tx, tenantId, productId))!;
  return ok({ id: productId, slug, stock: fresh.product.stock, variants: fresh.variants.map((x) => ({ id: x.id, title: x.title, stock: x.stock })) });
}

export async function setProductsStatus(tx: Tx, tenantId: string, ids: string[], status: "active" | "draft" | "archived", actor: Actor): Promise<number> {
  if (!ids.length) return 0;
  const r = await tx
    .update(products)
    .set({ status, ...(status === "active" ? { publishedAt: sql`coalesce(${products.publishedAt}, now())` } : {}) })
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)))
    .returning({ id: products.id });
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: `product.bulk_${status}`, targetType: "product", diff: { ids: r.map((x) => x.id) } });
  return r.length;
}

export async function setProductFeatured(tx: Tx, tenantId: string, id: string, featured: boolean): Promise<boolean> {
  const r = await tx.update(products).set({ featured }).where(and(eq(products.tenantId, tenantId), eq(products.id, id))).returning({ id: products.id });
  return r.length > 0;
}

/** Delete = archive (orders keep referencing the product). */
export async function archiveProduct(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const n = await setProductsStatus(tx, tenantId, [id], "archived", actor);
  return n > 0;
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export interface AdminCategory extends CategoryRow {
  productCount: number;
}

export async function listAdminCategories(tx: Tx, tenantId: string): Promise<AdminCategory[]> {
  const rows = await tx
    .select({ cat: categories, productCount: sql<number>`(select count(*) from ${products} p where p.category_id = ${qualified(categories.id)})::int` })
    .from(categories)
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.sort), asc(categories.name));
  return rows.map((r) => ({ ...r.cat, productCount: Number(r.productCount) }));
}

export async function saveCategory(tx: Tx, tenantId: string, id: string | null, v: z.output<typeof categorySchema>, actor: Actor): Promise<Result<{ id: string }, SaveProductError>> {
  const slug = slugify(v.slug);
  const conds = [eq(categories.tenantId, tenantId), eq(categories.slug, slug)];
  if (id) conds.push(ne(categories.id, id));
  const [dup] = await tx.select({ id: categories.id }).from(categories).where(and(...conds)).limit(1);
  if (dup) return fail({ field: "slug", message: "slug นี้ถูกใช้แล้ว" }, "slug");
  if (v.parentId && v.parentId === id) return fail({ field: "parentId", message: "หมวดหมู่เป็นหมวดแม่ของตัวเองไม่ได้" }, "parent");
  const data = { name: v.name, slug, description: v.description, image: v.image, parentId: v.parentId, sort: v.sort };
  let catId = id;
  if (catId) await tx.update(categories).set(data).where(and(eq(categories.tenantId, tenantId), eq(categories.id, catId)));
  else {
    const [row] = await tx.insert(categories).values({ tenantId, ...data }).returning({ id: categories.id });
    catId = row!.id;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: id ? "category.update" : "category.create", targetType: "category", targetId: catId, diff: { name: v.name } });
  return ok({ id: catId });
}

export async function deleteCategory(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<{ detached: number }>> {
  const [row] = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.id, id))).limit(1);
  if (!row) return fail("ไม่พบหมวดหมู่", "not_found");
  const detached = await tx.update(products).set({ categoryId: null }).where(and(eq(products.tenantId, tenantId), eq(products.categoryId, id))).returning({ id: products.id });
  await tx.update(categories).set({ parentId: null }).where(and(eq(categories.tenantId, tenantId), eq(categories.parentId, id)));
  await tx.delete(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "category.delete", targetType: "category", targetId: id, diff: { name: row.name, detached: detached.length } });
  return ok({ detached: detached.length });
}

export async function reorderCategories(tx: Tx, tenantId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await tx.update(categories).set({ sort: i }).where(and(eq(categories.tenantId, tenantId), eq(categories.id, orderedIds[i]!)));
  }
}
