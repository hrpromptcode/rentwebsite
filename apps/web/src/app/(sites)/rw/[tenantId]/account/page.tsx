import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, LogOut, ShoppingBag, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { getRuntime, makeT } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { logoutAction } from "./actions";

export const metadata = { title: "บัญชีของฉัน" };

export default async function AccountPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect("/account/login");
  const runtime = await getRuntime(tenantId);
  const t = makeT(runtime?.config.locale ?? "th");
  const modules = runtime?.config.modules ?? [];

  const links = [
    modules.includes("commerce") && { href: "/account/orders", icon: ShoppingBag, label: t("order.myOrders") },
    modules.includes("booking") && { href: "/account/bookings", icon: CalendarDays, label: t("booking.myBookings") },
    modules.includes("topup") && { href: "/account/topups", icon: Zap, label: "ประวัติการเติม" },
    modules.includes("topup") && { href: "/wallet", icon: Wallet, label: t("topup.wallet") },
  ].filter(Boolean) as Array<{ href: string; icon: typeof ShoppingBag; label: string }>;

  return (
    <section className="container-x pt-24 pb-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("common.account")}</p>
            <h1 className="font-heading text-3xl font-semibold">{customer.name ?? customer.phone ?? customer.email}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{customer.phone ?? customer.email}</p>
          </div>
          <form action={logoutAction.bind(null, tenantId)}>
            <Button variant="outline" size="sm" type="submit">
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
      </div>
    </section>
  );
}
