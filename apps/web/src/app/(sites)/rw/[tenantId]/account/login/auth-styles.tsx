/**
 * Hoisted CSS for the customer account screens (login, account home, my orders). Theme tokens only; motion is a
 * one-shot entrance (fade + 14px rise, photo settle) that exists only under `prefers-reduced-motion: no-preference`.
 * Operational routes: no WebGL, no scroll-linked work.
 */
export function AuthStyles() {
  return (
    <style href="rw-account-screens" precedence="default">{`
.rw-auth-gradient {
  background:
    radial-gradient(120% 90% at 18% 8%, color-mix(in oklab, var(--primary) 58%, #0b0b0e), transparent 62%),
    radial-gradient(90% 80% at 92% 100%, color-mix(in oklab, var(--accent) 48%, #0b0b0e), transparent 66%),
    #0d0d10;
}
.rw-auth-scrim {
  background:
    linear-gradient(180deg, rgb(0 0 0 / 0.5) 0%, rgb(0 0 0 / 0.12) 34%, rgb(0 0 0 / 0.3) 60%, rgb(0 0 0 / 0.82) 100%),
    linear-gradient(90deg, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%);
}
.rw-auth-grain {
  opacity: 0.07;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.rw-auth-name { text-shadow: 0 2px 30px rgb(0 0 0 / 0.35); }
.rw-otp-code {
  background-image: linear-gradient(90deg, var(--border) 0 1px, transparent 1px);
  background-size: calc(100% / 6) 100%;
  background-position: 0 0;
}
@media (prefers-reduced-motion: no-preference) {
  .rw-auth-photo { animation: rw-auth-settle 2.4s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)) both; }
  .rw-auth-rise { animation: rw-auth-rise 0.9s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)) both; animation-delay: var(--d, 0ms); }
  .rw-auth-dot { animation: rw-auth-pulse 2.4s ease-in-out infinite; }
  .rw-step-in { animation: rw-auth-rise 0.6s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)) both; }
}
@keyframes rw-auth-settle { from { transform: scale(1.08); filter: saturate(0.6); } to { transform: none; filter: none; } }
@keyframes rw-auth-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes rw-auth-pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 color-mix(in oklab, var(--glow, #fff) 60%, transparent); } 50% { opacity: 0.7; box-shadow: 0 0 0 6px transparent; } }
.rw-acc-link .rw-acc-arrow { transition: transform var(--dur-ui, 320ms) var(--ease-out-quart, ease), background-color var(--dur-micro, 160ms), color var(--dur-micro, 160ms); }
.rw-acc-link:hover .rw-acc-arrow, .rw-acc-link:focus-visible .rw-acc-arrow { transform: rotate(-45deg); background: var(--foreground); color: var(--background); }
.rw-acc-link { transition: border-color var(--dur-micro, 160ms), transform var(--dur-ui, 320ms) var(--ease-out-quart, ease), box-shadow var(--dur-ui, 320ms); }
.rw-acc-link:hover { transform: translateY(-3px); border-color: color-mix(in oklab, var(--foreground) 28%, var(--border)); box-shadow: var(--shadow-float); }
`}</style>
  );
}
