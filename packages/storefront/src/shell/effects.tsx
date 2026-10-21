"use client";

import * as React from "react";
import { CursorGlow } from "@rentweb/ui/fx/cursor-glow";
import { Scanlines } from "@rentweb/ui/fx/scanlines";

/**
 * Legacy theme effects. `CursorGlow` is turned off automatically when the hi-end custom cursor is on
 * (`effects.cursor !== "off"`) so there is never a double cursor (§6.3).
 */
export function ThemeEffects({ cursorGlow, scanlines, cursor = "off" }: { cursorGlow: boolean; scanlines: boolean; cursor?: "off" | "dot" | "label" }) {
  return (
    <>
      {cursorGlow && cursor === "off" && <CursorGlow />}
      {scanlines && <Scanlines />}
    </>
  );
}
