import * as React from "react";
import Link from "next/link";
import { ShoppingBag, UserRound } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { LiveClock } from "@rentweb/ui/motion/live-clock";
import type { StorefrontCtx } from "../ctx";
import { Logo } from "./logo";
import { HeaderShell } from "./header-shell";
import { HeaderCta } from "./header-cta";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { CartBadge } from "./cart-badge";
import { ThemeToggle } from "./theme-toggle";
import { isSafeNavHref, safeNav } from "./nav-href";
import { shellContact } from "./social";

/** Presets whose header shows the studio-style live clock by default (`settings.header.clock` overrides). */
const CLOCK_PRESETS = new Set(["obsidian"]);

function Actions({ ctx, cta, compact, clock }: { ctx: StorefrontCtx; cta: { label: string; href: string } | null; compact?: boolean; clock?: boolean }) {
  const hasCommerce = ctx.tenant.modules.includes("commerce");
  const hasAccount = hasCommerce || ctx.tenant.modules.includes("booking") || ctx.tenant.modules.includes("topup") || ctx.tenant.modules.includes("clinic");
  return (
    <div className="flex items-center gap-1">
      {clock && <LiveClock label="GMT+7" className="rw-header-clock mr-2 hidden xl:inline-flex" />}
      {ctx.theme.mode === "system" && <ThemeToggle labels={{ dark: ctx.t("common.darkMode"), light: ctx.t("common.lightMode") }} />}
      {hasAccount && (
        <Button asChild variant="ghost" size="icon" className="rw-header-icon text-current md:size-9" aria-label={ctx.t("common.account")}>
          <Link href="/account">
            <UserRound className="size-5" />
          </Link>
        </Button>
      )}
      {hasCommerce && (
        <Button asChild variant="ghost" size="icon" className="rw-header-icon relative text-current md:size-9" aria-label={ctx.t("cart.title")}>
          <Link href="/cart" data-cart-icon="">
            <ShoppingBag className="size-5" />
            <CartBadge count={ctx.cartCount ?? 0} />
          </Link>
        </Button>
      )}
      {cta && !compact && <HeaderCta cta={cta} />}
    </div>
  );
}

export function SiteHeader({ ctx, nav: rawNav }: { ctx: StorefrontCtx; nav: NavItem[] }) {
  const nav = safeNav(rawNav); // ADMIN_B2-18: never render a javascript:/data:/… href; honour `external`
  const layout = ctx.theme.layout;
  const headerSettings = (ctx.tenant.settings.header as { cta?: { label: string; href: string }; clock?: boolean } | undefined) ?? {};
  const cta = headerSettings.cta?.label && isSafeNavHref(headerSettings.cta.href) ? headerSettings.cta : null;
  const clock = typeof headerSettings.clock === "boolean" ? headerSettings.clock : CLOCK_PRESETS.has(ctx.theme.preset.key);
  const variant = layout.header;
  const contact = shellContact(ctx);

  const mobile = <MobileNav items={nav} title={ctx.tenant.name} cta={cta} contact={contact} />;

  if (variant === "centered") {
    return (
      <HeaderShell variant={variant} transparent={layout.headerTransparent} sticky={layout.headerSticky}>
        <div className="container-x flex flex-col items-center md:py-1">
          <div data-header-row="centered" className="flex h-16 w-full items-center justify-between md:h-auto md:justify-center md:py-3">
            <div className="w-10 md:hidden" />
            <Logo ctx={ctx} size="lg" />
            <div className="flex items-center md:absolute md:right-[max(1rem,calc((100%-var(--container))/2+1rem))]">
              <Actions ctx={ctx} cta={cta} compact clock={clock} />
              {mobile}
            </div>
          </div>
          <NavLinks items={nav} className="rw-nav-centered pb-3" />
        </div>
      </HeaderShell>
    );
  }

  if (variant === "split") {
    const mid = Math.ceil(nav.length / 2);
    return (
      <HeaderShell variant={variant} transparent={layout.headerTransparent} sticky={layout.headerSticky}>
        <div data-header-row="" className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-20">
          <NavLinks items={nav.slice(0, mid)} className="justify-start" />
          <div className="justify-self-start md:hidden">{mobile}</div>
          <Logo ctx={ctx} size="md" className="justify-self-center" />
          <div className="flex items-center justify-end gap-1">
            <NavLinks items={nav.slice(mid)} />
            <Actions ctx={ctx} cta={cta} clock={clock} />
          </div>
        </div>
      </HeaderShell>
    );
  }

  if (variant === "floating") {
    return (
      <HeaderShell variant={variant} transparent={layout.headerTransparent} sticky>
        <Logo ctx={ctx} size="sm" />
        <NavLinks items={nav} className="mx-auto" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Actions ctx={ctx} cta={cta} clock={clock} />
          {mobile}
        </div>
      </HeaderShell>
    );
  }

  if (variant === "minimal" || variant === "sidebar") {
    // only the first 3 items fit inline: keep the menu button on tablet/desktop when there are more (RA-01)
    const inline = nav.slice(0, 3);
    return (
      <HeaderShell variant={variant} transparent={layout.headerTransparent} sticky={layout.headerSticky}>
        <div data-header-row="" className="container-x flex h-16 items-center justify-between md:h-20">
          <Logo ctx={ctx} />
          <div className="flex items-center gap-1">
            <NavLinks items={inline} />
            <Actions ctx={ctx} cta={cta} clock={clock} />
            <MobileNav items={nav} title={ctx.tenant.name} cta={cta} contact={contact} desktop={nav.length > inline.length} />
          </div>
        </div>
      </HeaderShell>
    );
  }

  // classic
  return (
    <HeaderShell variant="classic" transparent={layout.headerTransparent} sticky={layout.headerSticky}>
      <div data-header-row="" className="container-x flex h-16 items-center justify-between gap-6 md:h-20">
        <Logo ctx={ctx} />
        <NavLinks items={nav} className="mx-auto" />
        <div className="flex items-center gap-1">
          <Actions ctx={ctx} cta={cta} clock={clock} />
          {mobile}
        </div>
      </div>
    </HeaderShell>
  );
}
