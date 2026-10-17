import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { BOOKING_STATUS, PAY_AT_SHOP_LABEL, SOURCE_LABEL, THAI_WEEKDAYS } from "@rentweb/module-booking/admin/labels";
import { ColorDot, StatusPill } from "@rentweb/module-booking/admin/ui";
import { thb } from "@/lib/format";
import { bkkMinutes, hm, STATUS_DOT } from "./calendar-style";

export interface WeekBooking {
  id: string;
  number: string;
  status: string;
  source: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
  staffName: string | null;
  staffColor: string | null;
  price: number;
  /** ADMIN_B2-04: no deposit taken (no payment receiver) — pay at the shop */
  payAtShop?: boolean;
  day: string;
}

export function WeekList({ slug, days, bookings, today, dayHref }: { slug: string; days: Array<{ ymd: string; weekday: number; label: string }>; bookings: WeekBooking[]; today: string; dayHref: (ymd: string) => string }) {
  return (
    <div className="space-y-4" data-testid="week-list">
      {days.map((d) => {
        const list = bookings.filter((b) => b.day === d.ymd);
        return (
          <section key={d.ymd} className={cn("card overflow-hidden p-0", d.ymd === today && "ring-2 ring-primary/40")}>
            <header className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
              <Link href={dayHref(d.ymd)} className="flex min-w-0 items-baseline gap-2 hover:text-primary">
                <span className={cn("font-heading text-base font-semibold", (d.weekday === 0 || d.weekday === 6) && "text-primary")}>{THAI_WEEKDAYS[d.weekday]}</span>
                <span className="truncate text-sm text-muted-foreground">{d.label}</span>
                {d.ymd === today && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">วันนี้</span>}
              </Link>
              <Link href={dayHref(d.ymd)} className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                {list.length ? `${list.length} คิว` : "ไม่มีคิว"} <ChevronRight className="size-4" aria-hidden />
              </Link>
            </header>
            {list.length > 0 && (
              <ul className="divide-y">
                {list.map((b) => (
                  <li key={b.id}>
                    <Link href={`/t/${slug}/bookings/${b.id}`} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <span className="tabular-nums">
                        <span className="block font-semibold">{hm(bkkMinutes(b.startsAt))}</span>
                        <span className="block text-xs text-muted-foreground">{hm(bkkMinutes(b.endsAt))}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[b.status])} aria-hidden />
                          <span className={cn("truncate font-medium", (b.status === "cancelled" || b.status === "no_show") && "line-through opacity-70")}>{b.serviceName}</span>
                        </span>
                        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="truncate">{b.customerName}</span>
                          {b.staffName && (
                            <span className="inline-flex items-center gap-1">
                              <ColorDot color={b.staffColor ?? "#64748b"} /> {b.staffName}
                            </span>
                          )}
                          <span className="hidden sm:inline">· {SOURCE_LABEL[b.source] ?? b.source}</span>
                          <span className="hidden font-mono sm:inline">· {b.number}</span>
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <StatusPill map={BOOKING_STATUS} status={b.status} />
                        <span className="text-xs tabular-nums text-muted-foreground">{b.price ? thb(b.price) : ""}</span>
                        {b.payAtShop && b.status !== "cancelled" && b.status !== "no_show" && (
                          <span data-testid="pay-at-shop-chip" className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-900 dark:bg-sky-500/15 dark:text-sky-100">
                            {PAY_AT_SHOP_LABEL}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
