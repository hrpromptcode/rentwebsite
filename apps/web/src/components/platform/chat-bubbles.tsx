"use client";

import * as React from "react";
import { UserRound } from "lucide-react";

export interface ChatPair {
  pain: string;
  answer: string;
}

/**
 * Pain points as a chat (§4.3 #6): rows join a queue as they scroll into view and play one after another — the
 * owner's complaint pops in, a typing indicator follows, then RentWeb's coral answer. All text is server-rendered
 * and visible without JS / under reduced motion (start states live in platform.css under no-preference + scripting).
 */
export function ChatBubbles({ pairs, brand = "RentWeb" }: { pairs: ChatPair[]; brand?: string }) {
  const ref = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-chat-row]"));
    const show = (el: Element | null, v = "true") => {
      if (el) (el as HTMLElement).dataset.shown = v;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rows.forEach((r) => r.querySelectorAll("[data-bubble]").forEach((b) => show(b)));
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let busyUntil = 0;
    const play = (row: HTMLElement) => {
      const start = Math.max(performance.now(), busyUntil);
      const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, start - performance.now() + ms));
      at(0, () => show(row.querySelector("[data-bubble='pain']")));
      at(380, () => show(row.querySelector("[data-typing]")));
      at(1250, () => {
        show(row.querySelector("[data-typing]"), "false");
        show(row.querySelector("[data-bubble='answer']"));
      });
      busyUntil = start + 1500;
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => rows.indexOf(a.target as HTMLElement) - rows.indexOf(b.target as HTMLElement))
          .forEach((e) => {
            io.unobserve(e.target);
            play(e.target as HTMLElement);
          });
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.35 },
    );
    rows.forEach((r) => io.observe(r));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <ol ref={ref} className="pf-chat grid gap-9 md:gap-12" aria-label="ปัญหาที่เจ้าของร้านเจอ และทางแก้">
      {pairs.map((p, i) => (
        <li key={i} data-chat-row="" className="grid gap-3">
          <div data-bubble="pain" className="pf-bubble flex items-end gap-3" style={{ ["--origin" as string]: "0% 100%" }}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border" aria-hidden="true">
              <UserRound className="size-4.5" />
            </span>
            <p className="max-w-[30rem] rounded-[1.6rem] rounded-bl-md bg-card px-5 py-3.5 text-step-1 leading-[1.6] shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)] ring-1 ring-border">
              <span className="sr-only">เจ้าของร้าน: </span>
              {p.pain}
            </p>
          </div>
          <div className="relative flex justify-end">
            <span data-typing="" className="pf-typing absolute bottom-1 right-14 inline-flex items-center gap-1 rounded-full bg-primary/15 px-4 py-3 text-primary" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <div data-bubble="answer" className="pf-bubble flex items-end gap-3" style={{ ["--origin" as string]: "100% 100%" }}>
              <p className="max-w-[30rem] rounded-[1.6rem] rounded-br-md bg-primary px-5 py-3.5 text-step-1 font-medium leading-[1.6] text-primary-foreground shadow-[0_24px_60px_-28px_rgb(255_107_61/0.7)]">
                <span className="sr-only">{brand}: </span>
                {p.answer}
              </p>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                <span className="pf-dot !bg-primary-foreground !shadow-none" />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
