import { and, eq, or } from "drizzle-orm";
import { topupBlacklist, type Tx } from "@rentweb/db";
import { normalizeThaiPhone } from "@rentweb/core";

export type BlacklistKind = "phone" | "ip" | "uid" | "email" | "device";

export interface BlacklistCheck {
  kind: BlacklistKind;
  value: string;
}

/** Canonical form so "081-234-5678" and "0812345678" match the same entry. */
export function normalizeBlacklistValue(kind: BlacklistKind, value: string): string {
  const v = value.trim();
  if (kind === "phone") return normalizeThaiPhone(v) ?? v.replace(/[^0-9+]/g, "");
  if (kind === "email") return v.toLowerCase();
  if (kind === "uid") return v.toLowerCase();
  return v;
}

/** Builds the checks for an order: contact phone/email, request IP and every id-like player field. */
export function blacklistChecksFor(input: { contact?: string | null; ip?: string | null; playerFields?: Record<string, string>; deviceId?: string | null }): BlacklistCheck[] {
  const checks: BlacklistCheck[] = [];
  const contact = input.contact?.trim();
  if (contact) {
    if (contact.includes("@")) checks.push({ kind: "email", value: contact });
    else if (normalizeThaiPhone(contact)) checks.push({ kind: "phone", value: contact });
  }
  if (input.ip) checks.push({ kind: "ip", value: input.ip });
  if (input.deviceId) checks.push({ kind: "device", value: input.deviceId });
  for (const v of Object.values(input.playerFields ?? {})) if (v) checks.push({ kind: "uid", value: v });
  return checks.map((c) => ({ kind: c.kind, value: normalizeBlacklistValue(c.kind, c.value) })).filter((c) => c.value.length > 0);
}

/** Returns the first matching blacklist entry, or null when everything is clean. */
export async function findBlacklisted(tx: Tx, tenantId: string, checks: BlacklistCheck[]) {
  if (!checks.length) return null;
  const conds = checks.map((c) => and(eq(topupBlacklist.kind, c.kind), eq(topupBlacklist.value, c.value))!);
  const [hit] = await tx
    .select()
    .from(topupBlacklist)
    .where(and(eq(topupBlacklist.tenantId, tenantId), or(...conds)!))
    .limit(1);
  return hit ?? null;
}

export async function isBlacklisted(tx: Tx, tenantId: string, checks: BlacklistCheck[]): Promise<boolean> {
  return (await findBlacklisted(tx, tenantId, checks)) !== null;
}

/** Idempotent insert. */
export async function addToBlacklist(tx: Tx, tenantId: string, entry: { kind: BlacklistKind; value: string; reason?: string | null; createdBy?: string | null }) {
  const value = normalizeBlacklistValue(entry.kind, entry.value);
  const [row] = await tx
    .insert(topupBlacklist)
    .values({ tenantId, kind: entry.kind, value, reason: entry.reason ?? null, createdBy: entry.createdBy ?? null })
    .onConflictDoNothing({ target: [topupBlacklist.tenantId, topupBlacklist.kind, topupBlacklist.value] })
    .returning();
  return row ?? null;
}

export async function removeFromBlacklist(tx: Tx, tenantId: string, kind: BlacklistKind, value: string) {
  await tx.delete(topupBlacklist).where(and(eq(topupBlacklist.tenantId, tenantId), eq(topupBlacklist.kind, kind), eq(topupBlacklist.value, normalizeBlacklistValue(kind, value))));
}
