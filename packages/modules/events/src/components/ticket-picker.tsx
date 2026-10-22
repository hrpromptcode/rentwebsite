"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, Loader2, Lock, LogIn, Minus, Plus, Tag, Ticket, UserRound, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { cn } from "@rentweb/ui/lib/utils";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import { createTicketOrderAction, type CreateTicketOrderPayload } from "../actions";
import { OrderLines, type OrderLinesData } from "./order-summary";
import { GlueWords } from "./thai-wrap";
import { L } from "../labels";
import type { SaleState } from "../services/catalog";
import { formatThaiDate, formatThaiDateTime, formatThaiSession, formatThaiTime } from "../services/time";

/* ------------------------------------------------------------------ */
/* types (serialisable: dates as ISO strings)                          */
/* ------------------------------------------------------------------ */

export interface PickerType {
  id: string;
  sessionId: string | null;
  name: string;
  description: string | null;
  price: number;
  /** null = unlimited */
  remaining: number | null;
  saleState: SaleState;
  minPerOrder: number;
  maxPerOrder: number;
  salesStart: string | null;
  salesEnd: string | null;
}

export interface PickerSession {
  id: string;
  name: string | null;
  startsAt: string;
  endsAt: string;
  doorsOpen: string | null;
  /** null = uncapped */
  remaining: number | null;
  open: boolean;
  soldOut: boolean;
  /** the types sellable for this session (event-wide + session-bound), with session-aware sale states */
  ticketTypes: PickerType[];
}

export interface TicketPickerProps {
  event: { id: string; slug: string; title: string; status: string };
  sessions: PickerSession[];
  config: { maxPerOrder: number; allowGuestCheckout: boolean; holdMinutes: number; ticketTerms: string };
  /** online methods the organiser accepts (free orders need none) */
  methods: PaymentMethodOption[];
  customer: { id: string; name: string | null; phone: string | null; email: string | null } | null;
  initialSessionId?: string | null;
  loginHref: string;
  className?: string;
}

type QuoteState = { status: "idle" } | { status: "loading" } | { status: "ok"; quote: OrderLinesData & { promo: string | null } } | { status: "error"; error: string };
type Step = 0 | 1 | 2 | 3;
const STEPS = [L.stepTickets, L.stepHolders, L.stepContact, L.stepPay];

