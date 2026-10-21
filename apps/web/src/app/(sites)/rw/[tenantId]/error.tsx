"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@rentweb/ui/components/button";
import { RollText } from "@rentweb/ui/motion/roll-text";

/**
 * Route error state (§6.3): calm, on-brand, never a raw stack trace. "ลองใหม่" re-renders the segment (`reset()`),
 * "กลับหน้าแรก" goes home. Logged to the console for diagnostics (digest only in production).
 */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.warn("[storefront] route error", error.digest ?? error.message);
  }, [error]);
  return (
    <section className="rw-state relative isolate flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 pt-28 pb-20 text-center" data-rw-state="error">
      <div className="rw-state-glow" aria-hidden />
      <div className="rw-error-mark" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <span className="mono-label mt-8 text-muted-foreground" data-script="latin" aria-hidden>
        Something went wrong{error.digest ? ` · ${error.digest}` : ""}
      </span>
      <h1 className="font-heading mt-5 text-step-4 font-semibold text-balance">เกิดข้อผิดพลาด</h1>
      <p className="mt-3 max-w-md text-pretty text-muted-foreground">ระบบขัดข้องชั่วคราว ลองโหลดใหม่อีกครั้ง หากยังไม่ได้ กลับไปหน้าแรกก่อนได้เลย</p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => reset()}>
          <RollText>ลองใหม่</RollText>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">
            <RollText>กลับหน้าแรก</RollText>
          </Link>
        </Button>
      </div>
    </section>
  );
}
