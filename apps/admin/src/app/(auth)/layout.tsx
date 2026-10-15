import Link from "next/link";
import { Store } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-surface">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]" />
      <header className="relative z-10 flex h-16 items-center px-4 sm:px-8">
        <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-lg px-2 font-heading text-lg font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-4" aria-hidden />
          </span>
          RentWeb
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">{children}</main>
    </div>
  );
}
