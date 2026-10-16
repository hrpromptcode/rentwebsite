"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Armchair, Bike, Check, CheckCheck, ChefHat, Flame, Loader2, Maximize2, Minimize2, ShoppingBag, StickyNote, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { STATION_LABEL, type BoardItem, type BoardOrder, type KitchenSnapshot } from "@rentweb/module-restaurant/admin";
import type { ActionResult } from "@/components/ui/form";
import { elapsedMinutes, elapsedTone, fmtTime, formatElapsed, useNow } from "../_components/elapsed";
import { bumpTicketAction, completeTicketAction, setItemDoneAction, startTicketAction } from "./actions";

type StationKey = "all" | "kitchen" | "bar" | "dessert";
const STATION_TABS: Array<[StationKey, string]> = [
  ["all", "ทั้งหมด"],
  ["kitchen", STATION_LABEL.kitchen!],
  ["bar", STATION_LABEL.bar!],
  ["dessert", STATION_LABEL.dessert!],
];
const SOUND_KEY = "rw-kds-sound";
const STATION_KEY = "rw-kds-station";

export function KitchenDisplay({ slug, initial, canWrite, tenantName }: { slug: string; initial: KitchenSnapshot; canWrite: boolean; tenantName: string }) {
  const [snap, setSnap] = React.useState<KitchenSnapshot>(initial);
  const [station, setStation] = React.useState<StationKey>("all");
  const [immersive, setImmersive] = React.useState(false);
  const [sound, setSound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastOk, setLastOk] = React.useState(initial.now);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState<Set<string>>(() => new Set());
  const seen = React.useRef(new Set(initial.tickets.map((t) => t.id)));
  const audio = React.useRef<AudioContext | null>(null);
  const container = React.useRef<HTMLDivElement>(null);
  const now = useNow(initial.now, 1000);

  React.useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) === "1");
      const s = localStorage.getItem(STATION_KEY) as StationKey | null;
      if (s && STATION_TABS.some(([k]) => k === s)) setStation(s);
    } catch {
      /* ignore */
    }
    const onFs = () => setImmersive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const beep = React.useCallback(() => {
    try {
      const ctx = (audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
      if (ctx.state === "suspended") void ctx.resume();
      const play = (at: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.3);
      };
      play(ctx.currentTime, 880);
      play(ctx.currentTime + 0.3, 1174);
    } catch {
      /* no audio */
    }
  }, []);

  const soundRef = React.useRef(sound);
  soundRef.current = sound;

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch(`/t/${slug}/restaurant/kitchen/feed`, { cache: "no-store", headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as KitchenSnapshot;
      const newIds = data.tickets.filter((t) => !seen.current.has(t.id)).map((t) => t.id);
      for (const id of newIds) seen.current.add(id);
      if (newIds.length) {
        setFresh((prev) => new Set([...prev, ...newIds]));
        setTimeout(() => setFresh((prev) => new Set([...prev].filter((id) => !newIds.includes(id)))), 45_000);
        if (soundRef.current) beep();
      }
      setSnap(data);
      setError(null);
      setLastOk(data.now);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    }
  }, [slug, beep]);

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const t = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) beep();
  }

  function pickStation(s: StationKey) {
    setStation(s);
    try {
      localStorage.setItem(STATION_KEY, s);
    } catch {
      /* ignore */
    }
  }

  async function toggleFullscreen() {
    const el = container.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setImmersive(false);
      return;
    }
    setImmersive(true);
    if (el.requestFullscreen) await el.requestFullscreen().catch(() => {});
  }

  async function run(key: string, fn: () => Promise<ActionResult>) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(null);
    }
  }

  const forStation = (t: BoardOrder) => (station === "all" ? t.items : t.items.filter((i) => i.station === station)).filter((i) => i.status !== "cancelled");
  const tickets = snap.tickets.filter((t) => forStation(t).length > 0);
  const queue = tickets.filter((t) => t.status !== "ready");
  const readyRail = tickets.filter((t) => t.status === "ready");
  const counts = Object.fromEntries(STATION_TABS.map(([k]) => [k, snap.tickets.filter((t) => t.status !== "ready" && (k === "all" ? t.items : t.items.filter((i) => i.station === k)).some((i) => i.status !== "cancelled")).length])) as Record<StationKey, number>;

  return (
    <div ref={container} className={cn("dark flex flex-col bg-zinc-950 text-zinc-50", immersive ? "fixed inset-0 z-[100] overflow-y-auto" : "min-h-[70vh] rounded-2xl border border-zinc-800")}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur sm:px-4">
        {!immersive && (
          <Link href={`/t/${slug}/restaurant/orders`} className="grid size-11 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50" aria-label="กลับไปบอร์ดออเดอร์">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        )}
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-orange-500/20 text-orange-300">
            <ChefHat className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-heading text-base font-semibold">จอครัว</p>
            <p className="text-[11px] text-zinc-400">{tenantName}</p>
          </div>
        </div>
        <nav aria-label="สถานี" className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:ml-2 sm:w-auto">
          {STATION_TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => pickStation(k)} aria-pressed={station === k} className={cn("inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition-colors", station === k ? "bg-zinc-50 text-zinc-950" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800")}>
              {label}
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", station === k ? "bg-zinc-950/10" : "bg-zinc-800 text-zinc-400")}>{counts[k]}</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-1 text-[11px] text-zinc-400 md:inline-flex">
            {error ? (
              <>
                <WifiOff className="size-3.5 text-red-400" aria-hidden /> ขาดการเชื่อมต่อ
              </>
            ) : (
              <>
                <Wifi className="size-3.5 text-emerald-400" aria-hidden /> {fmtTime(lastOk)}
              </>
            )}
          </span>
          <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "ปิดเสียงเตือน" : "เปิดเสียงเตือนเมื่อมีออเดอร์ใหม่"} title={sound ? "ปิดเสียงเตือน" : "เปิดเสียงเตือน"} className={cn("grid size-11 place-items-center rounded-xl transition-colors", sound ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800")}>
            {sound ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          </button>
          <button type="button" onClick={toggleFullscreen} aria-pressed={immersive} aria-label={immersive ? "ออกจากเต็มจอ" : "เต็มจอ"} className="grid size-11 place-items-center rounded-xl bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            {immersive ? <Minimize2 className="size-5" aria-hidden /> : <Maximize2 className="size-5" aria-hidden />}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-3 sm:p-4">
        {queue.length === 0 ? (
          <div className="grid min-h-[40vh] place-items-center rounded-2xl border border-dashed border-zinc-800 text-center">
            <div>
              <CheckCheck className="mx-auto size-10 text-emerald-400" aria-hidden />
              <p className="mt-3 font-heading text-lg font-semibold">ไม่มีออเดอร์ค้าง</p>
              <p className="text-sm text-zinc-400">ออเดอร์ใหม่จะเด้งขึ้นที่นี่อัตโนมัติ{sound ? " พร้อมเสียงเตือน" : " (เปิดเสียงเตือนได้ที่มุมขวาบน)"}</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="ตั๋วออเดอร์">
            {queue.map((t) => (
              <Ticket key={t.id} slug={slug} t={t} items={forStation(t)} now={now} isNew={fresh.has(t.id)} busy={busy} canWrite={canWrite} station={station} run={run} />
            ))}
          </ul>
        )}

        {readyRail.length > 0 && (
          <section aria-label="พร้อมเสิร์ฟ" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <Check className="size-4" aria-hidden /> พร้อมเสิร์ฟ / พร้อมรับ ({readyRail.length})
            </h2>
            <ul className="flex flex-wrap gap-2">
              {readyRail.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-xl bg-zinc-900 py-1.5 pl-3 pr-1.5 text-sm">
                  <span className="font-heading font-semibold">{t.number}</span>
                  <span className="text-xs text-zinc-400">{t.type === "dine_in" ? `โต๊ะ ${t.tableName ?? "—"}` : "รับกลับบ้าน"}</span>
                  <span className="text-xs tabular-nums text-zinc-500">{formatElapsed(t.readyAt ?? t.placedAt, now)}</span>
                  {canWrite && (
                    <button type="button" onClick={() => run(t.id, () => bumpTicketAction(slug, t.id))} disabled={busy === t.id} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
                      {busy === t.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                      {t.type === "dine_in" ? "เสิร์ฟแล้ว" : "ส่งมอบแล้ว"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Ticket({ slug, t, items, now, isNew, busy, canWrite, station, run }: { slug: string; t: BoardOrder; items: BoardItem[]; now: number; isNew: boolean; busy: string | null; canWrite: boolean; station: StationKey; run: (key: string, fn: () => Promise<ActionResult>) => Promise<void> }) {
  const mins = elapsedMinutes(t.placedAt, now);
  const tone = elapsedTone(mins, 10, 20);
  const doneCount = items.filter((i) => i.status === "done" || i.status === "served").length;
  const dineIn = t.type === "dine_in";
  return (
    <li
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-zinc-900 shadow-lg transition-shadow",
        tone === "ok" && "border-zinc-800",
        tone === "warn" && "border-amber-500/60",
        tone === "danger" && "border-red-500/70",
        isNew && "ring-2 ring-amber-400 animate-pulse [animation-iteration-count:6]",
      )}
      aria-label={`ตั๋ว ${t.number}`}
    >
      <header className={cn("flex items-start justify-between gap-2 px-3 py-2.5", tone === "ok" && "bg-emerald-500/10", tone === "warn" && "bg-amber-500/15", tone === "danger" && "bg-red-500/15")}>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-heading text-xl font-semibold leading-none tracking-tight">
            {t.number}
            {isNew && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">ใหม่</span>}
            {t.status === "preparing" && <Flame className="size-4 text-orange-400" aria-label="กำลังทำ" />}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-300">
            <span className="inline-flex items-center gap-1 font-medium">
              {dineIn ? <Armchair className="size-3.5" aria-hidden /> : t.type === "delivery" ? <Bike className="size-3.5" aria-hidden /> : <ShoppingBag className="size-3.5" aria-hidden />}
              {dineIn ? `โต๊ะ ${t.tableName ?? "—"}` : t.type === "delivery" ? "เดลิเวอรี่" : `รับกลับ ${t.scheduledFor ? fmtTime(t.scheduledFor) : "ทันที"}`}
            </span>
            {(t.guestLabel ?? t.customerName) && <span className="truncate text-zinc-400">{t.guestLabel ?? t.customerName}</span>}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-lg px-2 py-1 font-heading text-lg font-bold tabular-nums leading-none", tone === "ok" && "bg-emerald-500 text-zinc-950", tone === "warn" && "bg-amber-400 text-zinc-950", tone === "danger" && "bg-red-500 text-white")}>{formatElapsed(t.placedAt, now)}</span>
      </header>

      <ul className="flex-1 divide-y divide-zinc-800">
        {items.map((it) => {
          const done = it.status === "done" || it.status === "served";
          return (
            <li key={it.id}>
              <button
                type="button"
                disabled={!canWrite || busy === it.id}
                onClick={() => run(it.id, () => setItemDoneAction(slug, it.id, !done))}
                aria-pressed={done}
                className={cn("flex min-h-11 w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-800/70 disabled:cursor-default", done && "bg-zinc-900/50")}
              >
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2", done ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-zinc-600")} aria-hidden>
                  {busy === it.id ? <Loader2 className="size-3.5 animate-spin" /> : done ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("flex items-baseline gap-2 text-base font-semibold leading-tight", done && "text-zinc-500 line-through")}>
                    <span className="tabular-nums">{it.quantity}×</span>
                    <span>{it.name}</span>
                    {station === "all" && it.station !== "kitchen" && <span className="rounded bg-zinc-800 px-1 text-[10px] font-medium text-zinc-400 no-underline">{STATION_LABEL[it.station] ?? it.station}</span>}
                  </span>
                  {it.modifiers.length > 0 && <span className={cn("block text-sm text-zinc-400", done && "line-through")}>{it.modifiers.map((m) => m.name).join(" · ")}</span>}
                  {it.note && (
                    <span className="mt-0.5 flex items-start gap-1 text-sm font-medium text-amber-300">
                      <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {it.note}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {t.note && (
        <p className="flex items-start gap-1 border-t border-zinc-800 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t.note}
        </p>
      )}

      {canWrite && (
        <footer className="flex items-center gap-2 border-t border-zinc-800 p-2">
          <span className="px-1 text-xs tabular-nums text-zinc-400">
            {doneCount}/{items.length} เสร็จ
          </span>
          {t.status === "received" && (
            <button type="button" onClick={() => run(t.id, () => startTicketAction(slug, t.id))} disabled={busy === t.id} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50">
              <Flame className="size-4" aria-hidden /> เริ่มทำ
            </button>
          )}
          <button type="button" onClick={() => run(t.id, () => completeTicketAction(slug, t.id))} disabled={busy === t.id} className={cn("inline-flex h-11 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50", t.status !== "received" && "ml-auto")}>
            {busy === t.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />} เสร็จทั้งใบ
          </button>
        </footer>
      )}
    </li>
  );
}
