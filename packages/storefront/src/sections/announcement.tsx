import * as React from "react";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "../ctx";
import type { announcement } from "../definitions";
import { SmartLink } from "./_shared";

type Props = z.output<typeof announcement.schema>;

export function Announcement({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  return (
    <div className={cn("text-center text-sm", p.tone === "primary" && "bg-primary text-primary-foreground", p.tone === "accent" && "bg-accent text-accent-foreground", p.tone === "muted" && "bg-muted")}>
      <div className="container-x flex items-center justify-center gap-3 py-2.5">
        <span>{p.text}</span>
        {p.cta?.label && (
          <SmartLink href={p.cta.href} className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
            {p.cta.label}
            <ArrowRight className="size-3.5" />
          </SmartLink>
        )}
      </div>
    </div>
  );
}
