"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Switch } from "@rentweb/ui/components/switch";
import { Field, SubmitButton, withToast } from "@/components/ui/form";
import { finalizeSlug, typingSlug } from "@/lib/slug";
import { createPage } from "./actions";

export function NewPageDialog({ slug }: { slug: string }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [pageSlug, setPageSlug] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [nav, setNav] = React.useState(true);
  const action = withToast(createPage.bind(null, slug), { success: "สร้างหน้าแล้ว" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> สร้างหน้าใหม่
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>สร้างหน้าใหม่</DialogTitle>
          <DialogDescription>หน้าจะถูกสร้างเป็นฉบับร่าง เพิ่มเซ็กชันแล้วกดเผยแพร่เมื่อพร้อม</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <Field label="ชื่อหน้า" htmlFor="np-title">
            <Input
              id="np-title"
              name="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!touched) setPageSlug(finalizeSlug(e.target.value, 60));
              }}
              placeholder="เช่น โปรโมชัน, บริการของเรา"
              required
              autoFocus
            />
          </Field>
          <Field label="ที่อยู่หน้า (slug)" htmlFor="np-slug" hint="ใช้ a-z 0-9 และขีดกลาง ถ้าเว้นว่างจะสร้างจากชื่อ">
            <div className="flex items-center overflow-hidden rounded-md border border-input focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
              <span className="border-r bg-muted px-3 text-sm text-muted-foreground">/</span>
              <input
                id="np-slug"
                name="slug"
                value={pageSlug}
                onChange={(e) => {
                  setTouched(true);
                  setPageSlug(typingSlug(e.target.value, 60));
                }}
                onBlur={() => setPageSlug((v) => finalizeSlug(v, 60))}
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                placeholder="promotions"
              />
            </div>
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-2.5">
            <span className="text-sm font-medium">แสดงในเมนูนำทางอัตโนมัติ</span>
            <Switch checked={nav} onCheckedChange={setNav} />
            <input type="hidden" name="showInNav" value={nav ? "on" : "off"} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <SubmitButton pendingText="กำลังสร้าง…">สร้างหน้า</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
