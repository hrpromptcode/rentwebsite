"use client";

import * as React from "react";
import { UserRound } from "lucide-react";
import { PromptCodeMark } from "./ui";

export interface ChatPair {
  pain: string;
  answer: string;
}

/**
 * Pain points as a chat (§4.3 #6): rows join a queue as they scroll into view and play one after another — the
 * owner's complaint pops in, a typing indicator follows, then RentWeb's ocean-gradient answer. All text is server-rendered
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
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#ffe0ea] text-[#d11a63] ring-2 ring-white" aria-hidden="true">
              <UserRound className="size-4.5" />
            </span>
            <p className="pf-bubble-pain max-w-[30rem] rounded-[1.6rem] rounded-bl-md px-5 py-3.5 text-step-1 leading-[1.6]">
              <span className="sr-only">เจ้าของร้าน: </span>
              {p.pain}
            </p>
          </div>
          <div className="relative flex justify-end">
            <span data-typing="" className="pf-typing absolute bottom-1 right-14 inline-flex items-center gap-1.5 rounded-full px-4 py-3" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <div data-bubble="answer" className="pf-bubble flex items-end gap-3" style={{ ["--origin" as string]: "100% 100%" }}>
              <p className="pf-bubble-answer max-w-[30rem] rounded-[1.6rem] rounded-br-md px-5 py-3.5 text-step-1 font-medium leading-[1.6]">
                <span className="sr-only">{brand}: </span>
                {p.answer}
              </p>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-[0_10px_24px_-12px_rgb(21_97_183/0.6)] ring-1 ring-border" aria-hidden="true">
                <PromptCodeMark className="h-5" />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
