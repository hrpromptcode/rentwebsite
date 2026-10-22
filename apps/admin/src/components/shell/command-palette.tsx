"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, ExternalLink, LogOut, Plus, Search, ShieldCheck, Store } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@rentweb/ui/components/dialog";
import { cn } from "@rentweb/ui/lib/utils";
import { NavIcon } from "@/lib/icons";
import type { NavGroup } from "@/lib/nav";
import type { ShellTenant } from "./app-shell";

type Cmd = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  /** extra words the filter matches (english keys, slugs) */
  keywords?: string;
  icon: React.ReactNode;
  run: { href: string; external?: boolean; hard?: boolean };
};

const PALETTE_EVENT = "adm:palette";

/** Opens the palette from anywhere (topbar trigger, shortcuts). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

function norm(s: string) {
  return s.toLocaleLowerCase("th").normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * ⌘K / Ctrl+K command palette: jump to any menu of the current shop, switch shop, open the storefront, start a new
 * site, sign out. Combobox + listbox (aria-activedescendant), arrow keys / Enter / Esc, mouse hover follows. Mounted
 * only while open (Radix Dialog), so no listbox/option/dialog stays in the DOM for page locators.
 */
export function CommandPalette({ nav, tenants, current, storefrontUrl, isSuperadmin, mode }: { nav: NavGroup[]; tenants: ShellTenant[]; current?: ShellTenant | null; storefrontUrl?: string; isSuperadmin: boolean; mode: "tenant" | "console" }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  const commands = React.useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    for (const g of nav) {
      for (const item of g.items) {
        out.push({
          id: `nav-${item.key}`,
          group: mode === "console" ? "คอนโซล" : "เมนู",
          label: item.label,
          hint: g.label ?? undefined,
          keywords: `${item.key} ${item.href}`,
          icon: <NavIcon name={item.icon} className="size-4" />,
          run: { href: item.href },
        });
      }
    }
    if (mode === "tenant" && storefrontUrl) {
      out.push({ id: "storefront", group: "คำสั่ง", label: "ดูหน้าร้าน", hint: "เปิดแท็บใหม่", keywords: "storefront site web open", icon: <ExternalLink className="size-4" />, run: { href: storefrontUrl, external: true } });
    }
    out.push({ id: "new-site", group: "คำสั่ง", label: "สร้างเว็บใหม่", keywords: "new site onboarding create", icon: <Plus className="size-4" />, run: { href: "/onboarding" } });
    if (isSuperadmin) out.push({ id: "console", group: "คำสั่ง", label: "คอนโซลผู้ดูแลแพลตฟอร์ม", keywords: "console admin superadmin", icon: <ShieldCheck className="size-4" />, run: { href: "/console" } });
    for (const t of tenants) {
      if (current && t.id === current.id) continue;
      out.push({ id: `tenant-${t.id}`, group: "สลับร้าน", label: t.name, hint: t.slug, keywords: t.slug, icon: <Store className="size-4" />, run: { href: `/t/${t.slug}/dashboard` } });
    }
    out.push({ id: "logout", group: "คำสั่ง", label: "ออกจากระบบ", keywords: "logout sign out", icon: <LogOut className="size-4" />, run: { href: "/logout", hard: true } });
    return out;
  }, [nav, tenants, current, storefrontUrl, isSuperadmin, mode]);

  const filtered = React.useMemo(() => {
    const needle = norm(q);
    if (!needle) return commands;
    const parts = needle.split(" ");
    return commands.filter((c) => {
      const hay = norm(`${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`);
      return parts.every((p) => hay.includes(p));
    });
  }, [commands, q]);

  React.useEffect(() => setActive(0), [q, open]);
  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(c: Cmd | undefined) {
    if (!c) return;
    setOpen(false);
    if (c.run.external) window.open(c.run.href, "_blank", "noopener,noreferrer");
    else if (c.run.hard) window.location.assign(c.run.href);
    else router.push(c.run.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[active]);
    }
  }

  const listId = `${baseId}-list`;
  const optId = (i: number) => `${baseId}-opt-${i}`;
  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="adm-palette top-[12vh] flex max-h-[min(34rem,76dvh)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" aria-describedby={`${baseId}-desc`}>
        <DialogTitle className="sr-only">ค้นหาเมนูและคำสั่ง</DialogTitle>
        <DialogDescription id={`${baseId}-desc`} className="sr-only">
          พิมพ์เพื่อกรอง ใช้ลูกศรขึ้นลงเพื่อเลือก กด Enter เพื่อเปิด
        </DialogDescription>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length ? optId(active) : undefined}
            aria-label="ค้นหาเมนู ร้าน หรือคำสั่ง"
            placeholder="ไปที่เมนู สลับร้าน หรือสั่งงาน…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="adm-kbd hidden sm:inline-flex">Esc</kbd>
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label="ผลการค้นหา" className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {filtered.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">ไม่พบเมนูหรือคำสั่งที่ตรงกับ “{q}”</p>}
          {filtered.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {head && (
                  <div role="presentation" className="adm-palette-group">
                    {head}
                  </div>
                )}
                <div
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  data-idx={i}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(c)}
                  className={cn("adm-palette-item", i === active && "is-active")}
                >
                  <span className="adm-palette-icon">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:block">{c.hint}</span>}
                  {i === active ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <ArrowRight className="size-3.5 shrink-0 text-transparent" aria-hidden />}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="hidden items-center gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="adm-kbd">↑</kbd>
            <kbd className="adm-kbd">↓</kbd> เลือก
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="adm-kbd">Enter</kbd> เปิด
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <kbd className="adm-kbd">Ctrl</kbd>
            <kbd className="adm-kbd">K</kbd> เปิด/ปิด
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
