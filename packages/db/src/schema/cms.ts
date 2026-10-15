import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps, tz } from "./_helpers";
import { tenantRef } from "./platform";

export type SectionJson = { id: string; type: string; props: Record<string, unknown>; hidden?: boolean };
export type SeoJson = {
  title?: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
  canonical?: string;
};

export const pages = pgTable(
  "pages",
  {
    id: id(),
    tenantId: tenantRef(),
    slug: text("slug").notNull(), // "home" is the landing page
    title: text("title").notNull(),
    kind: text("kind").notNull().default("page"), // page | home | system (policy pages)
    status: text("status").notNull().default("draft"), // draft | published
    sections: jsonb("sections").$type<SectionJson[]>().notNull().default([]),
    publishedSections: jsonb("published_sections").$type<SectionJson[]>(),
    seo: jsonb("seo").$type<SeoJson>().notNull().default({}),
    showInNav: boolean("show_in_nav").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    publishedAt: tz("published_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("pages_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export const pageVersions = pgTable(
  "page_versions",
  {
    id: id(),
    tenantId: tenantRef(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    sections: jsonb("sections").$type<SectionJson[]>().notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("page_versions_page_idx").on(t.tenantId, t.pageId, t.createdAt)],
);

export type NavItem = { label: string; href: string; children?: NavItem[]; external?: boolean };

export const navigation = pgTable(
  "navigation",
  {
    id: id(),
    tenantId: tenantRef(),
    location: text("location").notNull(), // header | footer | mobile
    items: jsonb("items").$type<NavItem[]>().notNull().default([]),
    ...timestamps(),
  },
  (t) => [uniqueIndex("navigation_tenant_location_uq").on(t.tenantId, t.location)],
);

export const media = pgTable(
  "media",
  {
    id: id(),
    tenantId: tenantRef(),
    key: text("key").notNull(), // storage key, prefixed tenants/{id}/
    url: text("url").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    folder: text("folder").notNull().default("/"),
    blurDataUrl: text("blur_data_url"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("media_tenant_folder_idx").on(t.tenantId, t.folder, t.createdAt)],
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    tenantId: tenantRef(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    body: jsonb("body").$type<Record<string, unknown>>(), // tiptap JSON
    bodyHtml: text("body_html"),
    coverImage: text("cover_image"),
    category: text("category"),
    tags: text("tags").array().notNull().default([]),
    status: text("status").notNull().default("draft"),
    authorName: text("author_name"),
    seo: jsonb("seo").$type<SeoJson>().notNull().default({}),
    publishedAt: tz("published_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("posts_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export type FormField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "date" | "file";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export const forms = pgTable(
  "forms",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    fields: jsonb("fields").$type<FormField[]>().notNull().default([]),
    notifyEmails: text("notify_emails").array().notNull().default([]),
    successMessage: text("success_message"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("forms_tenant_slug_uq").on(t.tenantId, t.slug)],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: id(),
    tenantId: tenantRef(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    readAt: tz("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("form_submissions_form_idx").on(t.tenantId, t.formId, t.createdAt)],
);
