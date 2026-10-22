/** qa-c: crop a region of a screenshot (args: in.png out.png x y w h [scale]) */
import fs from "node:fs";
import { chromium } from "@playwright/test";
const [inp, out, x, y, w, h, sc = "1"] = process.argv.slice(2) as string[];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Math.round(+w! * +sc), height: Math.round(+h! * +sc) } });
const data = fs.readFileSync(inp!).toString("base64");
await p.setContent(`<body data-s="${sc}" style="margin:0;overflow:hidden"><div style="width:${+w! * +sc}px;height:${+h! * +sc}px;background:url(data:image/png;base64,${data}) -${+x! * +sc}px -${+y! * +sc}px / auto;"></div></body>`);
await p.evaluate(async () => { const i = new Image(); i.src = getComputedStyle(document.querySelector("div")!).backgroundImage.slice(5, -2); await i.decode(); document.querySelector("div")!.style.backgroundSize = `${i.width * Number(document.body.dataset.s || 1)}px auto`; });
await p.screenshot({ path: out! });
await b.close();
