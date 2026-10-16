import Link from "next/link";
import { UserRound } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { BOOKING_STATUS } from "@rentweb/module-booking/admin/labels";
import { Avatar } from "@rentweb/module-booking/admin/ui";
import { bkkMinutes, hm, STATUS_CHIP } from "./calendar-style";

export interface GridBooking {
  id: string;
  number: string;
  status: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  serviceName: string;
  staffId: string | null;
  partySize: number;
  paymentStatus: string;
  depositAmount: number;
}

export interface GridColumn {
  /** null = "ไม่ระบุ" */
  id: string | null;
  name: string;
  color: string;
  avatar: string | null;
}

const ROW_H = 44; // px per 30 minutes
const STEP = 30;

interface Placed extends GridBooking {
  top: number;
  height: number;
  lane: number;
  lanes: number;
  startMin: number;
  endMin: number;
}

/** Greedy lane assignment inside clusters of overlapping bookings of one column. */
function place(list: GridBooking[], openMin: number): Placed[] {
  const items = list
    .map((b) => {
      const startMin = bkkMinutes(b.startsAt);
      const endRaw = bkkMinutes(b.endsAt);
      const endMin = endRaw <= startMin ? Math.max(startMin + STEP, 24 * 60) : endRaw;
      return { ...b, startMin, endMin, top: 0, height: 0, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((e) => e <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.endMin);
      } else laneEnds[lane] = it.endMin;
      it.lane = lane;
    }
    for (const it of cluster) it.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length) flush();
  for (const it of out) {
    it.top = ((it.startMin - openMin) / STEP) * ROW_H;
    it.height = Math.max(ROW_H - 4, ((it.endMin - it.startMin) / STEP) * ROW_H - 4);
  }
  return out;
}

export function DayGrid({
  slug,
  date,
  columns,
  bookings,
  openMin,
  closeMin,
  nowMin,
  canCreate,
}: {
  slug: string;
  date: string;
  columns: GridColumn[];
  bookings: GridBooking[];
  openMin: number;
  closeMin: number;
  /** minutes since midnight when the grid shows today, else null */
  nowMin: number | null;
  canCreate: boolean;
}) {
  const rows: number[] = [];
  for (let m = openMin; m < closeMin; m += STEP) rows.push(m);
  const height = rows.length * ROW_H;
  const minW = 56 + columns.length * 168;

  return (
    <div className="card min-w-0 overflow-hidden p-0" data-testid="day-grid">
      <div className="max-h-[75vh] overflow-auto overscroll-x-contain">
        <div style={{ minWidth: minW }}>
          {/* header */}
          <div className="sticky top-0 z-20 flex border-b bg-card/95 backdrop-blur">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-card/95" />
            {columns.map((c) => {
              const n = bookings.filter((b) => b.staffId === c.id).length;
              return (
                <div key={c.id ?? "none"} className="flex min-w-0 flex-1 items-center gap-2 border-r px-3 py-2 last:border-r-0" style={{ boxShadow: c.id ? `inset 0 3px 0 ${c.color}` : undefined }}>
                  {c.id ? (
                    <Avatar src={c.avatar} name={c.name} color={c.color} size="sm" />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground">
                      <UserRound className="size-4" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{n ? `${n} คิว` : "ว่าง"}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* body */}
          <div className="relative flex pt-2" style={{ height: height + 8 }}>
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-card">
              {rows.map((m) => (
                <div key={m} className="relative border-b border-dashed border-border/60 pr-2 text-right text-[11px] tabular-nums text-muted-foreground" style={{ height: ROW_H }}>
                  {m % 60 === 0 ? <span className="absolute -top-2 right-2 bg-card px-0.5 font-medium text-foreground/70">{hm(m)}</span> : <span className="absolute -top-2 right-2 bg-card px-0.5">{hm(m)}</span>}
                </div>
              ))}
            </div>
            {columns.map((c) => {
              const placed = place(
                bookings.filter((b) => b.staffId === c.id),
                openMin,
              );
              return (
                <div key={c.id ?? "none"} className={cn("relative min-w-0 flex-1 border-r last:border-r-0", !c.id && "bg-muted/30")} data-testid={`col-${c.id ?? "none"}`}>
                  {rows.map((m) =>
                    canCreate ? (
                      <Link
                        key={m}
                        href={`/t/${slug}/bookings/new?date=${date}&time=${hm(m)}${c.id ? `&staff=${c.id}` : ""}`}
                        tabIndex={-1}
                        aria-hidden
                        className={cn("block border-b transition-colors hover:bg-primary-soft/40", m % 60 === 30 ? "border-border/70" : "border-dashed border-border/50")}
                        style={{ height: ROW_H }}
                      />
                    ) : (
                      <div key={m} className={cn("border-b", m % 60 === 30 ? "border-border/70" : "border-dashed border-border/50")} style={{ height: ROW_H }} />
                    ),
                  )}
                  {placed.map((b) => {
                    const st = BOOKING_STATUS[b.status];
                    const short = b.height < ROW_H * 1.5;
                    return (
                      <Link
                        key={b.id}
                        href={`/t/${slug}/bookings/${b.id}`}
                        data-testid="booking-chip"
                        data-booking={b.number}
                        className={cn("absolute z-[5] overflow-hidden rounded-lg px-2 py-1 text-xs shadow-xs ring-1 ring-inset transition hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring", STATUS_CHIP[b.status] ?? STATUS_CHIP.confirmed)}
                        style={{ top: b.top + 2, height: b.height, left: `calc(${(b.lane / b.lanes) * 100}% + 3px)`, width: `calc(${100 / b.lanes}% - 6px)`, borderLeft: `4px solid ${c.color}` }}
                        title={`${hm(b.startMin)}–${hm(b.endMin)} · ${b.serviceName} · ${b.customerName} · ${st?.label ?? b.status}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold tabular-nums">
                            {hm(b.startMin)}
                            {!short && `–${hm(b.endMin)}`}
                          </span>
                          {b.status === "pending" && b.depositAmount > 0 && b.paymentStatus === "unpaid" && <span className="shrink-0 rounded bg-amber-500 px-1 text-[10px] font-semibold text-white">มัดจำ</span>}
                        </span>
                        <span className="block truncate font-medium">{b.serviceName}</span>
                        {!short && (
                          <span className="block truncate opacity-80">
                            {b.customerName}
                            {b.partySize > 1 && ` (${b.partySize} คน)`}
                          </span>
                        )}
                        {b.height > ROW_H * 2.4 && <span className="mt-0.5 block truncate text-[10px] font-medium uppercase opacity-70">{st?.label ?? b.status}</span>}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
            {nowMin !== null && nowMin >= openMin && nowMin <= closeMin && (
              <div className="pointer-events-none absolute left-14 right-0 z-[6] border-t-2 border-rose-500" style={{ top: 8 + ((nowMin - openMin) / STEP) * ROW_H }} aria-hidden>
                <span className="absolute -left-1.5 -top-[5px] size-2 rounded-full bg-rose-500" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
