import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { SectionJson } from "@rentweb/db";
import type { TenantRuntime } from "@rentweb/core/tenant";
import { PageIntro, RenderSections, pad2 } from "@rentweb/storefront";
import { getNavigation, getPublishedPage } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";

/**
 * Hi-end CMS page (docs/design/hi-end-direction.md §5.0 "Inner content pages"): a page that does not open with a hero
 * starts with a PageIntro — eyebrow, giant SplitReveal <h1>, mono index ("03 / WORK"), drawn rule, optional lead.
 *
 * The intro ABSORBS the first section's heading when that section is a plain headed block (text, contact, features …):
 * its heading becomes the page <h1>, the page title (= the nav label) becomes the eyebrow and its subheading the lead,
 * so nothing is said twice. Legal pages (privacy / terms / refund) render their text as calm readable prose
 * (≤ 70ch, 18px / 1.75) with no motion beyond the intro. Pages that open with a hero render exactly as before.
 * Used by [...slug]/page.tsx and the draft preview.
 */

/** Section types that paint their own hero (core hero + module heroes): no intro. Mirrors components/page-body.tsx. */
const HERO_TYPES = new Set(["hero", "stay-search", "event-hero"]);

/** Headed sections whose title block can move up into the PageIntro; value = the prop used as the lead line. */
const ABSORB: Record<string, "subheading" | "body" | null> = {
  text: null,
  contact: "body",
  features: "subheading",
  "project-list": null,
  faq: "subheading",
  gallery: "subheading",
  team: "subheading",
  "curved-gallery": "subheading",
  pricing: "subheading",
  testimonials: null,
  steps: null,
  "sticky-story": "subheading",
  "horizontal-scroll": "subheading",
};

const LEGAL_SLUGS = ["privacy", "terms", "refund"] as const;
const LEGAL_LABEL: Record<(typeof LEGAL_SLUGS)[number], string> = { privacy: "ความเป็นส่วนตัว", terms: "เงื่อนไขการใช้บริการ", refund: "การคืนเงิน" };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const graphemes = (s: string) => [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s.replace(/\s+/g, ""))].length;
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

export type CmsPageInput = { slug: string; title: string; kind?: string | null; sections: SectionJson[] };

/** "03 / WORK": position in the header menu (home = 01) + the Latin slug; slug only when the page is not in the menu. */
async function indexLabel(tenantId: string, slug: string): Promise<string | undefined> {
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(slug)) return undefined;
  const label = slug.split("/").pop()!.replace(/-/g, " ").toUpperCase();
  const nav = await getNavigation(tenantId).catch(() => ({ header: [] as Array<{ href?: string }>, footer: [] }));
  const i = nav.header.findIndex((n) => (n.href ?? "").replace(/\/$/, "") === `/${slug}`);
  return i >= 0 ? `${pad2(i + 2)} / ${label}` : label;
}

type Intro = { eyebrow?: string; title: string; lead?: string; sections: SectionJson[] };

/** Builds the PageIntro and the section list with the absorbed title block removed from the first section. */
function introFor(page: CmsPageInput): Intro {
  const firstIdx = page.sections.findIndex((s) => !s.hidden);
  const first = firstIdx >= 0 ? page.sections[firstIdx] : undefined;
  const props = (first?.props ?? {}) as Record<string, unknown>;
  const leadKey = first ? ABSORB[first.type] : undefined;
  const heading = str(props.heading);
  const eyebrow = str(props.eyebrow);

  if (first && leadKey !== undefined && heading && graphemes(heading) <= 64) {
    // a short subheading / contact blurb becomes the intro lead; a long one stays in the section
    const lead = leadKey ? str(props[leadKey]) : "";
    const moveLead = !!leadKey && !!lead && lead.length <= 220;
    const stripped: Record<string, unknown> = { ...props, heading: "", eyebrow: "" };
    if (moveLead) stripped[leadKey!] = "";
    const titleIsPage = same(heading, page.title);
    return {
      // the nav label ("ผลงาน") above the section's own headline; the section eyebrow when the headline IS the page title
      eyebrow: !titleIsPage ? page.title : eyebrow && !same(eyebrow, page.title) ? eyebrow : undefined,
      title: titleIsPage ? page.title : heading,
      lead: moveLead ? lead : undefined,
      sections: page.sections.map((s, i) => (i === firstIdx ? { ...s, props: stripped } : s)),
    };
  }
  // the section keeps its own title block; only drop an eyebrow that just repeats the page title
  if (first && eyebrow && same(eyebrow, page.title)) {
    return { title: page.title, sections: page.sections.map((s, i) => (i === firstIdx ? { ...s, props: { ...props, eyebrow: "" } } : s)) };
  }
  return { title: page.title, sections: page.sections };
}

