import { eq } from "drizzle-orm";
import {
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
  trialDays?: number;
  settings?: Record<string, unknown>;
  themeOverrides?: Partial<ThemeInput>;
  /** when true, seeds sample content (default true) */
  withSampleData?: boolean;
  db?: Db;
}

export interface ProvisionResult {
  tenantId: string;
  slug: string;
  hostname: string;
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

  const modules = resolveModules(tpl.modules);
  const trialDays = input.trialDays ?? 14;
  const theme: ThemeInput = { preset: tpl.themePreset, ...(tpl.theme ?? {}), ...(input.themeOverrides ?? {}) };

  const tenantId = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tenants)
      .values({
        slug,
        name: input.name,
        siteType: tpl.siteType,
        planKey: input.planKey ?? "trial",
        status: "trialing",
        locale: input.locale ?? "th",
        settings: { ...(tpl.settings ?? {}), ...(input.settings ?? {}), templateKey: tpl.key },
        theme: theme as Record<string, unknown>,
        onboarding: { steps: {}, startedAt: new Date().toISOString() },
        trialEndsAt: new Date(Date.now() + trialDays * 86_400_000),
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
        if (tpl.pages.length) {
          await tx.insert(pages).values(
            tpl.pages.map((p, i) => ({
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
