import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CalendarDays, CheckCircle2, LogOut, ShoppingBag, Ticket, Wallet, Zap, BedDouble } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { LINE_LOGIN_ERROR_MESSAGES, isLineLoginEnabled, isLineLoginErrorCode } from "@rentweb/core/customer";
import { packagesEnabled } from "@rentweb/module-booking/services";
import { getRuntime, makeT } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { logoutAction, unlinkLineAction } from "./actions";
import { LineLinkCard } from "./line-link-card";

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
    modules.includes("commerce") && { href: "/account/orders", icon: ShoppingBag, label: t("order.myOrders") },
    modules.includes("booking") && { href: "/account/bookings", icon: CalendarDays, label: course ? "คลาสของฉัน" : t("booking.myBookings") },
    passes && { href: "/account/packages", icon: Ticket, label: modules.includes("clinic") ? "คอร์สของฉัน" : "คลาสพาสของฉัน" },
    modules.includes("rental") && { href: "/account/stays", icon: BedDouble, label: "การเข้าพักของฉัน" },
    modules.includes("events") && { href: "/account/tickets", icon: Ticket, label: "บัตรของฉัน" },
    modules.includes("topup") && { href: "/account/topups", icon: Zap, label: "ประวัติการเติม" },
    modules.includes("topup") && { href: "/wallet", icon: Wallet, label: t("topup.wallet") },
  ].filter(Boolean) as Array<{ href: string; icon: typeof ShoppingBag; label: string }>;

  const title = customer.name ?? customer.phone ?? customer.email ?? "สมาชิก LINE";
  const subtitle = customer.phone ?? customer.email ?? (linked ? "เข้าสู่ระบบด้วย LINE" : null);

  return (
    <section className="container-x pt-24 pb-16">
      <div className="mx-auto max-w-2xl">
        {banner && (
          <p role="status" data-testid="line-banner" className={`mb-6 flex items-start gap-2 rounded-[var(--radius-lg)] border p-3 text-sm ${banner.kind === "ok" ? "border-[#06C755]/40 bg-[#06C755]/10 text-[#04602b] dark:text-[#86efac]" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {banner.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{banner.text}</span>
          </p>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {customer.avatar && <img src={customer.avatar} alt="" width={56} height={56} className="size-14 shrink-0 rounded-full object-cover ring-2 ring-border" />}
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{t("common.account")}</p>
              <h1 className="font-heading text-2xl font-semibold break-words sm:text-3xl" data-testid="account-name">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <form action={logoutAction.bind(null, tenantId)} className="self-start sm:self-auto">
            <Button variant="outline" size="sm" type="submit" className="h-11 md:h-9">
              <LogOut className="size-4" /> {t("common.logout")}
            </Button>
          </form>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                <l.icon className="size-5" />
              </span>
              <span className="font-medium">{l.label}</span>
            </Link>
          ))}
        </div>
        {(lineEnabled || linked) && (
          <LineLinkCard linked={linked} enabled={lineEnabled} avatar={customer.avatar} displayName={linked ? customer.name : null} canUnlink={!!(customer.phone || customer.email)} unlinkAction={unlinkLineAction.bind(null, tenantId)} />
        )}
      </div>
    </section>
  );
}
