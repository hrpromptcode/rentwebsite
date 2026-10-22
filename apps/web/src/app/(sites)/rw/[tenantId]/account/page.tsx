import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowUpRight, BedDouble, CalendarDays, CheckCircle2, LogOut, ShoppingBag, Ticket, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { LINE_LOGIN_ERROR_MESSAGES, isLineLoginEnabled, isLineLoginErrorCode } from "@rentweb/core/customer";
import { packagesEnabled } from "@rentweb/module-booking/services";
import { getRuntime, makeT } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { logoutAction, unlinkLineAction } from "./actions";
import { LineLinkCard } from "./line-link-card";
import { AuthStyles } from "./login/auth-styles";

export const metadata = { title: "บัญชีของฉัน" };

type Search = { line?: string | string[]; line_error?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?line=linked|unlinked / ?line_error=<code> set by the LINE link flow → one Thai banner. */
function lineBanner(sp: Search): { kind: "ok" | "error"; text: string } | null {
  const ok = one(sp.line);
  if (ok === "linked") return { kind: "ok", text: "เชื่อมต่อบัญชี LINE สำเร็จ ครั้งถัดไปเข้าสู่ระบบด้วย LINE ได้ทันที" };
  if (ok === "unlinked") return { kind: "ok", text: "ยกเลิกการเชื่อมต่อ LINE แล้ว" };
  const err = one(sp.line_error);
  if (err) return { kind: "error", text: isLineLoginErrorCode(err) ? LINE_LOGIN_ERROR_MESSAGES[err] : LINE_LOGIN_ERROR_MESSAGES.unknown };
  return null;
}

/** First visible character (grapheme) of the customer's name for the monogram avatar. */
function initial(s: string): string {
  const g = new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s.trim()).containing(0)?.segment ?? "";
  return g.toUpperCase();
}

/**
 * Customer account home (operational route: calm, no 3D). Hooks kept: testid account-name, line-link-card
 * (+ unlink / confirm), line-banner, the "ออกจากระบบ" button.
 */
export default async function AccountPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Search> }) {
  const { tenantId } = await params;
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect("/account/login");
  const [runtime, sp] = await Promise.all([getRuntime(tenantId), searchParams]);
  const t = makeT(runtime?.config.locale ?? "th");
  const modules = runtime?.config.modules ?? [];
  // course template: bookings are class enrolments and passes (patient_packages) are sold without the clinic module
  const course = runtime?.config.siteType === "course";
  const passes = packagesEnabled(modules, runtime?.config.moduleConfig ?? null);
  const lineEnabled = isLineLoginEnabled(runtime?.config.settings);
  const linked = !!customer.lineUserId;
  const banner = lineBanner(sp);

  const links = [
    modules.includes("commerce") && { href: "/account/orders", icon: ShoppingBag, label: t("order.myOrders"), hint: "สถานะ การชำระเงิน และประวัติการซื้อ" },
    modules.includes("booking") && { href: "/account/bookings", icon: CalendarDays, label: course ? "คลาสของฉัน" : t("booking.myBookings"), hint: course ? "คลาสที่ลงไว้และประวัติการเรียน" : "คิวที่จองไว้ เลื่อนหรือยกเลิกได้" },
    passes && { href: "/account/packages", icon: Ticket, label: modules.includes("clinic") ? "คอร์สของฉัน" : "คลาสพาสของฉัน", hint: "จำนวนครั้งคงเหลือและวันหมดอายุ" },
    modules.includes("rental") && { href: "/account/stays", icon: BedDouble, label: "การเข้าพักของฉัน", hint: "การจองห้องพักและรายละเอียดเช็กอิน" },
    modules.includes("events") && { href: "/account/tickets", icon: Ticket, label: "บัตรของฉัน", hint: "บัตรเข้างานพร้อม QR สำหรับสแกน" },
    modules.includes("topup") && { href: "/account/topups", icon: Zap, label: "ประวัติการเติม", hint: "ทุกรายการเติมเกมและสถานะ" },
    modules.includes("topup") && { href: "/wallet", icon: Wallet, label: t("topup.wallet"), hint: "ยอดคงเหลือและการเติมเงิน" },
  ].filter(Boolean) as Array<{ href: string; icon: typeof ShoppingBag; label: string; hint: string }>;

  const title = customer.name ?? customer.phone ?? customer.email ?? "สมาชิก LINE";
  const subtitle = customer.phone ?? customer.email ?? (linked ? "เข้าสู่ระบบด้วย LINE" : null);

  return (
    <section className="container-x pt-24 pb-16 md:pt-32 md:pb-24">
      <AuthStyles />
      <div className="mx-auto max-w-5xl">
        {banner && (
          <p role="status" data-testid="line-banner" className={`mb-8 flex items-start gap-2 rounded-[var(--radius-lg)] border p-3 text-sm ${banner.kind === "ok" ? "border-[#06C755]/40 bg-[#06C755]/10 text-[#04602b] dark:text-[#86efac]" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {banner.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{banner.text}</span>
          </p>
        )}

        <header className="rw-auth-rise grid gap-6 border-b border-border pb-8 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end md:pb-12">
          {customer.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={customer.avatar} alt="" width={88} height={88} className="size-18 shrink-0 rounded-full object-cover ring-1 ring-border ring-offset-4 ring-offset-background md:size-22" />
          ) : (
            <span aria-hidden className="flex size-18 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-heading text-step-3 font-semibold md:size-22">
              {initial(title)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[0.02em] text-primary-ink">{t("common.account")}</p>
            <h1 className="mt-2 font-heading text-step-4 leading-[1.2] font-semibold break-words" data-testid="account-name">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          </div>
          <form action={logoutAction.bind(null, tenantId)} className="self-start sm:self-end">
            <Button variant="outline" type="submit" className="h-11">
              <LogOut className="size-4" /> {t("common.logout")}
            </Button>
          </form>
        </header>

        {links.length > 0 ? (
          <nav aria-label="เมนูบัญชี" className="mt-10 md:mt-14">
            <ul className="grid gap-4 sm:grid-cols-2">
              {links.map((l, i) => (
                <li key={l.href} className="rw-auth-rise" style={{ ["--d" as string]: `${80 + i * 60}ms` }}>
                  <Link href={l.href} className="rw-acc-link group flex h-full items-center gap-5 rounded-[var(--radius-xl)] border border-border bg-card p-5 text-card-foreground md:p-6">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                      <l.icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-3">
                        <span aria-hidden className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-heading text-step-1 font-semibold">{l.label}</span>
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{l.hint}</span>
                    </span>
                    <span aria-hidden className="rw-acc-arrow flex size-10 shrink-0 items-center justify-center rounded-full border border-border">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p className="mt-10 text-muted-foreground">
            ร้านนี้ยังไม่มีบริการที่ต้องเข้าสู่ระบบ{" "}
            <Link href="/" className="font-medium text-foreground underline underline-offset-4">
              กลับหน้าแรก
            </Link>
          </p>
        )}

        {(lineEnabled || linked) && (
          <div className="mt-10 [&>section]:mt-0 [&>section]:rounded-[var(--radius-xl)]">
            <LineLinkCard linked={linked} enabled={lineEnabled} avatar={customer.avatar} displayName={linked ? customer.name : null} canUnlink={!!(customer.phone || customer.email)} unlinkAction={unlinkLineAction.bind(null, tenantId)} />
          </div>
        )}
      </div>
    </section>
  );
}
