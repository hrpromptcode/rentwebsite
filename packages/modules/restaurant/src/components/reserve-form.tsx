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
import { RestaurantStyles } from "./styles";

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

  // quick day chips: the next 7 days that still have a round (the date input below covers any other day)
  const quickDays = React.useMemo(() => {
    const now = new Date(nowIso);
    const out: string[] = [];
    for (let i = 0; i < 14 && out.length < 7; i++) {
      const d = addDays(today, i);
      if (d > lastDay) break;
      if (reservationSlots({ hours, ymd: d, now }).length) out.push(d);
    }
    return out;
  }, [hours, today, lastDay, nowIso]);
  const ZoneIcon = ZONE_ICON[zone] ?? Home;

  return (
    <form action={formAction} className="grid gap-10">
      <RestaurantStyles />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="partySize" value={size} />
      <input type="hidden" name="zone" value={zone} />
      <input type="hidden" name="occasion" value={occasion} />
      <input type="hidden" name="paymentMethod" value={method} />

      <Step n="01" title="วันและเวลา">
        {quickDays.length > 1 && (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {quickDays.map((d) => {
              const on = d === date;
              const day = dayParts(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDate(d)}
                  className={cn(
                    "flex min-h-16 w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-[var(--radius-lg)] border px-2 py-2 text-center transition-colors duration-200",
                    on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-muted",
                  )}
                >
                  <span className={cn("text-[0.6875rem] font-semibold", !on && "text-muted-foreground")}>{d === today ? L.today : d === addDays(today, 1) ? L.tomorrow : day.weekday}</span>
                  <span className="font-heading text-xl leading-tight font-semibold tabular-nums">{day.day}</span>
                  <span className={cn("text-[0.6875rem]", !on && "text-muted-foreground")}>{day.month}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="res-date" className="text-sm font-medium text-muted-foreground">
            {L.date}
          </Label>
          <Input id="res-date" type="date" value={date} min={today} max={lastDay} onChange={(e) => setDate(e.target.value && e.target.value <= lastDay ? e.target.value : today)} className="h-12 max-w-xs text-base" required />
        </div>
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
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
                    className={cn(
                      "h-11 rounded-full border text-sm font-medium tabular-nums transition-colors duration-200",
                      time === s ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-muted",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {slots.length > 12 && (
                <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary-ink underline-offset-4 hover:underline" onClick={() => setShowAllSlots((v) => !v)}>
                  {showAllSlots ? "แสดงน้อยลง" : `แสดงเวลาอื่น (${slots.length - 12})`}
                </button>
              )}
            </>
          )}
        </div>
      </Step>

      <Step n="02" title="จำนวนคนและโซน">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
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
              <p className="text-sm font-medium text-muted-foreground">{L.zone}</p>
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
                      className={cn("flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-2 text-left transition-colors duration-200", active ? "border-primary bg-primary-soft" : "border-border bg-background hover:border-primary/40 hover:bg-muted")}
                    >
                      <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      <span>
                        <span className="block text-sm font-semibold">{z.zone}</span>
                        <span className="block text-xs text-muted-foreground">สูงสุด {z.maxSeats} ที่/โต๊ะ</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div aria-live="polite" className="min-h-6">
          {avail.state === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {L.checkingAvailability}
            </p>
          )}
          {avail.state === "ok" && (
            <p className="rr-fade flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" /> {L.available}
              {avail.remaining !== undefined && avail.remaining <= 2 && <span className="font-normal text-muted-foreground">(เหลือ {avail.remaining} โต๊ะ)</span>}
            </p>
          )}
          {avail.state === "full" && (
            <p className="rr-fade flex items-center gap-2 text-sm font-medium text-destructive">
              <XCircle className="size-4" /> {avail.totalSeats && size > avail.totalSeats ? `${zone ? `โซน${zone}` : "ร้าน"}รองรับได้สูงสุด ${avail.totalSeats} ท่าน กรุณาเลือกโซนอื่นหรือโทรจอง` : L.full}
            </p>
          )}
        </div>
      </Step>

      <Step n="03" title={L.occasion} hint={L.optional}>
        <div className="flex flex-wrap gap-2">
          {L.occasions.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={occasion === o}
              onClick={() => setOccasion(occasion === o ? "" : o)}
              className={cn("h-11 rounded-full border px-4 text-sm transition-colors duration-200", occasion === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/40 hover:bg-muted")}
            >
              {o}
            </button>
          ))}
        </div>
      </Step>

      <Step n="04" title="ข้อมูลติดต่อ">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </Step>

      {deposit > 0 && (
        <Step n="05" title={`${L.deposit} ${thb(deposit)}`} hint="หักจากบิลในวันที่มา">
          <PaymentMethodPicker options={methods} value={method} onChange={setMethod} name="paymentMethodPick" />
        </Step>
      )}

      {/* the reservation as it will be booked: a calm ticket that updates with every choice */}
      <div className="rr-ticket rounded-[var(--radius-xl)] border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-4">
          <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">Reservation</p>
          <p className="text-sm font-semibold">
            {dayParts(date).long}
            {time ? ` · ${time} น.` : ""}
          </p>
        </div>
        <div className="rr-ticket-perf" aria-hidden />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4 text-primary" aria-hidden /> {size} ท่าน
          </span>
          {zone && (
            <span className="inline-flex items-center gap-1.5">
              <ZoneIcon className="size-4 text-primary" /> โซน{zone}
            </span>
          )}
          {occasion && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck className="size-4 text-primary" aria-hidden /> {occasion}
            </span>
          )}
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="xl" className="h-14 w-full active:scale-[0.98] sm:w-auto sm:min-w-72" disabled={pending || !time || avail.state === "full"}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarCheck className="size-5" />}
        {deposit > 0 ? `ชำระมัดจำ ${thb(deposit)} และยืนยัน` : L.confirmReservation}
      </Button>
    </form>
  );
}

/** Numbered form step: mono index, heading, optional hint (no fieldset: its legend would rename the inner groups). */
function Step({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-border pt-8 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-heading text-xl font-semibold md:text-2xl">
        <span className="font-mono text-xs font-medium tracking-[0.08em] text-primary-ink">{n}</span>
        {title}
        {hint && <span className="font-sans text-sm font-normal text-muted-foreground">({hint})</span>}
      </h2>
      {children}
    </section>
  );
}

const TH_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_DAYS_LONG = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** Deterministic Thai date parts from YYYY-MM-DD (same on the server and the client: no Intl / timezone). */
function dayParts(ymd: string) {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { weekday: TH_DAYS[wd] ?? "", day: String(d), month: TH_MONTHS[m - 1] ?? "", long: `วัน${TH_DAYS_LONG[wd] ?? ""}ที่ ${d} ${TH_MONTHS[m - 1] ?? ""} ${y + 543}` };
}
