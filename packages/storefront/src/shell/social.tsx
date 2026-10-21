import * as React from "react";
import { contactOf, type StorefrontCtx } from "../ctx";
import { lineChat } from "../line";

/** Social / contact data the shell hands to client components (serialisable). */
export interface ShellSocial {
  kind: "facebook" | "instagram" | "line" | "tiktok";
  href: string;
  label: string;
}
export interface ShellContact {
  phone?: string;
  email?: string;
  address?: string;
  /** LINE chat link (ADMIN_B2-10: never a dead link) + what to show ("@shop") */
  line?: { href: string; display: string } | null;
  social: ShellSocial[];
}

export function shellContact(ctx: StorefrontCtx): ShellContact {
  const c = contactOf(ctx);
  const line = lineChat(c);
  const social: ShellSocial[] = [];
  if (c.facebook) social.push({ kind: "facebook", href: c.facebook, label: "Facebook" });
  if (c.instagram) social.push({ kind: "instagram", href: c.instagram, label: "Instagram" });
  if (c.tiktok) social.push({ kind: "tiktok", href: c.tiktok, label: "TikTok" });
  if (line?.href) social.push({ kind: "line", href: line.href, label: "LINE" });
  return {
    phone: c.phone || undefined,
    email: c.email || undefined,
    address: c.address || undefined,
    line: line?.href ? { href: line.href, display: line.display } : null,
    social,
  };
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z" />
    </svg>
  );
}

/** LINE speech-bubble mark (simplified, single colour). */
export function LineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.8 8.4.35.07.82.23.94.53.1.27.07.7.03.97l-.15.9c-.05.27-.21 1.05.92.57 1.13-.47 6.1-3.59 8.32-6.15C21.9 14.6 22.5 12.9 22.5 11c0-4.7-4.7-8.5-10.5-8.5Zm-3.9 11.1H6.1a.55.55 0 0 1-.55-.55V8.9a.55.55 0 1 1 1.1 0v3.6H8.1a.55.55 0 1 1 0 1.1Zm2.07-.55a.55.55 0 1 1-1.1 0V8.9a.55.55 0 1 1 1.1 0v4.15Zm4.98 0a.55.55 0 0 1-.38.52.56.56 0 0 1-.6-.18l-2.04-2.78v2.44a.55.55 0 1 1-1.1 0V8.9a.55.55 0 0 1 .98-.34l2.04 2.78V8.9a.55.55 0 1 1 1.1 0v4.15Zm3.27-2.62a.55.55 0 1 1 0 1.1H17v.97h1.42a.55.55 0 1 1 0 1.1h-1.97a.55.55 0 0 1-.55-.55V8.9c0-.3.25-.55.55-.55h1.97a.55.55 0 1 1 0 1.1H17v.98h1.42Z" />
    </svg>
  );
}

export function SocialIcon({ kind, className }: { kind: ShellSocial["kind"]; className?: string }) {
  if (kind === "facebook") return <FacebookIcon className={className} />;
  if (kind === "instagram") return <InstagramIcon className={className} />;
  if (kind === "tiktok") return <TiktokIcon className={className} />;
  return <LineIcon className={className} />;
}
