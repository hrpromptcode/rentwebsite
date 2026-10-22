import * as React from "react";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { BackToTop } from "@rentweb/ui/motion/back-to-top";
import { GiantWordmark } from "@rentweb/ui/motion/giant-wordmark";
import { LiveClock } from "@rentweb/ui/motion/live-clock";
import { RollText } from "@rentweb/ui/motion/roll-text";
import { cn } from "@rentweb/ui/lib/utils";
import { isThai } from "@rentweb/ui/motion/split";
import { contactOf, type StorefrontCtx } from "../ctx";
import { Logo } from "./logo";
import { navTarget, safeNav } from "./nav-href";
import { FooterReveal } from "./footer-reveal";
import { shellContact, SocialIcon } from "./social";

/** Text links: 44px-tall tap rows on phones (RA-10), compact (24px min target) from md up. */
const TAP_LINK = "inline-flex min-h-11 items-center md:min-h-6";

function Social({ ctx, className }: { ctx: StorefrontCtx; className?: string }) {
  const items = shellContact(ctx).social; // LINE via lineChat (ADMIN_B2-10)
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((s) => (
        <a key={s.kind} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="rw-ft-social">
          <SocialIcon kind={s.kind} className="size-4" />
        </a>
      ))}
    </div>
  );
}

function ContactLines({ ctx }: { ctx: StorefrontCtx }) {
  const c = contactOf(ctx);
  return (
    <ul className="space-y-2.5 text-sm text-muted-foreground">
      {c.address && (
        <li className="flex gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-line">{c.address}</span>
        </li>
      )}
      {c.phone && (
        <li className="flex items-center gap-2.5 md:items-start">
          <Phone className="size-4 shrink-0 md:mt-0.5" />
          <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center hover:text-foreground md:min-h-0">
            {c.phone}
          </a>
        </li>
      )}
      {c.email && (
        <li className="flex items-center gap-2.5 md:items-start">
          <Mail className="size-4 shrink-0 md:mt-0.5" />
          <a href={`mailto:${c.email}`} className="inline-flex min-h-11 items-center break-all hover:text-foreground md:min-h-0">
            {c.email}
          </a>
        </li>
      )}
      {c.hours?.slice(0, 2).map((h) => (
        <li key={h.day} className="pl-6.5">
          {h.day}: {h.time}
        </li>
      ))}
    </ul>
  );
}

function FooterLink({ item, className }: { item: NavItem; className?: string }) {
  return (
    <Link href={item.href} {...navTarget(item)} className={cn(TAP_LINK, "rw-ft-link", className)}>
      <RollText underline>{item.label}</RollText>
    </Link>
  );
}

function ColTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="rw-ft-title mono-label mb-4">{children}</h4>;
}

