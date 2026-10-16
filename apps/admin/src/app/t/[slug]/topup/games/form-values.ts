/** Pure form helpers for the game / package editors – shared by the server pages and the client forms (no server imports). */
import { satangToBaht, type GameInput, type PackageInput } from "@rentweb/module-topup/admin/schemas";

export interface FieldRowVM {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  required: boolean;
  placeholder: string;
  /** select options, one per line in the editor */
  options: string;
  helpImage: string;
}

export interface GameFormValues {
  name: string;
  slug: string;
  publisher: string;
  description: string;
  image: string;
  banner: string;
  category: "mobile" | "pc" | "console" | "voucher" | "app";
  fields: FieldRowVM[];
  instructions: string;
  featured: boolean;
  active: boolean;
  sort: string;
}

export const EMPTY_FIELD: FieldRowVM = { key: "", label: "", type: "text", required: true, placeholder: "", options: "", helpImage: "" };

export const EMPTY_GAME: GameFormValues = {
  name: "",
  slug: "",
  publisher: "",
  description: "",
  image: "",
  banner: "",
  category: "mobile",
  fields: [{ ...EMPTY_FIELD, key: "uid", label: "UID / ไอดีผู้เล่น", placeholder: "เช่น 123456789" }],
  instructions: "",
  featured: false,
  active: true,
  sort: "0",
};

export function toGameFormValues(g: {
  name: string;
  slug: string;
  publisher: string | null;
  description: string | null;
  image: string | null;
  banner: string | null;
  category: string;
  fields: Array<{ key: string; label: string; type: string; required?: boolean; placeholder?: string; options?: string[]; helpImage?: string }>;
  instructions: string | null;
  featured: boolean;
  active: boolean;
  sort: number;
}): GameFormValues {
  return {
    name: g.name,
    slug: g.slug,
    publisher: g.publisher ?? "",
    description: g.description ?? "",
    image: g.image ?? "",
    banner: g.banner ?? "",
    category: (["mobile", "pc", "console", "voucher", "app"].includes(g.category) ? g.category : "mobile") as GameFormValues["category"],
    fields: (g.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: (["text", "number", "select"].includes(f.type) ? f.type : "text") as FieldRowVM["type"],
      required: f.required !== false,
      placeholder: f.placeholder ?? "",
      options: (f.options ?? []).join("\n"),
      helpImage: f.helpImage ?? "",
    })),
    instructions: g.instructions ?? "",
    featured: g.featured,
    active: g.active,
    sort: String(g.sort),
  };
}

export function toGameInput(v: GameFormValues): GameInput {
  return {
    name: v.name,
    slug: v.slug || autoSlug(v.name),
    publisher: v.publisher.trim() || null,
    description: v.description.trim() || null,
    image: v.image.trim() || null,
    banner: v.banner.trim() || null,
    category: v.category,
    fields: v.fields.map((f) => ({
      key: f.key.trim(),
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      options: f.type === "select" ? f.options.split(/\r?\n|,/).map((o) => o.trim()).filter(Boolean) : undefined,
      helpImage: f.helpImage,
    })),
    instructions: v.instructions.trim() || null,
    featured: v.featured,
    active: v.active,
    sort: v.sort || "0",
  };
}

export interface PackageFormValues {
  id: string | null;
  name: string;
  description: string;
  price: string;
  costPrice: string;
  tierVip: string;
  tierAgent: string;
  fulfillment: "api" | "stock" | "manual";
  supplierId: string;
  supplierProductCode: string;
  estimatedMinutes: string;
  badge: string;
  active: boolean;
  sort: string;
}

export const EMPTY_PACKAGE: PackageFormValues = {
  id: null,
  name: "",
  description: "",
  price: "",
  costPrice: "",
  tierVip: "",
  tierAgent: "",
  fulfillment: "manual",
  supplierId: "",
  supplierProductCode: "",
  estimatedMinutes: "15",
  badge: "",
  active: true,
  sort: "0",
};

export function toPackageFormValues(p: {
  id: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number | null;
  tierPrices: Record<string, number> | null;
  fulfillment: string;
  supplierId: string | null;
  supplierProductCode: string | null;
  estimatedMinutes: number;
  badge: string | null;
  active: boolean;
  sort: number;
}): PackageFormValues {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    price: satangToBaht(p.price),
    costPrice: satangToBaht(p.costPrice),
    tierVip: satangToBaht(p.tierPrices?.vip ?? null),
    tierAgent: satangToBaht(p.tierPrices?.agent ?? null),
    fulfillment: (["api", "stock", "manual"].includes(p.fulfillment) ? p.fulfillment : "manual") as PackageFormValues["fulfillment"],
    supplierId: p.supplierId ?? "",
    supplierProductCode: p.supplierProductCode ?? "",
    estimatedMinutes: String(p.estimatedMinutes),
    badge: p.badge ?? "",
    active: p.active,
    sort: String(p.sort),
  };
}

export function toPackageInput(v: PackageFormValues): PackageInput {
  return {
    id: v.id,
    name: v.name,
    description: v.description.trim() || null,
    price: v.price,
    costPrice: v.costPrice,
    tierVip: v.tierVip,
    tierAgent: v.tierAgent,
    fulfillment: v.fulfillment,
    supplierId: v.fulfillment === "api" && v.supplierId ? v.supplierId : null,
    supplierProductCode: v.fulfillment === "api" ? v.supplierProductCode.trim() || null : null,
    estimatedMinutes: v.estimatedMinutes || "0",
    badge: v.badge.trim() || null,
    active: v.active,
    sort: v.sort || "0",
  };
}

/** Thai-friendly slug: keeps letters (incl. Thai vowels / tone marks), digits and "-". */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** ASCII slug from the name when possible ("Free Fire" → free-fire), else the Thai slug. */
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
