import { and, asc, count, eq, sql } from "drizzle-orm";
import { categories, products, type Tx } from "@rentweb/db";

export interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  sort: number;
  productCount: number;
}

/** Categories ordered by sort with the number of active products in each. */
export async function listCategories(tx: Tx, tenantId: string, opts: { limit?: number; withEmpty?: boolean } = {}): Promise<CategoryWithCount[]> {
  const rows = await tx
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      image: categories.image,
      parentId: categories.parentId,
      sort: categories.sort,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.tenantId, tenantId), eq(products.status, "active")))
    .where(eq(categories.tenantId, tenantId))
    .groupBy(categories.id)
    .orderBy(asc(categories.sort), asc(categories.name))
    .limit(opts.limit ?? 100);
  const out = rows.map((r) => ({ ...r, productCount: Number(r.productCount) }));
  return opts.withEmpty ? out : out.filter((c) => c.productCount > 0 || !!c.image);
}

export async function getCategoryBySlug(tx: Tx, tenantId: string, slug: string): Promise<CategoryWithCount | null> {
  const [row] = await tx.select().from(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.slug, slug))).limit(1);
  if (!row) return null;
  const [c] = await tx
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.categoryId, row.id), eq(products.status, "active")));
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: row.image,
    parentId: row.parentId,
    sort: row.sort,
    productCount: Number(c?.n ?? 0),
  };
}
