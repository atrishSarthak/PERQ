"use client";

import { useEffect, useRef } from "react";
import { TransitionRouter } from "next-transition-router";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

gsap.registerPlugin(DrawSVGPlugin);

// Kept short and roughly symmetric on purpose — the actual route's data
// fetch/render happens AFTER `leave`'s next() fires and BEFORE `enter`
// starts (next-transition-router's own model, not something these
// durations can shrink further), so any time spent here is pure overhead
// stacked on top of that. The overlay's solid background is what hides the
// content swap; the SVG stroke is a decorative accent on top of it, not
// the covering mechanism, so its width stays fixed rather than ballooning
// up to cover the screen itself — that ballooning (2px -> 300px -> 2px)
// was what made the old version feel like it lingered forever.
const LEAVE_DURATION = 0.16;
const ENTER_DURATION = 0.16;

/**
 * Site-wide page transition: a bold gold line sweeps across a solid
 * overlay on every client-side navigation (next/link clicks, router.push —
 * next-transition-router's `auto` prop patches both). Gold, not accent
 * blue, deliberately — gold is reserved for MIMIR "brand moment"
 * flourishes (Top Pick badge, this), while blue stays for MIMIR-attributed
 * text/UI, per the existing color split.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!pathRef.current) return;
    gsap.set(pathRef.current, { drawSVG: "0%" });
  }, []);

  return (
    <TransitionRouter
      auto
      leave={(next) => {
        const tl = gsap.timeline({ onComplete: next });
        tl.to(overlayRef.current, { opacity: 1, duration: LEAVE_DURATION, ease: "power1.inOut" }, 0).to(
          pathRef.current,
          { drawSVG: "100%", duration: LEAVE_DURATION, ease: "power1.inOut" },
          0
        );
        return () => {
          tl.kill();
        };
      }}
      enter={(next) => {
        const tl = gsap.timeline({ onComplete: next });
        tl.to(overlayRef.current, { opacity: 0, duration: ENTER_DURATION, ease: "power1.inOut" }, 0)
          .to(pathRef.current, { drawSVG: "100% 100%", duration: ENTER_DURATION, ease: "power1.inOut" }, 0)
          .set(pathRef.current, { drawSVG: "0%" });
        return () => {
          tl.kill();
        };
      }}
    >
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[999] flex items-center justify-center opacity-0"
        style={{ backgroundColor: "var(--bg-base)" }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1316 664"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full scale-125"
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            ref={pathRef}
            d="M13.4746 291.27C13.4746 291.27 100.646 -18.6724 255.617 16.8418C410.588 52.356 61.0296 431.197 233.017 546.326C431.659 679.299 444.494 21.0125 652.73 100.784C860.967 180.556 468.663 430.709 617.216 546.326C765.769 661.944 819.097 48.2722 988.501 120.156C1174.21 198.957 809.424 543.841 988.501 636.726C1189.37 740.915 1301.67 149.213 1301.67 149.213"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: "var(--gold)" }}
          />
        </svg>
      </div>
      {children}
    </TransitionRouter>
  );
}
