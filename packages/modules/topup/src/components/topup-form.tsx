"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgePercent, Check, Clock, KeyRound, Loader2, LogIn, PackageX, ShieldCheck, Sparkles, Wallet, Zap } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@rentweb/ui/components/accordion";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import type { GameField } from "@rentweb/db";

export interface TopupFormPackage {
  id: string;
  name: string;
  description: string | null;
  /** list price */
  price: number;
  /** what this customer pays */
  yourPrice: number;
  badge: string | null;
  fulfillment: string;
  estimatedMinutes: number;
  /** stock packages only */
  available: number | null;
  tierHint: { tier: string; price: number } | null;
}

export interface TopupFormState {
  /** Shown as a button under the error (e.g. OTP login required). */
  loginHref?: string;
  /** Optional follow-up link under the error (e.g. rate limited -> the customer's unpaid orders). */
  cta?: { href: string; label: string };
  error?: string;
  field?: string;
}

export interface TopupFormProps {
  game: { name: string; slug: string; fields: GameField[]; instructions: string | null };
  packages: TopupFormPackage[];
  methods: PaymentMethodOption[];
  loggedIn: boolean;
  /** Tenant requires an OTP-verified session before the first order (moduleConfig.topup.otpRequiredFirstOrder). */
  otpRequired?: boolean;
  walletBalance: number | null;
  tier: string | null;
  defaultContact?: string;
  loginHref: string;
  walletHref: string;
  action: (prev: TopupFormState, form: FormData) => Promise<TopupFormState>;
  initialPackageId?: string | null;
}

const TIER_LABEL: Record<string, string> = { vip: "VIP", agent: "ตัวแทน", member: "สมาชิก" };

