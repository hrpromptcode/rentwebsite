"use client";

import * as React from "react";
import { useActionState } from "react";
import { CalendarCheck, CheckCircle2, Clock, Loader2, Trees, Home, Users, XCircle } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { cn } from "@rentweb/ui/lib/utils";
import type { ReserveState } from "../action-types";
import { addDays, reservationSlots, type HoursRange } from "../services/time";
import { L } from "../labels";
import { QtyStepper } from "./qty-stepper";

export interface ReserveFormProps {
  hours: HoursRange;
  zones: Array<{ zone: string; tables: number; maxSeats: number }>;
  /** satang; 0 = no deposit */
  deposit: number;
  methods: PaymentMethodOption[];
  today: string; // YYYY-MM-DD in Bangkok
  /** last bookable day (YYYY-MM-DD); the server enforces the same window (SBR-015) */
  maxDate?: string;
  nowIso: string;
  initial: { date?: string; time?: string; size?: number; zone?: string };
  action: (prev: ReserveState, fd: FormData) => Promise<ReserveState>;
}

const ZONE_ICON: Record<string, React.ComponentType<{ className?: string }>> = { ในบ้าน: Home, สวน: Trees };

type Avail = { state: "idle" | "loading" | "ok" | "full" | "error"; remaining?: number; capacity?: number; totalSeats?: number };

