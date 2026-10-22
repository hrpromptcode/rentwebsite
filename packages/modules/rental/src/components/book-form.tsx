"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Loader2, Lock, Moon, Users } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Img, SectionStyles, sized } from "@rentweb/storefront";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import { createStayAction, type CreateStayPayload } from "../actions";
import { ExtrasPicker, type ExtraOption, type ExtraSelection } from "./extras-picker";
import { QuoteBreakdown, type QuoteBreakdownData } from "./quote-breakdown";
import { RentalStyles } from "./rental-styles";
import { RoomName } from "./room-name";
import { extrasParam } from "./stay-widget";
import { L } from "../labels";
import { formatThaiYmd } from "../services/time";

export interface StayBookFormProps {
  type: { id: string; slug: string; name: string; cover: string | null };
  checkIn: string;
  checkOut: string;
  guests: number;
  extras: ExtraOption[];
  initialExtras: ExtraSelection[];
  initialQuote: QuoteBreakdownData;
  /** pay options the policy offers (empty = nothing is charged online) */
  payOptions: Array<"deposit" | "full">;
  /** methods the stay can be paid with (empty with payOptions = pay at the property) */
  methods: PaymentMethodOption[];
  config: { depositPercent: number; freeCancelDays: number; checkInTime: string; checkOutTime: string };
  customer: { name: string | null; phone: string | null; email: string | null } | null;
  roomHref: string;
}

