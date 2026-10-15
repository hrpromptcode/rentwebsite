"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, Pencil, ShieldCheck, Sparkles, UserRound, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { cn } from "@rentweb/ui/lib/utils";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import { createBookingAction, type CreateBookingPayload } from "../actions";
import { L } from "../labels";
import { formatBkkTime, formatThaiDate, formatThaiYmd } from "../services/time";
import { MonthCalendar, type DayInfo } from "./month-calendar";
import { SlotPicker, type SlotChip } from "./slot-picker";

/* ------------------------------------------------------------------ */
/* Types shared with the server shell                                   */
/* ------------------------------------------------------------------ */

export interface WizardService {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  durationMin: number;
  price: number;
  priceNote: string | null;
  depositRequired: boolean;
  depositAmount: number;
  capacity: number;
  requiresStaff: boolean;
  featured: boolean;
  categoryName: string | null;
}

export interface WizardStaff {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  avatar: string | null;
  color: string;
  serviceIds: string[];
}

export interface WizardConfig {
  slotMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  cancelHours: number;
  depositEnabled: boolean;
}

export interface BookingWizardProps {
  services: WizardService[];
  staff: WizardStaff[];
  config: WizardConfig;
  /** YYYY-MM-DD in Bangkok, computed on the server */
  today: string;
  maxDate: string;
  customer: { name: string | null; phone: string | null; email: string | null } | null;
  preselect?: { serviceId?: string | null; staffId?: string | null };
  paymentMethods: PaymentMethodOption[];
  compact?: boolean;
  className?: string;
}

type StepKey = "service" | "staff" | "date" | "time" | "details" | "confirm";
const ALL_STEPS: StepKey[] = ["service", "staff", "date", "time", "details", "confirm"];
const STEP_LABEL: Record<StepKey, string> = { service: L.steps[0], staff: L.steps[1], date: L.steps[2], time: L.steps[3], details: L.steps[4], confirm: L.steps[5] };
const STEP_TITLE: Record<StepKey, string> = {
  service: L.stepTitles.service,
  staff: L.stepTitles.staff,
  date: L.stepTitles.date,
  time: L.stepTitles.time,
  details: L.stepTitles.details,
  confirm: L.stepTitles.confirm,
};

const EASE = [0.22, 1, 0.36, 1] as const;

function isGroup(s: WizardService | undefined) {
  return !!s && (s.capacity > 1 || !s.requiresStaff);
}

function priceLabel(s: WizardService) {
  if (s.price === 0) return s.priceNote || L.free;
  return s.priceNote ? `${thb(s.price)} ${s.priceNote}` : thb(s.price);
}

/* ------------------------------------------------------------------ */
/* Wizard                                                               */
/* ------------------------------------------------------------------ */

