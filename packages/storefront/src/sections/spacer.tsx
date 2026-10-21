import * as React from "react";
import type { z } from "zod";
import type { StorefrontCtx } from "../ctx";
import type { spacer } from "../definitions";
import { SectionStyles } from "./_styles";
import { fxOf } from "./_shared";

type Props = z.output<typeof spacer.schema>;
const SIZES = { sm: "h-6", md: "h-12", lg: "h-24", xl: "h-40" };

/** Space, optionally with a divider that draws itself left → right as it scrolls in. */
export function Spacer({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  return (
    <div className={`container-x ${SIZES[p.size]} flex items-center`} aria-hidden data-fx={fx !== "auto" ? fx : undefined}>
      {p.divider && (
        <>
          <SectionStyles />
          <div className="relative h-px w-full bg-border/60">
            <div className="rw-draw-line absolute inset-0 bg-border" />
          </div>
        </>
      )}
    </div>
  );
}
