"use client";

import { useRouter } from "next/navigation";
import { draftFromAnswers, type QuizAnswersV2 } from "@perq/shared";
import { QuizV2Wizard } from "@/components/recommender/QuizV2Wizard";

export function QuizV2Client({ initial }: { initial?: QuizAnswersV2 }) {
  const router = useRouter();
  return (
    <QuizV2Wizard
      initial={initial ? draftFromAnswers(initial) : undefined}
      onComplete={async (answers) => {
        const res = await fetch("/api/recommender/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answers),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save your answers.");
        router.push("/results");
        router.refresh();
      }}
    />
  );
}
