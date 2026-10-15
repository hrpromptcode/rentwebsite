"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, ExternalLink, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, ShieldCheck, Store } from "lucide-react";
import { Avatar, AvatarFallback } from "@rentweb/ui/components/avatar";
import { Button } from "@rentweb/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@rentweb/ui/components/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@rentweb/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rentweb/ui/components/tooltip";
import { cn } from "@rentweb/ui/lib/utils";
import { NavIcon } from "@/lib/icons";
import type { NavGroup } from "@/lib/nav";

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

export function AppShell({ nav, user, tenants, current, storefrontUrl, mode, banner, children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

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

  const navList = (compact: boolean) => (
    <nav aria-label="เมนูหลัก" className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-thin px-3 py-4">
      {nav.map((group) => (
        <div key={group.key}>
          {group.label && !compact && <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{group.label}</p>}
          {group.label && compact && <div className="mx-3 mb-2 h-px bg-border" />}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const link = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    compact && "justify-center px-0",
                    active ? "bg-primary-soft text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <NavIcon name={item.icon} className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {!compact && <span className="truncate">{item.label}</span>}
                  {!compact && item.badge ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{item.badge}</span> : null}
                </Link>
              );
              return (
                <li key={item.key}>
                  {compact ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className={cn("flex h-16 items-center gap-2 border-b px-4", compact && "justify-center px-0")}>
      <Link href={mode === "console" ? "/console" : "/"} className="flex min-w-0 items-center gap-2 font-heading font-semibold tracking-tight">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          {mode === "console" ? <ShieldCheck className="size-4" aria-hidden /> : <Store className="size-4" aria-hidden />}
        </span>
        {!compact && <span className="truncate">{mode === "console" ? "RentWeb Console" : "RentWeb"}</span>}
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-background transition-[width] duration-300 ease-theme lg:flex", collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]")}
      >
        {brand(collapsed)}
        {navList(collapsed)}
        <div className={cn("border-t p-3", collapsed && "flex justify-center")}>
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={toggleCollapsed} aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"} className={cn(!collapsed && "w-full justify-start")}>
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {!collapsed && "ย่อแถบเมนู"}
          </Button>
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(20rem,85vw)] gap-0 p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">เมนู</SheetTitle>
          {brand(false)}
          {navList(false)}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {banner}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="เปิดเมนู">
            <Menu aria-hidden />
          </Button>

          {mode === "tenant" ? (
            <TenantSwitcher tenants={tenants} current={current ?? null} isSuperadmin={user.role === "superadmin"} />
          ) : (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="truncate font-heading text-sm font-semibold sm:text-base">คอนโซลผู้ดูแลแพลตฟอร์ม</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {mode === "tenant" && storefrontUrl && (
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <a href={storefrontUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> ดูหน้าร้าน
                </a>
              </Button>
            )}
            {mode === "tenant" && storefrontUrl && (
              <Button asChild variant="outline" size="icon" className="sm:hidden" aria-label="ดูหน้าร้าน">
                <a href={storefrontUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
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
        <Button variant="ghost" className="h-11 max-w-[60vw] justify-start gap-2 px-2 sm:max-w-xs">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">{current ? initials(current.name) : "?"}</span>
          <span className="truncate font-heading text-sm font-semibold sm:text-base">{current?.name ?? "เลือกร้าน"}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>ร้านของคุณ</DropdownMenuLabel>
        {tenants.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">ยังไม่มีร้านที่คุณเป็นสมาชิก</p>}
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link href={`/t/${t.slug}/dashboard`} className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">{initials(t.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.slug}</span>
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
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary-soft text-primary">{initials(user.name)}</AvatarFallback>
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
