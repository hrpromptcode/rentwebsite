import { z } from "zod";
import type { ModuleKey } from "../modules";

/**
 * Section = a block on a page. Props are validated with zod so the admin can auto-generate forms
 * and the renderer can trust the JSON. React components live in @rentweb/sections (web) and are
 * looked up by `type`.
 */
export interface SectionDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  name: { th: string; en: string };
  description?: { th: string; en: string };
  category: "hero" | "content" | "media" | "social" | "cta" | "commerce" | "booking" | "topup" | "restaurant" | "clinic" | "layout";
  schema: S;
  defaults: z.input<S>;
  /** module required for this section to be available */
  module?: ModuleKey;
  /** optional variants a theme may render differently */
  variants?: string[];
}

export const link = z.object({ label: z.string().default(""), href: z.string().default("#"), external: z.boolean().optional() });
export const image = z.object({ url: z.string().default(""), alt: z.string().default("") });

export function defineSection<S extends z.ZodTypeAny>(def: SectionDefinition<S>): SectionDefinition<S> {
  return def;
}

export function newSectionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type SectionInstance = { id: string; type: string; props: Record<string, unknown>; hidden?: boolean };

export function instantiate<S extends z.ZodTypeAny>(def: SectionDefinition<S>, props: Partial<z.input<S>> = {}): SectionInstance {
  return { id: newSectionId(), type: def.type, props: { ...(def.defaults as object), ...props } as Record<string, unknown> };
}
