import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode, UtensilsCrossed } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { CtaButton, Eyebrow, RevealHeading } from "@rentweb/storefront";
import { getActiveMenu, restaurantConfigOf } from "@rentweb/module-restaurant/services";
import { MenuBrowser, MenuCover, coverDish } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ item?: string }>;

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "restaurant", "menu", { title: "เมนู" }) : {};
}

/**
 * /menu (marketing) – a printed-menu cover with steam over the signature dish, then the menu book: sticky category
 * index + plate preview on desktop (chip bar on phones), dishes as menu lines; the cart continues into pickup (/order)
 * or the table flow (/t/[qr]).
 */
export default async function MenuPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { item } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("restaurant")) return cmsFallback(runtime, "menu");
  const cfg = restaurantConfigOf(runtime.config);
  const menu = await tenantTx(tenantId, (tx) => getActiveMenu(tx, tenantId));
  const dishes = menu ? menu.categories.reduce((n, c) => n + c.items.length, 0) : 0;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-2 md:pt-14 lg:pb-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="lg:col-span-6 xl:col-span-7">
            <Eyebrow text={runtime.config.name} index={menu ? `(${String(dishes).padStart(2, "0")})` : undefined} className="mb-5" />
            <RevealHeading as="h1" text={L.menu} trigger="mount" mode="words" className="font-heading text-step-6 font-semibold" />
            <Reveal delay={0.15}>
              <p className="mt-5 max-w-xl text-step-1 leading-relaxed text-pretty text-muted-foreground">{L.menuSubtitle}</p>
            </Reveal>
            <Reveal delay={0.25} className="mt-7 flex flex-wrap gap-3">
              {cfg.pickup && <CtaButton href="/order" label={L.pickup} size="lg" />}
              <CtaButton href="/reserve" label={L.reserve} size="lg" variant="outline" arrow={false} />
            </Reveal>
            {cfg.dineIn && (
              <Reveal delay={0.32}>
                <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <QrCode className="size-4 text-primary" aria-hidden /> {L.scanHint}
                </p>
              </Reveal>
            )}
            {menu && menu.categories.length > 0 && (
              <p aria-hidden className="mt-8 hidden flex-wrap gap-x-5 gap-y-1 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase lg:flex">
                <span>{String(menu.categories.length).padStart(2, "0")} หมวด</span>
                <span>{String(dishes).padStart(2, "0")} จาน</span>
                <span>{L.poweredHint}</span>
              </p>
            )}
          </div>
          {menu && menu.categories.length > 0 && (
            <div className="lg:col-span-6 xl:col-span-5">
              <MenuCover dish={coverDish(menu)} brand={runtime.config.name} count={dishes} className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/5]" />
            </div>
          )}
        </div>
      </section>

      {menu && menu.categories.length ? (
        <MenuBrowser menu={menu} mode={{ kind: "browse" }} layout="editorial" serviceChargePercent={0} initialItemId={item ?? null} />
      ) : (
        <section className="container-x pt-6 pb-24">
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UtensilsCrossed className="size-6" />
            </span>
            <p className="font-heading text-xl font-semibold">ยังไม่มีเมนูในขณะนี้</p>
            <p className="text-sm text-muted-foreground">กรุณากลับมาใหม่อีกครั้ง หรือติดต่อร้านโดยตรง</p>
            <Button asChild variant="outline" size="lg" className="mt-2">
              <Link href="/reserve">{L.reserve}</Link>
            </Button>
          </div>
        </section>
      )}
    </PageBody>
  );
}
