import { DASHBOARD_COLORS as C } from "./dashboardTheme";

/**
 * Static placeholder for Feature 2 (Chrome extension) — not shipped yet, so
 * no functional CTA. Feature 3 (goal-based advisor) used to render here too
 * but now has a real widget (GoalAdvisorWidget) once it shipped; this
 * component stays generic/reusable for whichever not-yet-built feature
 * needs a placeholder next, rather than being renamed to a Feature-2-only
 * component for one remaining call site.
 */
export function ComingSoonWidget({
  gridArea,
  size,
  badge,
  title,
  body,
}: {
  gridArea: string;
  size: "lg" | "sm";
  badge: string;
  title: string;
  body: string;
}) {
  const isLg = size === "lg";

  return (
    <div
      className="relative flex flex-col justify-center gap-2.5 rounded-3xl"
      style={{
        gridArea,
        backgroundColor: C.surface,
        border: `1px solid ${C.surfaceBorder}`,
        padding: isLg ? "28px 32px" : "24px 26px",
      }}
    >
      <span
        className="absolute rounded-full font-body font-semibold uppercase tracking-wide"
        style={{
          top: isLg ? 24 : 22,
          right: isLg ? 28 : 22,
          backgroundColor: "rgba(255,255,255,0.06)",
          color: C.textSecondary,
          fontSize: isLg ? 11 : 10,
          padding: isLg ? "6px 12px" : "5px 10px",
        }}
      >
        {badge}
      </span>
      <h3 className="font-display font-semibold" style={{ color: C.textPrimary, fontSize: isLg ? 20 : 17 }}>
        {title}
      </h3>
      <p
        className="font-body leading-relaxed"
        style={{ color: C.textSecondary, fontSize: isLg ? 14 : 13, maxWidth: isLg ? 520 : undefined }}
      >
        {body}
      </p>
    </div>
  );
}
