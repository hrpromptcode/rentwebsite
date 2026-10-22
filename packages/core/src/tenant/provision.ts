import { eq } from "drizzle-orm";
import {
  forms,
  getAdminDb,
  navigation,
  pages,
  tenantDomains,
  tenantMembers,
  tenantModules,
  tenants,
  withTenant,
  type Db,
  type NavItem,
  type SectionJson,
  type Tx,
  user,
} from "@rentweb/db";
import { rootDomain } from "../env";
import { resolveModules, type ModuleKey } from "../modules";
import type { ThemeInput } from "../theme";
import { tenantSlug } from "../utils";
import { invalidateTenant } from "./resolve";

export interface TemplatePage {
  slug: string;
  title: string;
  kind?: "home" | "page" | "system";
  showInNav?: boolean;
  sections: SectionJson[];
  /** ADMIN_B2-07: brand-neutral sections used instead of `sections` for new (non-demo) shops ("{{name}}" = shop name) */
  neutralSections?: SectionJson[];
  seo?: Record<string, unknown>;
}

export interface TemplateDefinition {
  key: string;
  name: { th: string; en: string };
  description: { th: string; en: string };
  category: string;
  siteType: string;
  modules: ModuleKey[];
  themePreset: string;
  theme?: Partial<ThemeInput>;
  settings?: Record<string, unknown>;
  /** ADMIN_B2-07: the sample brand's name(s) in page copy; replaced with the shop's name for non-demo tenants */
  sampleBrand?: string[];
  /** ADMIN_B2-07: other sample-story phrases and their neutral replacement for non-demo tenants */
  neutralText?: Array<[string, string]>;
  moduleConfig?: Partial<Record<ModuleKey, Record<string, unknown>>>;
  pages: TemplatePage[];
  navigation: { header: NavItem[]; footer: NavItem[] };
  /** inserts sample data (products, services, games…) inside the tenant transaction */
  seed?: (tx: Tx, tenantId: string) => Promise<void>;
  complexity?: number;
  previewImage?: string;
  /** which theme presets look good with this template (first = default) */
  recommendedPresets?: string[];
}

export interface ProvisionInput {
  name: string;
  slug?: string;
  template: TemplateDefinition;
  ownerUserId?: string;
  locale?: string;
  planKey?: string;
  settings?: Record<string, unknown>;
  themeOverrides?: Partial<ThemeInput>;
  /** when true, seeds sample content (default true) */
  withSampleData?: boolean;
  /**
   * Keep the template's sample business identity (PromptPay ID, bank accounts, phone, LINE,
   * e-mail, address, licence no., LINE/tel/mailto links, form recipients). Only for demo sites:
   * defaults to true for ownerless `demo-*` slugs (tooling seed / reset-demo) and false otherwise,
   * so a real shop never takes payments to – or mails its leads to – the sample business.
   */
  sampleIdentity?: boolean;
  db?: Db;
}

export interface ProvisionResult {
  tenantId: string;
  slug: string;
  hostname: string;
}

type Json = Record<string, unknown>;

/**
 * Template settings without the sample business's identity (AC-02): contact keeps only the
 * opening hours (used by ordering/reservation slots), payments keep only which methods are
 * switched on – no PromptPay ID / bank account, so nothing can be paid to the sample receiver
 * until the owner enters their own (the dashboard checklist then shows these steps as open).
 */
export function stripSampleIdentity(settings: Json): Json {
  const out: Json = { ...settings };
  const contact = settings.contact as Json | undefined;
  if (contact) out.contact = contact.hours ? { hours: contact.hours } : {};
  const payments = settings.payments as Json | undefined;
  if (payments) out.payments = payments.enabled ? { enabled: payments.enabled } : {};
  const clinic = settings.clinic as Json | undefined;
  if (clinic) {
    const { licenseNo: _sample, ...rest } = clinic;
    out.clinic = rest;
  }
  delete out.notifications;
  delete out.line;
  return out;
}

/** Section types whose sample content would be fabricated reviews under a real shop's name. */
const SAMPLE_REVIEW_SECTIONS = new Set(["testimonials"]);

/**
 * Pages for a new (non-demo) shop (ADMIN_B2-07): brand-neutral variants where the template has them (About),
 * every sample brand name (and the "{{name}}" token) replaced with the shop's name, and sample testimonials
 * hidden until the owner adds real ones (the editor's eye toggle shows them again).
 */
export function neutralTemplatePages(pages: TemplatePage[], opts: { tenantName: string; sampleBrand?: string[]; neutralText?: Array<[string, string]>; samples?: Array<[string, string]> }): TemplatePage[] {
  const name = opts.tenantName.trim() || "ร้านของเรา";
  const brands = [...new Set((opts.sampleBrand ?? []).filter((b) => b && b.length >= 3))].sort((a, b) => b.length - a.length);
  const pairs: Array<[string, string]> = [...(opts.samples ?? []), ...(opts.neutralText ?? []), ["{{name}}", name], ...brands.map((b): [string, string] => [b, name])];
  return pages.map(({ neutralSections, ...p }) => ({
    ...p,
    sections: scrubSampleLinks(neutralSections ?? p.sections, pairs).map((s) => (SAMPLE_REVIEW_SECTIONS.has(s.type) ? { ...s, hidden: true } : s)),
  }));
}

const SAMPLE_CONTACT_HREF = /^(?:https?:\/\/(?:line\.me|lin\.ee)\/|tel:|mailto:)/i;

