import "server-only";
import { sql, type Tx } from "@rentweb/db";

/**
 * ADMIN_B2-17: where a media-library file is referenced, so deleting it can say what will break.
 * Matches on the storage key (tenants/<id>/<folder>/<file>), which is part of both the relative
 * (/uploads/...) and the absolute (CDN / storefront-origin) form of the URL.
 */
export interface MediaUsage {
  kind: string;
  label: string;
  /** admin path relative to /t/<slug>, when there is an edit page */
  href?: string;
}

interface Source {
  table: string;
  cols: string[];
  kind: string;
  href?: (id: string) => string;
}

// identifiers are constants (never user input); every table is tenant-scoped (tenant_id + RLS)
const SOURCES: Source[] = [
  { table: "pages", cols: ["sections", "published_sections", "seo", "draft_meta"], kind: "หน้าเว็บ", href: (id) => `/pages/${id}` },
  { table: "posts", cols: ["cover_image"], kind: "บทความ" },
  { table: "products", cols: ["images"], kind: "สินค้า", href: (id) => `/products/${id}` },
  { table: "product_variants", cols: ["image"], kind: "ตัวเลือกสินค้า" },
  { table: "categories", cols: ["image"], kind: "หมวดสินค้า", href: () => `/products/categories` },
  { table: "services", cols: ["image"], kind: "บริการ", href: (id) => `/services/${id}` },
  { table: "staff", cols: ["avatar"], kind: "พนักงาน", href: (id) => `/staff/${id}` },
  { table: "clinic_packages", cols: ["image"], kind: "แพ็กเกจคลินิก" },
  { table: "menu_categories", cols: ["image"], kind: "หมวดเมนู" },
  { table: "menu_items", cols: ["image"], kind: "เมนูอาหาร", href: (id) => `/restaurant/menu/items/${id}` },
  { table: "games", cols: ["image"], kind: "เกม" },
  { table: "game_packages", cols: ["image"], kind: "แพ็กเกจเกม" },
];

function likeNeedle(key: string): string {
  return `%${key.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function findMediaUsage(tx: Tx, tenantId: string, media: { key: string; url: string }, tenantTheme: unknown): Promise<MediaUsage[]> {
  const needle = likeNeedle(media.key || media.url);
  const out: MediaUsage[] = [];
  for (const s of SOURCES) {
    const where = sql.join(
      s.cols.map((c) => sql`${sql.raw(`t."${c}"`)}::text like ${needle}`),
      sql` or `,
    );
    const rows = (await tx.execute(
      sql`select t.id::text as id, coalesce(to_jsonb(t)->>'name', to_jsonb(t)->>'title', to_jsonb(t)->>'sku', '') as label from ${sql.raw(`"${s.table}"`)} t where t.tenant_id = ${tenantId} and (${where}) limit 10`,
    )) as unknown as Array<{ id: string; label: string }>;
    for (const r of rows) out.push({ kind: s.kind, label: r.label || "(ไม่มีชื่อ)", ...(s.href ? { href: s.href(r.id) } : {}) });
  }
  const themeText = JSON.stringify(tenantTheme ?? {});
  if (media.key && themeText.includes(media.key)) out.push({ kind: "ดีไซน์และธีม", label: "โลโก้ / ไอคอน / รูปแชร์ของเว็บ", href: "/design" });
  return out;
}