export function TopupForm({ game, packages, methods, loggedIn, otpRequired = false, walletBalance, tier, defaultContact = "", loginHref, walletHref, action, initialPackageId }: TopupFormProps) {
  const [state, submit, pending] = useActionState(action, {} as TopupFormState);
  // a refusal (rate limit, OTP, stock…) renders below step 4, usually off-screen when the customer pressed the sticky
  // summary / bottom-bar button: bring it into view and move focus there so the message is actually read
  const alertRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = alertRef.current;
    if (!state.error || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [state]);
  const firstAvailable = packages.find((p) => p.available === null || p.available > 0);
  const [packageId, setPackageId] = React.useState<string>(() => (initialPackageId && packages.some((p) => p.id === initialPackageId) ? initialPackageId : firstAvailable?.id ?? ""));
  const defaultMethod = methods.find((m) => !m.disabled)?.value ?? "promptpay_qr";
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(defaultMethod);
  const selected = packages.find((p) => p.id === packageId) ?? null;
  const total = selected?.yourPrice ?? 0;
  const walletShort = method === "wallet" && walletBalance !== null && total > walletBalance;
  // guests of a shop with otpRequiredFirstOrder cannot order at all: every CTA becomes the OTP login instead of a dead button
  const needsOtp = otpRequired && !loggedIn;
  const canSubmit = !needsOtp && !!selected && !pending && !walletShort && (selected.available === null || selected.available > 0);

  return (
    <form action={submit} id="topup-form" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* plain block wrapper so the mobile bar below can stay sticky across the whole steps column (as its own grid row it could not move) */}
      <div className="min-w-0">
      <div className="grid gap-6">
        {needsOtp && <OtpNotice loginHref={loginHref} />}

        {/* 1. player */}
        <Reveal as="section" className="card p-5 md:p-7" aria-labelledby="step-player">
          <StepHeading n={1} id="step-player" title="ข้อมูลผู้เล่น" subtitle="กรอกให้ตรงกับในเกม ระบบเติมผ่าน ID เท่านั้น ไม่ต้องใช้รหัสผ่าน" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {game.fields.map((f) => (
              <div key={f.key} className={cn("grid gap-2", game.fields.length === 1 && "sm:col-span-2")}>
                <Label htmlFor={`pf-${f.key}`}>
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                {f.type === "select" ? (
                  <select
                    id={`pf-${f.key}`}
                    name={`pf_${f.key}`}
                    required={f.required}
                    defaultValue=""
                    aria-invalid={state.field === f.key || undefined}
                    className="flex h-12 w-full rounded-md border border-input bg-background px-3.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
                  >
                    <option value="" disabled>
                      เลือก{f.label}
                    </option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  // RV-01: mirror the server's format rules (services validatePlayerFields) so the customer sees them before submitting
                  <Input
                    id={`pf-${f.key}`}
                    name={`pf_${f.key}`}
                    inputMode={f.inputMode ?? (f.type === "number" ? "numeric" : "text")}
                    pattern={f.pattern || (f.type === "number" ? "[0-9]*" : undefined)}
                    minLength={f.minLength && f.minLength > 0 ? f.minLength : undefined}
                    maxLength={Math.min(f.maxLength && f.maxLength > 0 ? f.maxLength : 120, 120)}
                    title={f.hint || undefined}
                    placeholder={f.placeholder ?? f.label}
                    required={f.required}
                    autoComplete="off"
                    className="h-12"
                    aria-invalid={state.field === f.key || undefined}
                    aria-describedby={f.hint ? `pf-${f.key}-hint` : undefined}
                  />
                )}
                {f.hint && f.type !== "select" && (
                  <p id={`pf-${f.key}-hint`} className="text-xs text-muted-foreground">
                    {f.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
          {game.instructions && (
            <Accordion type="single" collapsible className="mt-4 rounded-[var(--radius-lg)] border border-border/60 px-4">
              <AccordionItem value="howto" className="border-0">
                <AccordionTrigger className="py-3.5 text-sm">วิธีดู ID ของ {game.name}</AccordionTrigger>
                <AccordionContent className="pb-4 whitespace-pre-line">{game.instructions}</AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </Reveal>

        {/* 2. package */}
        <Reveal as="section" className="card p-5 md:p-7" delay={0.05} aria-labelledby="step-package">
          <StepHeading n={2} id="step-package" title="เลือกแพ็กเกจ" subtitle={tier && tier !== "member" ? `คุณได้ราคาสมาชิก ${TIER_LABEL[tier] ?? tier}` : "สมาชิก VIP และตัวแทนได้ราคาถูกกว่า"} />
          <input type="hidden" name="packageId" value={packageId} />
          <div role="radiogroup" aria-label="แพ็กเกจ" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map((p) => {
              const active = p.id === packageId;
              const out = p.available !== null && p.available <= 0;
              const auto = p.fulfillment === "api" || p.fulfillment === "stock";
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={out}
                  onClick={() => setPackageId(p.id)}
                  className={cn(
                    "relative flex min-h-[7.5rem] flex-col items-start rounded-[var(--radius-lg)] border p-4 text-left transition",
                    active ? "border-primary bg-primary-soft ring-2 ring-primary/40 shadow-[0_0_30px_-8px_var(--glow)]" : "border-border/70 bg-background/40 hover:border-primary/50",
                    out && "cursor-not-allowed border-dashed border-border bg-muted/30 shadow-none hover:border-border",
                  )}
                >
                  {p.badge && (
                    <Badge variant="accent" className="absolute -top-2.5 left-3 shadow-md">
                      {p.badge}
                    </Badge>
                  )}
                  {active && (
                    <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-4" />
                    </span>
                  )}
                  <span className="font-heading pr-8 text-base leading-tight font-semibold">{p.name}</span>
                  {p.description && <span className="mt-0.5 text-xs text-muted-foreground">{p.description}</span>}
                  <span className="mt-2 flex items-baseline gap-2">
                    <span className={cn("font-heading text-xl font-semibold", out ? "text-muted-foreground line-through" : "text-primary")}>{thb(p.yourPrice)}</span>
                    {p.yourPrice < p.price && <span className="text-xs text-muted-foreground line-through">{thb(p.price)}</span>}
                  </span>
                  <span className="mt-auto flex w-full flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] text-muted-foreground">
                    {out ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/60 bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                        <PackageX className="size-3.5 text-destructive" /> หมดชั่วคราว
                      </span>
                    ) : auto ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <Zap className="size-3.5" /> อัตโนมัติ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500">
                        <Clock className="size-3.5" /> เติมมือ ~{p.estimatedMinutes} นาที
                      </span>
                    )}
                    {p.available !== null && p.available > 0 && <span>เหลือ {p.available} โค้ด</span>}
                    {p.tierHint && p.yourPrice >= p.price && (
                      <span className="inline-flex items-center gap-1">
                        <BadgePercent className="size-3.5" /> {TIER_LABEL[p.tierHint.tier] ?? p.tierHint.tier} {thb(p.tierHint.price)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Reveal>

        {/* 3. payment */}
        <Reveal as="section" className="card p-5 md:p-7" delay={0.1} aria-labelledby="step-pay">
          <StepHeading n={3} id="step-pay" title="วิธีชำระเงิน" subtitle="PromptPay ตรวจสลิปอัตโนมัติ หรือตัดจากกระเป๋าเงินในเว็บทันที" />
          <div className="mt-5">
            <PaymentMethodPicker options={methods} value={method} onChange={setMethod} />
          </div>
          {!loggedIn && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <LogIn className="size-4" />
              <Link href={loginHref} className="text-primary underline-offset-4 hover:underline">
                เข้าสู่ระบบ
              </Link>
              เพื่อใช้กระเป๋าเงินและเก็บประวัติการเติม
            </p>
          )}
          {walletShort && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-amber-500" />
              ยอดในกระเป๋า {thb(walletBalance ?? 0)} ไม่พอสำหรับ {thb(total)}
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link href={walletHref}>
                  <Wallet /> เติมเงินกระเป๋า
                </Link>
              </Button>
            </div>
          )}
        </Reveal>

        {/* 4. contact */}
        <Reveal as="section" className="card p-5 md:p-7" delay={0.15} aria-labelledby="step-contact">
          <StepHeading n={4} id="step-contact" title="ช่องทางติดต่อ" subtitle={loggedIn ? "ใช้แจ้งเตือนเมื่อเติมสำเร็จ (ไม่บังคับ)" : "เบอร์โทรหรืออีเมล ใช้ติดตามรายการและแจ้งเตือนเมื่อสำเร็จ"} />
          <div className="mt-5 grid gap-2">
            <Label htmlFor="contact">เบอร์โทร / LINE ID / อีเมล {!loggedIn && <span className="text-destructive">*</span>}</Label>
            <Input id="contact" name="contact" defaultValue={defaultContact} placeholder="08x-xxx-xxxx" required={!loggedIn} autoComplete="tel" className="h-12" maxLength={120} aria-invalid={state.field === "contact" || undefined} />
          </div>
        </Reveal>

        {state.error && (
          <div ref={alertRef} tabIndex={-1} role="alert" className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/40 outline-none bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="grid gap-2">
              <span>{state.error}</span>
              {state.loginHref && (
                <a href={state.loginHref} className="inline-flex h-11 w-fit items-center rounded-full bg-destructive px-4 font-semibold text-destructive-foreground">
                  เข้าสู่ระบบด้วย OTP
                </a>
              )}
              {state.cta && (
                <Link href={state.cta.href} className="inline-flex h-11 w-fit items-center rounded-full border border-destructive/50 px-4 font-semibold text-foreground">
                  {state.cta.label}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* mobile summary: sticky to the viewport bottom (above the storefront chat button, bottom-4 h-13) while the steps
          are on screen; it settles after step 4 and scrolls away with the form, so it never covers the footer */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-6 rounded-[var(--radius-xl)] border border-border/70 bg-background/95 px-4 py-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            {needsOtp ? (
              <p className="text-xs leading-snug text-foreground">ยืนยันเบอร์ด้วย OTP ก่อนสั่งซื้อครั้งแรก</p>
            ) : (
              <p className="truncate text-xs text-muted-foreground">{selected ? `${game.name} · ${selected.name}` : "เลือกแพ็กเกจ"}</p>
            )}
            <p className="font-heading text-xl font-semibold text-primary">{selected ? thb(total) : "—"}</p>
          </div>
          {needsOtp ? (
            <a href={loginHref} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--glow)]">
              <KeyRound className="size-4" /> ยืนยันด้วย OTP
            </a>
          ) : (
            <Button type="submit" size="lg" disabled={!canSubmit} className="h-12 min-w-36">
              {pending ? <Loader2 className="animate-spin" /> : <Zap />} {pending ? "กำลังสร้าง…" : "เติมเลย"}
            </Button>
          )}
        </div>
      </div>
      </div>

      {/* desktop summary */}
      <aside className="hidden lg:sticky lg:top-28 lg:block">
        <Summary game={game.name} selected={selected} method={method} walletBalance={walletBalance} total={total} canSubmit={canSubmit} pending={pending} otpHref={needsOtp ? loginHref : null} />
      </aside>
    </form>
  );
}

function StepHeading({ n, id, title, subtitle }: { n: number; id: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-heading flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_0_18px_-4px_var(--glow)]">{n}</span>
      <div>
        <h2 id={id} className="font-heading text-lg font-semibold md:text-xl">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function OtpNotice({ loginHref }: { loginHref: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-primary/40 bg-primary/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 font-medium">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
        ร้านนี้ให้ยืนยันเบอร์โทรด้วย OTP ก่อนสั่งซื้อครั้งแรก (ครั้งเดียว ใช้เวลาไม่ถึงนาที) แล้วกลับมาเติมต่อที่หน้านี้ได้ทันที
      </p>
      <a href={loginHref} className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">
        ยืนยันด้วย OTP
      </a>
    </div>
  );
}

function Summary({ game, selected, method, walletBalance, total, canSubmit, pending, otpHref }: { game: string; selected: TopupFormPackage | null; method: string; walletBalance: number | null; total: number; canSubmit: boolean; pending: boolean; otpHref: string | null }) {
  const methodLabel = method === "wallet" ? "กระเป๋าเงินในเว็บ" : method === "promptpay_qr" ? "PromptPay QR" : "โอนเงิน + สลิป";
  return (
    <div className="card p-6">
      <h2 className="font-heading text-lg font-semibold">สรุปรายการ</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">เกม</dt>
          <dd className="text-right font-medium">{game}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">แพ็กเกจ</dt>
          <dd className="text-right font-medium">{selected?.name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">ชำระผ่าน</dt>
          <dd className="text-right font-medium">{methodLabel}</dd>
        </div>
        {method === "wallet" && walletBalance !== null && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">คงเหลือหลังหัก</dt>
            <dd className={cn("text-right font-medium", walletBalance - total < 0 && "text-destructive")}>{thb(Math.max(0, walletBalance - total))}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 flex items-end justify-between border-t border-border/60 pt-4">
        <span className="text-sm text-muted-foreground">ยอดชำระ</span>
        <span className="font-heading text-3xl font-semibold text-primary text-glow">{selected ? thb(total) : "—"}</span>
      </div>
      {otpHref ? (
        <>
          <a href={otpHref} className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--glow)]">
            <KeyRound className="size-5" /> ยืนยันด้วย OTP เพื่อเติม
          </a>
          <p className="mt-2 text-center text-xs text-muted-foreground">ร้านนี้ให้ยืนยันเบอร์โทรก่อนสั่งซื้อครั้งแรก</p>
        </>
      ) : (
        <Button type="submit" size="xl" disabled={!canSubmit} className="mt-5 w-full">
          {pending ? <Loader2 className="animate-spin" /> : <Zap />} {pending ? "กำลังสร้างรายการ…" : "เติมเลย"}
        </Button>
      )}
      <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-emerald-500" /> ไม่ต้องให้รหัสผ่าน ปลอดภัย 100%
        </li>
        <li className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" /> เติมไม่สำเร็จ คืนเงินอัตโนมัติ
        </li>
      </ul>
    </div>
  );
}