/** Sample identity values of a template mapped to the placeholder shown until the owner edits the text. */
export function sampleIdentityValues(settings: Json): Array<[string, string]> {
  const contact = (settings.contact ?? {}) as Json;
  const payments = (settings.payments ?? {}) as Json;
  const clinic = (settings.clinic ?? {}) as Json;
  const pairs: Array<[unknown, string]> = [
    [clinic.licenseNo, "[เลขที่ใบอนุญาต]"],
    [contact.phone, "[เบอร์โทรของร้าน]"],
    [contact.email, "[อีเมลของร้าน]"],
    [contact.lineId, "[LINE ID ของร้าน]"],
    [contact.address, "[ที่อยู่ของร้าน]"],
    [payments.promptpayId, "[พร้อมเพย์ของร้าน]"],
    ...((Array.isArray(payments.bankAccounts) ? payments.bankAccounts : []) as Json[]).map((b): [unknown, string] => [b.number, "[เลขบัญชีของร้าน]"]),
  ];
  return pairs.filter((p): p is [string, string] => typeof p[0] === "string" && p[0].length >= 4);
}

/**
 * Template sections without the sample business's contact points: LINE / tel: / mailto: buttons
 * go to the tenant's own /contact page, and sample values inside texts (e.g. the clinic licence
 * number in the hero) become a visible "[…ของร้าน]" placeholder for the owner to fill in.
 */
export function scrubSampleLinks<T>(value: T, samples: Array<[string, string]> = []): T {
  if (typeof value === "string") return samples.reduce<string>((s, [from, to]) => s.split(from).join(to), value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubSampleLinks(v, samples)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value as Json)) {
    out[k] = k === "href" && typeof v === "string" && SAMPLE_CONTACT_HREF.test(v) ? "/contact" : scrubSampleLinks(v, samples);
  }
  return out as T;
}

export async function isSlugAvailable(slug: string, db: Db = getAdminDb()): Promise<boolean> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return !row;
}

/**
 * Creates a tenant from a template:
 *  1. platform rows (tenant, subdomain, modules, owner membership)      — admin transaction
 *  2. tenant-scoped content (pages, navigation, sample data)            — RLS transaction
 * If step 2 fails the tenant is removed again.
 */
export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const db = input.db ?? getAdminDb();
  const tpl = input.template;
  let slug = tenantSlug(input.slug ?? input.name);
  if (!(await isSlugAvailable(slug, db))) slug = tenantSlug(`${slug}-${Math.random().toString(36).slice(2, 6)}`);

  const sampleIdentity = input.sampleIdentity ?? (!input.ownerUserId && slug.startsWith("demo-"));
  const templateSettings = sampleIdentity ? (tpl.settings ?? {}) : stripSampleIdentity(tpl.settings ?? {});
  const samples = sampleIdentityValues(tpl.settings ?? {});
  const templatePages = sampleIdentity
    ? tpl.pages.map(({ neutralSections: _neutral, ...p }) => p)
    : neutralTemplatePages(tpl.pages, { tenantName: input.name, sampleBrand: tpl.sampleBrand, neutralText: tpl.neutralText, samples });
  let ownerEmail: string | null = null;
  if (input.ownerUserId) {
    const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, input.ownerUserId)).limit(1);
    ownerEmail = owner?.email ?? null;
  }

  const modules = resolveModules(tpl.modules);
  const theme: ThemeInput = { preset: tpl.themePreset, ...(tpl.theme ?? {}), ...(input.themeOverrides ?? {}) };

  const tenantId = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tenants)
      .values({
        slug,
        name: input.name,
        siteType: tpl.siteType,
        planKey: input.planKey ?? "starter",
        status: "active",
        locale: input.locale ?? "th",
        settings: { ...templateSettings, ...(input.settings ?? {}), templateKey: tpl.key },
        theme: theme as Record<string, unknown>,
        onboarding: { steps: {}, startedAt: new Date().toISOString() },
      })
      .returning({ id: tenants.id });
    const id = t!.id;

    await tx.insert(tenantDomains).values({
      tenantId: id,
      hostname: `${slug}.${rootDomain()}`,
      kind: "subdomain",
      isPrimary: true,
      status: "active",
      verifiedAt: new Date(),
    });

    await tx.insert(tenantModules).values(
      modules.map((m) => ({ tenantId: id, moduleKey: m, enabled: true, config: tpl.moduleConfig?.[m] ?? {} })),
    );

    if (input.ownerUserId) {
      await tx.insert(tenantMembers).values({ tenantId: id, userId: input.ownerUserId, role: "owner" });
    }
    return id;
  });

  try {
    await withTenant(
      db,
      tenantId,
      async (tx) => {
        if (templatePages.length) {
          await tx.insert(pages).values(
            templatePages.map((p, i) => ({
              tenantId,
              slug: p.slug,
              title: p.title,
              kind: p.kind ?? (p.slug === "home" ? "home" : "page"),
              status: "published",
              sections: p.sections,
              publishedSections: p.sections,
              seo: p.seo ?? {},
              showInNav: p.showInNav ?? false,
              sort: i,
              publishedAt: new Date(),
            })),
          );
        }
        await tx.insert(navigation).values([
          { tenantId, location: "header", items: tpl.navigation.header },
          { tenantId, location: "footer", items: tpl.navigation.footer },
        ]);
        if (tpl.seed && input.withSampleData !== false) await tpl.seed(tx, tenantId);
        // seeded forms notify the new owner – never an address that came with the template (AC-03)
        if (!sampleIdentity) await tx.update(forms).set({ notifyEmails: ownerEmail ? [ownerEmail] : [] }).where(eq(forms.tenantId, tenantId));
      },
      { role: null }, // admin connection; RLS still filters by tenant_id via set_config
    );
  } catch (err) {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    throw err;
  }

  await invalidateTenant(tenantId, [`${slug}.${rootDomain()}`]);
  return { tenantId, slug, hostname: `${slug}.${rootDomain()}` };
}