export function linesParam(qty: Record<string, number>): string {
  return Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}:${n}`)
    .join(",");
}

/* ------------------------------------------------------------------ */
/* widget                                                               */
/* ------------------------------------------------------------------ */

/**
 * Event-page buy widget: session → quantity per ticket type (live quote from /api/events/quote) → one attendee name
 * per ticket (optionally the buyer's) → contact (guest or signed-in) → summary, promo, method, terms → createTicketOrderAction
 * → redirect to /tickets/[id]?k=. Server re-validates everything (sales windows, min/max, remaining) under locks.
 */
export function TicketPicker({ event, sessions, config, methods, customer, initialSessionId, loginHref, className }: TicketPickerProps) {
  const openSessions = React.useMemo(() => sessions.filter((s) => s.open), [sessions]);
  const defaultSession = openSessions.find((s) => s.id === initialSessionId && !s.soldOut) ?? openSessions.find((s) => !s.soldOut) ?? openSessions[0] ?? null;
  const [sessionId, setSessionId] = React.useState<string | null>(defaultSession?.id ?? null);
  const session = openSessions.find((s) => s.id === sessionId) ?? null;
  const types = session?.ticketTypes ?? [];
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [step, setStep] = React.useState<Step>(0);
  const [quote, setQuote] = React.useState<QuoteState>({ status: "idle" });
  const [buyer, setBuyer] = React.useState(customer?.name ?? "");
  const [sameAsBuyer, setSameAsBuyer] = React.useState(true);
  const [holders, setHolders] = React.useState<Record<string, string>>({});
  const [phone, setPhone] = React.useState(customer?.phone ?? "");
  const [email, setEmail] = React.useState(customer?.email ?? "");
  const [note, setNote] = React.useState("");
  const [promoInput, setPromoInput] = React.useState("");
  const [promo, setPromo] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(methods[0]?.value ?? "promptpay_qr");
  const [terms, setTerms] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const totalQty = types.reduce((s, t) => s + (qty[t.id] ?? 0), 0);
  const lines = types.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ticketTypeId: t.id, qty: qty[t.id]! }));
  const linesKey = linesParam(qty);
  const needsLogin = !customer && !config.allowGuestCheckout;

  // reset quantities when the session changes (types differ per session)
  const changeSession = (id: string) => {
    setSessionId(id);
    setQty({});
    setStep(0);
    setError(null);
  };

  const capFor = (t: PickerType) => Math.min(t.maxPerOrder, t.remaining ?? Number.POSITIVE_INFINITY, config.maxPerOrder - (totalQty - (qty[t.id] ?? 0)));
  const inc = (t: PickerType) => {
    const cur = qty[t.id] ?? 0;
    const next = cur === 0 ? Math.max(1, t.minPerOrder) : cur + 1;
    if (next > capFor(t)) return;
    setQty((q) => ({ ...q, [t.id]: next }));
  };
  const dec = (t: PickerType) => {
    const cur = qty[t.id] ?? 0;
    const next = cur - 1 < t.minPerOrder ? 0 : cur - 1;
    setQty((q) => ({ ...q, [t.id]: next }));
  };

  // live quote (debounced); the server is the source of truth for prices, promo and remaining
  React.useEffect(() => {
    if (!session || lines.length === 0) {
      setQuote({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setQuote({ status: "loading" });
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ event: event.id, session: session.id, lines: linesKey });
        if (promo) qs.set("promo", promo);
        const r = await fetch(`/api/events/quote?${qs}`, { signal: ctrl.signal, cache: "no-store" });
        const data = (await r.json()) as { ok: true; quote: OrderLinesData & { promo: string | null } } | { ok: false; error: string };
        if (data.ok) setQuote({ status: "ok", quote: data.quote });
        else {
          setQuote({ status: "error", error: L.errors[data.error] ?? L.errors.unknown! });
          if (data.error === "promo_invalid") setPromo(null);
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setQuote({ status: "error", error: L.errors.unknown! });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, session?.id, promo, event.id]);

  // one slot per ticket, stable keys per (type, index) so changing another type's quantity keeps typed names
  const slots = React.useMemo(() => types.flatMap((t) => Array.from({ length: qty[t.id] ?? 0 }, (_, i) => ({ key: `${t.id}:${i}`, typeId: t.id, typeName: t.name, i }))), [types, qty]);
  const holderName = (key: string) => (sameAsBuyer ? buyer.trim() : (holders[key] ?? "").trim());

  const goNext = () => {
    setError(null);
    if (step === 0) {
      if (quote.status !== "ok" || totalQty === 0) return setError(L.errors.no_lines!);
      return setStep(1);
    }
    if (step === 1) {
      if (buyer.trim().length < 2) return setError(L.needName);
      if (!sameAsBuyer) {
        const missing = slots.findIndex((s) => holderName(s.key).length < 1);
        if (missing >= 0) return setError(L.needHolder(missing + 1));
      }
      return setStep(2);
    }
    if (step === 2) {
      if (buyer.trim().length < 2) return setError(L.needName);
      if (!customer && phone.trim().length < 9 && !email.trim()) return setError(L.errors.invalid_customer!);
      if (phone.trim() && phone.trim().replace(/\D/g, "").length < 9) return setError(L.errors.invalid_phone!);
      return setStep(3);
    }
  };
  const goBack = () => {
    setError(null);
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  };

  const total = quote.status === "ok" ? quote.quote.total : 0;
  const payable = total > 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return goNext();
    if (!terms) return setError(L.needTerms);
    if (quote.status !== "ok" || !session) return setError(L.errors.no_lines!);
    if (payable && methods.length === 0) return setError(L.noMethods);
    setError(null);
    const payload: CreateTicketOrderPayload = {
      eventId: event.id,
      sessionId: session.id,
      lines,
      holders: slots.map((s) => ({ ticketTypeId: s.typeId, name: holderName(s.key) || buyer.trim() })),
      name: buyer.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      note: note.trim() || null,
      promoCode: promo,
      paymentMethod: payable ? (method === "slip" ? "slip" : "promptpay_qr") : null,
      terms,
    };
    startTransition(async () => {
      try {
        const r = await createTicketOrderAction(payload);
        if (r && "error" in r) setError(r.error);
      } catch (err) {
        // redirect() throws a control-flow error Next handles; anything else is a real failure
        if (!(err instanceof Error && /NEXT_REDIRECT/.test(err.message))) setError(L.errors.unknown!);
      }
    });
  };

  /* ---------- empty / closed states ---------- */
  if (event.status === "cancelled" || event.status === "ended" || openSessions.length === 0) {
    return (
      <div className={cn("card p-5 text-center sm:p-6", className)} data-testid="ticket-picker" data-state="closed">
        <Ticket className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-medium">{event.status === "cancelled" ? L.eventCancelled : event.status === "ended" || openSessions.length === 0 ? L.eventEnded : L.notOnSale}</p>
        <Button asChild variant="outline" className="mt-4 h-11">
          <Link href="/events">{L.browse}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("card p-4 sm:p-6", className)} data-testid="ticket-picker" data-step={step} noValidate>
      {/* progress */}
      <ol className="flex items-center gap-1.5 text-[11px] font-medium" aria-label="ขั้นตอนการซื้อบัตร">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
            <span className={cn("truncate", i === step ? "text-foreground" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {/* ---------- step 0: session + quantities ---------- */}
      {step === 0 && (
        <div className="mt-5">
          {openSessions.length > 1 && (
            <fieldset>
              <legend className="font-heading flex items-center gap-2 text-lg font-semibold">
                <CalendarDays className="size-5 text-primary" aria-hidden /> {L.pickSession}
              </legend>
              <div className="mt-3 grid gap-2" role="radiogroup" aria-label={L.pickSession}>
                {openSessions.map((s) => {
                  const active = s.id === sessionId;
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={active} disabled={s.soldOut} onClick={() => changeSession(s.id)} data-testid={`picker-session-${s.id}`} className={cn("flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition", active ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "border-border hover:bg-muted", s.soldOut && "cursor-not-allowed opacity-60")}>
                      <span>
                        <span className="block text-sm font-medium">{s.name ? `${s.name} · ` : ""}{formatThaiDate(new Date(s.startsAt))}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatThaiTime(new Date(s.startsAt))}–{formatThaiTime(new Date(s.endsAt))}
                          {s.doorsOpen ? ` · ${L.doorsOpen} ${formatThaiTime(new Date(s.doorsOpen))}` : ""}
                        </span>
                      </span>
                      <span className={cn("shrink-0 text-xs font-medium", s.soldOut ? "text-destructive" : s.remaining !== null && s.remaining <= 10 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{s.soldOut ? L.soldOut : s.remaining !== null && s.remaining <= 10 ? L.remaining(s.remaining) : active ? <Check className="size-4 text-primary" aria-hidden /> : ""}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {openSessions.length === 1 && session && (
            <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-muted/60 px-3.5 py-3 text-sm">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">{formatThaiSession(new Date(session.startsAt), new Date(session.endsAt))}</span>
                {session.doorsOpen && <span className="block text-xs text-muted-foreground">{L.doorsOpen} {formatThaiTime(new Date(session.doorsOpen))}</span>}
              </span>
            </p>
          )}

          <h3 className={cn("font-heading flex items-center gap-2 text-lg font-semibold", openSessions.length > 1 ? "mt-6" : "mt-5")}>
            <Ticket className="size-5 text-primary" aria-hidden /> {L.ticketTypes}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{L.maxTotal(config.maxPerOrder)}</p>
          <ul className="mt-3 divide-y divide-border" data-testid="ticket-type-list">
            {types.map((t) => {
              const n = qty[t.id] ?? 0;
              const onSale = t.saleState === "on_sale";
              const cap = capFor(t);
              return (
                <li key={t.id} className={cn("flex items-start justify-between gap-3 py-3.5", !onSale && "opacity-70")} data-testid={`ticket-type-${t.id}`} data-sale-state={t.saleState}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      <GlueWords text={t.name} />
                    </p>
                    <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums text-primary">{t.price > 0 ? thb(t.price) : L.free}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <GlueWords text={t.description} />
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {t.saleState === "not_started" && t.salesStart && <span className="text-muted-foreground">{L.salesStartAt(formatThaiDateTime(new Date(t.salesStart)))}</span>}
                      {t.saleState === "closed" && <span className="text-muted-foreground">{L.salesClosed}</span>}
                      {t.saleState === "sold_out" && <span className="font-medium text-destructive">{L.soldOut}</span>}
                      {onSale && t.salesEnd && <span className="text-amber-700 dark:text-amber-300">{L.salesEndAt(formatThaiDateTime(new Date(t.salesEnd)))}</span>}
                      {onSale && t.remaining !== null && t.remaining <= 10 && <span className="font-medium text-amber-700 dark:text-amber-300">{t.remaining <= 3 ? L.lastTickets(t.remaining) : L.remaining(t.remaining)}</span>}
                      {onSale && t.minPerOrder > 1 && <span className="text-muted-foreground">{L.minPerOrder(t.minPerOrder)}</span>}
                      {onSale && <span className="text-muted-foreground">{L.maxPerOrderN(t.maxPerOrder)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`จำนวน ${t.name}`}>
                    <Button type="button" variant="outline" size="icon" aria-label={`ลดจำนวน ${t.name}`} disabled={!onSale || n === 0} onClick={() => dec(t)} data-testid={`qty-dec-${t.id}`}>
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center font-heading text-lg font-semibold tabular-nums" aria-live="polite" data-testid={`qty-${t.id}`}>
                      {n}
                    </span>
                    <Button type="button" variant="outline" size="icon" aria-label={`เพิ่มจำนวน ${t.name}`} disabled={!onSale || (n === 0 ? Math.max(1, t.minPerOrder) : n + 1) > cap} onClick={() => inc(t)} data-testid={`qty-inc-${t.id}`}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
            {types.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{L.notOnSale}</li>}
          </ul>
        </div>
      )}

      {/* ---------- step 1: holders ---------- */}
      {step === 1 && (
        <div className="mt-5">
          <h3 className="font-heading flex items-center gap-2 text-lg font-semibold">
            <UserRound className="size-5 text-primary" aria-hidden /> {L.holdersTitle}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{L.holdersHint}</p>
          <div className="mt-4 grid gap-2">
            <Label htmlFor="picker-buyer">{L.buyerName}</Label>
            <Input id="picker-buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} autoComplete="name" maxLength={120} className="h-12" data-testid="picker-buyer" />
          </div>
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={sameAsBuyer} onChange={(e) => setSameAsBuyer(e.target.checked)} className="size-5 shrink-0 accent-primary" data-testid="picker-same-as-buyer" />
            {L.useBuyerName}
          </label>
          <ol className="mt-3 grid gap-3">
            {slots.map((s, i) => (
              <li key={s.key} className="grid gap-1.5">
                <Label htmlFor={`holder-${i}`} className="text-xs text-muted-foreground">
                  {L.holderLabel(i + 1, s.typeName)}
                </Label>
                <Input id={`holder-${i}`} value={sameAsBuyer ? buyer : (holders[s.key] ?? "")} disabled={sameAsBuyer} onChange={(e) => setHolders((h) => ({ ...h, [s.key]: e.target.value }))} placeholder={L.holderPlaceholder} maxLength={120} className="h-12" data-testid={`holder-${i}`} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ---------- step 2: contact ---------- */}
      {step === 2 && (
        <div className="mt-5">
          <h3 className="font-heading text-lg font-semibold">{L.contact}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{customer ? L.signedInAs(customer.name ?? customer.phone ?? customer.email ?? "") : needsLogin ? L.loginHint : L.guestCheckout}</p>
          {needsLogin ? (
            <Button asChild size="lg" className="mt-4 w-full">
              <Link href={loginHref}>
                <LogIn className="size-4" /> {L.loginToBuy}
              </Link>
            </Button>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="picker-name">{L.name}</Label>
                <Input id="picker-name" value={buyer} onChange={(e) => setBuyer(e.target.value)} autoComplete="name" required maxLength={120} className="h-12" data-testid="picker-name" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="picker-phone">{L.phone}</Label>
                  <Input id="picker-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={20} className="h-12" data-testid="picker-phone" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="picker-email">{L.emailOptional}</Label>
                  <Input id="picker-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} className="h-12" data-testid="picker-email" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{L.contactHint}</p>
              <div className="grid gap-2">
                <Label htmlFor="picker-note">{L.noteOptional}</Label>
                <Textarea id="picker-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={L.notePlaceholder} data-testid="picker-note" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- step 3: summary + pay ---------- */}
      {step === 3 && session && (
        <div className="mt-5">
          <h3 className="font-heading text-lg font-semibold">{L.stepPay}</h3>
          <p className="mt-2 flex items-start gap-2 text-sm">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium">{event.title}</span>
              <span className="block text-muted-foreground">{session.name ? `${session.name} · ` : ""}{formatThaiSession(new Date(session.startsAt), new Date(session.endsAt))}</span>
            </span>
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label={L.holdersTitle}>
            {slots.map((s, i) => (
              <li key={s.key} className="rounded-full bg-muted px-2.5 py-1">
                {holderName(s.key) || buyer} · {s.typeName}
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            {quote.status === "ok" ? <OrderLines data={{ ...quote.quote, promoCode: quote.quote.promo }} /> : <p className="text-sm text-muted-foreground">{L.quoting}</p>}
          </div>

          {/* promo */}
          <div className="mt-4">
            <Label htmlFor="picker-promo" className="text-xs text-muted-foreground">
              {L.promoCode}
            </Label>
            {promo ? (
              <p className="mt-1.5 flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="size-4" aria-hidden /> {L.promoApplied(promo)}
                </span>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 text-xs underline" onClick={() => { setPromo(null); setPromoInput(""); }}>
                  <X className="size-3" aria-hidden /> {L.removePromo}
                </button>
              </p>
            ) : (
              <div className="mt-1.5 flex gap-2">
                <Input id="picker-promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder={L.promoPlaceholder} maxLength={32} className="h-11 font-mono uppercase" data-testid="picker-promo" />
                <Button type="button" variant="outline" className="h-11 shrink-0" disabled={!promoInput.trim()} onClick={() => setPromo(promoInput.trim())}>
                  {L.applyPromo}
                </Button>
              </div>
            )}
          </div>

          {payable && (
            <div className="mt-5">
              <p className="text-sm font-medium">{L.paymentMethod}</p>
              {methods.length > 0 ? <PaymentMethodPicker options={methods} value={method} onChange={setMethod} /> : <p className="mt-2 rounded-[var(--radius-md)] bg-muted p-3 text-sm text-muted-foreground">{L.noMethods}</p>}
            </div>
          )}

          <details className="mt-5 rounded-[var(--radius-md)] border border-border text-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-3.5 font-medium">{L.terms}</summary>
            <p className="px-3.5 pb-3 whitespace-pre-line text-muted-foreground">{config.ticketTerms}</p>
          </details>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" data-testid="picker-terms" />
            <span>{L.acceptTerms}</span>
          </label>
        </div>
      )}

      {/* ---------- footer ---------- */}
      <div className="mt-5 border-t border-border pt-4" aria-live="polite">
        {step === 0 && (
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{L.ticketsSelected(totalQty)}</p>
              <p className="font-heading text-2xl font-semibold tabular-nums text-primary" data-testid="picker-total">
                {quote.status === "ok" ? (quote.quote.total > 0 ? thb(quote.quote.total) : L.free) : quote.status === "loading" ? <Loader2 className="inline size-5 animate-spin text-muted-foreground" aria-label={L.quoting} /> : "–"}
              </p>
            </div>
          </div>
        )}
        {(quote.status === "error" || error) && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive" data-testid="picker-error">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error ?? (quote.status === "error" ? quote.error : "")}
          </p>
        )}
        <div className={cn("mt-4 flex gap-2", step > 0 ? "flex-col-reverse sm:flex-row" : "")}>
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" className="sm:w-auto" onClick={goBack} disabled={pending} data-testid="picker-back">
              <ArrowLeft className="size-4" /> {L.back}
            </Button>
          )}
          {step < 3 ? (
            <Button type="button" size="xl" className="flex-1" onClick={goNext} disabled={(step === 0 && (quote.status !== "ok" || totalQty === 0)) || (step === 2 && needsLogin)} data-testid="picker-next">
              {L.next} <ArrowRight className="size-5" />
            </Button>
          ) : (
            <Button type="submit" size="xl" className="flex-1" disabled={pending || quote.status !== "ok" || (payable && methods.length === 0)} data-testid="picker-submit">
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Lock className="size-5" aria-hidden />} {pending ? L.creating : payable ? L.payNow(thb(total)) : L.getFree}
            </Button>
          )}
        </div>
        {step === 3 && payable && <p className="mt-3 text-center text-xs text-muted-foreground">{L.holdNote(config.holdMinutes)}</p>}
      </div>
    </form>
  );
}
