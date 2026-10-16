"use client";

import { Printer } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden /> พิมพ์
    </Button>
  );
}
