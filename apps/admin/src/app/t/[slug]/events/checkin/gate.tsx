"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, CameraOff, Check, Loader2, Maximize2, Minimize2, Moon, RefreshCw, ScanLine, Sun, TriangleAlert, Undo2, Users, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { CHECKIN_REASON, GATE, GATE_EXTRA_REASON, type Tone } from "@rentweb/module-events/admin/labels";
import { NativeSelect, formatThaiDateTime, formatThaiTime, isSignedTicketPayload, normalizeTicketCode } from "@rentweb/module-events/admin/ui";
import { gateCheckInAction, gateSnapshotAction, gateUndoAction, type GateResult, type GateSnapshot } from "./actions";

export interface GateEventVM {
  id: string;
  title: string;
  sessions: Array<{ id: string; label: string; today: boolean }>;
}

interface Props {
  slug: string;
  events: GateEventVM[];
  initialEventId: string;
  initialSessionId: string;
  initialSnapshot: GateSnapshot;
  canScan: boolean;
  attendeesHref: string;
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

/** A scanner pastes the whole payload in a burst; a human types 12 symbols. Both are "complete" without pressing Enter. */
function looksComplete(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (isSignedTicketPayload(s)) return s.split(".").length >= 5 && s.length > 40;
  return normalizeTicketCode(s) !== null;
}

function reasonMeta(key: string): { label: string; hint: string; tone: Tone } {
  return CHECKIN_REASON[key] ?? GATE_EXTRA_REASON[key] ?? { label: key, hint: "", tone: "destructive" };
}

const TONE_PANEL: Record<Tone, string> = {
  success: "border-emerald-500/60 bg-emerald-50 text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-50",
  warning: "border-amber-500/60 bg-amber-50 text-amber-950 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-50",
  destructive: "border-red-500/60 bg-red-50 text-red-950 dark:border-red-400/50 dark:bg-red-500/15 dark:text-red-50",
  default: "border-border bg-card text-card-foreground",
  muted: "border-border bg-muted text-muted-foreground",
};

const TONE_ICON: Record<Tone, string> = {
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-white",
  destructive: "bg-red-600 text-white",
  default: "bg-primary text-primary-foreground",
  muted: "bg-muted text-muted-foreground",
};

function beep(tone: Tone) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(tone === "success" ? 40 : [80, 60, 80]);
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = tone === "success" ? 880 : tone === "warning" ? 440 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + (tone === "success" ? 0.12 : 0.3));
    osc.onended = () => void ac.close().catch(() => {});
  } catch {
    /* audio is a nicety */
  }
}

const DARK_KEY = "rw.gate.dark";

/* ------------------------------------------------------------------ */
/* component                                                            */
/* ------------------------------------------------------------------ */

