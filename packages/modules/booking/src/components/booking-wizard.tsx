"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, Minus, Pencil, Plus, ShieldCheck, Sparkles, Ticket, UserRound, Users } from "lucide-react";
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
import { BookingStyles } from "./hi/styles";

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
  /** fixed guests per booking (package "for 2", priced per booking); null = per person */
  seatsPerBooking: number | null;
  featured: boolean;
  categoryName: string | null;
}

/** SBR-016: a course session the signed-in customer redeems with this booking. */
export interface WizardCourse {
  id: string;
  name: string;
  sessionsLeft: number;
  /** service the course is for (null = any service) */
  serviceId: string | null;
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
  /** date (YYYY-MM-DD) / start (ISO) jump straight to the time / details step – used by class timetables ("สมัครเรียน" on a session) */
  preselect?: { serviceId?: string | null; staffId?: string | null; date?: string | null; start?: string | null; slots?: SlotChip[] | null };
  paymentMethods: PaymentMethodOption[];
  /** ADMIN_B2-04: deposits are on but the shop has no payment receiver: deposit services are booked without one (pay at the shop) */
  payAtShop?: boolean;
  /** redeem a course session (price 0, no deposit) */
  course?: WizardCourse | null;
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

/** per-person group service: the customer picks the party size and pays per guest */
function isPerPerson(s: WizardService | undefined) {
  return !!s && s.capacity > 1 && !s.seatsPerBooking;
}

function partyOf(s: WizardService | undefined, requested: number) {
  if (!s) return 1;
  if (s.seatsPerBooking) return Math.min(s.seatsPerBooking, Math.max(1, s.capacity));
  return isPerPerson(s) ? Math.min(Math.max(1, requested), s.capacity) : 1;
}

function priceLabel(s: WizardService, party = 1) {
  if (s.price === 0) return s.priceNote || L.free;
  const amount = isPerPerson(s) ? s.price * party : s.price;
  const base = s.priceNote ? `${thb(amount)} ${s.priceNote}` : thb(amount);
  return isPerPerson(s) && party === 1 ? `${base} / ${L.perGuest}` : base;
}

/* ------------------------------------------------------------------ */
/* Wizard                                                               */
/* ------------------------------------------------------------------ */

export function BookingWizard({ services: allServices, staff, config, today, maxDate, customer, preselect, paymentMethods, payAtShop = false, course, compact, className }: BookingWizardProps) {
  const reduce = useReducedMotion();
  // a course booking is limited to the course's service
  const services = React.useMemo(() => (course?.serviceId ? allServices.filter((s) => s.id === course.serviceId) : allServices), [allServices, course]);
  const initialService = services.find((s) => s.id === (course?.serviceId ?? preselect?.serviceId)) ?? null;
  const initialStaff = staff.find((s) => s.id === preselect?.staffId && (!initialService || s.serviceIds.includes(initialService.id))) ?? null;

  // a timetable link preselects the session: date (+ start) must be inside the booking window and belong to the service
  const initialDate = initialService && preselect?.date && /^\d{4}-\d{2}-\d{2}$/.test(preselect.date) && preselect.date >= today && preselect.date <= maxDate ? preselect.date : null;
  const initialStart = initialDate && preselect?.start && !Number.isNaN(Date.parse(preselect.start)) ? new Date(preselect.start).toISOString() : null;

  const [serviceId, setServiceId] = React.useState<string | null>(initialService?.id ?? null);
  /** undefined = not chosen yet, null = ใครก็ได้ */
  const [staffChoice, setStaffChoice] = React.useState<string | null | undefined>(initialStaff ? initialStaff.id : initialService && isGroup(initialService) ? null : undefined);
  const [month, setMonth] = React.useState((initialDate ?? today).slice(0, 7));
  const [date, setDate] = React.useState<string | null>(initialDate);
  const [start, setStart] = React.useState<string | null>(initialStart);
  const [details, setDetails] = React.useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", note: "" });
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(paymentMethods[0]?.value ?? "promptpay_qr");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [dir, setDir] = React.useState(1);
  const [partyWanted, setPartyWanted] = React.useState(1);

  const service = services.find((s) => s.id === serviceId);
  const group = isGroup(service);
  const perPerson = isPerPerson(service) && !course;
  const party = course ? 1 : partyOf(service, partyWanted);
  const partyQs = party > 1 ? `&party=${party}` : "";
  const steps = React.useMemo<StepKey[]>(() => (group ? ALL_STEPS.filter((k) => k !== "staff") : ALL_STEPS), [group]);
  const eligibleStaff = React.useMemo(() => (service ? staff.filter((s) => s.serviceIds.includes(service.id)) : []), [staff, service]);

  const initialStep: StepKey = initialStart ? "details" : initialDate ? "time" : initialService ? (initialStaff || isGroup(initialService) ? "date" : "staff") : "service";
  const [step, setStep] = React.useState<StepKey>(initialStep);
  const stepIndex = steps.indexOf(step);

  // RESPONSIVE_B2-10: after every step change, keyboard / screen-reader focus moves to the new step's heading (its
  // accessible name starts with "ขั้นตอนที่ n จาก N"), instead of dropping to <body> when the chosen card unmounts.
  // AnimatePresence (mode="wait") mounts the new step after the old one has left, so the heading's ref focuses it then.
  const stepRef = React.useRef(step);
  const focusHeadingOnMount = React.useRef(false);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    if (stepRef.current === step) return;
    stepRef.current = step;
    const h = headingRef.current;
    if (h && h.dataset.step === step) h.focus();
    else focusHeadingOnMount.current = true;
  }, [step]);
  const setHeading = React.useCallback((el: HTMLHeadingElement | null) => {
    headingRef.current = el;
    if (el && focusHeadingOnMount.current && el.dataset.step === stepRef.current) {
      focusHeadingOnMount.current = false;
      el.focus();
    }
  }, []);

  // availability caches
  const [days, setDays] = React.useState<Record<string, Record<string, DayInfo>>>({});
  // slots of a preselected session day arrive from the server (BookingWidgetSection) so the summary is complete on first paint
  const [slots, setSlots] = React.useState<Record<string, SlotChip[]>>(() =>
    initialDate && initialService && preselect?.slots ? { [`${initialDate}|${initialService.id}|${initialStaff?.id ?? ""}|${course ? 1 : partyOf(initialService, 1)}`]: preselect.slots } : {},
  );
  const staffParam = staffChoice ?? "";
  const daysKey = `${month}|${serviceId}|${staffParam}|${party}`;
  const slotsKey = `${date}|${serviceId}|${staffParam}|${party}`;

  React.useEffect(() => {
    if (step !== "date" || !serviceId || days[daysKey]) return;
    const ctrl = new AbortController();
    fetch(`/api/booking/days?month=${month}&service=${serviceId}${staffParam ? `&staff=${staffParam}` : ""}${partyQs}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { days: Array<{ date: string; available: boolean; count: number }> }) => {
        setDays((d) => ({ ...d, [daysKey]: Object.fromEntries(j.days.map((x) => [x.date, { available: x.available, count: x.count }])) }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setDays((d) => ({ ...d, [daysKey]: {} }));
      });
    return () => ctrl.abort();
  }, [step, serviceId, month, staffParam, partyQs, daysKey, days]);

  // also fetch once a start is preselected (details step) so the chosen session's seats / instructor can be shown;
  // keyed on `wantSlots` rather than `step` so moving details → confirm does not abort and restart an in-flight fetch
  const wantSlots = step === "time" || !!start;
  React.useEffect(() => {
    if (!wantSlots || !serviceId || !date || slots[slotsKey]) return;
    const ctrl = new AbortController();
    fetch(`/api/booking/slots?date=${date}&service=${serviceId}${staffParam ? `&staff=${staffParam}` : ""}${partyQs}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { slots: SlotChip[] }) => setSlots((s) => ({ ...s, [slotsKey]: j.slots })))
      .catch(() => {
        if (!ctrl.signal.aborted) setSlots((s) => ({ ...s, [slotsKey]: [] }));
      });
    return () => ctrl.abort();
  }, [wantSlots, serviceId, date, staffParam, partyQs, slotsKey, slots]);

  // class sessions carry their instructor on the slot (group services only) – shown on chips and in the summary
  const staffNames = React.useMemo(() => (group ? Object.fromEntries(staff.map((s) => [s.id, s.name])) : undefined), [group, staff]);
  const chosenSlot = start ? (slots[slotsKey] ?? []).find((s) => s.start === start) : undefined;
  const instructorName = chosenSlot?.staffId && staffNames ? (staffNames[chosenSlot.staffId] ?? null) : null;

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

  const unitDeposit = service && !course && config.depositEnabled && service.depositRequired ? service.depositAmount : 0;
  const deposit = perPerson ? (service && service.price > 0 ? Math.min(unitDeposit * party, service.price * party) : unitDeposit * party) : unitDeposit;
  const depositWaived = payAtShop && !!service && !course && service.depositRequired && service.depositAmount > 0;
  // classes prepay the whole fee online: say "ค่าเรียน", not "มัดจำ … ส่วนที่เหลือชำระที่ร้าน"
  const fullPay = deposit > 0 && !!service && service.price > 0 && deposit >= (perPerson ? service.price * party : service.price);
  const changeParty = (n: number) => {
    setPartyWanted(n);
    setStart(null);
  };
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
      partySize: party,
      patientPackageId: course?.id ?? null,
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
      instructorName={instructorName}
      deposit={deposit}
      fullPay={fullPay}
      party={party}
      course={course ?? null}
      onEdit={(k) => go(k)}
      steps={steps}
    />
  );

  const transition = reduce ? { duration: 0 } : { duration: 0.42, ease: EASE };

  return (
    <div className={cn("grid gap-6", !compact && "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10", className)}>
      <BookingStyles />
      <div className={cn("bk-panel bk-float p-4 sm:p-6 md:p-9", compact && "p-4 sm:p-5 md:p-6")}>
        <StepHeader steps={steps} current={step} reached={stepIndex} onJump={(k) => steps.indexOf(k) < stepIndex && go(k)} />

        {/* compact selection strip (mobile + compact mode) */}
        <SelectionStrip service={service ?? null} staffLabel={group ? instructorName : staffChoice === undefined ? null : chosenStaff ? chosenStaff.name : L.anyStaff} date={date} start={start} className={cn("mt-5", !compact && "lg:hidden")} />

        {/* clip only the horizontal step slide: overflow-hidden also cut the tone marks of the step heading (ที่) */}
        <div className="relative mt-7 min-h-[320px] overflow-x-clip">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 36, filter: "blur(4px)" }}
              // same `animate` on server and client (useReducedMotion is null during SSR): no style mismatch on hydration
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -28, filter: "blur(4px)" }}
              transition={transition}
            >
              <div className="flex items-baseline gap-3">
                <span aria-hidden className="font-mono text-xs tracking-[0.1em] text-muted-foreground">
                  {String(stepIndex + 1).padStart(2, "0")}/{String(steps.length).padStart(2, "0")}
                </span>
                <h3 ref={setHeading} tabIndex={-1} data-step={step} className="font-heading text-step-3 leading-tight font-semibold outline-offset-4">
                  <span className="sr-only">
                    ขั้นตอนที่ {stepIndex + 1} จาก {steps.length}:{" "}
                  </span>
                  {STEP_TITLE[step]}
                </h3>
              </div>

              {course && (
                <p className="mt-4 flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-sm text-primary-ink">
                  <Ticket className="size-4 shrink-0" /> {L.useCourse}: {L.courseLeft(course.name, course.sessionsLeft)}
                </p>
              )}

              {step === "service" && <ServiceStep services={services} selected={serviceId} onSelect={chooseService} />}

              {step === "staff" && service && <StaffStep staff={eligibleStaff} selected={staffChoice} onSelect={chooseStaff} />}

              {step === "date" && (
                <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_200px]">
                  <MonthCalendar month={month} onMonthChange={setMonth} selected={date} onSelect={chooseDate} minDate={today} maxDate={maxDate} days={days[daysKey] ?? null} loadingLabel={L.loadingDays} className="max-w-md" />
                  <div className="text-sm text-muted-foreground md:border-l md:border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] md:pl-6">
                    <p className="flex items-center gap-2">
                      <span className="inline-block size-1.5 rounded-full bg-primary" /> วันที่มีคิวว่าง
                    </p>
                    <p className="mt-3">จองล่วงหน้าได้สูงสุด {config.maxAdvanceDays} วัน</p>
                    {date && (
                      <p key={date} className="bk-flash mt-4 font-medium text-foreground">
                        <CalendarDays className="mr-1 inline size-4 text-primary" /> {formatThaiYmd(date, { weekday: true })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {step === "time" && (
                <div className="mt-6">
                  <button type="button" onClick={() => go("date")} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] px-4 text-sm font-medium transition-colors hover:border-primary hover:bg-primary-soft">
                    <CalendarDays className="size-4 text-primary" /> {date ? formatThaiYmd(date, { weekday: true }) : L.pickDateFirst}
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                  {perPerson && service && <PartyStepper value={party} max={service.capacity} onChange={changeParty} />}
                  {service?.seatsPerBooking ? (
                    <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="size-4 text-primary" /> {L.packageFor(service.seatsPerBooking)}
                    </p>
                  ) : null}
                  <SlotPicker slots={slots[slotsKey] ?? null} selected={start} onSelect={chooseTime} showRemaining={perPerson} staffNames={staffNames} />
                </div>
              )}

              {step === "details" && (
                <form
                  className="mt-6 grid gap-5 sm:grid-cols-2"
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
                <div className="mt-6 space-y-5">
                  <div className="overflow-hidden rounded-[calc(var(--radius,.75rem)*1.4)] bg-muted/60" style={{ "--bk-notch": "var(--card)" } as React.CSSProperties}>
                    <div className="p-5 sm:p-6">
                      <dl className="grid gap-4 text-sm sm:grid-cols-2">
                        <Row label={L.services} value={service.name} />
                        {!group && <Row label={L.staff} value={chosenStaff ? chosenStaff.name : L.anyStaff} />}
                        <Row label="วันและเวลา" value={`${formatThaiDate(start, { weekday: true })} · ${formatBkkTime(start)} น.`} />
                        <Row label="ระยะเวลา" value={L.minutes(service.durationMin)} />
                        {party > 1 && <Row label={L.partySize} value={L.guests(party)} />}
                        {course && <Row label={L.useCourse} value={L.courseLeft(course.name, course.sessionsLeft)} />}
                        <Row label={L.name} value={details.name} />
                        <Row label={L.phone} value={details.phone} />
                        {details.email && <Row label="อีเมล" value={details.email} />}
                        {details.note && <Row label="หมายเหตุ" value={details.note} />}
                      </dl>
                    </div>
                    <div aria-hidden className="bk-perf bk-notched" />
                    <div className="flex min-h-[5.5rem] items-end justify-between gap-3 px-5 py-4 sm:px-6">
                      <div>
                        <p className="text-xs text-muted-foreground">{L.total}</p>
                        <p className="font-heading text-2xl font-semibold">{course ? L.useCourse : priceLabel(service, party)}</p>
                      </div>
                      {deposit > 0 ? (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {L.dueNow} ({fullPay ? L.fullPay : L.deposit})
                          </p>
                          <p className="font-heading text-2xl font-semibold text-primary">{thb(deposit)}</p>
                        </div>
                      ) : depositWaived ? (
                        <Badge variant="outline" className="px-3 py-1">
                          {L.payAtShopBadge}
                        </Badge>
                      ) : (
                        <Badge variant="success" className="px-3 py-1">
                          <Check className="size-3" /> {L.noDeposit}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {depositWaived && (
                    <p role="status" data-pay-at-shop className="rounded-[var(--radius-md)] border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                      {L.payAtShopNotice}
                    </p>
                  )}

                  {deposit > 0 && paymentMethods.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">{L.paymentMethod}</p>
                      <PaymentMethodPicker options={paymentMethods} value={method} onChange={setMethod} />
                      <p className="mt-2 text-xs text-muted-foreground">{fullPay ? L.fullPayNote(thb(deposit)) : L.depositNote(thb(deposit))}</p>
                    </div>
                  )}

                  <div className="flex items-start gap-3 rounded-[calc(var(--radius,.75rem)*1.2)] border border-dashed border-[color-mix(in_oklab,var(--foreground)_18%,transparent)] p-4 text-sm">
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

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] pt-5">
          <Button type="button" variant="ghost" size="lg" onClick={back} disabled={stepIndex === 0 || pending} className="rounded-full px-4">
            <ChevronLeft className="size-4" /> {L.back}
          </Button>
          {step === "confirm" ? (
            <Button type="button" size="lg" onClick={submit} disabled={pending} className="min-w-44 flex-1 rounded-full active:scale-[.97] sm:flex-none">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {pending ? L.confirming : L.confirm}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={step === "details" ? submitDetails : next} disabled={!canProceed[step]} className="min-w-36 rounded-full active:scale-[.97]">
              {L.next} <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {!compact && <aside className="hidden lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)] lg:block">{summary}</aside>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

/** Numbered nodes on a line that fills as the customer advances; done nodes jump back. */
function StepHeader({ steps, current, reached, onJump }: { steps: StepKey[]; current: StepKey; reached: number; onJump: (k: StepKey) => void }) {
  const idx = steps.indexOf(current);
  const pct = ((idx + 1) / steps.length) * 100;
  const fill = steps.length > 1 ? idx / (steps.length - 1) : 1;
  return (
    <div>
      <div className="relative">
        <span aria-hidden className="absolute top-1/2 right-[22px] left-[22px] h-0.5 -translate-y-1/2 bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)]" />
        <span aria-hidden className="absolute top-1/2 right-[22px] left-[22px] h-0.5 -translate-y-1/2">
          <span className="bk-step-line w-full" style={{ transform: `scaleX(${fill})` }} />
        </span>
        <ol className="relative flex items-center justify-between gap-1 text-xs sm:text-sm">
          {steps.map((k, i) => {
            const done = i < reached;
            const active = k === current;
            return (
              <li key={k} className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => done && onJump(k)}
                  disabled={!done}
                  aria-current={active ? "step" : undefined}
                  aria-label={`ขั้นที่ ${i + 1} ${STEP_LABEL[k]}${done ? " (เสร็จแล้ว แตะเพื่อแก้ไข)" : active ? " (ขั้นปัจจุบัน)" : ""}`}
                  className={cn(
                    "relative flex size-11 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-500",
                    active && "scale-110 border-primary bg-primary text-primary-foreground shadow-[0_10px_26px_-10px_var(--primary)]",
                    done && "border-primary bg-background text-primary hover:bg-primary hover:text-primary-foreground",
                    !active && !done && "border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-background text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden /> : <span className="font-mono">{i + 1}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <ol aria-hidden className="mt-2 hidden justify-between text-xs sm:flex">
        {steps.map((k) => (
          <li key={k} className={cn("w-11 text-center whitespace-nowrap", k === current ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {STEP_LABEL[k]}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground sm:hidden">
        ขั้นที่ {steps.indexOf(current) + 1}/{steps.length} · {STEP_LABEL[current]}
      </p>
      <div className="sr-only" role="progressbar" aria-label="ความคืบหน้าการจอง" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} />
    </div>
  );
}

function ServiceStep({ services, selected, onSelect }: { services: WizardService[]; selected: string | null; onSelect: (s: WizardService) => void }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, WizardService[]>();
    for (const s of services) map.set(s.categoryName ?? "", [...(map.get(s.categoryName ?? "") ?? []), s]);
    return [...map.entries()];
  }, [services]);
  let n = 0;
  return (
    <div className="mt-6 space-y-7">
      {groups.map(([cat, list]) => (
        <div key={cat || "_"}>
          {cat && (
            <p className="mb-3 flex items-center gap-3 text-xs font-semibold text-primary-ink">
              <span aria-hidden className="h-px w-6 bg-current opacity-60" /> {cat}
            </p>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {list.map((s) => {
              const active = s.id === selected;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s)}
                  aria-pressed={active}
                  style={{ "--i": n++ } as React.CSSProperties}
                  className={cn(
                    "bk-choice bk-pop flex min-h-[76px] items-center gap-3 rounded-[calc(var(--radius,.75rem)*1.2)] border p-3 text-left",
                    active ? "border-primary bg-primary-soft" : "border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-background hover:border-primary/50",
                  )}
                >
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt="" className="size-14 shrink-0 rounded-[var(--radius-md)] object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary-soft text-primary">
                      <Sparkles className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{s.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">{priceLabel(s, 1)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" /> {L.minutes(s.durationMin)}
                      </span>
                      {s.depositRequired && s.depositAmount > 0 && (
                        <span>
                          {L.deposit} {thb(s.depositAmount)}
                        </span>
                      )}
                      {s.seatsPerBooking ? <span>{L.packageFor(s.seatsPerBooking)}</span> : s.capacity > 1 && <span>สูงสุด {s.capacity} ท่าน/รอบ</span>}
                      {s.featured && (
                        <Badge variant="soft" className="px-1.5 py-0 text-[10px]">
                          แนะนำ
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-[color-mix(in_oklab,var(--foreground)_18%,transparent)]")}>
                    {active && <Check className="size-3.5" />}
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
    <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={cn(
          "bk-choice bk-pop flex min-h-[76px] items-center gap-3 rounded-[calc(var(--radius,.75rem)*1.2)] border p-3 text-left sm:col-span-2",
          selected === null ? "border-primary bg-primary-soft" : "border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-background hover:border-primary/50",
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
      {staff.map((s, i) => {
        const active = selected === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-pressed={active}
            style={{ "--i": i + 1 } as React.CSSProperties}
            className={cn(
              "bk-choice bk-pop flex min-h-[76px] items-center gap-3 rounded-[calc(var(--radius,.75rem)*1.2)] border p-3 text-left",
              active ? "border-primary bg-primary-soft" : "border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-background hover:border-primary/50",
            )}
          >
            {s.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
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

/** Party size for per-person group services (SBR-001); slots are fetched for the whole party. */
function PartyStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span id="bk-party-label" className="text-sm font-medium">
        {L.partySize}
      </span>
      <div className="inline-flex items-center rounded-full border" role="group" aria-labelledby="bk-party-label">
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="ลดจำนวนผู้ใช้บริการ" className="flex size-11 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40">
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="min-w-16 text-center text-sm font-semibold tabular-nums" aria-live="polite">
          {L.guests(value)}
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="เพิ่มจำนวนผู้ใช้บริการ" className="flex size-11 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <span className="text-xs text-muted-foreground">สูงสุด {max} ท่าน</span>
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
        <span key={`${i}-${c}`} className="bk-pop inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-ink" style={{ "--i": i } as React.CSSProperties}>
          {c}
        </span>
      ))}
    </div>
  );
}

/** One summary row; a module-level component so its flash only replays when the value changes (not on every render). */
function SummaryItem({ k, label, value, icon: Icon, steps, onEdit }: { k: StepKey; label: string; value: string | null; icon: React.ComponentType<{ className?: string }>; steps: StepKey[]; onEdit: (k: StepKey) => void }) {
  return (
    <li className="flex items-start gap-3">
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-500", value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span key={value ?? "-"} className={cn("block text-sm", value ? "bk-flash font-medium" : "text-muted-foreground/70")}>
          {value ?? L.notSelected}
        </span>
      </span>
      {value && steps.includes(k) && (
        <button type="button" onClick={() => onEdit(k)} aria-label={`แก้ไข${label}`} className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
          <Pencil className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/** Desktop summary that follows the customer (sticky): a ticket whose values flash as they change. */
function Summary({
  service,
  staffLabel,
  date,
  start,
  instructorName,
  deposit,
  fullPay,
  party,
  course,
  onEdit,
  steps,
}: {
  service: WizardService | null;
  staffLabel: string | null;
  date: string | null;
  start: string | null;
  /** class session instructor (group services with a timetable) */
  instructorName?: string | null;
  deposit: number;
  /** the online payment is the whole fee (classes) */
  fullPay?: boolean;
  party: number;
  course: WizardCourse | null;
  onEdit: (k: StepKey) => void;
  steps: StepKey[];
}) {
  return (
    <div className="bk-panel bk-float overflow-hidden">
      <div className="flex items-center justify-between bg-primary-soft px-5 py-4">
        <p className="font-heading text-lg font-semibold">{L.summary}</p>
        <span aria-hidden className="font-mono text-[10px] tracking-[0.14em] text-primary-ink">
          TICKET
        </span>
      </div>
      <ul className="space-y-4 px-5 py-5">
        <SummaryItem steps={steps} onEdit={onEdit} k="service" label={L.services} value={service?.name ?? null} icon={Sparkles} />
        {steps.includes("staff") && <SummaryItem steps={steps} onEdit={onEdit} k="staff" label={L.staff} value={staffLabel} icon={UserRound} />}
        <SummaryItem steps={steps} onEdit={onEdit} k="date" label="วัน" value={date ? formatThaiYmd(date, { weekday: true }) : null} icon={CalendarDays} />
        <SummaryItem steps={steps} onEdit={onEdit} k="time" label="เวลา" value={start ? `${formatBkkTime(start)} น.${service ? ` · ${L.minutes(service.durationMin)}` : ""}` : null} icon={Clock} />
        {instructorName && <SummaryItem steps={steps} onEdit={onEdit} k="time" label={L.instructor} value={instructorName} icon={UserRound} />}
      </ul>
      {service && (
        <>
          <div aria-hidden className="bk-perf bk-notched" />
          <div className="px-5 py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{party > 1 ? `${L.total} (${L.guests(party)})` : L.total}</span>
              <span key={`${party}-${service.id}`} className="bk-flash font-semibold">
                {course ? L.useCourse : priceLabel(service, party)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">{deposit > 0 ? `${fullPay ? L.fullPay : L.deposit} (${L.dueNow})` : L.deposit}</span>
              <span className={cn("font-semibold", deposit > 0 && "text-primary")}>{deposit > 0 ? thb(deposit) : "–"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
