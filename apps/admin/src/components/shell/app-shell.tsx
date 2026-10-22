"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Check, ChevronsUpDown, ExternalLink, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, ShieldCheck, Store } from "lucide-react";
import { Avatar, AvatarFallback } from "@rentweb/ui/components/avatar";
import { Button } from "@rentweb/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@rentweb/ui/components/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@rentweb/ui/components/sheet";
import { RouteProgress } from "@rentweb/ui/motion/route-transition";
import { cn } from "@rentweb/ui/lib/utils";
import type { NavGroup } from "@/lib/nav";
import { useReturnFocus } from "@/lib/use-return-focus";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { NavList } from "./nav-list";
import { TableEnhancer } from "./table-enhancer";

export interface ShellUser {
  name: string;
  email: string;
  role: string;
}

export interface ShellTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  role?: string;
}

export interface AppShellProps {
  nav: NavGroup[];
  user: ShellUser;
  tenants: ShellTenant[];
  current?: ShellTenant | null;
  storefrontUrl?: string;
  /** "tenant" shows tenant switcher; "console" shows platform header */
  mode: "tenant" | "console";
  banner?: React.ReactNode;
  children: React.ReactNode;
}

const STORAGE_KEY = "rw-admin-sidebar-collapsed";

/**
 * Admin shell — "night rail, paper desk" (docs/design/hi-end-direction.md §4.1 platform identity): a dark rail with the
 * RentWeb● wordmark, a sliding active indicator and the live-site status; a light paper workspace with a glass topbar
 * (shop switcher, ⌘K command palette, storefront link, user menu) and a 2px route-progress line. No 3D, CSS motion
 * only, everything static under prefers-reduced-motion.
 */