export function BookingWizard({ services, staff, config, today, maxDate, customer, preselect, paymentMethods, compact, className }: BookingWizardProps) {
  const reduce = useReducedMotion();
  const initialService = services.find((s) => s.id === preselect?.serviceId) ?? null;
  const initialStaff = staff.find((s) => s.id === preselect?.staffId && (!initialService || s.serviceIds.includes(initialService.id))) ?? null;

  const [serviceId, setServiceId] = React.useState<string | null>(initialService?.id ?? null);
  /** undefined = not chosen yet, null = ใครก็ได้ */
  const [staffChoice, setStaffChoice] = React.useState<string | null | undefined>(initialStaff ? initialStaff.id : initialService && isGroup(initialService) ? null : undefined);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [date, setDate] = React.useState<string | null>(null);
  const [start, setStart] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", note: "" });
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(paymentMethods[0]?.value ?? "promptpay_qr");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [dir, setDir] = React.useState(1);

  const service = services.find((s) => s.id === serviceId);
  const group = isGroup(service);
  const steps = React.useMemo<StepKey[]>(() => (group ? ALL_STEPS.filter((k) => k !== "staff") : ALL_STEPS), [group]);
  const eligibleStaff = React.useMemo(() => (service ? staff.filter((s) => s.serviceIds.includes(service.id)) : []), [staff, service]);

  const initialStep = initialService ? (initialStaff || isGroup(initialService) ? "date" : "staff") : "service";
  const [step, setStep] = React.useState<StepKey>(initialStep);
  const stepIndex = steps.indexOf(step);

  // availability caches
  const [days, setDays] = React.useState<Record<string, Record<string, DayInfo>>>({});
  const [slots, setSlots] = React.useState<Record<string, SlotChip[]>>({});
  const staffParam = staffChoice ?? "";
  const daysKey = `${month}|${serviceId}|${staffParam}`;
  const slotsKey = `${date}|${serviceId}|${staffParam}`;

  React.useEffect(() => {
    if (step !== "date" || !serviceId || days[daysKey]) return;
    const ctrl = new AbortController();
    fetch(`/api/booking/days?month=${month}&service=${serviceId}${staffParam ? `&staff=${staffParam}` : ""}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { days: Array<{ date: string; available: boolean; count: number }> }) => {
        setDays((d) => ({ ...d, [daysKey]: Object.fromEntries(j.days.map((x) => [x.date, { available: x.available, count: x.count }])) }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setDays((d) => ({ ...d, [daysKey]: {} }));
      });
    return () => ctrl.abort();
  }, [step, serviceId, month, staffParam, daysKey, days]);

  React.useEffect(() => {
    if (step !== "time" || !serviceId || !date || slots[slotsKey]) return;
    const ctrl = new AbortController();
    fetch(`/api/booking/slots?date=${date}&service=${serviceId}${staffParam ? `&staff=${staffParam}` : ""}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { slots: SlotChip[] }) => setSlots((s) => ({ ...s, [slotsKey]: j.slots })))
      .catch(() => {
        if (!ctrl.signal.aborted) setSlots((s) => ({ ...s, [slotsKey]: [] }));
      });
    return () => ctrl.abort();
  }, [step, serviceId, date, staffParam, slotsKey, slots]);

  const go = (next: StepKey) => {
    const from = steps.indexOf(step);
    const to = steps.indexOf(next);
    setDir(to >= from ? 1 : -1);
    setError(null);
    setFieldError(null);
    setStep(next);
  };
  const next = () => {
    const i = steps.indexOf(step);
    if (i < steps.length - 1) go(steps[i + 1]!);
  };
  const back = () => {
    const i = steps.indexOf(step);
    if (i > 0) go(steps[i - 1]!);
  };

  const chooseService = (s: WizardService) => {
    setServiceId(s.id);
    setDate(null);
    setStart(null);
    const g = isGroup(s);
    const keepStaff = staffChoice && staff.find((x) => x.id === staffChoice)?.serviceIds.includes(s.id);
    setStaffChoice(g ? null : keepStaff ? staffChoice : undefined);
    setDir(1);
    setStep(g || keepStaff ? "date" : "staff");
  };
  const chooseStaff = (id: string | null) => {
    setStaffChoice(id);
    setDate(null);
    setStart(null);
    setDir(1);
    setStep("date");
  };
  const chooseDate = (d: string) => {
    setDate(d);
    setStart(null);
    setDir(1);
    setStep("time");
  };
  const chooseTime = (iso: string) => {
    setStart(iso);
    setDir(1);
    setStep("details");
  };

  const canProceed: Record<StepKey, boolean> = {
    service: !!service,
    staff: staffChoice !== undefined,
    date: !!date,
    time: !!start,
    details: details.name.trim().length >= 2 && /^0\d{8,9}$/.test(details.phone.replace(/[^0-9]/g, "").replace(/^66/, "0")),
    confirm: true,
  };

  const submitDetails = () => {
    const digits = details.phone.replace(/[^0-9]/g, "");
    if (details.name.trim().length < 2) return setFieldError("กรุณากรอกชื่อ");
    if (!/^0\d{8,9}$/.test(digits.startsWith("66") ? `0${digits.slice(2)}` : digits)) return setFieldError(L.errors.invalid_phone ?? "");
    if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return setFieldError("อีเมลไม่ถูกต้อง");
    next();
  };

  const deposit = service && config.depositEnabled && service.depositRequired ? service.depositAmount : 0;
  const chosenStaff = staffChoice ? staff.find((s) => s.id === staffChoice) : null;

  const submit = () => {
    if (!service || !start) return;
    setError(null);
    const payload: CreateBookingPayload = {
      serviceId: service.id,
      staffId: group ? null : (staffChoice ?? null),
      start,
      name: details.name.trim(),
      phone: details.phone.trim(),
      email: details.email.trim() || null,
      note: details.note.trim() || null,
      paymentMethod: deposit > 0 ? method : null,
    };
    startTransition(async () => {
      try {
        const r = await createBookingAction(payload);
        if (r && "error" in r) {
          setError(r.error);
          if (r.error === L.errors.slot_taken) {
            setSlots((s) => {
              const copy = { ...s };
              delete copy[slotsKey];
              return copy;
            });
            setStart(null);
            setDir(-1);
            setStep("time");
          }
        }
      } catch (e) {
        // redirect() throws a control-flow error that Next handles; anything else is a real failure
        if (!(e instanceof Error && /NEXT_REDIRECT/.test(e.message))) setError(L.errors.unknown ?? "");
      }
    });
  };

  const summary = (
    <Summary
      service={service ?? null}
      staffLabel={group ? L.noStaffNeeded : staffChoice === undefined ? null : chosenStaff ? chosenStaff.name : L.anyStaff}
      date={date}
      start={start}
      deposit={deposit}
      onEdit={(k) => go(k)}
      steps={steps}
    />
  );

  const transition = reduce ? { duration: 0 } : { duration: 0.28, ease: EASE };

  return (
    <div className={cn("grid gap-6", !compact && "lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10", className)}>
      <div className={cn("card p-4 sm:p-6 md:p-8", compact && "p-4 sm:p-5")}>
        <StepHeader steps={steps} current={step} reached={stepIndex} onJump={(k) => steps.indexOf(k) < stepIndex && go(k)} />

        {/* compact selection strip (mobile + compact mode) */}
        <SelectionStrip service={service ?? null} staffLabel={group ? null : staffChoice === undefined ? null : chosenStaff ? chosenStaff.name : L.anyStaff} date={date} start={start} className={cn("mt-4", !compact && "lg:hidden")} />

        <div className="relative mt-6 min-h-[320px] overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -28 }}
              transition={transition}
            >
              <h3 className="font-heading text-xl font-semibold md:text-2xl">{STEP_TITLE[step]}</h3>

              {step === "service" && <ServiceStep services={services} selected={serviceId} onSelect={chooseService} />}

              {step === "staff" && service && (
                <StaffStep staff={eligibleStaff} selected={staffChoice} onSelect={chooseStaff} />
              )}

              {step === "date" && (
                <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
                  <MonthCalendar month={month} onMonthChange={setMonth} selected={date} onSelect={chooseDate} minDate={today} maxDate={maxDate} days={days[daysKey] ?? null} loadingLabel={L.loadingDays} className="max-w-md" />
                  <div className="text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <span className="inline-block size-1.5 rounded-full bg-primary" /> วันที่มีคิวว่าง
                    </p>
                    <p className="mt-3">จองล่วงหน้าได้สูงสุด {config.maxAdvanceDays} วัน</p>
                    {date && (
                      <p className="mt-3 font-medium text-foreground">
                        <CalendarDays className="mr-1 inline size-4 text-primary" /> {formatThaiYmd(date, { weekday: true })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {step === "time" && (
                <div className="mt-4">
                  <button type="button" onClick={() => go("date")} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium hover:bg-primary-soft">
                    <CalendarDays className="size-4 text-primary" /> {date ? formatThaiYmd(date, { weekday: true }) : L.pickDateFirst}
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                  <SlotPicker slots={slots[slotsKey] ?? null} selected={start} onSelect={chooseTime} showRemaining={group} />
                </div>
              )}

              {step === "details" && (
                <form
                  className="mt-4 grid gap-5 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitDetails();
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="bk-name">{L.name}</Label>
                    <Input id="bk-name" autoComplete="name" required value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} className="h-12" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="bk-phone">{L.phone}</Label>
                    <Input id="bk-phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="08x-xxx-xxxx" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} className="h-12" />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="bk-email">{L.email}</Label>
                    <Input id="bk-email" type="email" inputMode="email" autoComplete="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} className="h-12" />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="bk-note">{L.note}</Label>
                    <Textarea id="bk-note" placeholder={L.notePlaceholder} value={details.note} onChange={(e) => setDetails({ ...details, note: e.target.value })} className="min-h-20" />
                  </div>
                  {fieldError && (
                    <p className="flex items-center gap-2 text-sm text-destructive sm:col-span-2">
                      <AlertCircle className="size-4" /> {fieldError}
                    </p>
                  )}
                  <button type="submit" className="hidden" aria-hidden />
                </form>
              )}

              {step === "confirm" && service && start && (
                <div className="mt-4 space-y-5">
                  <div className="rounded-[var(--radius-lg)] bg-muted/60 p-4 sm:p-5">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <Row label={L.services} value={service.name} />
                      {!group && <Row label={L.staff} value={chosenStaff ? chosenStaff.name : L.anyStaff} />}
                      <Row label="วันและเวลา" value={`${formatThaiDate(start, { weekday: true })} · ${formatBkkTime(start)} น.`} />
                      <Row label="ระยะเวลา" value={L.minutes(service.durationMin)} />
                      <Row label={L.name} value={details.name} />
                      <Row label={L.phone} value={details.phone} />
                      {details.email && <Row label="อีเมล" value={details.email} />}
                      {details.note && <Row label="หมายเหตุ" value={details.note} />}
                    </dl>
                    <div className="mt-4 flex items-end justify-between border-t pt-4">
                      <div>
                        <p className="text-xs text-muted-foreground">{L.total}</p>
                        <p className="font-heading text-2xl font-semibold">{priceLabel(service)}</p>
                      </div>
                      {deposit > 0 ? (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{L.dueNow} ({L.deposit})</p>
                          <p className="font-heading text-2xl font-semibold text-primary">{thb(deposit)}</p>
                        </div>
                      ) : (
                        <Badge variant="success" className="px-3 py-1">
                          <Check className="size-3" /> {L.noDeposit}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {deposit > 0 && paymentMethods.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">{L.paymentMethod}</p>
                      <PaymentMethodPicker options={paymentMethods} value={method} onChange={setMethod} />
                      <p className="mt-2 text-xs text-muted-foreground">{L.depositNote(thb(deposit))}</p>
                    </div>
                  )}

                  <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-dashed p-4 text-sm">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">{L.policyTitle}</p>
                      <p className="mt-1 text-muted-foreground">{L.policy(config.cancelHours)}</p>
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertCircle className="size-4 shrink-0" /> {error}
                    </p>
                  )}
                </div>
              )}

              {error && step !== "confirm" && (
                <p role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" /> {error}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
          <Button type="button" variant="ghost" size="lg" onClick={back} disabled={stepIndex === 0 || pending} className="px-4">
            <ChevronLeft className="size-4" /> {L.back}
          </Button>
          {step === "confirm" ? (
            <Button type="button" size="lg" onClick={submit} disabled={pending} className="min-w-44 flex-1 sm:flex-none">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {pending ? L.confirming : L.confirm}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={step === "details" ? submitDetails : next} disabled={!canProceed[step]} className="min-w-36">
              {L.next} <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {!compact && <aside className="hidden lg:sticky lg:top-28 lg:block">{summary}</aside>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

function StepHeader({ steps, current, reached, onJump }: { steps: StepKey[]; current: StepKey; reached: number; onJump: (k: StepKey) => void }) {
  const reduce = useReducedMotion();
  const pct = ((steps.indexOf(current) + 1) / steps.length) * 100;
  return (
    <div>
      <ol className="flex items-center justify-between gap-1 text-xs sm:text-sm">
        {steps.map((k, i) => {
          const done = i < reached;
          const active = k === current;
          return (
            <li key={k} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
              <button
                type="button"
                onClick={() => done && onJump(k)}
                disabled={!done}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition sm:size-9",
                  active && "border-primary bg-primary text-primary-foreground shadow-md shadow-glow/40",
                  done && "border-primary bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground",
                  !active && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </button>
              <span className={cn("truncate", active ? "font-medium text-foreground" : "text-muted-foreground", "hidden sm:inline")}>{STEP_LABEL[k]}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground sm:hidden">
        ขั้นที่ {steps.indexOf(current) + 1}/{steps.length} · {STEP_LABEL[current]}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${pct}%` }} transition={reduce ? { duration: 0 } : { duration: 0.45, ease: EASE }} />
      </div>
    </div>
  );
}

function ServiceStep({ services, selected, onSelect }: { services: WizardService[]; selected: string | null; onSelect: (s: WizardService) => void }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, WizardService[]>();
    for (const s of services) map.set(s.categoryName ?? "", [...(map.get(s.categoryName ?? "") ?? []), s]);
    return [...map.entries()];
  }, [services]);
  return (
    <div className="mt-4 space-y-6">
      {groups.map(([cat, list]) => (
        <div key={cat || "_"}>
          {cat && <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">{cat}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => {
              const active = s.id === selected;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s)}
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-[72px] items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition",
                    active ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "hover:border-primary/50 hover:bg-muted/60",
                  )}
                >
                  {s.image ? (
                    <img src={s.image} alt="" className="size-14 shrink-0 rounded-[var(--radius-md)] object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary-soft text-primary">
                      <Sparkles className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium leading-snug">{s.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{priceLabel(s)}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" /> {L.minutes(s.durationMin)}
                      </span>
                      {s.depositRequired && s.depositAmount > 0 && <span>{L.deposit} {thb(s.depositAmount)}</span>}
                      {s.capacity > 1 && <span>สูงสุด {s.capacity} ที่</span>}
                      {s.featured && (
                        <Badge variant="soft" className="px-1.5 py-0 text-[10px]">
                          แนะนำ
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffStep({ staff, selected, onSelect }: { staff: WizardStaff[]; selected: string | null | undefined; onSelect: (id: string | null) => void }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={cn(
          "flex min-h-[72px] items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition sm:col-span-2",
          selected === null ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "hover:border-primary/50 hover:bg-muted/60",
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Users className="size-5" />
        </span>
        <span>
          <span className="block font-medium">{L.anyStaff}</span>
          <span className="block text-xs text-muted-foreground">{L.anyStaffHint}</span>
        </span>
      </button>
      {staff.map((s) => {
        const active = selected === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-pressed={active}
            className={cn("flex min-h-[72px] items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition", active ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "hover:border-primary/50 hover:bg-muted/60")}
          >
            {s.avatar ? (
              <img src={s.avatar} alt="" className="size-12 shrink-0 rounded-full object-cover" loading="lazy" />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full text-white" style={{ background: s.color }}>
                <UserRound className="size-5" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block font-medium">{s.name}</span>
              {s.title && <span className="block truncate text-xs text-muted-foreground">{s.title}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SelectionStrip({ service, staffLabel, date, start, className }: { service: WizardService | null; staffLabel: string | null; date: string | null; start: string | null; className?: string }) {
  const chips = [service?.name, staffLabel, date ? formatThaiYmd(date, { short: true }) : null, start ? `${formatBkkTime(start)} น.` : null].filter(Boolean) as string[];
  if (!chips.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
          {c}
        </span>
      ))}
    </div>
  );
}

function Summary({
  service,
  staffLabel,
  date,
  start,
  deposit,
  onEdit,
  steps,
}: {
  service: WizardService | null;
  staffLabel: string | null;
  date: string | null;
  start: string | null;
  deposit: number;
  onEdit: (k: StepKey) => void;
  steps: StepKey[];
}) {
  const Item = ({ k, label, value, icon: Icon }: { k: StepKey; label: string; value: string | null; icon: React.ComponentType<{ className?: string }> }) => (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className={cn("block text-sm", value ? "font-medium" : "text-muted-foreground/70")}>{value ?? L.notSelected}</span>
      </span>
      {value && steps.includes(k) && (
        <button type="button" onClick={() => onEdit(k)} aria-label={`แก้ไข${label}`} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
          <Pencil className="size-3.5" />
        </button>
      )}
    </li>
  );
  return (
    <div className="card p-5">
      <p className="font-heading text-lg font-semibold">{L.summary}</p>
      <ul className="mt-4 space-y-4">
        <Item k="service" label={L.services} value={service?.name ?? null} icon={Sparkles} />
        {steps.includes("staff") && <Item k="staff" label={L.staff} value={staffLabel} icon={UserRound} />}
        <Item k="date" label="วัน" value={date ? formatThaiYmd(date, { weekday: true }) : null} icon={CalendarDays} />
        <Item k="time" label="เวลา" value={start ? `${formatBkkTime(start)} น.${service ? ` · ${L.minutes(service.durationMin)}` : ""}` : null} icon={Clock} />
      </ul>
      {service && (
        <div className="mt-5 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{L.total}</span>
            <span className="font-semibold">{priceLabel(service)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">{deposit > 0 ? `${L.deposit} (${L.dueNow})` : L.deposit}</span>
            <span className={cn("font-semibold", deposit > 0 && "text-primary")}>{deposit > 0 ? thb(deposit) : "–"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
