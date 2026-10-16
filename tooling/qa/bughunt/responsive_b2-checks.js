// In-page check script (responsive_a11y bughunt). Read as text and evaluated via page.evaluate(`(${src})(opts)`).
(opts) => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const out = { vw, sw: document.documentElement.scrollWidth, overflow: [], tap: [], imgNoAlt: [], imgDistorted: [], noName: [], noLabel: [], thaiClip: [], fixed: [], fixedOverlap: [], covered: [], hidden: [], contrast: [] };
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
    if (c) s += "." + c;
    return s.slice(0, 120);
  };
  const txt = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    return true;
  };
  const inHiddenTree = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return true;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return true;
    }
    return false;
  };
  if (!opts.only) {
  // 1. overflow
  const clippedX = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") return true;
    }
    return false;
  };
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1) return;
    if ((r.right > vw + 1 || r.left < -1) && !clippedX(el) && getComputedStyle(el).position !== "fixed")
      out.overflow.push(sel(el) + " L=" + Math.round(r.left) + " R=" + Math.round(r.right) + " '" + txt(el).slice(0, 30) + "'");
  });
  out.overflow = out.overflow.slice(0, 12);
  }
  // 2. tap targets
  if (opts.tap) {
    const seen = new Set();
    document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, summary, [role=tab], [role=radio], [role=checkbox]").forEach((el) => {
      if (!visible(el) || inHiddenTree(el)) return;
      const r = el.getBoundingClientRect();
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|SMALL|TD)$/.test(el.parentElement.tagName) && (el.parentElement.innerText || "").length > txt(el).length + 15) return;
      if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
        const lab = el.closest("label") || (el.id && document.querySelector('label[for="' + el.id + '"]'));
        if (lab) { const lr = lab.getBoundingClientRect(); if (lr.height >= 44) return; }
      }
      if (r.height < 44 || r.width < 44) {
        const key = el.tagName + "|" + txt(el) + "|" + Math.round(r.width) + "x" + Math.round(r.height);
        if (seen.has(key)) return;
        seen.add(key);
        out.tap.push(sel(el) + " " + Math.round(r.width) + "x" + Math.round(r.height) + " '" + (txt(el) || el.getAttribute("aria-label") || "").slice(0, 30) + "'");
      }
    });
  }
  if (!opts.only) {
  // 3. images
  document.querySelectorAll("img").forEach((img) => {
    if (!img.hasAttribute("alt") && !inHiddenTree(img)) out.imgNoAlt.push((img.currentSrc || img.src || "").slice(-80));
    if (!visible(img) || !img.naturalWidth || !img.naturalHeight) return;
    const cs = getComputedStyle(img);
    if (cs.objectFit === "fill" || cs.objectFit === "") {
      const r = img.getBoundingClientRect();
      const ra = r.width / r.height, na = img.naturalWidth / img.naturalHeight;
      if (Math.abs(ra / na - 1) > 0.04) out.imgDistorted.push((img.currentSrc || img.src).slice(-70) + " box=" + Math.round(r.width) + "x" + Math.round(r.height) + " natural=" + img.naturalWidth + "x" + img.naturalHeight + " " + sel(img));
    }
  });
  // 4. accessible names
  const nameOf = (el) => {
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al;
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((n) => n.textContent).join(" ").trim();
      if (t) return t;
    }
    const t = (el.textContent || "").trim();
    if (t) return t;
    const im = el.querySelector("img[alt]");
    if (im && im.getAttribute("alt").trim()) return im.getAttribute("alt");
    const st = el.querySelector("svg title");
    if (st && st.textContent.trim()) return st.textContent;
    if (el.title && el.title.trim()) return el.title;
    if (el.tagName === "INPUT" && el.value) return el.value;
    const wrap = el.closest("label");
    if (wrap && wrap.textContent.trim()) return wrap.textContent;
    if (el.id) { const lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lf && lf.textContent.trim()) return lf.textContent; }
    return "";
  };
  document.querySelectorAll("a[href], button, [role=button], [role=link]").forEach((el) => {
    if (inHiddenTree(el)) return;
    if (!nameOf(el)) out.noName.push(sel(el) + (el.getAttribute("href") ? " href=" + el.getAttribute("href").slice(0, 60) : ""));
  });
  document.querySelectorAll("input, select, textarea").forEach((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
    if (el.getAttribute("aria-hidden") === "true" || inHiddenTree(el)) return;
    const ok = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.title || el.closest("label") || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
    if (!ok) out.noLabel.push(sel(el) + " type=" + (type || el.tagName.toLowerCase()) + " name=" + (el.getAttribute("name") || "") + " placeholder=" + (el.getAttribute("placeholder") || ""));
  });
  }
  // 5. Thai ink clipping: glyph ink (canvas measureText with the element's font) vs. every clipping ancestor's padding box
  if (!opts.only) {
    const THAI = /[฀-๿]/;
    const cv2 = document.createElement("canvas").getContext("2d");
    const clipAnc = (el) => {
      const list = [];
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowY !== "visible" || (cs.webkitLineClamp && cs.webkitLineClamp !== "none")) list.push(a);
        if (list.length >= 4) break;
      }
      return list;
    };
    const seenT = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n2 = 0;
    while (w.nextNode() && n2 < 4000) {
      const tn = w.currentNode;
      const t = (tn.textContent || "").trim();
      if (!t || !THAI.test(t)) continue;
      n2++;
      const el = tn.parentElement;
      if (!el || !visible(el) || inHiddenTree(el)) continue;
      const ancs = clipAnc(el);
      if (!ancs.length) continue;
      const cs = getComputedStyle(el);
      const font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      cv2.font = font;
      const m = cv2.measureText(t);
      const fA = m.fontBoundingBoxAscent;
      const range = document.createRange();
      range.selectNodeContents(tn);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      const hits = [];
      for (const a of ancs) {
        const ar = a.getBoundingClientRect(), acs = getComputedStyle(a);
        const top = ar.top + parseFloat(acs.borderTopWidth), bottom = ar.bottom - parseFloat(acs.borderBottomWidth);
        if (bottom - top < 2) continue;
        for (const r of rects) {
          const mid = (r.top + r.bottom) / 2;
          if (mid < top || mid > bottom) continue; // line intentionally hidden (clamp / scroller)
          const inkTop = r.top + fA - m.actualBoundingBoxAscent, inkBot = r.top + fA + m.actualBoundingBoxDescent;
          if (inkTop < top - 1 || inkBot > bottom + 1) hits.push({ a, r, top, bottom });
        }
      }
      if (!hits.length) continue;
      // refine per character on the offending lines (whole-string metrics overstate lines without stacked marks)
      let worst = null;
      for (const h of hits) {
        let maxA = 0, maxD = 0;
        for (let i = 0; i < tn.length; i++) {
          range.setStart(tn, i);
          range.setEnd(tn, i + 1);
          const cr = range.getBoundingClientRect();
          if (cr.width === 0 && cr.height === 0) continue;
          if (Math.abs(cr.top - h.r.top) > 2) continue;
          const mm = cv2.measureText(tn.textContent.slice(Math.max(0, i - 2), i + 1));
          maxA = Math.max(maxA, mm.actualBoundingBoxAscent);
          maxD = Math.max(maxD, mm.actualBoundingBoxDescent);
        }
        const over = Math.max(h.top - (h.r.top + fA - maxA), h.r.top + fA + maxD - h.bottom);
        if (over > 1 && (!worst || over > worst.over)) worst = { ...h, over };
      }
      if (!worst) continue;
      const key = sel(el) + "|" + sel(worst.a);
      if (seenT.has(key)) continue;
      seenT.add(key);
      out.thaiClip.push("clip=" + worst.over.toFixed(1) + "px el=" + sel(el) + " fs=" + cs.fontSize + " lh=" + cs.lineHeight + " by=" + (worst.a === el ? "self" : sel(worst.a)) + " ov=" + getComputedStyle(worst.a).overflowY + " '" + t.slice(0, 30) + "'");
    }
    out.thaiClip = out.thaiClip.slice(0, 20);
    // 5b. reveal / heading state at final position
    out.reveal = [];
    out.headClip = [];
    document.querySelectorAll("[data-reveal], [data-reveal-item], [data-reveal-word]").forEach((el, i) => {
      if (inHiddenTree(el)) return;
      const cs = getComputedStyle(el);
      let op = 1;
      for (let n = el; n && n !== document.body; n = n.parentElement) op = Math.min(op, parseFloat(getComputedStyle(n).opacity));
      out.reveal.push(i + "|" + sel(el) + "|op=" + op.toFixed(2) + "|tf=" + cs.transform + "|tr=" + cs.translate + "|sc=" + cs.scale);
    });
    document.querySelectorAll("main h1, main h2, h1").forEach((el) => {
      if (!visible(el) || inHiddenTree(el)) return;
      const r = el.getBoundingClientRect();
      let vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const ar = a.getBoundingClientRect();
        if (cs.overflowX !== "visible") { vis.l = Math.max(vis.l, ar.left); vis.r = Math.min(vis.r, ar.right); }
        if (cs.overflowY !== "visible") { vis.t = Math.max(vis.t, ar.top); vis.b = Math.min(vis.b, ar.bottom); }
      }
      const area = Math.max(0, vis.r - vis.l) * Math.max(0, vis.b - vis.t), full = r.width * r.height;
      // words inside the heading clipped by their own wrappers
      let wordsHidden = 0, words = 0;
      el.querySelectorAll("[data-reveal-word]").forEach((wd) => {
        words++;
        const wr = wd.getBoundingClientRect();
        const p = wd.parentElement, pr = p.getBoundingClientRect(), pcs = getComputedStyle(p);
        let op = 1;
        for (let n = wd; n && n !== el.parentElement; n = n.parentElement) op = Math.min(op, parseFloat(getComputedStyle(n).opacity));
        const clipped = pcs.overflowY !== "visible" && (wr.top < pr.top - 1 || wr.bottom > pr.bottom + 1);
        if (op < 0.95 || clipped) wordsHidden++;
      });
      if ((full > 0 && area / full < 0.9) || wordsHidden) out.headClip.push(sel(el) + " visible=" + (full ? Math.round((area / full) * 100) : 0) + "% wordsHidden=" + wordsHidden + "/" + words + " '" + txt(el).slice(0, 40) + "'");
    });
  }
  // 6. fixed elements + overlap + covering interactive elements
  const fixed = [];
  document.querySelectorAll("body *").forEach((el) => {
    const cs = getComputedStyle(el);
    if ((cs.position === "fixed" || cs.position === "sticky") && visible(el) && parseFloat(cs.opacity) > 0.05) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.width * r.height < 100) return;
      if (fixed.some((f) => f.el.contains(el))) return;
      fixed.push({ el, r, pos: cs.position, z: cs.zIndex });
    }
  });
  out.fixed = fixed.map((f) => f.pos + " " + sel(f.el) + " z=" + f.z + " [" + Math.round(f.r.left) + "," + Math.round(f.r.top) + " " + Math.round(f.r.width) + "x" + Math.round(f.r.height) + "]");
  for (let i = 0; i < fixed.length; i++)
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i].r, b = fixed[j].r;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 2 && iy > 2 && !fixed[i].el.contains(fixed[j].el) && !fixed[j].el.contains(fixed[i].el)) out.fixedOverlap.push(sel(fixed[i].el) + " X " + sel(fixed[j].el) + " overlap=" + Math.round(ix) + "x" + Math.round(iy));
    }
  document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button]").forEach((el) => {
    if (!visible(el) || inHiddenTree(el)) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > vh) return;
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + r.height / 2], [r.right - 4, r.top + r.height / 2]];
    let blocked = 0, by = null;
    for (const [x, y] of pts) {
      const top = document.elementFromPoint(x, y);
      if (top && !el.contains(top) && !top.contains(el)) {
        const f = fixed.find((f) => f.el.contains(top) && !f.el.contains(el));
        if (f) { blocked++; by = f.el; }
      }
    }
    if (blocked >= 2) out.covered.push(sel(el) + " '" + (txt(el) || el.getAttribute("aria-label") || "").slice(0, 30) + "' covered by " + sel(by));
  });
  if (!opts.only) {
  // 7. invisible content (opacity 0 / visibility hidden) in main
  document.querySelectorAll("main h1, main h2, main h3, main p, main li, main img, main a, main button").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    let op = 1, hid = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      op = Math.min(op, parseFloat(cs.opacity));
      if (cs.visibility === "hidden") hid = true;
      if (n.getAttribute("aria-hidden") === "true") return;
      if (cs.display === "none") return;
    }
    if (op < 0.05 || hid) out.hidden.push(sel(el) + " op=" + op + " '" + (txt(el) || el.getAttribute("src") || "").slice(0, 30) + "'");
  });
  out.hidden = out.hidden.slice(0, 10);
  }
  // 8. contrast (solid backgrounds only)
  if (opts.contrast) {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const cv = document.createElement("canvas").getContext("2d");
    const toRgb = (c) => {
      if (!c) return null;
      if (/^rgb/.test(c)) return parse(c);
      cv.fillStyle = "#000";
      cv.fillStyle = c;
      const f = cv.fillStyle;
      if (f.startsWith("#")) { const n = parseInt(f.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
      return parse(f);
    };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const bgOf = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        const c = toRgb(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
        if (n === document.documentElement) break;
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) base = layers[i].a >= 0.99 ? layers[i] : blend(layers[i], base);
      return base;
    };
    const seen = new Set();
    document.querySelectorAll("body *").forEach((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      if (!own || !visible(el) || inHiddenTree(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (cs.position === "absolute" && cs.clip && cs.clip.startsWith("rect(0")) return;
      const bg = bgOf(el);
      if (!bg) return;
      const cx = Math.max(0, Math.min(window.innerWidth - 1, r.left + Math.min(r.width / 2, 10))), cy = r.top + r.height / 2;
      if (cy > 0 && cy < vh) {
        const stack = document.elementsFromPoint(cx, cy);
        if (stack.some((s) => (s.tagName === "IMG" || s.tagName === "VIDEO" || s.tagName === "CANVAS" || s.tagName === "svg") && !s.contains(el) && !el.contains(s))) return;
      }
      let fg = toRgb(cs.color);
      if (!fg) return;
      let op = 1;
      for (let n = el; n && n !== document.body; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
      if (op < 0.98) fg = { ...fg, a: fg.a * op };
      if (fg.a < 1) fg = blend(fg, bg);
      const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
      const large = fs >= 24 || (bold && fs >= 18.66);
      const need = large ? 3 : 4.5;
      const cr = ratio(fg, bg);
      if (cr < need - 0.01) {
        const key = cs.color + "|" + JSON.stringify(bg) + "|" + own.slice(0, 15);
        if (seen.has(key)) return;
        seen.add(key);
        out.contrast.push(cr.toFixed(2) + " need " + need + " fg=" + cs.color + " bg=rgb(" + [bg.r, bg.g, bg.b].map(Math.round).join(",") + ") fs=" + fs + " " + sel(el) + " '" + own.slice(0, 30) + "'");
      }
    });
    out.contrast = out.contrast.slice(0, 25);
  }
  return out;
}
