import { cn } from "@rentweb/ui/lib/utils";

/**
 * Screenshot in a browser frame with floating annotation pills (features sticky story). Server-safe.
 * `notes` positions are percentages of the frame.
 */
export function AnnotatedShot({ src, alt, url, notes, className }: { src: string; alt: string; url: string; notes: { x: number; y: number; label: string }[]; className?: string }) {
  return (
    <div className={cn("relative size-full p-[4%]", className)}>
      <div className="relative flex size-full flex-col overflow-hidden rounded-[1.1rem] bg-card shadow-[0_50px_100px_-46px_rgb(21_97_183/0.6),0_24px_50px_-34px_rgb(27_34_51/0.3)] ring-1 ring-[#dfe6f1]">
        <div className="flex items-center gap-2 border-b border-border bg-[linear-gradient(180deg,#fff,#f4f7fc)] px-4 py-2.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="mx-auto truncate rounded-full bg-[#eaf1fb] px-4 py-1 font-mono text-[0.7rem] text-muted-foreground">{url}</span>
        </div>
        <div className="relative min-h-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="absolute inset-0 size-full object-cover object-top" loading="lazy" decoding="async" />
        </div>
      </div>
      {notes.map((n, i) => (
        <span
          key={n.label}
          className="absolute z-10 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-3.5 py-2 text-[0.8rem] font-semibold text-background shadow-xl"
          style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 0.4}s` }}
        >
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
            <span className="relative size-2 rounded-full bg-primary" />
          </span>
          {n.label}
        </span>
      ))}
    </div>
  );
}
