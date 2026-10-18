"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CalendarDays, Loader2, Lock, Moon, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import { createStayAction, type CreateStayPayload } from "../actions";
import { ExtrasPicker, type ExtraOption, type ExtraSelection } from "./extras-picker";
import { QuoteBreakdown, type QuoteBreakdownData } from "./quote-breakdown";
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

/**
 * /stay/book: guest details, add-ons (re-quoted live), cancellation policy, pay option + method → createStayAction →
 * redirect to /stays/[id]?k=. The summary card is sticky on desktop and sits above the form on phones.
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
  const firstRender = React.useRef(true);

  // re-quote when the add-ons change (the server re-validates everything on submit anyway)
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
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
        setQuoting(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [sel, type.id, checkIn, checkOut, guests]);

  const cash = method === "cash";
  const due = cash || !payOption ? 0 : payOption === "full" ? quote.total : quote.deposit;
  const dueLabel = cash || !payOption ? L.payAtProperty : payOption === "full" ? L.payOptionFull : L.payOptionDeposit(config.depositPercent);
  const onlineMethods = methods.filter((m) => m.value !== "cash");
  const showPayOptions = payOptions.length > 1 && !cash;

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
    <aside className="card overflow-hidden p-0" aria-label={L.summary}>
      {type.cover && <Img src={type.cover} alt={type.name} className="aspect-[16/9] w-full object-cover" />}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{L.summary}</p>
        <h2 className="font-heading mt-1 text-xl font-semibold">{type.name}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-[var(--radius-md)] bg-muted/60 p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden /> {L.checkIn}
            </dt>
            <dd className="mt-0.5 font-medium">{formatThaiYmd(checkIn, { short: true, weekday: true })}</dd>
            <dd className="text-xs text-muted-foreground">{L.checkInTime(config.checkInTime)}</dd>
          </div>
          <div className="rounded-[var(--radius-md)] bg-muted/60 p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden /> {L.checkOut}
            </dt>
            <dd className="mt-0.5 font-medium">{formatThaiYmd(checkOut, { short: true, weekday: true })}</dd>
            <dd className="text-xs text-muted-foreground">{L.checkOutTime(config.checkOutTime)}</dd>
          </div>
        </dl>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Moon className="size-3.5" aria-hidden /> {L.nights(quote.nights)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {L.guestsN(guests)}
          </span>
        </p>
        <div className={cn("mt-4 border-t border-border pt-4 transition-opacity", quoting && "opacity-60")}>
          <QuoteBreakdown quote={quote} dueNow={due} dueLabel={dueLabel} />
        </div>
        <Link href={roomHref} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {L.changeDates}
        </Link>
      </div>
    </aside>
  );

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start" data-testid="book-form" noValidate>
      <div className="lg:hidden">{summary}</div>
      <div className="space-y-6">
        <section className="card p-5 md:p-6">
          <h2 className="font-heading text-xl font-semibold">{L.guestDetails}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="book-name">{L.name}</Label>
              <Input id="book-name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} className="h-12" data-testid="book-name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="book-phone">{L.phone}</Label>
              <Input id="book-phone" name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required maxLength={20} className="h-12" data-testid="book-phone" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="book-email">{L.email}</Label>
              <Input id="book-email" name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} className="h-12" data-testid="book-email" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="book-note">{L.note}</Label>
              <Textarea id="book-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder={L.notePlaceholder} data-testid="book-note" />
            </div>
          </div>
        </section>

        {extras.length > 0 && (
          <section className="card p-5 md:p-6">
            <h2 className="font-heading text-xl font-semibold">{L.extras}</h2>
            <ExtrasPicker extras={extras} value={sel} onChange={setSel} className="mt-4" />
          </section>
        )}

        <section className="card p-5 md:p-6">
          <h2 className="font-heading text-xl font-semibold">{L.paymentMethod}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{L.policy(config.freeCancelDays, config.depositPercent)}</p>
          {showPayOptions && (
            <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="จำนวนที่ชำระตอนนี้">
              {payOptions.map((o) => {
                const amount = o === "full" ? quote.total : quote.deposit;
                const active = payOption === o;
                return (
                  <button key={o} type="button" role="radio" aria-checked={active} data-testid={`pay-option-${o}`} onClick={() => setPayOption(o)} className={cn("min-h-14 rounded-[var(--radius-lg)] border p-3 text-left transition", active ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "border-border hover:bg-muted")}>
                    <span className="block text-sm font-medium">{o === "full" ? L.payOptionFull : L.payOptionDeposit(config.depositPercent)}</span>
                    <span className="block text-xs text-muted-foreground">{thb(amount)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {methods.length > 0 ? (
            <div className="mt-4">
              <PaymentMethodPicker options={payOptions.length ? methods : methods.filter((m) => m.value === "cash")} value={method ?? ""} onChange={(v) => setMethod(v)} />
            </div>
          ) : (
            <p className="mt-4 rounded-[var(--radius-md)] bg-muted p-3 text-sm text-muted-foreground">{payOptions.length ? "ที่พักยังไม่ได้ตั้งค่าช่องทางรับชำระเงินออนไลน์ การจองจะยืนยันทันทีและชำระที่ที่พัก" : "ชำระค่าห้องพักเต็มจำนวนเมื่อเช็กอิน ไม่ต้องวางมัดจำ"}</p>
          )}
          {onlineMethods.length === 0 && methods.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{L.payAtProperty}</p>}
        </section>

        <section className="card p-5 md:p-6">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-primary" data-testid="book-consent" />
            <span>
              {L.consent} · {L.policy(config.freeCancelDays, config.depositPercent)}
            </span>
          </label>
          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive" data-testid="book-error">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          )}
          <Button type="submit" size="xl" className="mt-4 w-full" disabled={pending || quoting} data-testid="book-submit">
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Lock className="size-5" aria-hidden />} {pending ? L.confirming : due > 0 ? `${L.confirmBooking} · ${L.dueNow} ${thb(due)}` : L.confirmBooking}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">{due > 0 ? L.holdNote : "การจองจะได้รับการยืนยันทันที"}</p>
        </section>
      </div>
      <div className="hidden lg:sticky lg:top-24 lg:block">{summary}</div>
    </form>
  );
}
