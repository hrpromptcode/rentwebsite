import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, QrCode, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { getActiveMenu, restaurantConfigOf } from "@rentweb/module-restaurant/services";
import { MenuBrowser } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback } from "@/lib/cms-fallback";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ item?: string }>;

export const metadata: Metadata = { title: "เมนู" };

/** /menu – browse the active menu; the cart continues into pickup (/order) or the table flow (/t/[qr]). */
export default async function MenuPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { item } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("restaurant")) return cmsFallback(runtime, "menu");
  const cfg = restaurantConfigOf(runtime.config);
  const menu = await tenantTx(tenantId, (tx) => getActiveMenu(tx, tenantId));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-4 md:pt-10 md:pb-6">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">{runtime.config.name}</p>
          <h1 className="font-heading mt-1 text-4xl font-semibold md:text-6xl">{L.menu}</h1>
          <p className="mt-3 max-w-xl text-muted-foreground md:text-lg">{L.menuSubtitle}</p>
        </Reveal>
        <Reveal delay={0.1} className="mt-5 flex flex-wrap gap-2">
          {cfg.pickup && (
            <Button asChild size="lg">
              <Link href="/order">
                <ShoppingBag className="size-5" /> {L.pickup}
              </Link>
            </Button>
          )}
          <Button asChild size="lg" variant="outline">
            <Link href="/reserve">
              <CalendarCheck className="size-5" /> {L.reserve}
            </Link>
          </Button>
        </Reveal>
        {cfg.dineIn && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <QrCode className="size-4" /> {L.scanHint}
          </p>
        )}
      </section>

      {menu && menu.categories.length ? (
        <MenuBrowser menu={menu} mode={{ kind: "browse" }} serviceChargePercent={0} initialItemId={item ?? null} />
      ) : (
        <section className="container-x pb-24">
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <UtensilsCrossed className="size-10 text-muted-foreground" />
            <p className="font-medium">ยังไม่มีเมนูในขณะนี้</p>
            <p className="text-sm text-muted-foreground">กรุณากลับมาใหม่อีกครั้ง หรือติดต่อร้านโดยตรง</p>
          </div>
        </section>
      )}
    </PageBody>
  );
}
