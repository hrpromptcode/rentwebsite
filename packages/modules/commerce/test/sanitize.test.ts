import { describe, expect, it } from "vitest";
import { sanitizeHtml, stripHtml } from "../src/lib/sanitize";
import { descriptionToHtml, htmlToDescription } from "../src/admin/schemas";

const TAGS = "p|br|strong|b|em|i|u|s|ul|ol|li|h2|h3|h4|blockquote|a|span|table|thead|tbody|tr|th|td|hr";
const TAG_RE = new RegExp(`^</?(${TAGS})((?: (?:href|title|target|rel|colspan|rowspan)="[^"<>]*")*)/?>$`);

/** Every "<" in the output must open one of the rebuilt allow-listed tags, with allow-listed attributes only. */
function expectOnlyAllowedMarkup(out: string) {
  const tags = out.match(/<[^>]*>?/g) ?? [];
  for (const t of tags) {
    expect(t, `unexpected markup ${t} in ${out}`).toMatch(TAG_RE);
    expect(t).not.toMatch(/javascript:|vbscript:|data:/i);
  }
  // text between the tags is fully escaped (it may still *say* "onerror=", but only as text)
  expect(out.replace(/<[^>]*>/g, "")).not.toMatch(/[<>]/);
}

const PAYLOADS = [
  "<p>ok</p><img src=x onerror=alert(document.domain) x=",
  "<img src=x onerror=alert(1)>",
  "<img src=x onerror=alert(1)",
  "<IMG SRC=x OnError=alert(1)>",
  "<svg/onload=alert(1)>",
  "<svg><script>alert(1)</script></svg><p>after</p>",
  "<svg><animate onbegin=alert(1) attributeName=x dur=1s>",
  "<math><mi xlink:href=javascript:alert(1)>x</mi></math>",
  "<script>alert(1)</script>",
  "<SCRIPT SRC=//evil.example/x.js></SCRIPT>",
  "<scr<script>ipt>alert(1)</script>",
  "<script>alert(1)",
  "<style>body{background:url(javascript:alert(1))}</style><p>x</p>",
  "<iframe src=javascript:alert(1)></iframe>",
  "<iframe srcdoc='<script>alert(1)</script>'>",
  "<object data=javascript:alert(1)>",
  "<embed src=javascript:alert(1)>",
  "<form action=javascript:alert(1)><button>x</button></form>",
  "<textarea><img src=x onerror=alert(1)></textarea>",
  "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>",
  "<template><img src=x onerror=alert(1)></template>",
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="java\nscript:alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href="jav&Tab;ascript:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="&#106avascript:alert(1)">x</a>',
  '<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3A;alert(1)">x</a>',
  '<a href="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058alert(1)">x</a>',
  '<a href="javascript&colon;alert(1)">x</a>',
  '<a href="&#1;javascript:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="https://ok.example" onclick="alert(1)">x</a>',
  "<a href=https://ok.example\"onmouseover=alert(1)>x</a>",
  "<a href='https://ok.example' title='x\" onmouseover=\"alert(1)'>x</a>",
  '<p title="&quot;><script>alert(1)</script>">x</p>',
  '<p class="x" style="background:url(javascript:alert(1))" onmouseover="alert(1)">x</p>',
  '<b title="<img src=x onerror=alert(1)>">x</b>',
  '<x a="</p><img src=x onerror=alert(1)>"',
  "<p\nonclick=alert(1)>x</p>",
  "<p/onclick=alert(1)>x</p>",
  "<<img src=x onerror=alert(1)>>",
  "<!--<img src=x onerror=alert(1)>-->",
  "<!--><img src=x onerror=alert(1)>-->",
  "<!--",
  "<!DOCTYPE html><img src=x onerror=alert(1)>",
  "<![CDATA[<img src=x onerror=alert(1)>]]>",
  "<?xml version=\"1.0\"?><img src=x onerror=alert(1)>",
  "</p><img src=x onerror=alert(1)>",
  "</ img src=x onerror=alert(1)>",
  "<a href=\"https://ok.example\">open link that never closes",
  "&lt;img src=x onerror=alert(1)&gt;",
  "<p>ok</p><a href=\"https://x\" x=",
  "<p>ok</p><a href=\"https://x",
  "<details open ontoggle=alert(1)>",
  "<base href=javascript:/><a href=x>x</a>",
  "<meta http-equiv=refresh content=\"0;url=javascript:alert(1)\">",
  "<link rel=stylesheet href=//evil.example/x.css>",
  "<td background=javascript:alert(1) colspan=\"2&quot; onclick=alert(1)\">c</td>",
];

