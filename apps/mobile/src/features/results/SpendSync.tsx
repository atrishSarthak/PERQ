import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { useResults, useSyncSpend } from "@/lib/queries";

// Recommender sync prompt (handoff Step 2 §9): shown on Home and Cards once a
// reconciled statement exists and the ranking still uses quiz estimates.
export function SpendSyncPrompt() {
  const results = useResults();
  const sync = useSyncSpend();
  const s = results.data?.spendSync;
  if (!s || s.source === "statements" || !s.available) return null;
  return (
    <Card>
      <Text variant="bodyStrong">Your recommendations use quiz estimates. Use your real spending?</Text>
      <Text variant="small" tone="muted">
        PERQ would rank cards on your average monthly spend from {s.statementCount} statement{s.statementCount === 1 ? "" : "s"}. You can switch back in Profile.
      </Text>
      <Button label="Use my real spending" loading={sync.isPending} onPress={() => sync.mutate("statements")} />
    </Card>
  );
}

/** "Based on your last N statements" when ranking on real spend. */
export function spendBasisLine(s: { source: string; statementCount: number } | undefined): string | null {
  if (!s || s.source !== "statements") return null;
  return `Based on your last ${s.statementCount} statement${s.statementCount === 1 ? "" : "s"}`;
}
