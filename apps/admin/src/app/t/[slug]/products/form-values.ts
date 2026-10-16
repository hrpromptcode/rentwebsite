import { satangToBaht } from "@rentweb/module-commerce/admin/schemas";

/**
 * Product form view-model + helpers shared by the client form and the server pages.
 * Kept out of product-form.tsx on purpose: that file is "use client", and calling one of its
 * exports from a server component ("Attempted to call toFormValues() from the server") crashes the page.
 */

export interface ProductFormValues {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  images: Array<{ url: string; alt?: string; mediaId?: string }>;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  type: "physical" | "digital" | "service" | "preorder";
  status: "draft" | "active" | "archived";
  trackInventory: boolean;
  stock: string;
  lowStockThreshold: string;
  weightGrams: string;
  sku: string;
  tags: string[];
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  options: Array<{ name: string; values: string[] }>;
  variants: VariantRowVM[];
}

export interface VariantRowVM {
  id?: string;
  title: string;
  optionValues: Record<string, string>;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  active: boolean;
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  images: [],
  price: "",
  compareAtPrice: "",
  costPrice: "",
  type: "physical",
  status: "draft",
  trackInventory: true,
  stock: "0",
  lowStockThreshold: "5",
  weightGrams: "0",
  sku: "",
  tags: [],
  featured: false,
  seoTitle: "",
  seoDescription: "",
  options: [],
  variants: [],
};

/** Normalises a slug the user typed: keeps Thai/Unicode letters (schema allows them). */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Auto slug derived from the product name. ASCII-first: the storefront's /products/[slug] route
 * matches the raw path segment, so Unicode slugs currently 404 there (all seeded slugs are ASCII).
 * Falls back to the Unicode slug only when the name has no Latin letters/digits at all; the field
 * stays editable either way.
 */
export function autoSlug(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii.length >= 2 ? ascii : normalizeSlug(name);
}

/** Row → form values (server passes raw rows). */
export function toFormValues(p: {
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  categoryId: string | null;
  images: Array<{ url: string; alt?: string; mediaId?: string }>;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  type: string;
  status: string;
  trackInventory: boolean;
  stock: number;
  lowStockThreshold: number;
  weightGrams: number;
  sku: string | null;
  tags: string[];
  featured: boolean;
  seo: Record<string, unknown>;
  options: Array<{ name: string; values: string[] }>;
}, variants: Array<{ id: string; title: string; optionValues: Record<string, string>; sku: string | null; price: number; compareAtPrice: number | null; stock: number; active: boolean }>, descriptionText: string): ProductFormValues {
  return {
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription ?? "",
    description: descriptionText,
    categoryId: p.categoryId ?? "",
    images: p.images ?? [],
    price: satangToBaht(p.price),
    compareAtPrice: satangToBaht(p.compareAtPrice),
    costPrice: satangToBaht(p.costPrice),
    type: p.type as ProductFormValues["type"],
    status: p.status as ProductFormValues["status"],
    trackInventory: p.trackInventory,
    stock: String(p.stock),
    lowStockThreshold: String(p.lowStockThreshold),
    weightGrams: String(p.weightGrams),
    sku: p.sku ?? "",
    tags: p.tags ?? [],
    featured: p.featured,
    seoTitle: typeof p.seo?.title === "string" ? p.seo.title : "",
    seoDescription: typeof p.seo?.description === "string" ? p.seo.description : "",
    options: p.options ?? [],
    variants: variants.map((x) => ({ id: x.id, title: x.title, optionValues: x.optionValues ?? {}, sku: x.sku ?? "", price: satangToBaht(x.price), compareAtPrice: satangToBaht(x.compareAtPrice), stock: String(x.stock), active: x.active })),
  };
}
