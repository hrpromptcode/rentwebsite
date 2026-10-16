import { readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { ADMIN, chromium, loginState, here } from "./admin_modules-lib";
const creds = JSON.parse(readFileSync(path.join(here, "admin_modules-creds.json"), "utf8"));
const ids = readFileSync(path.join(here, "admin_modules-actionids.txt"), "utf8").trim().split("\n").map((l) => l.split(" "));
const idOf = (name: string, file: string) => ids.find(([, n, f]) => n === name && (f ?? "").includes(file))?.[0];
const BOGUS = "01a10000-0000-7000-8000-000000000000";
type T = [role: string, slug: string, page: string, action: string, file: string, args: unknown[]];
const tests: T[] = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
async function main() {
  const browser = await chromium.launch();
  const pages: Record<string, any> = {};
  for (const [role, slug, pg, action, file, args] of tests) {
    if (!pages[role]) {
      const st = role === "owner" ? await loginState(browser) : await loginState(browser, creds[role].email, creds[role].password, role);
      const ctx = await browser.newContext({ storageState: st });
      pages[role] = await ctx.newPage();
      await pages[role].goto(`${ADMIN}/t/${slug}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    }
    const id = idOf(action, file);
    if (!id) { console.log(`?? no id for ${action} ${file}`); continue; }
    const a = JSON.stringify(args).replaceAll("$BOGUS", BOGUS);
    const res = await pages[role].evaluate(async ({ url, id, body }: any) => {
      const r = await fetch(url, { method: "POST", headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body });
      return { status: r.status, text: (await r.text()).slice(0, 2000) };
    }, { url: `/t/${slug}${pg}`, id, body: a });
    const t = res.text.replace(/\s+/g, " ");
    const refused = /คุณไม่มีสิทธิ์ดำเนินการนี้/.test(t);
    const m = t.match(/"(?:error|message)":"([^"]{0,80})"/);
    console.log(`${role.padEnd(7)} ${slug.padEnd(15)} ${action.padEnd(28)} -> ${res.status} ${refused ? "REFUSED(no permission)" : "ALLOWED-past-role-check"} ${m ? m[0] : t.slice(0, 160)}`);
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
