import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Flame, ImageOff, ListChecks, Pencil, Plus, Search, Sparkles, Star } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { cn } from "@rentweb/ui/lib/utils";
import { listCategoriesAdmin, listItemsAdmin, listMenusAdmin, STATION_LABEL, TAG_LABEL } from "@rentweb/module-restaurant/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { ItemToggles } from "./item-toggles";
import { CategoryManager, MenuSetsManager, MenuSwitcher } from "./menu-managers";

export const metadata: Metadata = { title: "เมนู" };

const FLAGS: Array<[string, string]> = [
  ["", "ทั้งหมด"],
  ["soldOut", "หมดชั่วคราว"],
  ["hidden", "ซ่อนอยู่"],
  ["featured", "แนะนำ"],
];

export default async function MenuPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const canEdit = hasRole(ctx, "manager");
  const canToggle = hasRole(ctx, "staff");

  const q = (sp.q ?? "").trim();
  const station = sp.station && sp.station in STATION_LABEL ? sp.station : "";
  const flag = (["soldOut", "hidden", "featured"] as const).find((f) => f === sp.flag) ?? null;

  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const menus = await listMenusAdmin(tx, ctx.tenant.id);
    const menu = menus.find((m) => m.id === sp.menu) ?? menus.find((m) => m.active) ?? menus[0] ?? null;
    if (!menu) return { menus, menu: null, categories: [], items: [] as Awaited<ReturnType<typeof listItemsAdmin>> };
    const categories = await listCategoriesAdmin(tx, ctx.tenant.id, menu.id);
    const categoryId = categories.some((c) => c.id === sp.category) ? sp.category! : null;
    const items = await listItemsAdmin(tx, ctx.tenant.id, { menuId: menu.id, categoryId, q, station: station || null, flag });
    return { menus, menu, categories, items, categoryId };
  });

  const base = `/t/${slug}/restaurant/menu`;
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(data.menu ? { menu: data.menu.id } : {}), ...(data.categoryId ? { category: data.categoryId } : {}), ...(q ? { q } : {}), ...(station ? { station } : {}), ...(flag ? { flag } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `${base}?${p}`;
  };
  const totalItems = data.categories.reduce((s, c) => s + c.itemCount, 0);
  const soldOut = data.items.filter((i) => i.soldOut).length;
  const newHref = `${base}/items/new?menu=${data.menu?.id ?? ""}${data.categoryId ? `&category=${data.categoryId}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="เมนู"
        description={data.menu ? `${data.menu.name} · ${data.categories.length} หมวด · ${fmtNumber(totalItems)} รายการ` : "ยังไม่มีชุดเมนู"}
        actions={
          <>
            <MenuSwitcher slug={slug} menus={data.menus} current={data.menu?.id ?? ""} />
            <MenuSetsManager slug={slug} menus={data.menus} canEdit={canEdit} />
            <Button asChild variant="outline">
              <Link href={`${base}/modifiers`}>
                <ListChecks aria-hidden /> กลุ่มตัวเลือก
              </Link>
            </Button>
            {canEdit && data.menu && data.categories.length > 0 && (
              <Button asChild>
                <Link href={newHref}>
                  <Plus aria-hidden /> เพิ่มเมนูอาหาร
                </Link>
              </Button>
            )}
          </>
        }
      />

      {!data.menu ? (
        <EmptyState icon={BookOpen} title="ยังไม่มีชุดเมนู" description="สร้างชุดเมนูแรก (เช่น เมนูหลัก) แล้วเพิ่มหมวดและรายการอาหาร" action={<MenuSetsManager slug={slug} menus={data.menus} canEdit={canEdit} />} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="รายการ" value={fmtNumber(totalItems)} icon={BookOpen} tone="primary" />
            <KpiCard label="หมดชั่วคราว" value={fmtNumber(soldOut)} icon={Flame} tone={soldOut ? "accent" : "default"} />
            <KpiCard label="เมนูแนะนำ" value={fmtNumber(data.items.filter((i) => i.featured).length)} icon={Star} tone="success" />
          </section>

          <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-sm font-semibold">หมวด</h2>
                {canEdit && <CategoryManager slug={slug} menuId={data.menu.id} categories={data.categories} canEdit={canEdit} />}
              </div>
              <nav aria-label="หมวดเมนู" className="-mx-4 flex max-w-[100vw] gap-1 overflow-x-auto px-4 pb-1 xl:mx-0 xl:max-w-none xl:flex-col xl:px-0">
                <Link href={link({ category: "" })} aria-current={!data.categoryId ? "page" : undefined} className={cn("flex h-11 shrink-0 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium", !data.categoryId ? "bg-primary-soft text-primary" : "hover:bg-muted")}>
                  ทั้งหมด <span className="text-xs tabular-nums text-muted-foreground">{totalItems}</span>
                </Link>
                {data.categories.map((c) => (
                  <Link key={c.id} href={link({ category: c.id })} aria-current={data.categoryId === c.id ? "page" : undefined} className={cn("flex h-11 shrink-0 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium", data.categoryId === c.id ? "bg-primary-soft text-primary" : "hover:bg-muted")}>
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.itemCount}</span>
                  </Link>
                ))}
              </nav>
            </aside>

            <div className="min-w-0 space-y-3">
              <form className="flex flex-col gap-2 sm:flex-row" action={base}>
                <input type="hidden" name="menu" value={data.menu.id} />
                {data.categoryId && <input type="hidden" name="category" value={data.categoryId} />}
                {flag && <input type="hidden" name="flag" value={flag} />}
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อเมนู…" className="pl-9" aria-label="ค้นหาเมนู" />
                </div>
                <select name="station" defaultValue={station} className="h-11 rounded-xl border bg-background px-3 text-sm" aria-label="สถานี">
                  <option value="">ทุกสถานี</option>
                  {Object.entries(STATION_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secondary">
                  ค้นหา
                </Button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {FLAGS.map(([k, label]) => (
                  <Button key={k} asChild size="sm" variant={(flag ?? "") === k ? "default" : "outline"}>
                    <Link href={link({ flag: k })}>{label}</Link>
                  </Button>
                ))}
                <span className="ml-auto self-center text-xs text-muted-foreground">{data.items.length} รายการ</span>
              </div>

              {data.items.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title={q || flag || station ? "ไม่พบเมนูตามเงื่อนไข" : data.categories.length === 0 ? "ยังไม่มีหมวด" : "ยังไม่มีเมนูในหมวดนี้"}
                  description={data.categories.length === 0 ? "เพิ่มหมวดก่อน (เช่น จานหลัก, เครื่องดื่ม) แล้วจึงเพิ่มรายการอาหาร" : "เพิ่มรายการอาหารพร้อมรูป ราคา และตัวเลือก"}
                  action={canEdit && data.categories.length > 0 ? <Button asChild><Link href={newHref}><Plus aria-hidden /> เพิ่มเมนูอาหาร</Link></Button> : canEdit ? <CategoryManager slug={slug} menuId={data.menu.id} categories={data.categories} canEdit={canEdit} /> : undefined}
                />
              ) : (
                <>
                  {/* phones: one card per item with the quick toggles in view (RESPONSIVE_B2-03); the table starts at md */}
                  <ul aria-label="รายการเมนู" className="card divide-y md:hidden">
                    {data.items.map((it) => (
                      <li key={it.id} className="p-3">
                        <div className={cn("flex items-start gap-3", !it.available && "opacity-60")}>
                          <Link href={`${base}/items/${it.id}`} className="flex min-w-0 flex-1 items-start gap-3 hover:text-primary">
                            {it.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={assetUrl(it.image)} alt="" className={cn("size-14 shrink-0 rounded-lg object-cover", it.soldOut && "grayscale")} />
                            ) : (
                              <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                                <ImageOff className="size-4" aria-hidden />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span data-item-name className="block font-medium leading-snug [overflow-wrap:anywhere]">
                                {it.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {it.categoryName} · {STATION_LABEL[it.station] ?? it.station}
                                {it.nameEn ? ` · ${it.nameEn}` : ""}
                              </span>
                              {(it.soldOut || it.featured || !it.available) && (
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {it.soldOut && <Badge variant="destructive">หมด</Badge>}
                                  {it.featured && <Badge variant="accent">แนะนำ</Badge>}
                                  {!it.available && <Badge variant="muted">ซ่อน</Badge>}
                                </span>
                              )}
                            </span>
                          </Link>
                          <span data-item-price className="shrink-0 text-right text-sm tabular-nums">
                            <span className="block font-medium">{thb(it.price)}</span>
                            {it.compareAtPrice && <span className="block text-xs text-muted-foreground line-through">{thb(it.compareAtPrice)}</span>}
                          </span>
                        </div>
                        <ItemToggles slug={slug} id={it.id} name={it.name} available={it.available} soldOut={it.soldOut} featured={it.featured} canEdit={canToggle} layout="grid" className="mt-3" />
                      </li>
                    ))}
                  </ul>
                  <div className="card hidden py-0 md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-full">เมนู</TableHead>
                          <TableHead className="hidden xl:table-cell">หมวด / สถานี</TableHead>
                          <TableHead className="text-right">ราคา</TableHead>
                          <TableHead className="w-[10rem]">สถานะ</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((it) => (
                          <TableRow key={it.id} className={cn(!it.available && "opacity-60")}>
                            <TableCell className="max-w-0 whitespace-normal">
                              <Link href={`${base}/items/${it.id}`} className="flex items-start gap-3 hover:text-primary">
                                {it.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={assetUrl(it.image)} alt="" className={cn("size-12 shrink-0 rounded-lg object-cover", it.soldOut && "grayscale")} />
                                ) : (
                                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                                    <ImageOff className="size-4" aria-hidden />
                                  </span>
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-1.5 font-medium [overflow-wrap:anywhere]">
                                    {it.name}
                                    {it.soldOut && <Badge variant="destructive">หมด</Badge>}
                                    {it.featured && <Badge variant="accent">แนะนำ</Badge>}
                                    {!it.available && <Badge variant="muted">ซ่อน</Badge>}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {it.nameEn ? `${it.nameEn} · ` : ""}
                                    {it.spicyLevel > 0 ? `เผ็ด ${it.spicyLevel} · ` : ""}
                                    {it.tags.map((t) => TAG_LABEL[t] ?? t).join(", ")}
                                    {it.modifierGroupNames.length ? ` · ตัวเลือก: ${it.modifierGroupNames.join(", ")}` : ""}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground xl:hidden">
                                    {it.categoryName} · {STATION_LABEL[it.station] ?? it.station}
                                  </span>
                                </span>
                              </Link>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              <span className="block">{it.categoryName}</span>
                              <span className="block text-xs text-muted-foreground">
                                {STATION_LABEL[it.station] ?? it.station}
                                {it.prepMinutes ? ` · ${it.prepMinutes} นาที` : ""}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className="block font-medium">{thb(it.price)}</span>
                              {it.compareAtPrice && <span className="block text-xs text-muted-foreground line-through">{thb(it.compareAtPrice)}</span>}
                            </TableCell>
                            <TableCell>
                              <ItemToggles slug={slug} id={it.id} name={it.name} available={it.available} soldOut={it.soldOut} featured={it.featured} canEdit={canToggle} />
                            </TableCell>
                            <TableCell>
                              <Button asChild variant="ghost" size="icon" aria-label={`แก้ไข ${it.name}`}>
                                <Link href={`${base}/items/${it.id}`}>
                                  <Pencil aria-hidden />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