/** Legal prose: paragraphs, "1. …" runs as an ordered list, "หัวข้อ: …" lead-ins in bold. */
function LegalProse({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="rw-legal">
      {paras.map((p, i) => {
        const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
        const listStart = lines.findIndex((l) => /^\d+[.)]\s/.test(l));
        if (listStart >= 0 && lines.slice(listStart).every((l) => /^\d+[.)]\s/.test(l))) {
          return (
            <div key={i}>
              {lines.slice(0, listStart).map((l, j) => (
                <p key={j}>{l}</p>
              ))}
              <ol>
                {lines.slice(listStart).map((l, j) => (
                  <li key={j}>{l.replace(/^\d+[.)]\s*/, "")}</li>
                ))}
              </ol>
            </div>
          );
        }
        const m = /^([^:\n]{2,48}):\s+([\s\S]+)$/.exec(p);
        return (
          <p key={i}>
            {m ? (
              <>
                <strong>{m[1]}:</strong> {m[2]}
              </>
            ) : (
              lines.map((l, j) => (
                <span key={j}>
                  {l}
                  {j < lines.length - 1 && <br />}
                </span>
              ))
            )}
          </p>
        );
      })}
    </div>
  );
}

/** Hoisted page-level CSS (React 19 <style href precedence>): legal prose + trimming the first section under the intro. */
function CmsStyles() {
  return (
    <style href="rw-cms-page" precedence="default">{`
[data-cms-sections] > [data-section]:first-child { padding-top: calc(clamp(2.5rem, 5vw, 4.5rem) * var(--density, 1)); }
.rw-legal { font-size: 1.125rem; line-height: 1.75; max-width: 70ch; color: color-mix(in oklab, var(--foreground) 86%, var(--muted-foreground)); text-wrap: pretty; }
.rw-legal > * + * { margin-top: 1.4em; }
.rw-legal p:first-child { font-size: var(--step-1); line-height: 1.7; color: var(--foreground); }
.rw-legal strong { color: var(--foreground); font-weight: 600; }
.rw-legal ol { margin-top: 0.9em; display: grid; gap: 0.75em; counter-reset: rw-legal; padding: 0; list-style: none; }
.rw-legal ol > li { counter-increment: rw-legal; display: grid; grid-template-columns: 2.75rem minmax(0, 1fr); align-items: baseline; padding-top: 0.75em; border-top: 1px solid var(--border); }
.rw-legal ol > li::before { content: counter(rw-legal, decimal-leading-zero); font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.08em; color: var(--muted-foreground); }
`}</style>
  );
}

export async function CmsPageView({ runtime, page }: { runtime: TenantRuntime; page: CmsPageInput }) {
  const tenantId = runtime.config.id;
  const ctx = await buildCtx(runtime);
  const first = page.sections.find((s) => !s.hidden);

  // 1. pages that open with their own hero: unchanged (the sr-only page <h1> comes from RenderSections)
  if (first && HERO_TYPES.has(first.type)) {
    return (
      <PageBody theme={runtime.theme} sections={page.sections}>
        <RenderSections sections={page.sections} ctx={ctx} pageTitle={page.title} />
      </PageBody>
    );
  }

  const index = await indexLabel(tenantId, page.slug);

  // 2. legal: calm prose, no motion beyond the intro
  const legalSlug = LEGAL_SLUGS.find((s) => s === page.slug);
  if ((legalSlug || page.kind === "system") && first?.type === "text" && str((first.props as Record<string, unknown>).body)) {
    const props = first.props as Record<string, unknown>;
    const title = str(props.heading) || page.title;
    const rest = page.sections.filter((s) => s !== first);
    const siblings = (await Promise.all(LEGAL_SLUGS.map(async (s) => ((await getPublishedPage(tenantId, s)) ? s : null)))).filter((s): s is (typeof LEGAL_SLUGS)[number] => !!s);
    return (
      <PageBody theme={runtime.theme} sections={page.sections}>
        <CmsStyles />
        <div className="container-x">
          <PageIntro eyebrow={str(props.eyebrow) || (same(title, page.title) ? undefined : page.title)} title={title} index={index} />
        </div>
        <div className="container-x grid gap-12 pt-6 pb-[calc(var(--section-y,6rem)*0.8)] lg:grid-cols-12 lg:gap-16 md:pt-10">
          <nav aria-label="เอกสารนโยบาย" className="order-2 lg:order-1 lg:col-span-3">
            <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+2rem)]">
              <p className="mono-label text-muted-foreground">{runtime.config.name}</p>
              {siblings.length > 1 && (
                <ul className="mt-4 grid border-t border-border">
                  {siblings.map((s) => (
                    <li key={s} className="border-b border-border">
                      <Link
                        href={`/${s}`}
                        aria-current={s === page.slug ? "page" : undefined}
                        className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
                      >
                        {LEGAL_LABEL[s]}
                        {s === page.slug && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/contact" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">
                มีคำถามเกี่ยวกับเอกสารนี้? ติดต่อเรา <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
          </nav>
          <article className="order-1 lg:order-2 lg:col-span-8 lg:col-start-5">
            <LegalProse text={str(props.body)} />
          </article>
        </div>
        {rest.length > 0 && <RenderSections sections={rest} ctx={ctx} />}
      </PageBody>
    );
  }

  // 3. everything else: PageIntro (absorbing the first section's title block) + the sections
  const intro = introFor(page);
  return (
    <PageBody theme={runtime.theme} sections={page.sections}>
      <CmsStyles />
      <div className="container-x">
        <PageIntro eyebrow={intro.eyebrow} title={intro.title} lead={intro.lead} index={index} />
      </div>
      <div data-cms-sections="">
        <RenderSections sections={intro.sections} ctx={ctx} />
      </div>
    </PageBody>
  );
}
