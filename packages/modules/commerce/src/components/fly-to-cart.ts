/**
 * Fly-to-cart (§5.1): a round thumbnail of the product flies from `from` to the visible header cart icon
 * (`[data-cart-icon]`, shell) along an arc, then the badge bounces (`rw:cart-bump`). Reduced motion / no target / no
 * image: just the bump. Browser only; never throws.
 */
export function flyToCart(src: string | null | undefined, from: DOMRect | null | undefined) {
  if (typeof window === "undefined") return;
  const bump = () => window.dispatchEvent(new Event("rw:cart-bump"));
  try {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-icon]")).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    });
    if (reduce || !target || !src || !from || typeof Element.prototype.animate !== "function") return bump();
    const to = target.getBoundingClientRect();
    const size = Math.max(48, Math.min(120, from.width * 0.5, from.height * 0.5));
    const x0 = from.left + from.width / 2 - size / 2;
    const y0 = from.top + from.height / 2 - size / 2;
    const dx = to.left + to.width / 2 - (x0 + size / 2);
    const dy = to.top + to.height / 2 - (y0 + size / 2);
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.className = "rwc-fly";
    Object.assign(img.style, { left: `${x0}px`, top: `${y0}px`, width: `${size}px`, height: `${size}px` });
    document.body.appendChild(img);
    const lift = Math.min(160, Math.abs(dy) * 0.35 + 60);
    const anim = img.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(.62) rotate(-8deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(.16) rotate(4deg)`, opacity: 0.4, offset: 1 },
      ],
      { duration: 820, easing: "cubic-bezier(.55,0,.35,1)", fill: "forwards" },
    );
    const done = () => {
      img.remove();
      bump();
    };
    anim.onfinish = done;
    anim.oncancel = done;
  } catch {
    bump();
  }
}
