import type { BrowserContext, Page } from "@playwright/test";
/**
 * Test-harness guard against dev-server HMR churn (web_visual packet): while other agents hit the shared Turbopack dev
 * server it broadcasts `turbopack-message type=restart` / `reloadPage "HMR hash mismatch"` every ~0.5 s, and every
 * connected page reloads in a loop (networkidle never settles, evaluate() loses its context). Dropping only those
 * reload-type frames keeps hydration and the rest of the HMR protocol intact (blocking the socket entirely prevents
 * hydration). Has no effect on the page code under test.
 */
export async function isolateHmr(ctx: BrowserContext) {
  await ctx.routeWebSocket(
    (u) => u.pathname.startsWith("/_next/hmr"),
    (ws) => {
      const server = ws.connectToServer();
      server.onMessage((m) => {
        const s = typeof m === "string" ? m : "";
        if (s.includes('"type":"reloadPage"') || s.includes('"type":"serverComponentChanges"') || (s.includes('"type":"turbopack-message"') && s.includes('"type":"restart"'))) return;
        ws.send(m);
      });
    },
  );
}

/** goto + wait until the page has gone 2 s without a main-frame navigation (absorbs the one reload after connect). */
export async function stableGoto(page: Page, url: string, waitUntil: "load" | "networkidle" = "networkidle") {
  let last = Date.now();
  const onNav = (f: { parentFrame(): unknown }) => {
    if (!f.parentFrame()) last = Date.now();
  };
  page.on("framenavigated", onNav);
  const res = await page.goto(url, { waitUntil, timeout: 120_000 });
  const deadline = Date.now() + 30_000;
  while (Date.now() - last < 2000 && Date.now() < deadline) await page.waitForTimeout(300);
  await page.waitForLoadState(waitUntil, { timeout: 60_000 }).catch(() => {});
  page.off("framenavigated", onNav);
  return res;
}
