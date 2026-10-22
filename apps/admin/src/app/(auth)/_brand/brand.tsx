import * as React from "react";
import Link from "next/link";
import { env } from "@rentweb/core/env";
import { PRESETS } from "@rentweb/core/theme";
import { listTemplates } from "@rentweb/templates";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * RentWeb platform identity for the admin's first-impression screens (docs/design/hi-end-direction.md §4.1):
 * night palette, Anuphan / Unbounded / JetBrains Mono, the "RentWeb●" wordmark with its pulsing coral "online" dot,
 * and the "shop windows" wall — every template's live storefront screenshot (apps/web/public/showcase) on a tilted,
 * slowly drifting plane. CSS only (no WebGL); static under reduced motion. Server components.
 */

const isThai = (s: string) => /[฀-๿]/.test(s);

export function Brandmark({ className }: { className?: string }) {
  return (
    <span className={cn("rw-brandmark inline-flex items-baseline gap-[0.14em]", className)} role="img" aria-label="RentWeb">
      <span aria-hidden>RentWeb</span>
      <span className="rw-dot" aria-hidden />
    </span>
  );
}

export function Mono({ children, className, as: Tag = "span" }: { children: string; className?: string; as?: "span" | "p" }) {
  return (
    <Tag className={cn("rw-mono", className)} data-script={isThai(children) ? "thai" : "latin"}>
      {children}
    </Tag>
  );
}

export type Shot = { key: string; name: string; src: string };

/** Live template screenshots served by the platform site (same files the showcase uses). */
export function showcaseShots(): Shot[] {
  const base = env().WEB_URL.replace(/\/$/, "");
  return listTemplates().map((t) => ({ key: t.key, name: t.name.th, src: `${base}/showcase/${t.key}.webp` }));
}

export function platformCounts() {
  return { templates: listTemplates().length, presets: Object.keys(PRESETS).length };
}

/** The tilted wall of lit "shop windows" + a statement in the lower left. Decorative (aria-hidden wall). */
export function ShopWindows({ statement, kicker, className }: { statement: string; kicker: string; className?: string }) {
  const shots = showcaseShots();
  const { templates, presets } = platformCounts();
  const cols: Shot[][] = [[], [], []];
  shots.forEach((s, i) => cols[i % 3]!.push(s));
  const speeds = ["74s", "92s", "83s"];
  return (
    <div className={cn("rw-windows", className ?? "absolute inset-0")}>
      <div className="rw-windows-plane" aria-hidden>
        {cols.map((col, c) => (
          <div key={c} className="rw-windows-col" style={{ ["--rw-drift" as string]: speeds[c], marginTop: c === 1 ? "-18%" : c === 2 ? "8%" : undefined }}>
            {[...col, ...col].map((s, i) => (
              <div key={`${s.key}-${i}`} className="rw-window">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" width={1440} height={900} loading={i < col.length ? "eager" : "lazy"} decoding="async" fetchPriority="low" />
                <span className="rw-window-label rw-mono">{`demo-${s.key}`}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="rw-windows-glow" aria-hidden />
      <div className="rw-windows-fade" aria-hidden />
      <div className="absolute top-7 right-7 z-10 flex items-center gap-2.5 text-[#f3f1ec]/80">
        <span className="rw-dot text-[0.95rem]" aria-hidden />
        <Mono>{`${templates} live demos`}</Mono>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 p-10 xl:p-14">
        <Mono className="text-primary">{kicker}</Mono>
        <p className="mt-5 font-heading text-[clamp(2.25rem,3.3vw,3.75rem)] leading-[1.18] font-semibold whitespace-pre-line text-[#f3f1ec]" data-script="thai">
          {statement}
        </p>
        <div className="mt-9 flex flex-wrap gap-x-12 gap-y-4">
          {[
            [String(templates), "เทมเพลตตามธุรกิจ"],
            [String(presets), "ธีมสำเร็จรูป"],
            ["999", "บาท/เดือน เริ่มต้น"],
          ].map(([n, label]) => (
            <p key={label} className="grid gap-1.5">
              <span className="font-accent text-[2rem] leading-none font-medium tracking-[-0.03em] text-[#f3f1ec]">{n}</span>
              <span className="text-sm text-[#a3a099]">{label}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Phones / tablets: a slim drifting strip of the same shop windows under the header (decorative). */
export function WindowsStrip({ className }: { className?: string }) {
  const shots = showcaseShots();
  return (
    <div className={cn("rw-strip -mx-5 sm:-mx-10", className)} aria-hidden>
      <div className="rw-strip-track">
        {[...shots, ...shots].map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${s.key}-${i}`} src={s.src} alt="" width={1440} height={900} loading={i < 4 ? "eager" : "lazy"} decoding="async" fetchPriority="low" />
        ))}
      </div>
    </div>
  );
}

/**
 * Split auth screen: the form column (wordmark, the page's form, HUD footer) and, from lg, the shop-windows panel.
 * Renders the page's single <main>.
 */
export function AuthSplit({ children, panel }: { children: React.ReactNode; panel: React.ReactNode }) {
  return (
    <div className="relative z-10 grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
      <div className="flex min-w-0 flex-col px-5 py-5 sm:px-10 lg:px-14 xl:px-20">
        <header className="flex h-12 items-center justify-between gap-4">
          <Link href="/" className="-mx-2 inline-flex h-11 items-center rounded-lg px-2 text-[1.375rem] text-foreground">
            <Brandmark />
          </Link>
          <Mono className="text-muted-foreground">ระบบหลังบ้าน</Mono>
        </header>
        <WindowsStrip className="mt-6 lg:hidden" />
        <main className="flex flex-1 items-center py-10 lg:py-14">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground">
          <Mono>{`© ${new Date().getFullYear()} RentWeb`}</Mono>
          <Mono>Made in Bangkok · TH</Mono>
        </footer>
      </div>
      <div className="relative hidden min-h-dvh p-3 lg:block">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[1.75rem] border border-[#f3f1ec]/[0.06] bg-[#090a0e]">{panel}</div>
      </div>
    </div>
  );
}
