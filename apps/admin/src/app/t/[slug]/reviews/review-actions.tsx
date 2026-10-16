"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquareReply, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import type { FormResult } from "@rentweb/module-commerce/admin/schemas";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteReviewAction, replyReviewAction, setReviewStatusAction } from "./actions";

export function ReviewActions({ slug, review, canWrite, canReply }: { slug: string; review: { id: string; status: string; reply: string }; canWrite: boolean; canReply: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [reply, setReply] = React.useState(review.reply);

  async function run(key: string, fn: () => Promise<FormResult>, after?: () => void) {
    setPending(key);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "ดำเนินการแล้ว");
        after?.();
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {canWrite && review.status !== "approved" && (
        <Button size="sm" onClick={() => run("approve", () => setReviewStatusAction(slug, review.id, "approved"))} disabled={pending !== null}>
          {pending === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} อนุมัติ
        </Button>
      )}
      {canWrite && review.status !== "rejected" && (
        <Button size="sm" variant="outline" onClick={() => run("reject", () => setReviewStatusAction(slug, review.id, "rejected"))} disabled={pending !== null}>
          {pending === "reject" ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />} ปฏิเสธ
        </Button>
      )}
      {canWrite && review.status !== "pending" && (
        <Button size="sm" variant="ghost" onClick={() => run("pending", () => setReviewStatusAction(slug, review.id, "pending"))} disabled={pending !== null}>
          <RotateCcw aria-hidden /> รอตรวจ
        </Button>
      )}
      {canReply && (
        <Button size="sm" variant="ghost" onClick={() => setReplyOpen(true)} disabled={pending !== null}>
          <MessageSquareReply aria-hidden /> {review.reply ? "แก้คำตอบ" : "ตอบกลับ"}
        </Button>
      )}
      {canWrite && (
        <ConfirmButton size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="ลบรีวิวนี้ถาวร?" description="โดยปกติแนะนำให้ “ปฏิเสธ” แทน เพื่อเก็บประวัติไว้" confirmLabel="ลบรีวิว" action={() => deleteReviewAction(slug, review.id)}>
          <Trash2 aria-hidden /> ลบ
        </ConfirmButton>
      )}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตอบกลับรีวิว</DialogTitle>
            <DialogDescription>คำตอบจะแสดงใต้รีวิวบนหน้าสินค้า (เมื่อรีวิวได้รับอนุมัติ)</DialogDescription>
          </DialogHeader>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="ขอบคุณสำหรับรีวิวค่ะ…" className="min-h-28" maxLength={1000} autoFocus aria-label="ข้อความตอบกลับ" />
          <DialogFooter>
            {review.reply && (
              <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => run("reply", () => replyReviewAction(slug, review.id, ""), () => setReplyOpen(false))} disabled={pending !== null}>
                ลบคำตอบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setReplyOpen(false)} disabled={pending !== null}>
              ยกเลิก
            </Button>
            <Button onClick={() => run("reply", () => replyReviewAction(slug, review.id, reply), () => setReplyOpen(false))} disabled={pending !== null || !reply.trim()}>
              {pending === "reply" && <Loader2 className="animate-spin" aria-hidden />} บันทึกคำตอบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
