import { Skeleton } from "@perq/ui";
import { DASHBOARD_COLORS as C } from "./dashboardTheme";

/**
 * App Router route-level loading state for /home — without this, the
 * page-transition overlay (components/transitions/PageTransition.tsx) can't
 * start its "enter" shrink animation until HomePage's Server Component
 * fully resolves, since there's no Suspense boundary for the router to
 * commit against sooner. That's what made navigating back to /home in
 * particular feel "stuck": every other page transition still had to wait
 * on data, but /home had no intermediate step at all, gold overlay held at
 * full coverage the whole time. Mirrors HomeDashboard's bento grid so the
 * skeleton doesn't jump when real content swaps in.
 */
export default function HomeLoading() {
  return (
    <div style={{ backgroundColor: C.pageBg, minHeight: "100vh" }} className="px-16 py-14 pb-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 space-y-3">
          <Skeleton height={32} width="30%" />
          <Skeleton height={16} width="20%" />
        </div>

        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(12, 1fr)", gridTemplateRows: "380px 100px 240px" }}
        >
          <div
            className="space-y-4 rounded-lg p-6"
            style={{ gridArea: "1 / 1 / 2 / 9", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
          >
            <Skeleton height={22} width="35%" />
            <Skeleton radius="md" className="aspect-[1.75/1] w-full max-w-sm" />
            <Skeleton height={16} width="80%" />
            <Skeleton height={16} width="60%" />
          </div>

          <div
            className="space-y-4 rounded-lg p-6"
            style={{ gridArea: "1 / 9 / 3 / 13", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
          >
            <Skeleton height={22} width="55%" />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>

          <div
            className="flex items-center rounded-lg p-6"
            style={{ gridArea: "2 / 1 / 3 / 9", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
          >
            <Skeleton height={20} width="40%" />
          </div>

          <div
            className="space-y-4 rounded-lg p-6"
            style={{ gridArea: "3 / 1 / 4 / 9", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
          >
            <Skeleton height={20} width="45%" />
            <Skeleton height={16} width="70%" />
          </div>

          <div
            className="space-y-4 rounded-lg p-6"
            style={{ gridArea: "3 / 9 / 4 / 13", backgroundColor: C.surface, border: `1px solid ${C.surfaceBorder}` }}
          >
            <Skeleton height={20} width="55%" />
            <Skeleton height={16} width="65%" />
          </div>
        </div>
      </div>
    </div>
  );
}
