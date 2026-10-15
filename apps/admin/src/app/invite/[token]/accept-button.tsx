"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { useAction } from "@/components/ui/form";
import { acceptInvitation } from "../actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const [run, pending] = useAction(acceptInvitation, { success: "" });
  return (
    <Button type="button" size="lg" onClick={() => void run(token)} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} ยอมรับคำเชิญ
    </Button>
  );
}
