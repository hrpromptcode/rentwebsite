import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight, Clock } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { serviceList } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { listServices, type ServiceWithCategory } from "../services/catalog";
import { ServiceCard, servicePriceLabel } from "../components/cards";
import { L } from "../labels";

type Props = z.output<typeof serviceList.schema>;

function groupByCategory(list: ServiceWithCategory[]) {
  const map = new Map<string, ServiceWithCategory[]>();
  for (const s of list) map.set(s.categoryName ?? "", [...(map.get(s.categoryName ?? "") ?? []), s]);
  return [...map.entries()];
}

/** "Menu" layout: service name … dotted leader … price, like a spa menu card. */
export function ServiceMenu({ services, className }: { services: ServiceWithCategory[]; className?: string }) {
  const groups = groupByCategory(services);
  return (
    <div className={cn("grid gap-10 md:grid-cols-2 md:gap-x-14", className)}>
      {groups.map(([cat, list]) => (
        <Reveal key={cat || "_"}>
          {cat && <h3 className="mb-4 font-heading text-xl font-semibold text-primary">{cat}</h3>}
          <ul className="space-y-4">
            {list.map((s) => (
              <li key={s.id}>
                {/* RA-10: the two-line row is ~42px; keep the whole tap target at least 44px */}
                <Link href={`/services/${s.slug}`} className="group block min-h-11">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium leading-snug group-hover:text-primary">{s.name}</span>
                    <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-foreground/30" />
                    <span className="shrink-0 font-semibold tabular-nums">{servicePriceLabel(s)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {L.minutes(s.durationMin)}
                    </span>
                    {s.depositRequired && s.depositAmount > 0 && <span>{L.deposit} {thb(s.depositAmount)}</span>}
                    {s.description && <span className="hidden truncate sm:inline">· {s.description}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      ))}
    </div>
  );
}

export async function ServiceListSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const services = await withTenant(getDb(), ctx.tenant.id, (tx) => listServices(tx, ctx.tenant.id, { categorySlug: p.categorySlug, limit: p.limit }));
  if (!services.length) return null;
  const truncated = services.length >= p.limit;
  return (
    <Section id={id} tone={p.variant === "menu" ? "surface" : "default"}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        {p.variant === "menu" && <ServiceMenu services={services} className="mx-auto max-w-5xl" />}
        {p.variant === "list" && (
          <Stagger className="mx-auto grid max-w-4xl gap-3">
            {services.map((s) => (
              <StaggerItem key={s.id}>
                <ServiceCard s={s} variant="row" />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        {p.variant === "cards" && (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <StaggerItem key={s.id} className="h-full">
                <ServiceCard s={s} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/book">
              {L.bookNow} <ArrowRight className="size-4" />
            </Link>
          </Button>
          {truncated && (
            <Button asChild size="lg" variant="outline">
              <Link href="/services">{L.viewAllServices}</Link>
            </Button>
          )}
        </Reveal>
      </div>
    </Section>
  );
}