export function AppShell({ nav, user, tenants, current, storefrontUrl, mode, banner, children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // RESPONSIVE_B2-11: the drawer is controlled (no SheetTrigger), so hand focus back to the menu button on close
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const drawerFocus = useReturnFocus(menuButtonRef);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  const isActive = (href: string) => pathname === href || (href.split("/").length > 3 && pathname.startsWith(`${href}/`)) || (mode === "console" && href !== "/console" && pathname.startsWith(`${href}/`));
  const host = storefrontUrl ? storefrontUrl.replace(/^https?:\/\//, "") : null;

  return (
    <div className="adm-app flex min-h-dvh">
      <RouteProgress />
      <TableEnhancer />

      {/* Desktop rail */}
      <aside className={cn("adm-rail sticky top-0 hidden h-dvh shrink-0 flex-col lg:flex", collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]")} data-collapsed={collapsed ? "" : undefined}>
        <RailBrand compact={collapsed} mode={mode} />
        <NavList nav={nav} compact={collapsed} isActive={isActive} />
        <div className={cn("space-y-2 border-t p-3", collapsed && "flex flex-col items-center")}>
          {mode === "tenant" && host && storefrontUrl && !collapsed && <SiteStatus url={storefrontUrl} host={host} status={current?.status ?? "active"} />}
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={toggleCollapsed} aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"} className={cn("text-muted-foreground hover:text-foreground", !collapsed && "w-full justify-start")}>
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {!collapsed && "ย่อแถบเมนู"}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer (same night rail) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="adm-rail w-[min(20rem,85vw)] gap-0 border-r-0 p-0 sm:max-w-sm" {...drawerFocus}>
          <SheetTitle className="sr-only">เมนู</SheetTitle>
          <RailBrand compact={false} mode={mode} />
          <NavList nav={nav} compact={false} isActive={isActive} />
          {mode === "tenant" && host && storefrontUrl && (
            <div className="border-t p-3">
              <SiteStatus url={storefrontUrl} host={host} status={current?.status ?? "active"} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <div className="adm-desk flex min-w-0 flex-1 flex-col">
        {banner}
        <header className="adm-topbar sticky top-0 z-30 flex h-16 items-center gap-1.5 px-3 sm:gap-2 sm:px-6 lg:px-8">
          <Button ref={menuButtonRef} variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="เปิดเมนู" aria-expanded={mobileOpen}>
            <Menu aria-hidden />
          </Button>

          {mode === "tenant" ? (
            <TenantSwitcher tenants={tenants} current={current ?? null} isSuperadmin={user.role === "superadmin"} />
          ) : (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="truncate font-heading text-sm font-semibold sm:text-base">คอนโซลผู้ดูแลแพลตฟอร์ม</span>
            </div>
          )}

          <div className="hidden min-w-0 flex-1 justify-center px-4 md:flex">
            <button type="button" onClick={openCommandPalette} className="adm-search" aria-label="ค้นหาเมนูและคำสั่ง" aria-keyshortcuts="Control+K Meta+K">
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">ไปที่เมนู สลับร้าน หรือสั่งงาน…</span>
              <kbd className="adm-kbd">Ctrl K</kbd>
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-0">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={openCommandPalette} aria-label="ค้นหาเมนูและคำสั่ง">
              <Search aria-hidden />
            </Button>
            {mode === "tenant" && storefrontUrl && (
              <Button asChild variant="outline" size="sm" className="adm-visit hidden sm:inline-flex">
                <a href={storefrontUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> ดูหน้าร้าน
                </a>
              </Button>
            )}
            <UserMenu user={user} />
          </div>
        </header>
        <main className="adm-main flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <CommandPalette nav={nav} tenants={tenants} current={current} storefrontUrl={storefrontUrl} isSuperadmin={user.role === "superadmin"} mode={mode} />
    </div>
  );
}

function RailBrand({ compact, mode }: { compact: boolean; mode: "tenant" | "console" }) {
  return (
    <div className={cn("flex h-16 shrink-0 items-center border-b px-5", compact && "justify-center px-0")}>
      <Link href={mode === "console" ? "/console" : "/"} className="adm-brand group" aria-label={mode === "console" ? "RentWeb Console" : "RentWeb"}>
        {compact ? (
          <span className="adm-brand-tile" aria-hidden>
            <span className="adm-dot" />
          </span>
        ) : (
          <>
            <span className="adm-wordmark" aria-hidden>
              RentWeb<span className="adm-dot" />
            </span>
            {mode === "console" && (
              <span className="adm-mono ml-2 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground" aria-hidden>
                CONSOLE
              </span>
            )}
          </>
        )}
      </Link>
    </div>
  );
}

const SITE_STATUS: Record<string, { label: string; live: boolean }> = {
  active: { label: "ออนไลน์", live: true },
  trialing: { label: "ออนไลน์", live: true },
  past_due: { label: "ค้างชำระ", live: true },
  suspended: { label: "ปิดชั่วคราว", live: false },
  cancelled: { label: "ปิดแล้ว", live: false },
};

function SiteStatus({ url, host, status }: { url: string; host: string; status: string }) {
  const s = SITE_STATUS[status] ?? { label: status, live: false };
  return (
    <a href={url} target="_blank" rel="noreferrer" className="adm-site group" data-live={s.live ? "" : undefined}>
      <span className="flex items-center gap-2 text-xs font-medium">
        <span className="adm-live" aria-hidden />
        {s.label}
        <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
      </span>
      <span className="adm-mono mt-1 block truncate text-[11px] text-muted-foreground">{host}</span>
    </a>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

export function TenantSwitcher({ tenants, current, isSuperadmin }: { tenants: ShellTenant[]; current: ShellTenant | null; isSuperadmin: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="adm-switcher h-11 min-w-0 max-w-[calc(100vw-11.5rem)] justify-start gap-2.5 px-2 sm:max-w-xs">
          <span className="adm-tenant-tile">{current ? initials(current.name) : "?"}</span>
          <span className="min-w-0 truncate font-heading text-sm font-semibold sm:text-base">{current?.name ?? "เลือกร้าน"}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>ร้านของคุณ</DropdownMenuLabel>
        {tenants.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">ยังไม่มีร้านที่คุณเป็นสมาชิก</p>}
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link href={`/t/${t.slug}/dashboard`} className="flex items-center gap-2.5">
              <span className={cn("adm-tenant-tile size-8", current?.id === t.id && "is-current")}>{initials(t.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="adm-mono block truncate text-[11px] text-muted-foreground">{t.slug}</span>
              </span>
              {current?.id === t.id && <Check className="size-4 text-primary" aria-hidden />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus aria-hidden /> สร้างเว็บใหม่
          </Link>
        </DropdownMenuItem>
        {isSuperadmin && (
          <DropdownMenuItem asChild>
            <Link href="/console">
              <ShieldCheck aria-hidden /> คอนโซลผู้ดูแลแพลตฟอร์ม
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="เมนูผู้ใช้">
          <Avatar className="adm-avatar size-9">
            <AvatarFallback className="bg-foreground text-[13px] font-semibold text-background">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs">{user.email}</span>
          {user.role === "superadmin" && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">ผู้ดูแลแพลตฟอร์ม</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "superadmin" && (
          <DropdownMenuItem asChild>
            <Link href="/console">
              <ShieldCheck aria-hidden /> คอนโซล
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/t">
            <Store aria-hidden /> ร้านของฉัน
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive">
          <a href="/logout">
            <LogOut aria-hidden /> ออกจากระบบ
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
