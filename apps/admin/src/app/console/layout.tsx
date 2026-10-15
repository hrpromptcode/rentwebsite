import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { CONSOLE_NAV } from "@/lib/nav";
import { requireSuperadmin } from "@/lib/session";
import { listUserTenants } from "@/lib/tenant";

export const metadata: Metadata = { title: { default: "คอนโซลผู้ดูแล", template: "%s · RentWeb Console" } };

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperadmin();
  const tenants = await listUserTenants(session.user.id);
  return (
    <AppShell mode="console" nav={CONSOLE_NAV} user={{ name: session.user.name, email: session.user.email, role: session.user.role ?? "user" }} tenants={tenants}>
      {children}
    </AppShell>
  );
}
