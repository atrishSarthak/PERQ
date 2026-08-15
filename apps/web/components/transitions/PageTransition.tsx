"use client";

import { useEffect, useRef } from "react";
import { TransitionRouter } from "next-transition-router";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

gsap.registerPlugin(DrawSVGPlugin);

/**
 * Site-wide page transition: a gold drawn-line wipe over a full-screen
 * overlay, played on every client-side navigation (next/link clicks,
 * router.push/back — next-transition-router's `auto` prop patches both).
 * Gold, not accent blue, deliberately — gold is reserved for MIMIR "brand
 * moment" flourishes (Top Pick badge, this), while blue stays for
 * MIMIR-attributed text/UI, per the existing color split.
 *
 * Technique: an SVG path animates from an invisible hairline (drawSVG 0%,
 * strokeWidth 2) to a full-bleed solid stroke (drawSVG 100%, strokeWidth
 * 300) during `leave`, which — layered on the fading-in overlay behind it
 * — fully covers the outgoing page before Next.js swaps in the new route
 * (the `next()` callback is only called once that timeline completes).
 * `enter` reverses it once the new page has mounted underneath.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!pathRef.current) return;
    gsap.set(pathRef.current, { drawSVG: "0%", strokeWidth: 2 });
  }, []);

  return (
    <TransitionRouter
      auto
      leave={(next) => {
        const tl = gsap.timeline({ onComplete: next });
        tl.to(overlayRef.current, { opacity: 1, duration: 0.4, ease: "power2.inOut" }).to(
          pathRef.current,
          { drawSVG: "100%", strokeWidth: 300, duration: 1.1, ease: "power2.inOut" },
          0
        );
        return () => {
          tl.kill();
        };
      }}
      enter={(next) => {
        const tl = gsap.timeline({ onComplete: next });
        tl.to(pathRef.current, { drawSVG: "100% 100%", strokeWidth: 2, duration: 1.1, ease: "power2.inOut" })
          .to(overlayRef.current, { opacity: 0, duration: 0.4, ease: "power2.inOut" }, 0.7)
          .set(pathRef.current, { drawSVG: "0%", strokeWidth: 2 });
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
            strokeWidth="2"
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