/** Floating-label field (CSS only, `.rw-ff` from the storefront section styles): the label rides up on focus / value. */
function Field({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rw-ff", className)}>
      {children}
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

const inputCls =
  "block w-full rounded-[var(--radius-lg)] border border-input bg-background px-3.5 pt-6 pb-2 text-base text-foreground transition-colors outline-none hover:border-foreground/40 focus-visible:border-primary focus-visible:ring-0 aria-[invalid=true]:border-destructive";

function StepTitle({ n, children, hint }: { n: number; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="rw-step-n" aria-hidden>
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="font-heading text-step-2 leading-tight font-semibold">{children}</h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * /stay/book: numbered sections (guest details with floating labels, add-ons re-quoted live, payment, consent) →
 * createStayAction → redirect to /stays/[id]?k=. The summary card (cover, dates around the nights, live breakdown) is
 * sticky on desktop and sits above the form on phones. The submit button answers instantly (pressed → spinner).
 */
export function StayBookForm({ type, checkIn, checkOut, guests, extras, initialExtras, initialQuote, payOptions, methods, config, customer, roomHref }: StayBookFormProps) {
  const [name, setName] = React.useState(customer?.name ?? "");
  const [phone, setPhone] = React.useState(customer?.phone ?? "");
  const [email, setEmail] = React.useState(customer?.email ?? "");
  const [note, setNote] = React.useState("");
  const [sel, setSel] = React.useState<ExtraSelection[]>(initialExtras);
  const [quote, setQuote] = React.useState<QuoteBreakdownData>(initialQuote);
  const [quoting, setQuoting] = React.useState(false);
  const [payOption, setPayOption] = React.useState<"deposit" | "full" | null>(payOptions[0] ?? null);
  const [method, setMethod] = React.useState<PaymentMethodOption["value"] | null>(methods[0]?.value ?? null);
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  // the server-rendered quote is for the initial selection; only a changed selection re-quotes. Keyed (not a
  // "first render" flag) so React StrictMode's double mount effect does not fire a request that dims the summary and
  // disables the submit button until it returns (qa-c).
  const quoteKey = `${type.id}|${checkIn}|${checkOut}|${guests}|${extrasParam(sel)}`;
  const quotedKey = React.useRef(quoteKey);

  // re-quote when the add-ons change (the server re-validates everything on submit anyway)
  React.useEffect(() => {
    if (quoteKey === quotedKey.current) return;
    quotedKey.current = quoteKey;
    const ctrl = new AbortController();
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const ex = extrasParam(sel);
        const r = await fetch(`/api/rental/quote?type=${type.id}&from=${checkIn}&to=${checkOut}&guests=${guests}${ex ? `&extras=${encodeURIComponent(ex)}` : ""}`, { signal: ctrl.signal, cache: "no-store" });
        const data = (await r.json()) as { ok: true; quote: QuoteBreakdownData } | { ok: false; error: string };
        if (data.ok) {
          setQuote(data.quote);
          setError(null);
        } else setError(L.errors[data.error] ?? L.errors.unknown!);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setError(L.errors.unknown!);
      } finally {
        // an aborted request must not clear the flag of the request that replaced it
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteKey encodes sel, type, dates and guests
  }, [quoteKey]);

  const cash = method === "cash";
  const due = cash || !payOption ? 0 : payOption === "full" ? quote.total : quote.deposit;
  const dueLabel = cash || !payOption ? L.payAtProperty : payOption === "full" ? L.payOptionFull : L.payOptionDeposit(config.depositPercent);
  const onlineMethods = methods.filter((m) => m.value !== "cash");
  const showPayOptions = payOptions.length > 1 && !cash;
  let n = 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("กรุณากรอกชื่อ-นามสกุล");
    if (phone.trim().length < 9) return setError(L.errors.invalid_phone!);
    if (!consent) return setError("กรุณายอมรับนโยบายการยกเลิกและเงื่อนไขการเข้าพัก");
    setError(null);
    const payload: CreateStayPayload = {
      unitTypeId: type.id,
      checkIn,
      checkOut,
      guests,
      extras: sel.filter((s) => s.qty > 0),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      note: note.trim() || null,
      paymentMethod: due > 0 || cash ? ((method ?? undefined) as "promptpay_qr" | "slip" | "cash" | undefined) : null,
      payOption: cash ? null : payOption,
    };
    startTransition(async () => {
      try {
        const r = await createStayAction(payload);
        if (r && "error" in r) setError(r.error);
      } catch (err) {
        // redirect() throws a control-flow error Next handles; anything else is a real failure
        if (!(err instanceof Error && /NEXT_REDIRECT/.test(err.message))) setError(L.errors.unknown!);
      }
    });
  };

  const summary = (
    <aside className="overflow-hidden rounded-[var(--radius-2xl,1.5rem)] border border-border bg-card shadow-float" aria-label={L.summary}>
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {type.cover && <Img src={sized(type.cover, 900)} alt={type.name} className="size-full object-cover" />}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-xs font-semibold tracking-[0.02em] text-white/80">{L.summary}</p>
          <RoomName as="h2" name={type.name} className="mt-1 font-heading text-step-2 leading-tight font-semibold" />
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[var(--radius-xl,1rem)] border border-border p-3.5">
          <div>
            <p className="text-xs text-muted-foreground">{L.checkIn}</p>
            <p className="font-heading font-semibold leading-snug">{formatThaiYmd(checkIn, { short: true, weekday: true })}</p>
            <p className="text-[0.7rem] text-muted-foreground">{L.checkInTime(config.checkInTime)}</p>
          </div>
          <span className="rw-nights-pill">
            <Moon className="size-3" aria-hidden /> {L.nights(quote.nights)}
          </span>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{L.checkOut}</p>
            <p className="font-heading font-semibold leading-snug">{formatThaiYmd(checkOut, { short: true, weekday: true })}</p>
            <p className="text-[0.7rem] text-muted-foreground">{L.checkOutTime(config.checkOutTime)}</p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-3.5" aria-hidden /> {L.guestsN(guests)}
        </p>
        <div className={cn("mt-4 border-t border-border pt-4 transition-opacity duration-300", quoting && "opacity-50")}>
          <QuoteBreakdown quote={quote} dueNow={due} dueLabel={dueLabel} />
        </div>
        <Link href={roomHref} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {L.changeDates}
        </Link>
      </div>
    </aside>
  );

  const card = "rounded-[var(--radius-2xl,1.5rem)] border border-border bg-card p-5 md:p-7";
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-10" data-testid="book-form" noValidate>
      <SectionStyles />
      <RentalStyles />
      <div className="lg:hidden">{summary}</div>
      <div className="space-y-5">
        <section className={card}>
          <StepTitle n={++n}>{L.guestDetails}</StepTitle>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field id="book-name" label={L.name} className="sm:col-span-2">
              <input id="book-name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} placeholder=" " className={inputCls} data-testid="book-name" />
            </Field>
            <Field id="book-phone" label={L.phone}>
              <input id="book-phone" name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required maxLength={20} placeholder=" " className={inputCls} data-testid="book-phone" />
            </Field>
            <Field id="book-email" label={L.email}>
              <input id="book-email" name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} placeholder=" " className={inputCls} data-testid="book-email" />
            </Field>
            <Field id="book-note" label={L.note} className="sm:col-span-2">
              <textarea id="book-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder={L.notePlaceholder} className={cn(inputCls, "min-h-28 resize-y pt-7")} data-testid="book-note" />
            </Field>
          </div>
        </section>

        {extras.length > 0 && (
          <section className={card}>
            <StepTitle n={++n} hint="ราคาในสรุปการจองอัปเดตทันที">
              {L.extras}
            </StepTitle>
            <ExtrasPicker extras={extras} value={sel} onChange={setSel} className="mt-6" />
          </section>
        )}

        <section className={card}>
          <StepTitle n={++n} hint={L.policy(config.freeCancelDays, config.depositPercent)}>
            {L.paymentMethod}
          </StepTitle>
          {showPayOptions && (
            <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="จำนวนที่ชำระตอนนี้">
              {payOptions.map((o) => {
                const amount = o === "full" ? quote.total : quote.deposit;
                const active = payOption === o;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`pay-option-${o}`}
                    onClick={() => setPayOption(o)}
                    className={cn("rw-press relative min-h-16 rounded-[var(--radius-lg)] border p-3.5 text-left transition-colors", active ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/40")}
                  >
                    {active && (
                      <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden>
                        <Check className="size-3" />
                      </span>
                    )}
                    <span className="block text-sm font-medium">{o === "full" ? L.payOptionFull : L.payOptionDeposit(config.depositPercent)}</span>
                    <span className="rw-price-num mt-0.5 block text-lg text-primary-ink">{thb(amount)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {methods.length > 0 ? (
            <div className="mt-5">
              <PaymentMethodPicker options={payOptions.length ? methods : methods.filter((m) => m.value === "cash")} value={method ?? ""} onChange={(v) => setMethod(v)} />
            </div>
          ) : (
            <p className="mt-5 rounded-[var(--radius-md)] bg-muted p-3 text-sm text-muted-foreground">{payOptions.length ? "ที่พักยังไม่ได้ตั้งค่าช่องทางรับชำระเงินออนไลน์ การจองจะยืนยันทันทีและชำระที่ที่พัก" : "ชำระค่าห้องพักเต็มจำนวนเมื่อเช็กอิน ไม่ต้องวางมัดจำ"}</p>
          )}
          {onlineMethods.length === 0 && methods.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{L.payAtProperty}</p>}
        </section>

        <section className={card}>
          <StepTitle n={++n}>ยืนยันการจอง</StepTitle>
          <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-border p-3.5 text-sm leading-relaxed transition-colors hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" data-testid="book-consent" />
            <span>
              {L.consent} · {L.policy(config.freeCancelDays, config.depositPercent)}
            </span>
          </label>
          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive" data-testid="book-error">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || quoting}
            data-testid="book-submit"
            className="rw-press mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-center text-base font-semibold whitespace-normal text-primary-foreground shadow-[0_16px_36px_-16px_var(--primary)] hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden /> : <Lock className="size-5 shrink-0" aria-hidden />}
            <span>{pending ? L.confirming : due > 0 ? `${L.confirmBooking} · ${L.dueNow} ${thb(due)}` : L.confirmBooking}</span>
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">{due > 0 ? L.holdNote : "การจองจะได้รับการยืนยันทันที"}</p>
        </section>
      </div>
      <div className="hidden lg:sticky lg:top-[calc(var(--header-h,5rem)+1rem)] lg:block">{summary}</div>
    </form>
  );
}
