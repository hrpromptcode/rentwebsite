import { cn } from "@rentweb/ui/lib/utils";
import { brandFontClasses } from "./_brand/fonts";
import "./_brand/night.css";

/**
 * Login / signup: the RentWeb platform identity (night palette, coral "online" dot) — the first thing a new shop owner
 * sees after the showcase site, so it continues that story. Each page renders <AuthSplit> (form + shop windows).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("rw-night relative isolate min-h-dvh overflow-x-clip bg-background text-foreground", brandFontClasses)}>
      <div className="rw-night-bg" aria-hidden />
      {children}
    </div>
  );
}
