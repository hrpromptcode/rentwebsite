import type { NextRequest } from "next/server";
import { MOCK_USERS, mockEnabled, notFound, seal } from "../../../_mock";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * GET /api/dev/line-mock/oauth2/v2.1/authorize — the "LINE consent screen". Without ?user it renders a picker;
 * with ?user=<id> it issues a code and redirects back to redirect_uri; with ?deny=1 it behaves like "cancel".
 */
export function GET(req: NextRequest) {
  if (!mockEnabled()) return notFound();
  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id") ?? "";
  const redirectUri = sp.get("redirect_uri") ?? "";
  const state = sp.get("state") ?? "";
  const scope = sp.get("scope") ?? "";
  const nonce = sp.get("nonce") ?? "";
  const challenge = sp.get("code_challenge") ?? "";
  const method = sp.get("code_challenge_method") ?? "";

  const problems: string[] = [];
  if (sp.get("response_type") !== "code") problems.push("response_type ต้องเป็น code");
  if (!clientId) problems.push("ไม่มี client_id");
  if (!/^https?:\/\//.test(redirectUri)) problems.push("redirect_uri ไม่ถูกต้อง");
  if (!state) problems.push("ไม่มี state");
  if (!challenge || method !== "S256") problems.push("ต้องส่ง code_challenge (S256)");
  if (!scope.split(" ").includes("profile")) problems.push("scope ต้องมี profile");
  if (problems.length) return new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><title>LINE mock</title><body style="font-family:system-ui;padding:24px"><h1>คำขอไม่ถูกต้อง</h1><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></body></html>`, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });

  const back = new URL(redirectUri);
  if (sp.get("deny") === "1") {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "The resource owner denied the request.");
    back.searchParams.set("state", state);
    return Response.redirect(back.toString(), 302);
  }
  const user = sp.get("user");
  if (user) {
    if (!MOCK_USERS.some((u) => u.userId === user)) return new Response("unknown mock user", { status: 400 });
    const code = seal({ u: user, c: clientId, r: redirectUri, ch: challenge, n: nonce, s: scope }, 300);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    return Response.redirect(back.toString(), 302);
  }

  const self = new URL(req.url);
  const pick = (userId: string) => {
    const u = new URL(self);
    u.searchParams.set("user", userId);
    return u.pathname + u.search;
  };
  const deny = (() => {
    const u = new URL(self);
    u.searchParams.set("deny", "1");
    return u.pathname + u.search;
  })();
  const initials = (n: string) => Array.from(n.trim()).slice(0, 1).join("");
  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LINE Login (โหมดจำลอง)</title>
<style>
  :root{color-scheme:light}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif;background:#f3f4f6;color:#111827}
  .top{background:#06C755;color:#fff;padding:20px 16px}
  .top h1{margin:0;font-size:20px;display:flex;gap:10px;align-items:center}
  .top p{margin:6px 0 0;font-size:13px;opacity:.9}
  main{max-width:440px;margin:0 auto;padding:20px 16px 40px}
  .card{background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:16px}
  h2{font-size:16px;margin:0 0 4px}
  .sub{font-size:13px;color:#6b7280;margin:0 0 14px}
  a.user{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;text-decoration:none;color:inherit;margin-bottom:10px}
  a.user:hover,a.user:focus-visible{border-color:#06C755;outline:none;box-shadow:0 0 0 3px rgba(6,199,85,.25)}
  .av{width:40px;height:40px;border-radius:50%;background:#06C755;color:#fff;display:grid;place-items:center;font-weight:600}
  .name{font-weight:600}
  .note{font-size:12px;color:#6b7280}
  .deny{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;color:#6b7280;text-decoration:underline;margin-top:6px}
  code{font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:6px;word-break:break-all}
</style></head>
<body>
<header class="top"><h1><svg width="28" height="28" viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M24 6C12.95 6 4 13.27 4 22.24c0 8.05 7.14 14.79 16.78 16.06.65.14 1.54.43 1.77.99.2.5.13 1.3.06 1.8l-.28 1.72c-.09.5-.4 1.98 1.73 1.08 2.14-.9 11.52-6.78 15.72-11.61C42.68 28.9 44 25.73 44 22.24 44 13.27 35.05 6 24 6Z"/></svg> LINE Login <span style="font-weight:400;font-size:14px">(โหมดจำลองสำหรับนักพัฒนา)</span></h1><p>แอป channel <code style="background:rgba(255,255,255,.2);color:#fff">${esc(clientId)}</code> ขอเข้าถึง: ${esc(scope)}</p></header>
<main>
  <section class="card" aria-labelledby="t">
    <h2 id="t">เลือกบัญชี LINE จำลองเพื่อเข้าสู่ระบบ</h2>
    <p class="sub">จะส่งกลับไปที่ <code>${esc(redirectUri)}</code></p>
    ${MOCK_USERS.map((u) => `<a class="user" href="${esc(pick(u.userId))}" data-testid="line-mock-user" data-user="${esc(u.userId)}"><span class="av" aria-hidden="true">${esc(initials(u.displayName))}</span><span><span class="name">${esc(u.displayName)}</span><br><span class="note">${esc(u.note)} · ${esc(u.email)}</span></span></a>`).join("\n    ")}
    <a class="deny" href="${esc(deny)}" data-testid="line-mock-deny">ยกเลิก (จำลองผู้ใช้กดไม่อนุญาต)</a>
  </section>
</main>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
