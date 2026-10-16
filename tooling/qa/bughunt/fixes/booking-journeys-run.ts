/**
 * booking packet – runs the unmodified booking journeys with the HMR guard from _dev-stable.ts applied to every
 * browser context (other agents keep the shared dev server reloading). Usage (from tooling/):
 *   npx tsx qa/bughunt/fixes/booking-journeys-run.ts            # storefront: qa/booking-journey.ts
 *   npx tsx qa/bughunt/fixes/booking-journeys-run.ts admin      # admin: qa/booking-admin-journey.ts
 */
import { chromium, type Browser, type BrowserContextOptions } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";

const launch = chromium.launch.bind(chromium);
(chromium as unknown as { launch: typeof chromium.launch }).launch = async (opts?: Parameters<typeof chromium.launch>[0]) => {
  const browser: Browser = await launch(opts);
  const newContext = browser.newContext.bind(browser);
  (browser as unknown as { newContext: (o?: BrowserContextOptions) => ReturnType<Browser["newContext"]> }).newContext = async (o?: BrowserContextOptions) => {
    const ctx = await newContext(o);
    await isolateHmr(ctx);
    return ctx;
  };
  return browser;
};

const which = process.argv[2] ?? "storefront";
await import(which === "admin" ? "../../booking-admin-journey" : "../../booking-journey");
