import { sanitizeCss } from "@rentweb/core/theme";
import { sanitizeHtml } from "../../../packages/modules/commerce/src/lib/sanitize";
const cssIn = "</sty</style>le><script>alert(document.domain)</script>";
console.log("sanitizeCss:", JSON.stringify(sanitizeCss(cssIn)));
console.log("sanitizeCss @import:", JSON.stringify(sanitizeCss("@im@import x;port url(https://evil.example/x.css);")));
const htmlIn = "<p>ok</p><img src=x onerror=alert(document.domain) x=";
console.log("sanitizeHtml:", JSON.stringify(sanitizeHtml(htmlIn)));
console.log("JSON-LD:", JSON.stringify({ name: "</script><script>alert(1)</script>" }));
