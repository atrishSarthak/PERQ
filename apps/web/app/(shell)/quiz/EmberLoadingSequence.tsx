import Image from "next/image";
import { Narration, type NarrationStep } from "@perq/ui";

/**
 * Ember's branded "working" sequence (Task 1 SUBMIT/LOADING SEQUENCE spec):
 * avatar mark + narrated steps with checkmarks. Wraps packages/ui's generic
 * Narration (PRD §9.3/Design System §5) with Ember-specific chrome — the
 * avatar image and gold/blue brand accents — since Narration itself
 * deliberately has no knowledge of Ember (packages/ui/src/narration/types.ts).
 */
export function EmberLoadingSequence({ steps }: { steps: NarrationStep[] }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative">
        <Image
          src="/ember-avatar.svg"
          unoptimized
          alt=""
          width={96}
          height={96}
          className="h-16 w-16 rounded-full"
          style={{ boxShadow: "0 0 0 3px var(--ember)" }}
        />
      </div>
      <p className="font-display text-h2 text-text-primary">
        <span className="text-ember-text">Ember</span> is on it
      </p>
      <div className="w-full max-w-xs">
        <Narration steps={steps} />
      </div>
    </div>
  );
}
