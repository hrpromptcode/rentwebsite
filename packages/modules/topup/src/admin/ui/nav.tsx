import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";

export interface FilterTab {
  key: string;
  label: string;
  count?: number;
  href: string;
}

/** Horizontal, scrollable quick-filter tabs rendered as links (server-side filtering). */
export function FilterTabs({ tabs, active, className }: { tabs: FilterTab[]; active: string; className?: string }) {
  return (
    <nav aria-label="ตัวกรองด่วน" className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex min-w-max gap-1 rounded-xl bg-muted p-1">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors", isActive ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {typeof t.count === "number" && <span className={cn("rounded-full px-1.5 text-xs tabular-nums", isActive ? "bg-primary-soft text-primary" : "bg-background/70 text-muted-foreground")}>{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Builds a query string from the current params with overrides (empty values removed). */
export function qs(params: Record<string, string | number | null | undefined>, overrides: Record<string, string | number | null | undefined> = {}): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...params, ...overrides })) {
    if (v === null || v === undefined || v === "") continue;
    merged[k] = String(v);
  }
  const s = new URLSearchParams(merged).toString();
  return s ? `?${s}` : "";
}

export function Pagination({ page, pages, total, baseHref, params, label = "รายการ" }: { page: number; pages: number; total: number; baseHref: string; params: Record<string, string | number | null | undefined>; label?: string }) {
  if (pages <= 1 && total <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {total.toLocaleString("th-TH")} {label} · หน้า {page} / {pages}
      </span>
      {pages > 1 && (
        <div className="flex gap-1">
          <Button asChild variant="outline" size="icon-sm" aria-label="หน้าก่อนหน้า" aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
            <Link href={`${baseHref}${qs(params, { page: Math.max(1, page - 1) })}`}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm" aria-label="หน้าถัดไป" aria-disabled={page >= pages} className={cn(page >= pages && "pointer-events-none opacity-50")}>
            <Link href={`${baseHref}${qs(params, { page: Math.min(pages, page + 1) })}`}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