describe("sanitizeHtml: XSS payloads", () => {
  it("escapes an unterminated trailing tag instead of passing it through (reverify 2026-10-17)", () => {
    const out = sanitizeHtml("<p>ok</p><img src=x onerror=alert(document.domain) x=");
    expect(out).toBe("<p>ok</p>&lt;img src=x onerror=alert(document.domain) x=");
    // the SSR page appends "</div>" right after it: that must not be able to complete the tag
    expect(`<div>${out}</div>`).not.toMatch(/<img/i);
  });

  it.each(PAYLOADS)("leaves only allow-listed markup: %s", (payload) => {
    const out = sanitizeHtml(payload);
    expectOnlyAllowedMarkup(out);
    expect(out).not.toMatch(/<(img|svg|script|style|iframe|object|embed|form|math|meta|link|base|details|textarea|template)/i);
    // the page wraps the description in a div: wrapping must not change any of this
    expectOnlyAllowedMarkup(`<p>${out}</p>`);
  });

  it("drops script/style/iframe/svg blocks with their content", () => {
    expect(sanitizeHtml("a<script>alert(1)</script>b")).toBe("ab");
    expect(sanitizeHtml("a<style>p{color:red}</style>b")).toBe("ab");
    expect(sanitizeHtml("a<iframe src=//x>inner</iframe>b")).toBe("ab");
    expect(sanitizeHtml("a<svg><script>alert(1)</script></svg>b")).toBe("ab");
    expect(sanitizeHtml("a<ScRiPt >x</sCrIpT >b")).toBe("ab");
    expect(sanitizeHtml("a<script>never closed <p>x</p>")).toBe("a");
  });

  it("rejects javascript: hidden behind entities, whitespace and control characters", () => {
    for (const p of PAYLOADS.filter((x) => /^<a href=(?!["']?https)/i.test(x))) expect(sanitizeHtml(p)).toBe("<a>x</a>");
  });

  it("keeps attribute values inside their quotes (no breakout)", () => {
    expect(sanitizeHtml("<a href=https://ok.example\"onmouseover=alert(1)>x</a>")).toBe(
      '<a href="https://ok.example&quot;onmouseover=alert(1)" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
    expect(sanitizeHtml("<a href='/p' title='x\" onmouseover=\"alert(1)'>x</a>")).toBe('<a href="/p" title="x&quot; onmouseover=&quot;alert(1)">x</a>');
    expect(sanitizeHtml('<p title="&quot;><script>alert(1)</script>">x</p>')).toBe("<p>x</p>");
    expect(sanitizeHtml('<td colspan="2&quot; onclick=alert(1)">c</td>')).toBe("<td>c</td>");
  });

  it("escapes text: < > & and quotes, keeping well-formed character references", () => {
    expect(sanitizeHtml(`<p>5 < 6 > 4 & "q" 'a'</p>`)).toBe("<p>5 &lt; 6 &gt; 4 &amp; &quot;q&quot; &#39;a&#39;</p>");
    expect(sanitizeHtml("<p>A &amp; B &hellip; &#8230; &#x2026; &bogus</p>")).toBe("<p>A &amp; B &hellip; &#8230; &#x2026; &amp;bogus</p>");
    expect(sanitizeHtml("&lt;img src=x onerror=alert(1)&gt;")).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("closes everything it opens and drops stray end tags", () => {
    expect(sanitizeHtml('<a href="https://x.example">never closed')).toBe(
      '<a href="https://x.example" target="_blank" rel="noopener noreferrer nofollow">never closed</a>',
    );
    expect(sanitizeHtml("</div></p><strong>b<em>i</strong>")).toBe("<strong>b<em>i</em></strong>");
    expect(sanitizeHtml("<p>a<p>b<ul><li>x<li>y</ul>")).toBe("<p>a</p><p>b</p><ul><li>x</li><li>y</li></ul>");
  });

  it("is idempotent", () => {
    for (const p of [...PAYLOADS, '<p>A "q" &amp; <a href="/x?a=1&amp;b=2">l</a></p>']) {
      const once = sanitizeHtml(p);
      expect(sanitizeHtml(once)).toBe(once);
    }
  });
});

describe("sanitizeHtml: normal formatting survives", () => {
  it("keeps p, br, strong, em, ul/li, headings, blockquote, tables", () => {
    const html =
      "<h2>Title</h2><p>Line 1<br>Line 2<br /></p><p><strong>bold</strong> <b>b</b> <em>em</em> <i>i</i> <u>u</u> <s>s</s></p>" +
      "<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><blockquote>q</blockquote><hr>" +
      '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td colspan="2">c</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(
      "<h2>Title</h2><p>Line 1<br/>Line 2<br/></p><p><strong>bold</strong> <b>b</b> <em>em</em> <i>i</i> <u>u</u> <s>s</s></p>" +
        "<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><blockquote>q</blockquote><hr/>" +
        '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td colspan="2">c</td></tr></tbody></table>',
    );
  });

  it("strips presentational attributes but keeps the text", () => {
    expect(sanitizeHtml('<p class="lead" style="color:red" id="x">สินค้าคุณภาพ</p>')).toBe("<p>สินค้าคุณภาพ</p>");
    expect(sanitizeHtml('<div><span style="x">a</span></div>')).toBe("<span>a</span>");
  });

  it("keeps safe links; external and target=_blank links get rel=noopener noreferrer", () => {
    expect(sanitizeHtml('<a href="https://shop.example/x?a=1&amp;b=2">ext</a>')).toBe(
      '<a href="https://shop.example/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">ext</a>',
    );
    expect(sanitizeHtml('<a href="http://shop.example" target="_self">h</a>')).toContain('rel="noopener noreferrer nofollow"');
    expect(sanitizeHtml('<a href="//cdn.example/x">p</a>')).toContain('target="_blank"');
    expect(sanitizeHtml('<a href="/products/abc">rel</a>')).toBe('<a href="/products/abc">rel</a>');
    expect(sanitizeHtml('<a href="#size">frag</a>')).toBe('<a href="#size">frag</a>');
    expect(sanitizeHtml('<a href="mailto:shop@example.com">m</a>')).toBe('<a href="mailto:shop@example.com">m</a>');
    expect(sanitizeHtml('<a href="tel:+6621234567">t</a>')).toBe('<a href="tel:+6621234567">t</a>');
    expect(sanitizeHtml('<a href="/p" target="_blank" rel="opener">b</a>')).toBe('<a href="/p" target="_blank" rel="noopener noreferrer nofollow">b</a>');
    expect(sanitizeHtml('<a href="/p" title="ขนาด &amp; สี">t</a>')).toBe('<a href="/p" title="ขนาด &amp; สี">t</a>');
    expect(sanitizeHtml("<a>plain</a>")).toBe("<a>plain</a>");
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
    expect(sanitizeHtml("")).toBe("");
  });
});

describe("admin description round trip", () => {
  it("plain textarea text survives descriptionToHtml -> sanitizeHtml -> htmlToDescription", () => {
    for (const text of ['He said "hi" & <b> it\'s 5 < 6', "บรรทัด 1\nบรรทัด 2\n\nย่อหน้า 2", "&quot; literal"]) {
      expect(htmlToDescription(sanitizeHtml(descriptionToHtml(text)))).toBe(text);
    }
  });
});

describe("stripHtml", () => {
  it("returns text only, decoding references and dropping script/style content", () => {
    expect(stripHtml("<p>A &amp; B&nbsp;C</p><script>alert(1)</script><style>p{}</style><p>D</p>")).toBe("A & B C D");
    expect(stripHtml("<p>" + "ก".repeat(20) + "</p>", 10)).toBe(`${"ก".repeat(9)}…`);
    expect(stripHtml(null)).toBe("");
  });
});
