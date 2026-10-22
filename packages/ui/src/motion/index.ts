// Motion kit barrel (docs/design/hi-end-direction.md §3.2). GSAP lives at "@rentweb/ui/motion/gsap" (not re-exported
// here so pages that only need Reveal never pull GSAP); split helpers at "@rentweb/ui/motion/split" (server-safe).

// existing (APIs kept)
export { Reveal } from "./reveal";
export { Stagger, StaggerItem } from "./stagger";
export { TextReveal } from "./text-reveal";
export { Marquee } from "./marquee";
export { Magnetic, type MagneticProps } from "./magnetic";
export { Parallax } from "./parallax";
export { Counter } from "./counter";
export { TiltCard } from "./tilt-card";
export { MotionRoot } from "./motion-root";

// text
export { SplitReveal, type SplitRevealProps, type SplitFrom, type SplitMode, type SplitTag, type SplitTrigger } from "./split-reveal";
export { ScrubText, type ScrubTextProps } from "./scrub-text";
export { RollText, type RollTextProps } from "./roll-text";
export { WordCycler, type WordCyclerProps } from "./word-cycler";
export { LetterDrop, type LetterDropProps } from "./letter-drop";
export { Odometer, type OdometerProps } from "./odometer";
export { GiantWordmark, type GiantWordmarkProps } from "./giant-wordmark";
export { LiveClock, type LiveClockProps } from "./live-clock";

// media / layout choreography
export { ImageReveal, type ImageRevealProps } from "./image-reveal";
export { ParallaxMedia, type ParallaxMediaProps } from "./parallax-media";
export { VelocityMarquee, type VelocityMarqueeProps } from "./velocity-marquee";
export { StickyStory, type StickyStoryProps, type StoryItem } from "./sticky-story";
export { HorizontalScroll, type HorizontalScrollProps } from "./horizontal-scroll";
export { ScatterCards, type ScatterCardsProps, type ScatterCard } from "./scatter-cards";
export { HoverPreview, type HoverPreviewProps } from "./hover-preview";

// page level
export { SmoothScroll, type SmoothScrollProps } from "./smooth-scroll";
export { useLenis, scrollToTarget, getLenis } from "./lenis-store";
export { Preloader, type PreloaderProps } from "./preloader";
export { RouteTransition, RouteProgress, type RouteTransitionStyle } from "./route-transition";
export { ScrollProgress, type ScrollProgressProps } from "./scroll-progress";
export { BackToTop, type BackToTopProps } from "./back-to-top";

// helpers
export { useMotionPrefs, prefersReducedMotion, motionLevel, whenPreloaded, type MotionLevel, type MotionPrefs } from "./prefs";
export { subscribeScroll, useScrollEffect, requestScrollTick } from "./scroll-loop";
export { isThai, scriptOf, splitWords, splitGraphemes, segmentText, glueMaiYamok, THAI_GLUE_WORDS, type Script, type WordSegment } from "./split";
export { ThaiWrap } from "./thai-wrap";
export { mulberry32, seedFromString, seeded } from "./random";
