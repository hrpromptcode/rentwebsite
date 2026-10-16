import * as React from "react";
import Link from "next/link";
import { ChevronDown, ShoppingBag, UserRound } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "../ctx";
import { Logo } from "./logo";
import { HeaderShell } from "./header-shell";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

function NavLinks({ items, className, itemClass }: { items: NavItem[]; className?: string; itemClass?: string }) {
  return (
    <nav className={cn("hidden items-center gap-1 md:flex", className)}>
      {items.map((it, i) => (
        <div key={`${it.href}-${i}`} className="group relative">
          <Link
            href={it.href}
            className={cn(
              "inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm font-medium opacity-85 transition hover:bg-foreground/5 hover:opacity-100",
              itemClass,
            )}
          >
            {it.label}
            {it.children?.length ? <ChevronDown className="size-3.5 opacity-60 transition group-hover:rotate-180" /> : null}
          </Link>
          {it.children?.length ? (
            <div className="invisible absolute top-full left-0 z-50 min-w-56 translate-y-2 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="card flex flex-col gap-0.5 p-2 text-foreground">
                {it.children.map((c, j) => (
                  <Link key={`${c.href}-${j}`} href={c.href} className="rounded-[var(--radius-md)] px-3 py-2 text-sm hover:bg-muted">
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

function Actions({ ctx, cta, compact }: { ctx: StorefrontCtx; cta: { label: string; href: string } | null; compact?: boolean }) {
  const hasCommerce = ctx.tenant.modules.includes("commerce");
  const hasAccount = hasCommerce || ctx.tenant.modules.includes("booking") || ctx.tenant.modules.includes("topup") || ctx.tenant.modules.includes("clinic");
  return (
    <div className="flex items-center gap-1">
      {ctx.theme.mode === "system" && <ThemeToggle labels={{ dark: ctx.t("common.darkMode"), light: ctx.t("common.lightMode") }} />}
      {hasAccount && (
        <Button asChild variant="ghost" size="icon" className="text-current md:size-9" aria-label={ctx.t("common.account")}>
          <Link href="/account">
            <UserRound className="size-5" />
          </Link>
        </Button>
      )}
      {hasCommerce && (
        <Button asChild variant="ghost" size="icon" className="relative text-current md:size-9" aria-label={ctx.t("cart.title")}>
          <Link href="/cart">
            <ShoppingBag className="size-5" />
            {!!ctx.cartCount && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{ctx.cartCount}</span>
            )}
          </Link>
        </Button>
      )}
      {cta && !compact && (
        <Button asChild size="sm" className="ml-1 hidden md:inline-flex">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}

export function SiteHeader({ ctx, nav }: { ctx: StorefrontCtx; nav: NavItem[] }) {
  const layout = ctx.theme.layout;
  const headerSettings = (ctx.tenant.settings.header as { cta?: { label: string; href: string } } | undefined) ?? {};
  const cta = headerSettings.cta ?? null;
  const variant = layout.header;

  const mobile = <MobileNav items={nav} title={ctx.tenant.name} cta={cta} />;

  if (variant === "centered") {
    return (
      <HeaderShell variant={variant} transparent={layout.headerTransparent} sticky={layout.headerSticky}>
        <div className="container-x flex flex-col items-center md:py-2">
          <div className="flex h-16 w-full items-center justify-between md:h-auto md:justify-center md:py-3">
            <div className="w-10 md:hidden" />
            <Logo ctx={ctx} size="lg" />
            <div className="flex items-center md:absolute md:right-[max(1rem,calc((100%-var(--container))/2+1rem))]">
              <Actions ctx={ctx} cta={cta} compact />
              {mobile}
            </div>
          </div>
          <NavLinks items={nav} className="pb-3" />
        </div>
      </HeaderShell>
    );
  }

  if (variant === "split") {
    const mid = Math.ceil(nav.length / 2);
    return (
      <HeaderShell variant={variant} transparent={layout.headerTransparent} sticky={layout.headerSticky}>
        <div className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-20">
          <NavLinks items={nav.slice(0, mid)} className="justify-start" />
          <div className="justify-self-start md:hidden">{mobile}</div>
          <Logo ctx={ctx} size="md" className="justify-self-center" />
          <div className="flex items-center justify-end gap-1">
            <NavLinks items={nav.slice(mid)} />
            <Actions ctx={ctx} cta={cta} />
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
          <Actions ctx={ctx} cta={cta} />
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
        <div className="container-x flex h-16 items-center justify-between md:h-20">
          <Logo ctx={ctx} />
          <div className="flex items-center gap-1">
            <NavLinks items={inline} />
            <Actions ctx={ctx} cta={cta} />
            <MobileNav items={nav} title={ctx.tenant.name} cta={cta} desktop={nav.length > inline.length} />
          </div>
        </div>
      </HeaderShell>
    );
  }

  // classic
  return (
    <HeaderShell variant="classic" transparent={layout.headerTransparent} sticky={layout.headerSticky}>
      <div className="container-x flex h-16 items-center justify-between gap-6 md:h-20">
        <Logo ctx={ctx} />
        <NavLinks items={nav} className="mx-auto" />
        <div className="flex items-center gap-1">
          <Actions ctx={ctx} cta={cta} />
          {mobile}
        </div>
      </div>
    </HeaderShell>
  );
}
