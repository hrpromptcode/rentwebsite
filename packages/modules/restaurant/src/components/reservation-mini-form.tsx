"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Clock, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { addDays, reservationSlots, type HoursRange } from "../services/time";
import { L } from "../labels";

const field = "flex h-12 w-full items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-background px-3 text-sm";
const select = "h-full w-full min-w-0 appearance-none bg-transparent text-base outline-none md:text-sm";

/** Date / time / party mini form on the home page → /reserve?date&time&size */
export function ReservationMiniForm({ hours, today, nowIso, className, dark }: { hours: HoursRange; today: string; nowIso: string; className?: string; dark?: boolean }) {
  const router = useRouter();
  const [date, setDate] = React.useState(today);
  const slots = React.useMemo(() => reservationSlots({ hours, ymd: date, now: new Date(nowIso) }), [hours, date, nowIso]);
  const [time, setTime] = React.useState("");
  const [size, setSize] = React.useState(2);
  React.useEffect(() => {
    if (!slots.includes(time)) setTime(slots[Math.min(slots.length - 1, Math.floor(slots.length / 2))] ?? "");
  }, [slots, time]);

  return (
    <form
      className={cn("grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const qs = new URLSearchParams({ date, ...(time ? { time } : {}), size: String(size) });
        router.push(`/reserve?${qs}`);
      }}
    >
      <label className={cn(field, dark && "border-white/25 bg-white/10 text-white")}>
        <CalendarDays className="size-4 shrink-0 opacity-70" />
        <span className="sr-only">{L.date}</span>
        <input type="date" value={date} min={today} max={addDays(today, 60)} onChange={(e) => setDate(e.target.value || today)} className={cn(select, dark && "[color-scheme:dark]")} />
      </label>
      <label className={cn(field, dark && "border-white/25 bg-white/10 text-white")}>
        <Clock className="size-4 shrink-0 opacity-70" />
        <span className="sr-only">{L.time}</span>
        <select value={time} onChange={(e) => setTime(e.target.value)} className={cn(select, dark && "[&>option]:text-foreground")} disabled={!slots.length}>
          {slots.length ? slots.map((s) => <option key={s} value={s}>{s} น.</option>) : <option value="">เต็มแล้ว</option>}
        </select>
      </label>
      <label className={cn(field, "sm:w-32", dark && "border-white/25 bg-white/10 text-white")}>
        <Users className="size-4 shrink-0 opacity-70" />
        <span className="sr-only">{L.partySize}</span>
        <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={cn(select, dark && "[&>option]:text-foreground")}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} คน
            </option>
          ))}
          <option value={16}>12+ คน</option>
        </select>
      </label>
      <Button type="submit" size="lg" className="h-12">
        {L.reserve}
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
