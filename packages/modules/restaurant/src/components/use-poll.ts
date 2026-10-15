"use client";

import * as React from "react";

/** Calls `fn` every `intervalMs` while `enabled` and the tab is visible; also on focus and on custom window events. */
export function usePoll(fn: () => void | Promise<void>, intervalMs: number, enabled: boolean, events: string[] = []) {
  const ref = React.useRef(fn);
  ref.current = fn;
  React.useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, intervalMs);
    };
    startTimer();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();
        startTimer();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    for (const e of events) window.addEventListener(e, tick);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
      for (const e of events) window.removeEventListener(e, tick);
    };
  }, [intervalMs, enabled, events.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}