export function ReserveForm({ hours, zones, deposit, methods, today, maxDate, nowIso, initial, action }: ReserveFormProps) {
  const [state, formAction, pending] = useActionState(action, {} as ReserveState);
  const lastDay = maxDate ?? addDays(today, 60);
  // default to the first day that still has a round (today after closing time → tomorrow)
  const [date, setDate] = React.useState(() => {
    if (initial.date && initial.date >= today && initial.date <= lastDay) return initial.date;
    const now = new Date(nowIso);
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      if (reservationSlots({ hours, ymd: d, now }).length) return d;
    }
    return today;
  });
  const slots = React.useMemo(() => reservationSlots({ hours, ymd: date, now: new Date(nowIso) }), [hours, date, nowIso]);
  const [time, setTime] = React.useState(initial.time && slots.includes(initial.time) ? initial.time : "");
  const [size, setSize] = React.useState(Math.min(40, Math.max(1, initial.size ?? 2)));
  const [zone, setZone] = React.useState(initial.zone && zones.some((z) => z.zone === initial.zone) ? initial.zone : (zones[0]?.zone ?? ""));
  const [occasion, setOccasion] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(methods[0]?.value ?? "promptpay_qr");
  const [avail, setAvail] = React.useState<Avail>({ state: "idle" });
  // a deep-linked time (/reserve?time=19:00) past the first 12 chips must stay visible as the selected chip
  const [showAllSlots, setShowAllSlots] = React.useState(() => !!time && slots.indexOf(time) >= 12);

  // when the date changes, drop a time that no longer exists; auto-pick the first slot if none chosen
  React.useEffect(() => {
    if (time && !slots.includes(time)) setTime("");
  }, [slots, time]);

  // live availability feedback
  React.useEffect(() => {
    if (!date || !time) {
      setAvail({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setAvail({ state: "loading" });
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ date, time, size: String(size), ...(zone ? { zone } : {}) });
        const r = await fetch(`/api/restaurant/reservations/availability?${qs}`, { signal: ctrl.signal, cache: "no-store" });
        const j = (await r.json()) as { available: boolean; remaining: number; capacity: number; totalSeats?: number };
        setAvail({ state: j.available ? "ok" : "full", remaining: j.remaining, capacity: j.capacity, totalSeats: j.totalSeats });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setAvail({ state: "error" });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [date, time, size, zone]);

  const visibleSlots = showAllSlots ? slots : slots.slice(0, 12);
  const maxSeats = zones.find((z) => z.zone === zone)?.maxSeats ?? 0;
  const bigParty = maxSeats > 0 && size > maxSeats * 2;

  return (
    <form action={formAction} className="grid gap-7">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="partySize" value={size} />
      <input type="hidden" name="zone" value={zone} />
      <input type="hidden" name="occasion" value={occasion} />
      <input type="hidden" name="paymentMethod" value={method} />

      <section className="grid gap-3">
        <Label htmlFor="res-date" className="text-base">{L.date}</Label>
        <Input id="res-date" type="date" value={date} min={today} max={lastDay} onChange={(e) => setDate(e.target.value && e.target.value <= lastDay ? e.target.value : today)} className="h-12 max-w-xs text-base" required />
      </section>

      <section>
        <p className="flex items-center gap-2 text-base font-medium">
          <Clock className="size-4 text-primary" /> {L.time}
        </p>
        {slots.length === 0 ? (
          <p className="mt-2 text-sm text-destructive">วันนี้ไม่มีรอบที่ว่างแล้ว กรุณาเลือกวันถัดไป</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label={L.time}>
              {visibleSlots.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={time === s}
                  onClick={() => setTime(s)}
                  className={cn("h-11 rounded-[var(--radius-md)] border text-sm font-medium tabular-nums transition", time === s ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border hover:bg-muted")}
                >
                  {s}
                </button>
              ))}
            </div>
            {slots.length > 12 && (
              <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline md:min-h-9" onClick={() => setShowAllSlots((v) => !v)}>
                {showAllSlots ? "แสดงน้อยลง" : `แสดงเวลาอื่น (${slots.length - 12})`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-base font-medium">
            <Users className="size-4 text-primary" /> {L.partySize}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <QtyStepper value={size} onChange={setSize} min={1} max={40} size="lg" label={L.partySize} />
            <span className="text-sm text-muted-foreground">คน</span>
          </div>
          {bigParty && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">กลุ่มใหญ่ ทางร้านจะจัดโต๊ะต่อกันให้ และอาจโทรยืนยันอีกครั้ง</p>}
        </div>
        {zones.length > 0 && (
          <div>
            <p className="text-base font-medium">{L.zone}</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={L.zone}>
              {zones.map((z) => {
                const Icon = ZONE_ICON[z.zone] ?? Home;
                const active = zone === z.zone;
                return (
                  <button
                    key={z.zone}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setZone(z.zone)}
                    className={cn("flex h-14 items-center gap-3 rounded-[var(--radius-lg)] border px-4 text-left transition", active ? "border-primary bg-primary-soft" : "border-border hover:bg-muted")}
                  >
                    <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                    <span>
                      <span className="block text-sm font-medium">{z.zone}</span>
                      <span className="block text-xs text-muted-foreground">สูงสุด {z.maxSeats} ที่/โต๊ะ</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div aria-live="polite" className="min-h-6">
        {avail.state === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {L.checkingAvailability}
          </p>
        )}
        {avail.state === "ok" && (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" /> {L.available}
            {avail.remaining !== undefined && avail.remaining <= 2 && <span className="text-muted-foreground">(เหลือ {avail.remaining} โต๊ะ)</span>}
          </p>
        )}
        {avail.state === "full" && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="size-4" /> {avail.totalSeats && size > avail.totalSeats ? `${zone ? `โซน${zone}` : "ร้าน"}รองรับได้สูงสุด ${avail.totalSeats} ท่าน กรุณาเลือกโซนอื่นหรือโทรจอง` : L.full}
          </p>
        )}
      </div>

      <section>
        <p className="text-base font-medium">
          {L.occasion} <span className="text-sm font-normal text-muted-foreground">({L.optional})</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {L.occasions.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={occasion === o}
              onClick={() => setOccasion(occasion === o ? "" : o)}
              className={cn("h-11 rounded-full border px-4 text-sm transition", occasion === o ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
            >
              {o}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="res-name">{L.name}</Label>
          <Input id="res-name" name="name" required maxLength={80} autoComplete="name" defaultValue={state.values?.name ?? ""} className="h-12" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="res-phone">{L.phone}</Label>
          <Input id="res-phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="08x-xxx-xxxx" defaultValue={state.values?.phone ?? ""} className="h-12" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="res-note">
            {L.reservationNote} <span className="font-normal text-muted-foreground">({L.optional})</span>
          </Label>
          <Textarea id="res-note" name="note" maxLength={300} placeholder={L.reservationNotePlaceholder} className="min-h-20" defaultValue={state.values?.note ?? ""} />
        </div>
      </section>

      {deposit > 0 && (
        <section>
          <p className="text-base font-medium">
            {L.deposit} {thb(deposit)} <span className="text-sm font-normal text-muted-foreground">(หักจากบิลในวันที่มา)</span>
          </p>
          <div className="mt-3">
            <PaymentMethodPicker options={methods} value={method} onChange={setMethod} name="paymentMethodPick" />
          </div>
        </section>
      )}

      {state.error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="xl" className="h-14 w-full sm:w-auto sm:min-w-72" disabled={pending || !time || avail.state === "full"}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarCheck className="size-5" />}
        {deposit > 0 ? `ชำระมัดจำ ${thb(deposit)} และยืนยัน` : L.confirmReservation}
      </Button>
    </form>
  );
}
