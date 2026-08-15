export interface SkeletonProps {
  className?: string;
  /** Inline width/height overrides — className's h- and w- utilities also work. */
  width?: string | number;
  height?: string | number;
  /** Defaults to --radius-sm; pass "md" or "lg" for a bigger card-shaped block. */
  radius?: "sm" | "md" | "lg";
}

/**
 * The one shimmer/skeleton primitive for the whole app (Task 1 STYLE spec:
 * "reuse the exact skeleton style already built for the results page — same
 * shimmer, same charcoal tone, same radius — don't invent a new loading
 * style"). Built once here so the results-page loading state and the quiz's
 * card-search loading state are visually identical by construction, not by
 * convention. The shimmer keyframes/utility class live in apps/web's
 * globals.css (perq-skeleton) since that's the app's single CSS entry
 * point; this component just applies that class plus the charcoal surface
 * token.
 */
export function Skeleton({ className = "", width, height, radius = "sm" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`perq-skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius: `var(--radius-${radius})`,
        backgroundColor: "var(--bg-surface-2)",
      }}
    />
  );
}
