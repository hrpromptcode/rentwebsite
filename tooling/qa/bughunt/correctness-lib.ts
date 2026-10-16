import "../../load-env";
import { eq, getAdminDb, getDb, tenants, withPlatform, withTenant, type Tx } from "@rentweb/db";

export const db = () => getDb();
export async function tenantIdOf(slug: string): Promise<string> {
  const rows = await withPlatform(getAdminDb(), (tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1));
  if (!rows[0]) throw new Error("no tenant " + slug);
  return rows[0].id;
}
export function tt<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(getDb(), tenantId, fn);
}
export function plat<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withPlatform(getAdminDb(), fn);
}
export async function done() {
  await (getDb() as any).$client?.end?.({ timeout: 2 });
  await (getAdminDb() as any).$client?.end?.({ timeout: 2 });
}

import http from "node:http";
/** HTTP request to a tenant host via localhost:3000 with an explicit Host header (Windows can't resolve *.localhost). */
export function hreq(host: string, path: string, opts: { method?: string; headers?: Record<string, string>; body?: Buffer | string; port?: number } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: opts.port ?? 3000, path, method: opts.method ?? "GET", headers: { host, ...(opts.headers ?? {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}
export function multipart(field: string, filename: string, mime: string, data: Buffer) {
  const boundary = "----qa" + Math.random().toString(16).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
