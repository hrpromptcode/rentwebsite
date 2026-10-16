"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Loader2, Lock, MapPin, MessageSquare, Package, ShieldCheck, Truck, UserRound } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";
import type { ShippingQuote } from "../services/shipping";
import { L, PAYMENT_LABELS, label } from "../labels";

export type CheckoutState = { error?: string; fieldErrors?: Record<string, string> };
export type CheckoutMethod = PaymentMethodOption["value"];

export interface CheckoutCart {
  items: Array<{ id: string; name: string; variantTitle: string | null; quantity: number; lineTotal: number; image: string | null }>;
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  freeShipping: boolean;
  itemCount: number;
}

export interface CheckoutFormProps {
  cart: CheckoutCart;
  shipping: ShippingQuote[];
  /** methods the tenant can take payment with (checkoutPaymentMethods: enabled AND a receiver configured) */
  methods: CheckoutMethod[];
  customer: { name: string | null; phone: string | null; email: string | null } | null;
  provinces: readonly string[];
  loginHref: string;
  action: (prev: CheckoutState, form: FormData) => Promise<CheckoutState>;
}

/** aria-describedby for a field: its error text when invalid, else its hint (RA-07). */
function describedBy(id: string, error?: string, hint?: boolean): string | undefined {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

function Field({ id, label: text, error, children, className, hint }: { id: string; label: string; error?: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{text}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const selectClass = "flex h-11 w-full rounded-md border border-input bg-background px-3.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive md:text-sm";

export function CheckoutForm({ cart, shipping, methods, customer, provinces, loginHref, action }: CheckoutFormProps) {
  const [state, submit, pending] = useActionState(action, {} as CheckoutState);
  const errors = state.fieldErrors ?? {};
  const [shippingId, setShippingId] = React.useState<string>(shipping[0]?.id ?? "");
  const quote = shipping.find((s) => s.id === shippingId) ?? shipping[0] ?? null;

  const options = React.useMemo<PaymentMethodOption[]>(() => {
    let values: CheckoutMethod[];
    if (quote?.requiresCod) values = ["cod"];
    else values = methods.filter((m) => m !== "cod" && m !== "wallet" && (m !== "cash" || quote?.isPickup));
    return values.map((v) => ({ value: v, label: PAYMENT_LABELS[v]?.label ?? v, description: PAYMENT_LABELS[v]?.description, extra: v === "cod" && quote?.codFee ? `+${thb(quote.codFee)}` : undefined }));
  }, [methods, quote]);

  const [method, setMethod] = React.useState<CheckoutMethod>(options[0]?.value ?? "promptpay_qr");
  // COR-23: nothing to pay with (no receiver configured, or none fits the chosen shipping) → explain and block
  const paymentNotice = options.length ? null : methods.length ? L.noPaymentForShipping : L.noPaymentReceiver;
  const canSubmit = !pending && shipping.length > 0 && options.length > 0;
  React.useEffect(() => {
    if (!options.some((o) => o.value === method)) setMethod(options[0]?.value ?? "promptpay_qr");
  }, [options, method]);

  const shippingFee = quote ? (cart.freeShipping ? 0 : quote.amount) : 0;
  const codFee = quote?.codFee ?? 0;
  const total = cart.subtotal - cart.discountTotal + shippingFee + codFee;
  const topRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (state.error || Object.keys(errors).length) topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const section = "card grid gap-4 p-5 md:p-6";
  const heading = (Icon: typeof UserRound, text: string) => (
    <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-4.5" />
      </span>
      {text}
    </h2>
  );

  return (
    <form id="checkout-form" action={submit} className="grid gap-8 pb-24 lg:grid-cols-[1fr_24rem] lg:items-start lg:pb-0" noValidate>
      <div ref={topRef} className="grid gap-5 scroll-mt-28">
        {state.error && (
          <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{state.error}</p>
          </div>
        )}

        {/* contact */}
        <Reveal className={section}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {heading(UserRound, L.contact)}
            {customer ? (
              <span className="text-sm text-muted-foreground">
                {L.loggedInAs} <span className="font-medium text-foreground">{customer.name ?? customer.phone ?? customer.email}</span>
              </span>
            ) : (
              <Link href={loginHref} className="inline-flex h-11 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                <Lock className="size-3.5" /> {L.loginForHistory}
                <span className="hidden text-muted-foreground sm:inline">· {L.loginForHistoryHint}</span>
              </Link>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label={L.name} error={errors.name}>
              <Input id="name" name="name" autoComplete="name" defaultValue={customer?.name ?? ""} required aria-invalid={!!errors.name} aria-describedby={describedBy("name", errors.name)} />
            </Field>
            <Field id="phone" label={L.phone} error={errors.phone}>
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={customer?.phone ?? ""} placeholder="08x-xxx-xxxx" required aria-invalid={!!errors.phone} aria-describedby={describedBy("phone", errors.phone)} />
            </Field>
            <Field id="email" label={L.email} error={errors.email} hint={L.emailHint} className="sm:col-span-2">
              <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={customer?.email ?? ""} aria-invalid={!!errors.email} aria-describedby={describedBy("email", errors.email, true)} />
            </Field>
          </div>
        </Reveal>

        {/* shipping method */}
        <Reveal delay={0.05} className={section}>
          {heading(Truck, L.shippingMethod)}
          {shipping.length === 0 ? (
            <p className="text-sm text-destructive">{L.noShipping}</p>
          ) : (
            <div className="grid gap-3" role="radiogroup" aria-label={L.shippingMethod} aria-invalid={!!errors.shippingMethodId} aria-describedby={errors.shippingMethodId ? "shippingMethodId-error" : undefined}>
              {shipping.map((s) => {
                const active = s.id === shippingId;
                const fee = cart.freeShipping ? 0 : s.amount;
                return (
                  <label key={s.id} className={cn("flex cursor-pointer items-center gap-4 rounded-[var(--radius-lg)] border p-4 transition", active ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "hover:bg-muted")}>
                    <input type="radio" name="shippingMethodId" value={s.id} checked={active} onChange={() => setShippingId(s.id)} className="sr-only" />
                    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", active ? "bg-primary text-primary-foreground" : "bg-muted")}>{s.isPickup ? <MapPin className="size-5" /> : <Package className="size-5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {[s.description, s.estimatedDays].filter(Boolean).join(" · ")}
                        {s.requiresCod && ` · ${L.payCod}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      {fee === 0 ? <span className="text-primary">{L.freeShipping}</span> : thb(fee)}
                      {s.codFee > 0 && <span className="block text-xs font-normal text-muted-foreground">+{thb(s.codFee)} COD</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {errors.shippingMethodId && (
            <p id="shippingMethodId-error" className="text-sm text-destructive">
              {errors.shippingMethodId}
            </p>
          )}
        </Reveal>

        {/* address */}
        <Reveal delay={0.1} className={section}>
          {heading(MapPin, L.address)}
          {quote?.isPickup ? (
            <p className="rounded-[var(--radius-md)] bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{L.pickupNoAddress}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="line1" label={L.addressLine1} error={errors.line1} className="sm:col-span-2">
                <Input id="line1" name="line1" autoComplete="address-line1" required aria-invalid={!!errors.line1} aria-describedby={describedBy("line1", errors.line1)} />
              </Field>
              <Field id="line2" label={L.addressLine2} error={errors.line2} className="sm:col-span-2">
                <Input id="line2" name="line2" autoComplete="address-line2" aria-invalid={!!errors.line2} aria-describedby={describedBy("line2", errors.line2)} />
              </Field>
              <Field id="subdistrict" label={L.subdistrict} error={errors.subdistrict}>
                <Input id="subdistrict" name="subdistrict" autoComplete="address-level3" required aria-invalid={!!errors.subdistrict} aria-describedby={describedBy("subdistrict", errors.subdistrict)} />
              </Field>
              <Field id="district" label={L.district} error={errors.district}>
                <Input id="district" name="district" autoComplete="address-level2" required aria-invalid={!!errors.district} aria-describedby={describedBy("district", errors.district)} />
              </Field>
              <Field id="province" label={L.province} error={errors.province}>
                <select id="province" name="province" defaultValue="" required aria-invalid={!!errors.province} aria-describedby={describedBy("province", errors.province)} className={selectClass} autoComplete="address-level1">
                  <option value="" disabled>
                    {L.selectProvince}
                  </option>
                  {provinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="postalCode" label={L.postalCode} error={errors.postalCode}>
                <Input id="postalCode" name="postalCode" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" required aria-invalid={!!errors.postalCode} aria-describedby={describedBy("postalCode", errors.postalCode)} />
              </Field>
            </div>
          )}
        </Reveal>

        {/* payment */}
        <Reveal delay={0.15} className={section}>
          {heading(ShieldCheck, L.paymentMethod)}
          {quote?.requiresCod && <p className="rounded-[var(--radius-md)] bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{L.codOnly}</p>}
          {paymentNotice ? (
            <p role="status" className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {paymentNotice}
            </p>
          ) : (
            <div role="group" aria-label={L.paymentMethod} aria-describedby={errors.paymentMethod ? "paymentMethod-error" : undefined}>
              <PaymentMethodPicker options={options} value={method} onChange={setMethod} />
            </div>
          )}
          {errors.paymentMethod && (
            <p id="paymentMethod-error" className="text-sm text-destructive">
              {errors.paymentMethod}
            </p>
          )}
        </Reveal>

        {/* note */}
        <Reveal delay={0.2} className={section}>
          <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden>
              <MessageSquare className="size-4.5" />
            </span>
            <label htmlFor="note">{L.note}</label>
          </h2>
          <Textarea id="note" name="note" placeholder={L.notePlaceholder} maxLength={500} className="min-h-20" />
        </Reveal>
      </div>

      {/* summary */}
      <Reveal delay={0.1} className="card p-5 md:p-6 lg:sticky lg:top-28">
        <h2 className="font-heading text-xl font-semibold">{L.orderSummary}</h2>
        <ul className="mt-4 grid max-h-72 gap-3 overflow-y-auto pr-1">
          {cart.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 text-sm">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted">
                {it.image && <img src={it.image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">{it.quantity}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 font-medium">{it.name}</span>
                {it.variantTitle && <span className="block text-xs text-muted-foreground">{it.variantTitle}</span>}
              </span>
              <span className="tabular-nums">{thb(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-2 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{L.subtotal}</dt>
            <dd className="tabular-nums">{thb(cart.subtotal)}</dd>
          </div>
          {cart.discountTotal > 0 && (
            <div className="flex justify-between text-primary">
              <dt>
                {L.discount}
                {cart.couponCode && <span className="ml-1 text-xs">({cart.couponCode})</span>}
              </dt>
              <dd className="tabular-nums">−{thb(cart.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{L.shipping}</dt>
            <dd className="tabular-nums">{quote ? (shippingFee === 0 ? L.freeShipping : thb(shippingFee)) : "—"}</dd>
          </div>
          {codFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{L.codFee}</dt>
              <dd className="tabular-nums">{thb(codFee)}</dd>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between border-t pt-3">
            <dt className="font-medium">{L.total}</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{thb(total)}</dd>
          </div>
        </dl>
        <Button type="submit" size="xl" disabled={!canSubmit} className="mt-5 hidden w-full lg:inline-flex">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-5" />}
          {pending ? L.placing : L.placeOrder}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{L.terms}</p>
      </Reveal>

      {/* mobile sticky bar */}
      <div data-sticky-bar="lg" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {L.total} · {label("items", { n: cart.itemCount })}
            </p>
            <p className="font-heading text-xl font-semibold tabular-nums">{thb(total)}</p>
          </div>
          <Button type="submit" size="lg" disabled={!canSubmit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            {pending ? L.placing : L.placeOrder}
          </Button>
        </div>
      </div>
    </form>
  );
}
