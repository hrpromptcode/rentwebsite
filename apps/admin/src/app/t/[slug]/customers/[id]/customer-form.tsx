"use client";

import * as React from "react";
import { Ban, Loader2, Save, ShieldCheck, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { toggleCustomerBlock, updateCustomer } from "../actions";

type Tier = "member" | "vip" | "agent";

export function CustomerForm({ slug, customerId, initial, blocked, canEdit, canBlock, marketingConsent }: { slug: string; customerId: string; initial: { notes: string; tags: string[]; tier: Tier }; blocked: boolean; canEdit: boolean; canBlock: boolean; marketingConsent: boolean }) {
  const [notes, setNotes] = React.useState(initial.notes);
  const [tags, setTags] = React.useState<string[]>(initial.tags);
  const [tier, setTier] = React.useState<Tier>(initial.tier);
  const [tagInput, setTagInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [blocking, setBlocking] = React.useState(false);
  const dirty = notes !== initial.notes || tier !== initial.tier || JSON.stringify(tags) !== JSON.stringify(initial.tags);

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function save() {
    setPending(true);
    try {
      const r = await updateCustomer(slug, customerId, { notes: notes || null, tags, tier });
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message ?? "บันทึกแล้ว");
    } finally {
      setPending(false);
    }
  }

  async function block(next: boolean) {
    setBlocking(true);
    try {
      const r = await toggleCustomerBlock(slug, customerId, next);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message ?? "อัปเดตแล้ว");
    } finally {
      setBlocking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>โน้ตและแท็ก</CardTitle>
        <CardDescription>ข้อมูลภายในสำหรับทีมของคุณ ลูกค้าไม่เห็น</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-1.5">
          <Label>ระดับลูกค้า</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as Tier)} disabled={!canEdit}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">สมาชิกทั่วไป</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="agent">ตัวแทนจำหน่าย</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cust-tag">แท็ก</Label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1">
                {t}
                {canEdit && (
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="grid size-5 place-items-center rounded-full hover:bg-foreground/10" aria-label={`ลบแท็ก ${t}`}>
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </Badge>
            ))}
            {tags.length === 0 && <span className="text-xs text-muted-foreground">ยังไม่มีแท็ก</span>}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Input
                id="cust-tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="เช่น ขาประจำ, ส่งด่วน แล้วกด Enter"
                maxLength={30}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                เพิ่ม
              </Button>
            </div>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cust-notes">โน้ตภายใน</Label>
          <Textarea id="cust-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="เช่น แพ้อาหารทะเล, ชอบให้โทรก่อนส่ง" className="min-h-28" disabled={!canEdit} maxLength={5000} />
        </div>
        <p className="text-xs text-muted-foreground">ความยินยอมรับข่าวสาร: {marketingConsent ? "ยินยอม" : "ไม่ยินยอม"}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canBlock ? (
            <Button type="button" variant={blocked ? "outline" : "ghost"} className={blocked ? "" : "text-destructive hover:text-destructive"} onClick={() => block(!blocked)} disabled={blocking}>
              {blocking ? <Loader2 className="animate-spin" aria-hidden /> : blocked ? <ShieldCheck aria-hidden /> : <Ban aria-hidden />}
              {blocked ? "ปลดบล็อก" : "บล็อกลูกค้า"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={save} disabled={!dirty || pending || !canEdit}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
