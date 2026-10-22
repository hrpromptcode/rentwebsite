import { SplitReveal } from "@rentweb/ui/motion";
import type { TemplateView } from "./platform-data";

/** Rotating seal beside the title (decorative; Latin only — Thai marks do not survive a textPath). */
function Seal({ id, text }: { id: string; text: string }) {
  const pathId = `pf-seal-${id}`;
  return (
    <span className="pf-tpl__seal" aria-hidden="true">
      <svg viewBox="0 0 120 120" data-ring="">
        <defs>
          <path id={pathId} d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
        </defs>
        <text>
          <textPath href={`#${pathId}`} textLength="282" lengthAdjust="spacing">
            {text}
          </textPath>
        </text>
      </svg>
      <svg viewBox="0 0 24 24" data-arrow="">
        <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * The editorial "Templates" wordmark (owner 2026-10-23: the heavy blue block "TEMPLATES ©10" read clunky): a huge thin
 * Manrope 200 word whose letters rise out of a mask, a serif-italic "(10)" count, an inline capsule that is a window onto
 * the drifting template screenshots (it opens after the letters, widens on hover while the letters gain weight in a
 * wave) and a slowly rotating seal pointing down at what follows. Render inside a `.pf-tpl` wrapper (entrance
 * choreography keys on it). Used by the home gallery chapter (h2) and the /templates hero (h1).
 */
export function TemplatesWordmark({ templates, as: Tag = "h2", id, srText, seal }: { templates: TemplateView[]; as?: "h1" | "h2"; id: string; srText: string; seal: string }) {
  const strip = [...templates, ...templates];
  return (
    <Tag id={id} className="pf-tpl__title pointer-events-auto">
      <span className="sr-only">{srText}</span>
      <span className="pf-tpl__line" aria-hidden="true">
        <span className="pf-tpl__lockup">
          <SplitReveal as="span" text="Templates" mode="chars" from="mask" stagger={0.05} duration={1.15} className="pf-tpl__word" />
          <span className="pf-tpl__count">({templates.length})</span>
        </span>
        <span className="pf-tpl__capsule">
          <span className="pf-tpl__strip">
            {strip.map((t, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${t.key}-${i}`} src={t.shot.desktop} alt="" width={1440} height={900} loading="lazy" decoding="async" draggable={false} />
            ))}
          </span>
        </span>
        <Seal id={id} text={seal} />
      </span>
    </Tag>
  );
}
