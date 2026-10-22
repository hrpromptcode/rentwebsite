import Link from "next/link";
import { cn } from "@rentweb/ui/lib/utils";
import { UserMenu } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/session";
import { Brandmark, Mono } from "../(auth)/_brand/brand";
import { brandFontClasses } from "../(auth)/_brand/fonts";
import "../(auth)/_brand/night.css";

/** Site-creation wizard in the RentWeb platform identity (night palette), continuing the signup screen. */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/onboarding");
  return (
    <div className={cn("rw-night relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground", brandFontClasses)}>
      <div className="rw-night-bg" aria-hidden />
      <header className="relative z-10 flex h-16 items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
        <Link href="/" className="inline-flex h-11 items-center rounded-lg px-2 text-[1.3rem] text-foreground">
          <Brandmark />
        </Link>
        <div className="flex items-center gap-5">
          <Mono className="hidden text-muted-foreground sm:inline">สร้างเว็บไซต์ใหม่</Mono>
          <UserMenu user={{ name: session.user.name, email: session.user.email, role: session.user.role ?? "user" }} />
        </div>
      </header>
      <main className="relative z-10 flex-1 px-4 sm:px-8">{children}</main>
    </div>
  );
}
