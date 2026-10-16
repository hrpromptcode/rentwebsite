"use server";

import { isUuid } from "@rentweb/core";
import { adjustWallet, setWalletFrozen } from "@rentweb/module-topup/admin";
import { fieldErrors, walletAdjustSchema, type FormResult, type WalletAdjustInput } from "@rentweb/module-topup/admin/schemas";
import { assertRole, getTenantCtx, tenantTx } from "@/lib/tenant";
import { actorOf, revalidateTopup } from "../_shared";

const paths = (walletId: string) => ["/topup/wallets", `/topup/wallets/${walletId}`];

/** Manual credit / debit. `requestKey` is generated when the dialog opens, so a double submit writes once. */
export async function adjustWalletAction(slug: string, walletId: string, input: WalletAdjustInput, requestKey: string): Promise<FormResult<{ balance: number; duplicate: boolean }>> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(walletId)) return { ok: false, error: "ไม่พบกระเป๋าเงิน" };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestKey)) return { ok: false, error: "คำขอไม่ถูกต้อง กรุณาเปิดหน้าต่างใหม่" };
  const parsed = walletAdjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล", fieldErrors: fieldErrors(parsed.error) };
  const { type, amount, reason } = parsed.data;
  if (amount === null) return { ok: false, error: "กรุณากรอกจำนวนเงิน", fieldErrors: { amount: "กรุณากรอกจำนวนเงิน" } };
  if (amount > 10_000_000) return { ok: false, error: "ปรับยอดได้ครั้งละไม่เกิน 100,000 บาท", fieldErrors: { amount: "ไม่เกิน 100,000 บาท" } };
  const r = await tenantTx(ctx.tenant.id, (tx) => adjustWallet(tx, ctx.tenant.id, walletId, { type, amount, reason, requestKey }, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.code === "insufficient" ? { amount: r.error } : undefined };
  revalidateTopup(slug, paths(walletId));
  const baht = (n: number) => `฿${(n / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
  return {
    ok: true,
    message: r.value.duplicate ? `รายการนี้บันทึกไปแล้ว · คงเหลือ ${baht(r.value.balance)}` : `${type === "credit" ? "เพิ่ม" : "หัก"} ${baht(amount)} แล้ว · คงเหลือ ${baht(r.value.balance)}`,
    data: r.value,
  };
}

export async function setWalletFrozenAction(slug: string, walletId: string, frozen: boolean): Promise<FormResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "manager");
  if (!isUuid(walletId)) return { ok: false, error: "ไม่พบกระเป๋าเงิน" };
  const r = await tenantTx(ctx.tenant.id, (tx) => setWalletFrozen(tx, ctx.tenant.id, walletId, frozen, actorOf(ctx)));
  if (!r.ok) return { ok: false, error: r.error };
  revalidateTopup(slug, paths(walletId));
  return { ok: true, message: frozen ? "ระงับกระเป๋าเงินแล้ว — ลูกค้าจะใช้จ่าย / เติมเงินไม่ได้จนกว่าจะปลดระงับ" : "ปลดระงับกระเป๋าเงินแล้ว" };
}
