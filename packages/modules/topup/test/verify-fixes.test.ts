import * as React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopupFeedClient, type FeedRow } from "../src/components/topup-feed-client";

/**
 * Regressions found by the final top-up verification (tooling/qa/bughunt/fixes/topup_verify.md).
 */
describe("VF-01 live feed: relative times hydrate identically", () => {
  afterEach(() => vi.useRealTimers());

  const rendered = new Date("2026-10-19T00:00:00.000Z");
  const rows: FeedRow[] = [
    { id: "a", gameName: "RoV (Arena of Valor)", packageName: "40 คูปอง", gameImage: null, player: "1234****", status: "fulfilled", at: new Date(rendered.getTime() - 6 * 60_000 - 30_000).toISOString() },
  ];

  it("the first render uses the server's renderedAt, not the clock at hydration time", () => {
    // hydration runs a minute after the server rendered the HTML ("6 นาทีที่แล้ว" on the server)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(rendered.getTime() + 61_000));
    const html = renderToString(React.createElement(TopupFeedClient, { initial: rows, limit: 8, renderedAt: rendered.toISOString() }));
    expect(html).toContain("6 นาทีที่แล้ว");
    expect(html).not.toContain("7 นาทีที่แล้ว");
  });

  it("without renderedAt it still renders against the current clock (old callers)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(rendered.getTime() + 61_000));
    const html = renderToString(React.createElement(TopupFeedClient, { initial: rows, limit: 8 }));
    expect(html).toContain("7 นาทีที่แล้ว");
  });
});
