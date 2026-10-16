"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Eye, EyeOff, Loader2, Star } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { toast } from "@rentweb/ui/components/sonner";
import { thb } from "@rentweb/core/money";
import { ProductStatusBadge } from "@rentweb/module-commerce/admin/ui";
import { cn } from "@rentweb/ui/lib/utils";
import { bulkProductStatusAction, toggleFeaturedAction } from "./actions";

export interface ProductRowVM {
  id: string;
  name: string;
  sku: string | null;
  image: string | null;
  minPrice: number;
  maxPrice: number;
  status: string;
  featured: boolean;
  hasVariants: boolean;
  stock: number | null;
  variantCount: number;
  categoryName: string | null;
  lowStockThreshold: number;
  updatedAt: string;
}

export function ProductsTable({ slug, rows, canWrite }: { slug: string; rows: ProductRowVM[]; canWrite: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = [...selected].filter((id) => rows.some((r) => r.id === id));

  async function bulk(status: "active" | "draft" | "archived") {
    setPending(status);
    try {
      const r = await bulkProductStatusAction(slug, ids, status);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }
  async function feature(id: string, featured: boolean) {
    setPending(`f:${id}`);
    try {
      const r = await toggleFeaturedAction(slug, id, featured);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {canWrite && ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary-soft/40 px-4 py-2.5 text-sm">
          <span className="font-medium">เลือก {ids.length} รายการ</span>
          <Button size="sm" variant="secondary" onClick={() => bulk("active")} disabled={pending !== null}>
            {pending === "active" ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} เผยแพร่
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulk("draft")} disabled={pending !== null}>
            {pending === "draft" ? <Loader2 className="animate-spin" aria-hidden /> : <EyeOff aria-hidden />} ซ่อน
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => bulk("archived")} disabled={pending !== null}>
            {pending === "archived" ? <Loader2 className="animate-spin" aria-hidden /> : <Archive aria-hidden />} เก็บถาวร
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            ยกเลิกการเลือก
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {canWrite && (
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="เลือกทั้งหมด" />
              </TableHead>
            )}
            <TableHead>สินค้า</TableHead>
            <TableHead className="hidden md:table-cell">SKU</TableHead>
            <TableHead className="text-right">ราคา</TableHead>
            <TableHead className="hidden text-right sm:table-cell">สต็อก</TableHead>
            <TableHead className="hidden lg:table-cell">หมวดหมู่</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="w-12 text-center">แนะนำ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const low = p.stock !== null && p.stock <= p.lowStockThreshold;
            return (
              <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                {canWrite && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={(v) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v === true) n.add(p.id);
                          else n.delete(p.id);
                          return n;
                        })
                      }
                      aria-label={`เลือก ${p.name}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/t/${slug}/products/${p.id}`} className="flex items-center gap-3 hover:text-primary">
                    <span className="size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">{p.image ? <img src={p.image} alt="" className="size-full object-cover" loading="lazy" /> : <span className="grid size-full place-items-center text-[10px] text-muted-foreground">ไม่มีรูป</span>}</span>
                    <span className="min-w-0">
                      <span className="block max-w-[16rem] truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.hasVariants ? `${p.variantCount} ตัวเลือก` : p.sku ? <span className="md:hidden">{p.sku}</span> : null}
                        {p.stock !== null && <span className={cn("sm:hidden", low && "text-destructive")}> · คงเหลือ {p.stock}</span>}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{p.sku ?? (p.hasVariants ? "หลาย SKU" : "—")}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{p.minPrice === p.maxPrice ? thb(p.minPrice) : `${thb(p.minPrice)} – ${thb(p.maxPrice)}`}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {p.stock === null ? <span className="text-muted-foreground">ไม่นับ</span> : low ? <Badge variant={p.stock <= 0 ? "destructive" : "warning"}>{p.stock <= 0 ? "หมด" : p.stock}</Badge> : p.stock}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{p.categoryName ?? "—"}</TableCell>
                <TableCell>
                  <ProductStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="icon-sm" onClick={() => feature(p.id, !p.featured)} disabled={!canWrite || pending !== null} aria-label={p.featured ? "เอาออกจากสินค้าแนะนำ" : "ตั้งเป็นสินค้าแนะนำ"} aria-pressed={p.featured}>
                    {pending === `f:${p.id}` ? <Loader2 className="animate-spin" aria-hidden /> : <Star className={cn("size-4", p.featured ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50")} aria-hidden />}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
