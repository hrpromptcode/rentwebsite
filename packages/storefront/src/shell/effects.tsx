"use client";

import * as React from "react";
import { CursorGlow, Scanlines } from "@rentweb/ui/fx";

export function ThemeEffects({ cursorGlow, scanlines }: { cursorGlow: boolean; scanlines: boolean }) {
  return (
    <>
      {cursorGlow && <CursorGlow />}
      {scanlines && <Scanlines />}
    </>
  );
}
