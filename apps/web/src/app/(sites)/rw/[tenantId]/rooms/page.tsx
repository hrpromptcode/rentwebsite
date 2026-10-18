import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, CalendarDays } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { fromPrices, listUnitTypes, rentalConfig, isValidYmd } from "@rentweb/module-rental/services";
import { RoomCard, L } from "@rentweb/module-rental/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "rental", "rooms", { title: L.roomsTitle }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ from?: string; to?: string; guests?: string }>;

/** /rooms – every room type with its lowest nightly rate; the searched dates (if any) are carried into each room page. */
export default async function RoomsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("rental")) return cmsFallback(runtime, "rooms");
  const config = rentalConfig(runtime.config.moduleConfig);
  const from = sp.from && isValidYmd(sp.from) ? sp.from : null;
  const to = from && sp.to && isValidYmd(sp.to) && sp.to > from ? sp.to : null;
  const guests = Number(sp.guests) > 0 ? Math.floor(Number(sp.guests)) : null;
  const query = from && to ? `?from=${from}&to=${to}${guests ? `&guests=${guests}` : ""}` : "";

  const { types, prices } = await tenantTx(tenantId, async (tx) => {
    const types = await listUnitTypes(tx, tenantId, { activeOnly: true });
    return { types, prices: await fromPrices(tx, tenantId, types) };
  });

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{L.roomsTitle}</h1>
            <p className="mt-4 text-muted-foreground">
              {types.length} ประเภทห้อง · ราคา “{L.from}” คือราคาต่อคืนต่ำสุดในช่วง 60 วันข้างหน้า · {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}
            </p>
          </div>
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href={from && to ? `/stay${query}` : "/stay"}>
              <CalendarDays className="size-4" /> {from && to ? L.changeDates : L.search}
            </Link>
          </Button>
        </Reveal>

        {types.length === 0 ? (
          <div className="card mt-10 flex flex-col items-center gap-3 p-10 text-center">
            <BedDouble className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{L.noRooms}</p>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">ติดต่อที่พัก</Link>
            </Button>
          </div>
        ) : (
          <Stagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((t, i) => (
              <StaggerItem key={t.id} className="h-full">
                <RoomCard type={t} fromPrice={prices[t.id] ?? t.basePrice} query={query} priority={i < 3} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>
    </PageBody>
  );
}
