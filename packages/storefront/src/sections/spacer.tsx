import * as React from "react";
import type { z } from "zod";
import type { StorefrontCtx } from "../ctx";
import type { spacer } from "../definitions";

type Props = z.output<typeof spacer.schema>;
const SIZES = { sm: "h-6", md: "h-12", lg: "h-24", xl: "h-40" };

export function Spacer({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  return (
    <div className={`container-x ${SIZES[p.size]} flex items-center`} aria-hidden>
      {p.divider && <div className="h-px w-full bg-border" />}
    </div>
  );
}
