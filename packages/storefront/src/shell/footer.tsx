import * as React from "react";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { NavItem } from "@rentweb/db";
import { cn } from "@rentweb/ui/lib/utils";
import { contactOf, type StorefrontCtx } from "../ctx";
import { Logo } from "./logo";

function Facebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

function Instagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function Social({ ctx }: { ctx: StorefrontCtx }) {
  const c = contactOf(ctx);
  const items = [
    c.facebook && { href: c.facebook, icon: Facebook, label: "Facebook" },
    c.instagram && { href: c.instagram, icon: Instagram, label: "Instagram" },
    c.lineId && { href: c.lineUrl ?? `https://line.me/R/ti/p/${encodeURIComponent(c.lineId)}`, icon: MessageCircle, label: "LINE" },
  ].filter(Boolean) as Array<{ href: string; icon: typeof Facebook; label: string }>;
  if (!items.length) return null;
  return (
    <div className="flex gap-2">
      {items.map((s) => (
        <a key={s.label} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="flex size-10 items-center justify-center rounded-full border transition hover:bg-foreground hover:text-background">
          <s.icon className="size-4" />
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
        <li className="flex gap-2.5">
          <Phone className="mt-0.5 size-4 shrink-0" />
          <a href={`tel:${c.phone}`} className="hover:text-foreground">
            {c.phone}
          </a>
        </li>
      )}
      {c.email && (
        <li className="flex gap-2.5">
          <Mail className="mt-0.5 size-4 shrink-0" />
          <a href={`mailto:${c.email}`} className="hover:text-foreground">
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

export function SiteFooter({ ctx, nav, legal }: { ctx: StorefrontCtx; nav: NavItem[]; legal: Array<{ label: string; href: string }> }) {
  const variant = ctx.theme.layout.footer;
  const year = new Date().getFullYear();
  const tagline = ctx.theme.brand.tagline ?? (ctx.tenant.settings.tagline as string | undefined);
  const showPowered = ctx.tenant.planKey === "trial" || ctx.tenant.planKey === "starter";
  const groups = nav.filter((n) => n.children?.length);
  const flat = nav.filter((n) => !n.children?.length);

  const bottom = (
    <div className="flex flex-col items-start justify-between gap-4 border-t pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
      <p>
        © {year} {ctx.tenant.name}. สงวนลิขสิทธิ์
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {legal.map((l, i) => (
          <Link key={`${l.href}-${i}`} href={l.href} className="hover:text-foreground">
            {l.label}
          </Link>
        ))}
        {showPowered && (
          <a href="https://rentweb.app" className="hover:text-foreground" rel="noreferrer">
            {ctx.t("common.poweredBy")}
          </a>
        )}
      </div>
    </div>
  );

  if (variant === "simple") {
    return (
      <footer className="border-t">
        <div className="container-x py-10">
          <div className="flex flex-col gap-6 pb-6 md:flex-row md:items-center md:justify-between">
            <Logo ctx={ctx} />
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {flat.map((n, i) => (
                <Link key={`${n.href}-${i}`} href={n.href} className="text-muted-foreground hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
            <Social ctx={ctx} />
          </div>
          {bottom}
        </div>
      </footer>
    );
  }

  if (variant === "centered") {
    return (
      <footer className="border-t bg-surface">
        <div className="container-x py-14 text-center">
          <div className="flex justify-center">
            <Logo ctx={ctx} size="lg" />
          </div>
          {tagline && <p className="mx-auto mt-4 max-w-md text-muted-foreground">{tagline}</p>}
          <nav className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-medium">
            {flat.map((n, i) => (
              <Link key={`${n.href}-${i}`} href={n.href} className="hover:text-primary">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 flex justify-center">
            <Social ctx={ctx} />
          </div>
          <div className="mt-10">{bottom}</div>
        </div>
      </footer>
    );
  }

  if (variant === "big") {
    return (
      <footer className="overflow-hidden border-t bg-foreground text-background">
        <div className="container-x py-14">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <Logo ctx={ctx} inverse size="lg" />
              {tagline && <p className="mt-4 max-w-sm text-background/70">{tagline}</p>}
              <div className="mt-6 [&_a]:hover:text-background [&_a:hover]:bg-background [&_a:hover]:text-foreground [&_li]:text-background/70">
                <ContactLines ctx={ctx} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
              <div>
                <h4 className="mb-4 text-xs font-semibold tracking-widest text-background/60 uppercase">{ctx.t("common.menu")}</h4>
                <ul className="space-y-2.5 text-sm">
                  {flat.map((n, i) => (
                    <li key={`${n.href}-${i}`}>
                      <Link href={n.href} className="text-background/85 hover:text-background">
                        {n.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {groups.slice(0, 2).map((g) => (
                <div key={g.label}>
                  <h4 className="mb-4 text-xs font-semibold tracking-widest text-background/60 uppercase">{g.label}</h4>
                  <ul className="space-y-2.5 text-sm">
                    {g.children!.map((c, j) => (
                      <li key={`${c.href}-${j}`}>
                        <Link href={c.href} className="text-background/85 hover:text-background">
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-14 select-none overflow-hidden" aria-hidden>
            <p className="heading-display -mb-[0.2em] text-[clamp(3rem,14vw,12rem)] font-semibold leading-none text-background/10 whitespace-nowrap">{ctx.tenant.name}</p>
          </div>
          <div className="[&_*]:border-background/20 [&_a]:text-background/60 [&_a:hover]:text-background [&_p]:text-background/60">{bottom}</div>
        </div>
      </footer>
    );
  }

  // columns (default)
  return (
    <footer className="border-t bg-surface">
      <div className="container-x py-14">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <Logo ctx={ctx} />
            {tagline && <p className="mt-4 max-w-xs text-sm text-muted-foreground">{tagline}</p>}
            <div className="mt-6">
              <Social ctx={ctx} />
            </div>
          </div>
          <div className="md:col-span-3">
            <h4 className="mb-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase">{ctx.t("common.menu")}</h4>
            <ul className="space-y-2.5 text-sm">
              {flat.map((n, i) => (
                <li key={`${n.href}-${i}`}>
                  <Link href={n.href} className="hover:text-primary">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {groups[0] && (
            <div className="md:col-span-2">
              <h4 className="mb-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase">{groups[0].label}</h4>
              <ul className="space-y-2.5 text-sm">
                {groups[0].children!.map((c, j) => (
                  <li key={`${c.href}-${j}`}>
                    <Link href={c.href} className="hover:text-primary">
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={cn(groups[0] ? "md:col-span-3" : "md:col-span-5")}>
            <h4 className="mb-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase">{ctx.t("common.contactUs")}</h4>
            <ContactLines ctx={ctx} />
          </div>
        </div>
        <div className="mt-12">{bottom}</div>
      </div>
    </footer>
  );
}
