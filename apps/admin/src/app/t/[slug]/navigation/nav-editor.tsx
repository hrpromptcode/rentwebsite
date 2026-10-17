"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, CornerDownRight, ExternalLink, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rentweb/ui/components/tabs";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { NavItem } from "@rentweb/db";
import { checkNavHref } from "@/lib/nav-href";
import { saveNavigation } from "../pages/actions";

type Link = { label: string; href: string };

/** ADMIN_B2-18: same rule as the server (no javascript:/data: links); shown while typing. */
function NavHrefError({ href }: { href: string }) {
  const r = checkNavHref(href);
  if (r.ok) return null;
  return (
    <p className="mt-2 pl-10 text-xs text-destructive">
      {r.error}
    </p>
  );
}

export function NavEditor({ slug, initialHeader, initialFooter, pageLinks, canEdit, storefrontUrl }: { slug: string; initialHeader: NavItem[]; initialFooter: NavItem[]; pageLinks: Link[]; canEdit: boolean; storefrontUrl: string }) {
  const [header, setHeader] = React.useState<NavItem[]>(initialHeader);
  const [footer, setFooter] = React.useState<NavItem[]>(initialFooter);
  const [saved, setSaved] = React.useState({ header: initialHeader, footer: initialFooter });
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify({ header, footer }) !== JSON.stringify(saved);

  async function save() {
    setPending(true);
    try {
      const r = await saveNavigation(slug, { header, footer });
      if (!r.ok) return toast.error(r.error);
      setSaved({ header, footer });
      toast.success(r.message ?? "บันทึกแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="header" className="card gap-0 py-0">
        <div className="border-b px-3 pt-3">
          <TabsList className="h-11">
            <TabsTrigger value="header">
              ส่วนหัว <span className="text-muted-foreground">({header.length})</span>
            </TabsTrigger>
            <TabsTrigger value="footer">
              ส่วนท้าย <span className="text-muted-foreground">({footer.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="header" className="p-4 sm:p-5">
          <NavList items={header} onChange={setHeader} pageLinks={pageLinks} canEdit={canEdit} allowChildren />
        </TabsContent>
        <TabsContent value="footer" className="p-4 sm:p-5">
          <NavList items={footer} onChange={setFooter} pageLinks={pageLinks} canEdit={canEdit} allowChildren />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "บันทึกล่าสุดแล้ว"} ·{" "}
          <a href={storefrontUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            ดูบนหน้าร้าน <ExternalLink className="size-3" aria-hidden />
          </a>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => (setHeader(saved.header), setFooter(saved.footer))} disabled={!dirty || pending}>
            <Undo2 aria-hidden /> ยกเลิก
          </Button>
          <Button type="button" onClick={save} disabled={!dirty || pending || !canEdit}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
          </Button>
        </div>
      </div>
    </div>
  );
}

function NavList({ items, onChange, pageLinks, canEdit, allowChildren, depth = 0 }: { items: NavItem[]; onChange: (v: NavItem[]) => void; pageLinks: Link[]; canEdit: boolean; allowChildren?: boolean; depth?: number }) {
  const update = (i: number, patch: Partial<NavItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i));
  const add = () => onChange([...items, { label: "", href: "/" }]);

  return (
    <div className="grid gap-3">
      {items.length === 0 && <p className={cn("rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground", depth ? "py-3" : "py-6")}>{depth ? "ยังไม่มีเมนูย่อย" : "ยังไม่มีเมนู — หน้าร้านจะแสดงหน้าที่เผยแพร่แล้วโดยอัตโนมัติ"}</p>}
      {items.map((item, i) => (
        <div key={i} className={cn("rounded-xl border p-3", depth && "bg-muted/30")}>
          <div className="flex items-start gap-2">
            {depth > 0 && <CornerDownRight className="mt-3 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <div className="flex shrink-0 flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || !canEdit} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="เลื่อนขึ้น">
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1 || !canEdit} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="เลื่อนลง">
                <ChevronDown className="size-4" aria-hidden />
              </button>
            </div>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_1.4fr]">
              <Input value={item.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="ชื่อเมนู" aria-label="ชื่อเมนู" disabled={!canEdit} />
              <div className="flex gap-2">
                <Input value={item.href} onChange={(e) => update(i, { href: e.target.value, external: /^https?:\/\//.test(e.target.value) || undefined })} placeholder="/products หรือ https://…" aria-label="ลิงก์" aria-invalid={!checkNavHref(item.href).ok || undefined} disabled={!canEdit} className="min-w-0 flex-1 font-mono text-xs" />
                <Select value="__pick" onValueChange={(v) => v !== "__pick" && update(i, { href: v, label: item.label || (pageLinks.find((p) => p.href === v)?.label ?? ""), external: undefined })} disabled={!canEdit}>
                  <SelectTrigger className="w-11 shrink-0 px-0 [&>svg:last-child]:hidden" aria-label="เลือกจากหน้าที่มี">
                    <Plus className="mx-auto size-4" aria-hidden />
                    <SelectValue className="sr-only" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="__pick" className="hidden">
                      เลือกหน้า
                    </SelectItem>
                    {pageLinks.map((p) => (
                      <SelectItem key={p.href} value={p.href}>
                        {p.label} <span className="ml-1 text-xs text-muted-foreground">{p.href}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(i)} disabled={!canEdit} aria-label="ลบเมนู">
              <Trash2 aria-hidden />
            </Button>
          </div>
          <NavHrefError href={item.href} />
          {allowChildren && depth === 0 && (
            <div className="mt-3 pl-10">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">เมนูย่อย ({item.children?.length ?? 0})</p>
                <Button type="button" variant="ghost" size="xs" onClick={() => update(i, { children: [...(item.children ?? []), { label: "", href: "/" }] })} disabled={!canEdit}>
                  <Plus aria-hidden /> เพิ่มเมนูย่อย
                </Button>
              </div>
              {(item.children?.length ?? 0) > 0 && <NavList items={item.children ?? []} onChange={(children) => update(i, { children: children.length ? children : undefined })} pageLinks={pageLinks} canEdit={canEdit} depth={1} />}
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant={depth ? "ghost" : "outline"} size={depth ? "sm" : "default"} onClick={add} disabled={!canEdit} className="justify-self-start">
        <Plus aria-hidden /> {depth ? "เพิ่มเมนูย่อย" : "เพิ่มเมนู"}
      </Button>
    </div>
  );
}