export function Gate({ slug, events, initialEventId, initialSessionId, initialSnapshot, canScan, attendeesHref }: Props) {
  const [eventId, setEventId] = React.useState(initialEventId);
  const [sessionId, setSessionId] = React.useState(initialSessionId);
  const [snapshot, setSnapshot] = React.useState<GateSnapshot>(initialSnapshot);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<(GateResult & { scannedAt: string }) | null>(null);
  const [lastOkId, setLastOkId] = React.useState<string | null>(null);
  const [undoing, setUndoing] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [camera, setCamera] = React.useState<"off" | "starting" | "on" | "unsupported" | "denied">("off");
  const [refreshing, setRefreshing] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const resultRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const detectTimer = React.useRef<number | null>(null);
  const submitTimer = React.useRef<number | null>(null);
  const lastScan = React.useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const busyRef = React.useRef(false);

  const event = events.find((e) => e.id === eventId) ?? events[0]!;
  const session = event.sessions.find((s) => s.id === sessionId) ?? null;
  const pct = snapshot.total ? Math.round((snapshot.checkedIn / snapshot.total) * 100) : 0;

  /* ---- night mode (persisted per device) + fullscreen state ---- */
  React.useEffect(() => {
    try {
      if (localStorage.getItem(DARK_KEY) === "1") setDark(true);
    } catch {
      /* private mode */
    }
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleDark = () => {
    setDark((d) => {
      try {
        localStorage.setItem(DARK_KEY, d ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !d;
    });
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen?.();
    } catch {
      toast.error("เบราว์เซอร์นี้ไม่รองรับโหมดเต็มจอ");
    }
  };

  /* ---- keep the URL shareable and the counts fresh when the gate changes event / session ---- */
  const syncUrl = React.useCallback((eid: string, sid: string) => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("event", eid);
      if (sid) u.searchParams.set("session", sid);
      else u.searchParams.set("session", "");
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = React.useCallback(
    async (eid = eventId, sid = sessionId, quiet = true) => {
      if (!quiet) setRefreshing(true);
      try {
        const s = await gateSnapshotAction(slug, eid, sid || null);
        if (s) setSnapshot(s);
      } catch {
        if (!quiet) toast.error("โหลดตัวเลขไม่สำเร็จ");
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [slug, eventId, sessionId],
  );

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  function pickEvent(eid: string) {
    const ev = events.find((e) => e.id === eid);
    if (!ev) return;
    const todays = ev.sessions.filter((s) => s.today);
    const sid = todays.length === 1 ? todays[0]!.id : "";
    setEventId(eid);
    setSessionId(sid);
    setResult(null);
    setLastOkId(null);
    syncUrl(eid, sid);
    void refresh(eid, sid);
    focusInput();
  }
  function pickSession(sid: string) {
    setSessionId(sid);
    setResult(null);
    syncUrl(eventId, sid);
    void refresh(eventId, sid);
    focusInput();
  }

  const focusInput = React.useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
  }, []);
  React.useEffect(() => {
    if (canScan) focusInput();
  }, [canScan, focusInput]);

  /* ---- one scan ---- */
  const submit = React.useCallback(
    async (raw: string, via: "input" | "camera") => {
      const value = raw.trim();
      if (!value || busyRef.current || !canScan) return;
      // a camera keeps seeing the same QR while the guest holds the phone up — one scan per code per few seconds
      const now = Date.now();
      if (via === "camera" && lastScan.current.raw === value && now - lastScan.current.at < 6_000) return;
      lastScan.current = { raw: value, at: now };
      busyRef.current = true;
      setBusy(true);
      if (submitTimer.current) window.clearTimeout(submitTimer.current);
      try {
        const r = await gateCheckInAction(slug, { code: value, eventId, sessionId: sessionId || null });
        setResult({ ...r, scannedAt: new Date().toISOString() });
        const tone: Tone = r.outcome === "checked_in" ? "success" : r.outcome === "already_checked_in" ? "warning" : r.outcome === "rejected" ? reasonMeta(r.reason).tone : "destructive";
        beep(tone);
        if (r.outcome === "checked_in") {
          setLastOkId(r.ticket.id);
          setSnapshot((s) => ({
            ...s,
            checkedIn: s.checkedIn + 1,
            remaining: Math.max(0, s.remaining - 1),
            recent: [{ id: r.ticket.id, holderName: r.ticket.holderName, typeName: r.ticket.typeName, code: r.ticket.code, at: r.at }, ...s.recent].slice(0, 8),
          }));
          void refresh();
        }
      } catch (e) {
        setResult({ outcome: "error", message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", scannedAt: new Date().toISOString() });
        beep("destructive");
      } finally {
        busyRef.current = false;
        setBusy(false);
        setCode("");
        if (via === "input") focusInput();
      }
    },
    [slug, eventId, sessionId, canScan, refresh, focusInput],
  );

  function onCodeChange(v: string) {
    setCode(v);
    if (submitTimer.current) window.clearTimeout(submitTimer.current);
    if (looksComplete(v)) submitTimer.current = window.setTimeout(() => void submit(v, "input"), isSignedTicketPayload(v) ? 220 : 140);
  }

  async function undoLast() {
    if (!lastOkId) return;
    setUndoing(true);
    try {
      const r = await gateUndoAction(slug, lastOkId);
      if (!r.ok) toast.error(r.error ?? "ยกเลิกไม่สำเร็จ");
      else {
        toast.success(r.message ?? "ยกเลิกการเช็กอินแล้ว");
        setLastOkId(null);
        setResult(null);
        void refresh();
      }
    } finally {
      setUndoing(false);
      focusInput();
    }
  }

  /* ---- camera (BarcodeDetector) ---- */
  const stopCamera = React.useCallback(() => {
    if (detectTimer.current) window.clearInterval(detectTimer.current);
    detectTimer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera((c) => (c === "on" || c === "starting" ? "off" : c));
  }, []);

  async function startCamera() {
    const Ctor = barcodeDetectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play();
      const detector = new Ctor({ formats: ["qr_code"] });
      setCamera("on");
      detectTimer.current = window.setInterval(async () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2 || busyRef.current) return;
        try {
          const found = await detector.detect(v);
          const hit = found.find((f) => f.rawValue && (isSignedTicketPayload(f.rawValue) || normalizeTicketCode(f.rawValue)));
          if (hit) void submit(hit.rawValue, "camera");
        } catch {
          /* a frame that cannot be decoded */
        }
      }, 280);
    } catch (e) {
      stopCamera();
      const name = e instanceof DOMException ? e.name : "";
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
  }
  React.useEffect(() => stopCamera, [stopCamera]);

  /* on a phone the result card sits below the input — bring it into view after every scan */
  React.useEffect(() => {
    if (!result || typeof window === "undefined" || window.innerWidth >= 768) return;
    resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [result]);

  /* ---- result view model ---- */
  const view = React.useMemo(() => {
    if (!result) return null;
    if (result.outcome === "error") return { tone: "destructive" as Tone, label: "ทำรายการไม่สำเร็จ", hint: result.message, ticket: null, at: null as string | null, key: "error" };
    if (result.outcome === "checked_in") return { tone: "success" as Tone, label: CHECKIN_REASON.checked_in!.label, hint: CHECKIN_REASON.checked_in!.hint, ticket: result.ticket, at: result.at, key: "checked_in" };
    if (result.outcome === "already_checked_in") return { tone: "warning" as Tone, label: CHECKIN_REASON.already_checked_in!.label, hint: result.at ? `เช็กอินไปแล้วเมื่อ ${formatThaiDateTime(new Date(result.at))}` : CHECKIN_REASON.already_checked_in!.hint, ticket: result.ticket, at: result.at, key: "already_checked_in" };
    const m = reasonMeta(result.reason);
    return { tone: m.tone, label: m.label, hint: m.hint, ticket: result.ticket, at: null as string | null, key: result.reason };
  }, [result]);

  const ResultIcon = view?.tone === "success" ? Check : view?.tone === "warning" ? TriangleAlert : X;

  return (
    <div ref={rootRef} className={cn("-mx-4 -my-6 min-h-[calc(100dvh-4rem)] bg-background px-4 py-6 text-foreground transition-colors sm:-mx-6 sm:px-6 lg:-mx-8 lg:-my-8 lg:px-8 lg:py-8 [&:fullscreen]:m-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:p-6", dark && "dark")} data-testid="gate" data-gate-dark={dark ? "true" : "false"}>
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <ScanLine className="size-6 text-primary" aria-hidden /> {GATE.title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{GATE.scanHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={toggleDark} aria-pressed={dark} aria-label={dark ? "โหมดสว่าง" : "โหมดกลางคืน"} title={dark ? "โหมดสว่าง" : "โหมดกลางคืน"} data-testid="gate-dark">
            {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={toggleFullscreen} aria-label={fullscreen ? "ออกจากเต็มจอ" : "ขยายเต็มจอ"} title={fullscreen ? "ออกจากเต็มจอ" : "ขยายเต็มจอ"} className="hidden sm:inline-flex">
            {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </Button>
          <Button asChild variant="outline">
            <Link href={`${attendeesHref}?event=${eventId}${sessionId ? `&session=${sessionId}` : ""}`}>
              <Users aria-hidden /> รายชื่อ
            </Link>
          </Button>
        </div>
      </div>

      {/* event / session */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">งาน</span>
          <NativeSelect value={eventId} onChange={(e) => pickEvent(e.target.value)} data-testid="gate-event">
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">รอบ</span>
          <NativeSelect value={sessionId} onChange={(e) => pickSession(e.target.value)} data-testid="gate-session">
            <option value="">{GATE.anySession}</option>
            {event.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.today ? " · วันนี้" : ""}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
        {/* scan column */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <label htmlFor="gate-code" className="sr-only">
              รหัสบัตร
            </label>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                id="gate-code"
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submit(code, "input");
                  }
                  if (e.key === "Escape") setCode("");
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (text && looksComplete(text)) {
                    e.preventDefault();
                    setCode(text);
                    void submit(text, "input");
                  }
                }}
                disabled={!canScan || busy}
                placeholder={canScan ? GATE.placeholder : "สิทธิ์ของคุณดูได้อย่างเดียว"}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="go"
                maxLength={400}
                aria-describedby="gate-code-hint"
                data-testid="gate-code"
                className={cn(
                  "h-16 w-full rounded-xl border-2 border-input bg-background pl-14 pr-14 font-mono text-2xl uppercase tracking-[0.18em] text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-base placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground sm:text-3xl",
                  "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60",
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {busy ? (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="กำลังตรวจสอบ" />
                ) : code ? (
                  <button type="button" onClick={() => (setCode(""), focusInput())} className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="ล้างรหัส">
                    <X className="size-5" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p id="gate-code-hint" className="text-xs text-muted-foreground">
                {session ? <>ตรวจรอบ: {session.label}</> : <>ไม่ตรวจรอบ — รับบัตรทุกรอบของงานนี้</>}
              </p>
              {canScan &&
                (camera === "on" || camera === "starting" ? (
                  <Button type="button" variant="outline" size="sm" onClick={stopCamera} data-testid="gate-camera-stop">
                    <CameraOff aria-hidden /> {GATE.cameraStop}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={startCamera} data-testid="gate-camera">
                    <Camera aria-hidden /> {GATE.camera}
                  </Button>
                ))}
            </div>
            {camera === "unsupported" && (
              <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
                {GATE.cameraUnsupported}
              </p>
            )}
            {camera === "denied" && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100" role="status">
                {GATE.cameraDenied}
              </p>
            )}
            <div className={cn("relative mt-3 overflow-hidden rounded-xl bg-black", camera === "on" || camera === "starting" ? "block" : "hidden")}>
              <video ref={videoRef} className="aspect-[4/3] w-full object-cover sm:aspect-video" muted playsInline aria-label="ภาพจากกล้องสำหรับสแกน QR" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="size-[56%] max-w-72 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {camera === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> กำลังเปิดกล้อง…
                </div>
              )}
            </div>
          </div>

          {/* result */}
          <div ref={resultRef} aria-live="polite" aria-atomic="true" data-testid="gate-result" data-outcome={result?.outcome ?? "idle"} data-reason={result && result.outcome === "rejected" ? result.reason : undefined} className={cn("min-h-56 rounded-2xl border-2 p-5 transition-colors sm:p-6", view ? TONE_PANEL[view.tone] : "border-dashed bg-card text-card-foreground")} onClick={focusInput}>
            {!view ? (
              <div className="flex h-full min-h-44 flex-col items-center justify-center text-center text-muted-foreground">
                <ScanLine className="mb-2 size-10 opacity-50" aria-hidden />
                <p className="text-lg font-medium text-foreground">{GATE.waiting}</p>
                <p className="text-sm">{GATE.waitingHint}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className={cn("flex size-16 shrink-0 items-center justify-center rounded-2xl sm:size-20", TONE_ICON[view.tone])}>
                  <ResultIcon className="size-9 sm:size-11" strokeWidth={2.5} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold leading-tight sm:text-3xl" data-testid="gate-result-label">
                    {view.label}
                  </p>
                  <p className="mt-1 text-sm opacity-90">{view.hint}</p>
                  {view.ticket && (
                    <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <p className="col-span-full truncate text-xl font-semibold" data-testid="gate-holder">
                        {view.ticket.holderName}
                        {view.ticket.seatLabel ? <span className="ml-2 text-sm font-normal opacity-80">ที่นั่ง {view.ticket.seatLabel}</span> : null}
                      </p>
                      <p>
                        <span className="opacity-70">ประเภทบัตร</span> <b>{view.ticket.typeName}</b>
                      </p>
                      <p className="font-mono text-xs sm:text-sm">{view.ticket.code}</p>
                      <p className="truncate">
                        <span className="opacity-70">รอบ</span> {view.ticket.sessionLabel ?? "ทุกรอบ"}
                      </p>
                      <p className="truncate">
                        <span className="opacity-70">งาน</span> {view.ticket.eventTitle} · <span className="font-mono text-xs">{view.ticket.orderNumber}</span>
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs opacity-80">
                    <span>{formatThaiTime(new Date(result!.scannedAt))}</span>
                    {view.key === "checked_in" && lastOkId && view.ticket && lastOkId === view.ticket.id && (
                      <Button type="button" size="sm" variant="outline" className="ml-auto bg-background/70 text-foreground" onClick={undoLast} disabled={undoing} data-testid="gate-undo">
                        {undoing ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} {GATE.undoLast}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* counts column */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" data-testid="gate-stats">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">{GATE.checkedInCount}</p>
                <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                  <span data-testid="gate-checked-in">{snapshot.checkedIn.toLocaleString("th-TH")}</span>
                  <span className="text-lg font-medium text-muted-foreground sm:text-xl"> / {snapshot.total.toLocaleString("th-TH")}</span>
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => void refresh(eventId, sessionId, false)} aria-label="รีเฟรชตัวเลข" disabled={refreshing}>
                <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
              </Button>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="สัดส่วนผู้เข้างานที่เช็กอินแล้ว">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-muted/60 px-2 py-2">
                <p className="text-xs text-muted-foreground">{GATE.remaining}</p>
                <p className="text-lg font-semibold tabular-nums" data-testid="gate-remaining">
                  {snapshot.remaining.toLocaleString("th-TH")}
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 px-2 py-2">
                <p className="text-xs text-muted-foreground">เข้าแล้ว</p>
                <p className="text-lg font-semibold tabular-nums">{pct}%</p>
              </div>
              <div className="rounded-xl bg-muted/60 px-2 py-2">
                <p className="text-xs text-muted-foreground">อัปเดต</p>
                <p className="text-lg font-semibold tabular-nums">{formatThaiTime(new Date(snapshot.at)).replace(" น.", "")}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" data-testid="gate-recent">
            <p className="text-sm font-medium">{GATE.recent}</p>
            {snapshot.recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีใครเช็กอิน{session ? "ในรอบนี้" : ""}</p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {snapshot.recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <Check className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.holderName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.typeName} · <span className="font-mono">{r.code}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.at ? formatThaiTime(new Date(r.at)) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
