import * as React from "react";
import type { SectionJson } from "@rentweb/db";
import type { StorefrontCtx } from "./ctx";
import { parseSectionProps, SECTION_DEFS } from "./definitions";
import { Hero } from "./sections/hero";
import { Features } from "./sections/features";
import { TextSection } from "./sections/text";
import { ImageText } from "./sections/image-text";
import { Gallery } from "./sections/gallery";
import { Testimonials } from "./sections/testimonials";
import { Faq } from "./sections/faq";
import { Cta } from "./sections/cta";
import { Contact } from "./sections/contact";
import { Stats } from "./sections/stats";
import { Logos } from "./sections/logos";
import { MarqueeSection } from "./sections/marquee";
import { Pricing } from "./sections/pricing";
import { Team } from "./sections/team";
import { Video } from "./sections/video";
import { Steps } from "./sections/steps";
import { Spacer } from "./sections/spacer";
import { Announcement } from "./sections/announcement";

export type SectionComponent = (props: { ctx: StorefrontCtx; props: any; id: string; index: number }) => React.ReactNode | Promise<React.ReactNode>;

/** Core section components. Module packages register theirs with `registerSection`. */
const REGISTRY: Record<string, SectionComponent> = {
  hero: Hero,
  features: Features,
  text: TextSection,
  "image-text": ImageText,
  gallery: Gallery,
  testimonials: Testimonials,
  faq: Faq,
  cta: Cta,
  contact: Contact,
  stats: Stats,
  logos: Logos,
  marquee: MarqueeSection,
  pricing: Pricing,
  team: Team,
  video: Video,
  steps: Steps,
  spacer: Spacer,
  announcement: Announcement,
};

export function registerSection(type: string, component: SectionComponent) {
  REGISTRY[type] = component;
}

export function hasSectionComponent(type: string) {
  return type in REGISTRY;
}

/** Section types whose component renders the page's <h1> (the hero headline). Module sections use h2. */
const H1_SECTIONS = new Set(["hero"]);

export function sectionsRenderH1(sections: SectionJson[]): boolean {
  return sections.some((s) => !s.hidden && H1_SECTIONS.has(s.type));
}

/**
 * Renders a page's sections. With `pageTitle`, a page without a hero still gets exactly one <h1> (visually hidden,
 * the section headings stay h2) so CMS pages have a document heading for screen readers and search engines (SS-07).
 */
export async function RenderSections({ sections, ctx, pageTitle }: { sections: SectionJson[]; ctx: StorefrontCtx; pageTitle?: string }) {
  const out: React.ReactNode[] = [];
  if (pageTitle && !sectionsRenderH1(sections)) out.push(<h1 key="page-title" className="sr-only">{pageTitle}</h1>);
  let index = 0;
  for (const s of sections) {
    if (s.hidden) continue;
    const def = SECTION_DEFS[s.type];
    const Comp = REGISTRY[s.type];
    if (!def || !Comp) {
      if (process.env.NODE_ENV !== "production") {
        out.push(
          <div key={s.id} className="container-x my-4 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
            section "{s.type}" ยังไม่มีคอมโพเนนต์แสดงผล
          </div>,
        );
      }
      continue;
    }
    if (def.module && !ctx.tenant.modules.includes(def.module)) continue;
    const props = parseSectionProps(s.type, s.props) ?? {};
    out.push(
      <React.Fragment key={s.id}>
        {await Comp({ ctx, props, id: s.id, index })}
      </React.Fragment>,
    );
    index++;
  }
  return <>{out}</>;
}
