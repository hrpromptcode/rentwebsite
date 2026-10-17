import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { classHighlights } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { listClasses } from "../services/classes";
import { ClassCard } from "../components/class-cards";
import { L } from "../labels";

type Props = z.output<typeof classHighlights.schema>;

/** Home-page grid of classes (featured by default) with level, rhythm, instructor and price. */
export async function ClassHighlightsSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  let classes = await withTenant(getDb(), ctx.tenant.id, (tx) => listClasses(tx, ctx.tenant.id, { featured: p.featured, level: p.level || null, limit: p.limit }));
  // a brand-new studio has no featured class yet → show every class instead of an empty block
  if (!classes.length && p.featured) classes = await withTenant(getDb(), ctx.tenant.id, (tx) => listClasses(tx, ctx.tenant.id, { level: p.level || null, limit: p.limit }));
  if (!classes.length) return null;
  const editorial = p.variant === "editorial";
  return (
    <Section id={id}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className={editorial ? "grid gap-6 lg:grid-cols-2" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"}>
          {classes.map((c) => (
            <StaggerItem key={c.id} className="h-full">
              <ClassCard c={c} variant={editorial ? "editorial" : "card"} />
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/classes">
              ดูคลาสทั้งหมด <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/schedule">{L.schedule}</Link>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}
