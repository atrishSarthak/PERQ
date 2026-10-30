"use client";

import { useEffect, useRef, useState } from "react";
import type { ResultsResponse } from "@perq/shared";
import { ResultsV2 } from "@/components/recommender/ResultsV2";
import { parseSSEStream } from "../quiz/parseSSEStream";

export function ResultsV2Client({ initial }: { initial: ResultsResponse }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState<string | null>(null);
  const requested = useRef<string | null>(null);
  const top = data.result.ranked[0];
  const explanation = top && data.explanation?.topCardId === top.cardId ? data.explanation.text : null;

  // A new Ember explanation only when the Top Pick changed (handoff §1.3).
  useEffect(() => {
    if (!top || explanation || requested.current === top.cardId) return;
    requested.current = top.cardId;
    (async () => {
      const res = await fetch("/api/recommender/explain", { method: "POST" });
      if (!res.ok || !res.body) return;
      for await (const raw of parseSSEStream(res.body)) {
        const e = raw as { type: string; label?: string; text?: string; topCardId?: string };
        if (e.type === "step" && e.label) setStep(e.label);
        if (e.type === "explanation" && e.text && e.topCardId) {
          setData((d) => ({ ...d, explanation: { text: e.text!, source: "gemini", topCardId: e.topCardId! } }));
        }
      }
      setStep(null);
    })().catch(() => setStep(null));
  }, [top, explanation]);

  async function toggleHeld(cardId: string, held: boolean) {
    await fetch(`/api/arsenal/${encodeURIComponent(cardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ held }),
    });
    const res = await fetch("/api/recommender/results");
    if (res.ok) setData(await res.json());
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-h1 font-bold text-text-primary">Your cards</h1>
        <a href="/quiz?retake=1" className="rounded-md border border-border px-3 py-2 font-body text-body-sm text-text-primary">
          Edit answers
        </a>
      </div>
      <ResultsV2 result={data.result} explanation={explanation} emberStep={step} onToggleHeld={toggleHeld} />
    </div>
  );
}
