import { Skeleton } from "@perq/ui";

/**
 * App Router route-level loading state for /results — shown automatically
 * while the server component's data fetch is in flight (e.g. right after
 * the quiz's submit sequence dismisses into this page). Mirrors
 * ResultsView's actual layout (filters sidebar, top pick, ranked list) so
 * the skeleton doesn't jump when real content swaps in.
 */
export default function ResultsLoading() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside
        className="hidden shrink-0 space-y-6 border-r border-border p-6 md:block md:w-64"
        style={{ backgroundColor: "var(--bg-base)" }}
      >
        <div className="space-y-3">
          <Skeleton height={12} width="40%" />
          <Skeleton height={16} width="70%" />
          <Skeleton height={16} width="60%" />
          <Skeleton height={16} width="80%" />
        </div>
        <div className="space-y-3">
          <Skeleton height={12} width="40%" />
          <Skeleton height={16} width="65%" />
          <Skeleton height={16} width="50%" />
        </div>
        <div className="space-y-3">
          <Skeleton height={12} width="40%" />
          <Skeleton height={16} width="70%" />
          <Skeleton height={16} width="55%" />
        </div>
      </aside>

      <main className="flex-1 space-y-6 p-6">
        <div>
          <Skeleton height={36} width="45%" />
          <div className="mt-2">
            <Skeleton height={16} width="30%" />
          </div>
        </div>

        <div className="flex gap-2">
          <Skeleton height={32} width={110} radius="lg" />
          <Skeleton height={32} width={110} radius="lg" />
          <Skeleton height={32} width={110} radius="lg" />
        </div>

        {/* Top pick skeleton card */}
        <div className="rounded-lg p-4 md:p-6" style={{ backgroundColor: "var(--bg-surface)" }}>
          <div className="flex flex-col gap-4 md:flex-row md:gap-6">
            <Skeleton radius="md" className="aspect-[1.75/1] w-full shrink-0 md:w-80" />
            <div className="flex flex-1 flex-col gap-4">
              <Skeleton height={26} width="60%" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Skeleton height={16} width="70%" />
                <Skeleton height={16} width="70%" />
                <Skeleton height={16} width="70%" />
                <Skeleton height={16} width="70%" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Skeleton height={48} />
          </div>
        </div>

        {/* Ranked list skeleton rows */}
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg p-4 md:p-6"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:gap-6">
                <Skeleton radius="md" className="aspect-[1.75/1] w-full shrink-0 md:w-80" />
                <div className="flex flex-1 flex-col gap-4">
                  <Skeleton height={22} width="55%" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Skeleton height={14} width="65%" />
                    <Skeleton height={14} width="65%" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