export function SiteFooter({ ctx, nav: rawNav, legal }: { ctx: StorefrontCtx; nav: NavItem[]; legal: Array<{ label: string; href: string }> }) {
  const nav = safeNav(rawNav); // ADMIN_B2-18
  const variant = ctx.theme.layout.footer;
  const year = new Date().getFullYear();
  const tagline = ctx.theme.brand.tagline ?? (ctx.tenant.settings.tagline as string | undefined);
  const showPowered = ctx.tenant.planKey === "starter";
  const groups = nav.filter((n) => n.children?.length);
  const flat = nav.filter((n) => !n.children?.length);
  const brandWord = (ctx.theme.brand.logoText ?? ctx.tenant.name).trim();
  const darkSite = ctx.theme.mode === "dark" || (ctx.theme.mode === "system" && ctx.theme.preset.defaultMode === "dark");

  const bottom = (
    <div className="rw-ft-bottom flex flex-col items-start justify-between gap-4 border-t pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
      <p>
        © {year} {ctx.tenant.name}. สงวนลิขสิทธิ์
      </p>
      <div className="flex flex-wrap items-center gap-x-5 md:gap-y-2">
        {legal.map((l, i) => (
          <Link key={`${l.href}-${i}`} href={l.href} className={TAP_LINK + " rw-ft-link"}>
            <RollText>{l.label}</RollText>
          </Link>
        ))}
        {showPowered && (
          <a href="https://rentweb.app" className={TAP_LINK + " rw-ft-link"} rel="noreferrer">
            {ctx.t("common.poweredBy")}
          </a>
        )}
      </div>
    </div>
  );

  // giant brand wordmark + a meta row above it (live clock on the big layout, back-to-top on every layout — kept away
  // from the bottom-right corner where the floating LINE button sits)
  const wordmark = (effect: "rise" | "spotlight", extra?: { outline?: boolean; className?: string; clock?: boolean; wordClass?: string }) => (
    <div className={cn("rw-ft-mark", extra?.className)}>
      <div className="rw-ft-meta flex items-center justify-between gap-4">
        {extra?.clock ? <LiveClock label="GMT+7" className="text-muted-foreground" /> : <span className="mono-label text-muted-foreground" data-script="latin" aria-hidden>©{String(year).slice(-2)}</span>}
        <BackToTop className="rw-ft-btt" />
      </div>
      {brandWord ? (
        <div className={cn("rw-ft-wordmark mt-2", extra?.wordClass)}>
          <GiantWordmark text={brandWord} effect={effect} outline={extra?.outline} decorative cap={isThai(brandWord) ? undefined : "32vw"} />
        </div>
      ) : null}
    </div>
  );

  if (variant === "simple") {
    return (
      <footer data-site-footer="" data-footer-layout="simple" className="rw-footer border-t">
        <div className="container-x py-10 md:py-14">
          <div className="flex flex-col gap-6 pb-8 md:flex-row md:items-center md:justify-between">
            <Logo ctx={ctx} />
            <nav className="flex flex-wrap gap-x-6 text-sm md:gap-y-2">
              {flat.map((n, i) => (
                <FooterLink key={`${n.href}-${i}`} item={n} className="text-muted-foreground hover:text-foreground" />
              ))}
            </nav>
            <Social ctx={ctx} />
          </div>
          {wordmark("rise", { wordClass: "rw-ft-wordmark--soft" })}
          {bottom}
        </div>
      </footer>
    );
  }

  if (variant === "centered") {
    return (
      <footer data-site-footer="" data-footer-layout="centered" className="rw-footer border-t bg-surface">
        <div className="container-x py-14 text-center md:py-20">
          <div className="flex justify-center">
            <Logo ctx={ctx} size="lg" />
          </div>
          {tagline && <p className="mx-auto mt-4 max-w-md text-pretty text-muted-foreground">{tagline}</p>}
          <nav className="mt-8 flex flex-wrap justify-center gap-x-8 text-sm font-medium md:gap-y-3">
            {flat.map((n, i) => (
              <FooterLink key={`${n.href}-${i}`} item={n} className="hover:text-primary" />
            ))}
          </nav>
          <div className="mt-8 flex justify-center">
            <Social ctx={ctx} />
          </div>
          {wordmark("rise", { outline: true, className: "mt-12 text-left", wordClass: "rw-ft-wordmark--outline" })}
          <div className="mt-6 text-left">{bottom}</div>
        </div>
      </footer>
    );
  }

  if (variant === "big") {
    return (
      <footer data-site-footer="" data-footer-layout="big" className="rw-footer rw-footer-big">
        <FooterReveal />
        <div className="rw-ft-inner container-x pt-16 pb-12 md:pt-24">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <Logo ctx={ctx} inverse size="lg" />
              {tagline && <p className="mt-5 max-w-sm text-pretty text-muted-foreground">{tagline}</p>}
              <div className="mt-7">
                <ContactLines ctx={ctx} />
              </div>
              <Social ctx={ctx} className="mt-7" />
            </div>
            <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
              <div>
                <ColTitle>{ctx.t("common.menu")}</ColTitle>
                <ul className="text-sm md:space-y-2.5">
                  {flat.map((n, i) => (
                    <li key={`${n.href}-${i}`}>
                      <FooterLink item={n} />
                    </li>
                  ))}
                </ul>
              </div>
              {groups.slice(0, 2).map((g) => (
                <div key={g.label}>
                  <ColTitle>{g.label}</ColTitle>
                  <ul className="text-sm md:space-y-2.5">
                    {g.children!.map((c, j) => (
                      <li key={`${c.href}-${j}`}>
                        <FooterLink item={c} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          {wordmark(darkSite ? "spotlight" : "rise", { className: "mt-16 md:mt-24", clock: true })}
          <div className="mt-8">{bottom}</div>
        </div>
      </footer>
    );
  }

  // columns (default)
  return (
    <footer data-site-footer="" data-footer-layout="columns" className="rw-footer border-t bg-surface">
      <div className="container-x pt-14 pb-12 md:pt-20">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <Logo ctx={ctx} />
            {tagline && <p className="mt-4 max-w-xs text-pretty text-sm text-muted-foreground">{tagline}</p>}
            <div className="mt-6">
              <Social ctx={ctx} />
            </div>
          </div>
          <div className="md:col-span-3">
            <ColTitle>{ctx.t("common.menu")}</ColTitle>
            <ul className="text-sm md:space-y-2.5">
              {flat.map((n, i) => (
                <li key={`${n.href}-${i}`}>
                  <FooterLink item={n} className="hover:text-primary" />
                </li>
              ))}
            </ul>
          </div>
          {groups[0] && (
            <div className="md:col-span-2">
              <ColTitle>{groups[0].label}</ColTitle>
              <ul className="text-sm md:space-y-2.5">
                {groups[0].children!.map((c, j) => (
                  <li key={`${c.href}-${j}`}>
                    <FooterLink item={c} className="hover:text-primary" />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={cn(groups[0] ? "md:col-span-3" : "md:col-span-5")}>
            <ColTitle>{ctx.t("common.contactUs")}</ColTitle>
            <ContactLines ctx={ctx} />
          </div>
        </div>
        {wordmark("rise", { className: "mt-14 md:mt-20" })}
        <div className="mt-6">{bottom}</div>
      </div>
    </footer>
  );
}
