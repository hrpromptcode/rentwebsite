"use client";

import * as React from "react";
import { AlertCircle, CalendarDays, Check, Loader2, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";
import { formatBkkTime, formatThaiYmd } from "../services/time";
import { MonthCalendar, type DayInfo } from "./month-calendar";
import { SlotPicker, type SlotChip } from "./slot-picker";

export interface ReschedulePanelProps {
  serviceId: string;
  staffId: string | null;
  today: string;
  maxDate: string;
  /** server action bound to the booking; returns an error message or redirects */
  action: (start: string) => Promise<{ error: string } | void>;
  onClose: () => void;
  className?: string;
  showRemaining?: boolean;
  /** guests of the booking (group services) – slots must fit the whole party */
  partySize?: number;
}

/** Calendar + slot picker used on /bookings/[id] to move an appointment. */
export function ReschedulePanel({ serviceId, staffId, today, maxDate, action, onClose, className, showRemaining, partySize }: ReschedulePanelProps) {
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [date, setDate] = React.useState<string | null>(null);
  const [start, setStart] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<Record<string, Record<string, DayInfo>>>({});
  const [slots, setSlots] = React.useState<Record<string, SlotChip[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const staffParam = staffId ?? "";
  const partyQs = partySize && partySize > 1 ? `&party=${partySize}` : "";
  const daysKey = `${month}|${staffParam}`;
  const slotsKey = `${date}|${staffParam}`;

  React.useEffect(() => {
    if (days[daysKey]) return;
    const ctrl = new AbortController();
    fetch(`/api/booking/days?month=${month}&service=${serviceId}${staffParam ? `&staff=${staffParam}` : ""}${partyQs}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j: { days: Array<{ date: string; available: boolean; count: number }> }) => setDays((d) => ({ ...d, [daysKey]: Object.fromEntries(j.days.map((x) => [x.date, { available: x.available, count: x.count }])) })))
      .catch(() => !ctrl.signal.aborted && setDays((d) => ({ ...d, [daysKey]: {} })));
    return () => ctrl.abort();
  }, [month, serviceId, staffParam, partyQs, daysKey, days]);

  React.useEffect(() => {
    if (!date || slots[slotsKey]) return;
    const ctrl = new AbortController();
    fetch(`/api/booking/slots?date=${date}&service=${serviceId}${staffParam ? `&staff=${staffParam}` : ""}${partyQs}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j: { slots: SlotChip[] }) => setSlots((s) => ({ ...s, [slotsKey]: j.slots })))
      .catch(() => !ctrl.signal.aborted && setSlots((s) => ({ ...s, [slotsKey]: [] })));
    return () => ctrl.abort();
  }, [date, serviceId, staffParam, partyQs, slotsKey, slots]);

  const submit = () => {
    if (!start) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await action(start);
        if (r && "error" in r) setError(r.error);
      } catch (e) {
        if (!(e instanceof Error && /NEXT_REDIRECT/.test(e.message))) setError(L.errors.unknown ?? "");
      }
    });
  };

  return (
    <div className={cn("bk-panel p-5 md:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-semibold">เลือกวันและเวลาใหม่</h3>
          <p className="text-sm text-muted-foreground">การจองเดิมจะถูกยกเลิกและสร้างการจองใหม่ให้อัตโนมัติ</p>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted">
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={date}
          onSelect={(d) => {
            setDate(d);
            setStart(null);
          }}
          minDate={today}
          maxDate={maxDate}
          days={days[daysKey] ?? null}
          loadingLabel={L.loadingDays}
        />
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="size-4 text-primary" /> {date ? formatThaiYmd(date, { weekday: true }) : L.pickDateFirst}
          </p>
          {date ? <SlotPicker slots={slots[slotsKey] ?? null} selected={start} onSelect={setStart} showRemaining={showRemaining} /> : <p className="rounded-[var(--radius-lg)] bg-muted p-6 text-center text-sm text-muted-foreground">{L.pickDateFirst}</p>}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> {error}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          {L.back}
        </Button>
        <Button type="button" size="lg" onClick={submit} disabled={!start || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {start ? `ยืนยันเลื่อนเป็น ${formatBkkTime(start)} น.` : "เลื่อนนัด"}
        </Button>
      </div>
    </div>
  );
}
