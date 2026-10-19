"use server";

import { redirect } from "next/navigation";
import { isUuid } from "@rentweb/core";
import { createGame, deleteGame, deletePackage, importStockCodes, setGameActive, setPackageActive, stockImportMessage, updateGame, upsertPackage, voidStockCode, type StockImportResult } from "@rentweb/module-topup/admin";
import { fieldErrors, gameSchema, packageSchema, stockImportSchema, type FormResult, type GameInput, type PackageInput } from "@rentweb/module-topup/admin/schemas";
import { safeFieldPattern } from "@rentweb/module-topup/services";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf, revalidateTopup, storeImage } from "../_shared";

const NOT_FOUND = { ok: false as const, error: "ไม่พบข้อมูล" };

function gamePaths(gameId?: string | null) {
  return ["/topup/games", ...(gameId ? [`/topup/games/${gameId}`] : [])];
}

export async function saveGameAction(slug: string, gameId: string | null, input: GameInput): Promise<FormResult<{ id: string; slug: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (gameId && !isUuid(gameId)) return NOT_FOUND;
  const parsed = gameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const keys = parsed.data.fields.map((f) => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) return { ok: false, error: `key “${dup}” ซ้ำกัน`, fieldErrors: { [`fields.${keys.lastIndexOf(dup)}.key`]: "key ซ้ำกับช่องอื่น" } };
  // STOREFRONT-12 rules: the storefront ignores unsafe patterns silently – tell the shop now instead
  const badPattern = parsed.data.fields.findIndex((f) => !!f.pattern && safeFieldPattern(f.pattern) === null);
  if (badPattern >= 0) return { ok: false, error: "รูปแบบ (regex) ไม่ถูกต้อง หรือซับซ้อนเกินไป", fieldErrors: { [`fields.${badPattern}.pattern`]: "รูปแบบไม่ถูกต้อง / ซับซ้อนเกินไป" } };
  const badLen = parsed.data.fields.findIndex((f) => f.minLength !== undefined && f.maxLength !== undefined && f.minLength > f.maxLength);
  if (badLen >= 0) return { ok: false, error: "ความยาวสั้นสุดมากกว่ายาวสุด", fieldErrors: { [`fields.${badLen}.minLength`]: "ต้องไม่เกินยาวสุด" } };
  const bad = parsed.data.fields.findIndex((f) => f.type === "select" && !(f.options?.length ?? 0));
  if (bad >= 0) return { ok: false, error: "ช่องแบบตัวเลือกต้องมีอย่างน้อย 1 ตัวเลือก", fieldErrors: { [`fields.${bad}.options`]: "ใส่ตัวเลือกอย่างน้อย 1 รายการ" } };
  const r = await tenantTx(ctx.tenant.id, (tx) => (gameId ? updateGame(tx, ctx.tenant.id, gameId, parsed.data, actorOf(ctx)) : createGame(tx, ctx.tenant.id, parsed.data, actorOf(ctx))));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.code === "slug" ? { slug: r.error } : undefined };
  revalidateTopup(slug, gamePaths(r.value.id));
  return { ok: true, message: gameId ? "บันทึกเกมแล้ว" : `เพิ่มเกม “${r.value.name}” แล้ว — เพิ่มแพ็กเกจต่อได้เลย`, data: { id: r.value.id, slug: r.value.slug } };
}

export async function setGameActiveAction(slug: string, gameId: string, active: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(gameId)) return NOT_FOUND;
  const okDone = await tenantTx(ctx.tenant.id, (tx) => setGameActive(tx, ctx.tenant.id, gameId, active));
  if (!okDone) return NOT_FOUND;
  revalidateTopup(slug, gamePaths(gameId));
  return { ok: true, message: active ? "เปิดขายเกมแล้ว" : "ปิดการแสดงเกมบนหน้าร้านแล้ว" };
}

export async function deleteGameAction(slug: string, gameId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(gameId)) return NOT_FOUND;
  const r = await tenantTx(ctx.tenant.id, (tx) => deleteGame(tx, ctx.tenant.id, gameId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, gamePaths());
  redirect(`/t/${slug}/topup/games`);
}

export async function uploadGameImageAction(slug: string, fd: FormData): Promise<FormResult<{ url: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  return storeImage(ctx.tenant.id, "games", fd.get("file"));
}

export async function savePackageAction(slug: string, gameId: string, input: PackageInput): Promise<FormResult<{ id: string }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(gameId)) return NOT_FOUND;
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.costPrice !== null && v.price !== null && v.costPrice > v.price) {
    return { ok: false, error: "ต้นทุนสูงกว่าราคาขาย — ตรวจสอบตัวเลขอีกครั้ง", fieldErrors: { costPrice: "ต้นทุนสูงกว่าราคาขาย" } };
  }
  const r = await tenantTx(ctx.tenant.id, (tx) => upsertPackage(tx, ctx.tenant.id, gameId, v, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.code === "supplier" ? { supplierId: r.error } : undefined };
  revalidateTopup(slug, gamePaths(gameId));
  return { ok: true, message: v.id ? `บันทึกแพ็กเกจ “${r.value.name}” แล้ว` : `เพิ่มแพ็กเกจ “${r.value.name}” แล้ว`, data: { id: r.value.id } };
}

export async function setPackageActiveAction(slug: string, gameId: string, packageId: string, active: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(packageId)) return NOT_FOUND;
  const done = await tenantTx(ctx.tenant.id, (tx) => setPackageActive(tx, ctx.tenant.id, packageId, active));
  if (!done) return NOT_FOUND;
  revalidateTopup(slug, gamePaths(gameId));
  return { ok: true, message: active ? "เปิดขายแพ็กเกจแล้ว" : "ปิดขายแพ็กเกจแล้ว" };
}

export async function deletePackageAction(slug: string, gameId: string, packageId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(packageId)) return NOT_FOUND;
  const r = await tenantTx(ctx.tenant.id, (tx) => deletePackage(tx, ctx.tenant.id, packageId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, gamePaths(gameId));
  return { ok: true, message: "ลบแพ็กเกจแล้ว" };
}

export async function importStockAction(slug: string, gameId: string, packageId: string, input: { codes: string; expiresAt?: string }): Promise<FormResult<StockImportResult>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(packageId)) return NOT_FOUND;
  const parsed = stockImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาวางโค้ด", fieldErrors: fieldErrors(parsed.error) };
  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.expiresAt)) return { ok: false, error: "วันหมดอายุไม่ถูกต้อง", fieldErrors: { expiresAt: "วันหมดอายุไม่ถูกต้อง" } };
    expiresAt = new Date(`${parsed.data.expiresAt}T23:59:59+07:00`);
    if (expiresAt.getTime() <= Date.now()) return { ok: false, error: "วันหมดอายุต้องเป็นวันในอนาคต", fieldErrors: { expiresAt: "ต้องเป็นวันในอนาคต" } };
  }
  const r = await tenantTx(ctx.tenant.id, (tx) => importStockCodes(tx, ctx.tenant.id, packageId, parsed.data.codes, { expiresAt, actor: actorOf(ctx) }));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, gamePaths(gameId));
  return { ok: true, message: stockImportMessage(r.value), data: r.value };
}

export async function voidStockAction(slug: string, gameId: string, codeId: string): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(codeId)) return NOT_FOUND;
  const r = await tenantTx(ctx.tenant.id, (tx) => voidStockCode(tx, ctx.tenant.id, codeId, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, gamePaths(gameId));
  return { ok: true, message: "ยกเลิกโค้ดแล้ว จะไม่ถูกนำไปขาย" };
}
