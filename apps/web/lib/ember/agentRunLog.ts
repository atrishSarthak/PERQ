import { agentRuns, db } from "@perq/db";
import type { AgentRunRecord } from "@perq/ai";

/** runEmber's logRun sink: one agent_runs row per Ember run (handoff §0.4). */
export async function logAgentRun(record: AgentRunRecord): Promise<void> {
  await db.insert(agentRuns).values({
    id: record.id,
    userId: record.userId,
    task: record.task,
    steps: record.steps,
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    status: record.status,
    error: record.error,
  });
}
