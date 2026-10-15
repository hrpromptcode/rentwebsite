import Link from "next/link";
import { Store } from "lucide-react";
import { UserMenu } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/session";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/onboarding");
  return (
    <div className="relative flex min-h-dvh flex-col bg-surface">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(70%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />
      <header className="relative z-10 flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-lg px-2 font-heading text-lg font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-4" aria-hidden />
          </span>
          RentWeb
        </Link>
        <UserMenu user={{ name: session.user.name, email: session.user.email, role: session.user.role ?? "user" }} />
      </header>
      <main className="relative z-10 flex-1 px-4 pb-16 sm:px-8">{children}</main>
    </div>
  );
}
