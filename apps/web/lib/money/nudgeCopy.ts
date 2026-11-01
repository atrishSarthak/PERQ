import { extractStructuredJson, type ResponseSchema } from "@perq/ai";
import { NUDGE_COPY_LIMITS, validateNudgeCopy, type NudgePayload } from "@perq/finance-engine";

// Nudge wording (handoff §7.1 step 6). Gemini sees only the rule id, its
// payload and the template, never transactions. Its text is used only if
// validateNudgeCopy passes; otherwise the template goes out.

const SCHEMA: ResponseSchema = {
  type: "object",
  properties: { title: { type: "string" }, body: { type: "string" } },
  required: ["title", "body"],
};

const TIMEOUT_MS = 20_000; // copy is written off the request path (cron or after())

export interface NudgeCopyInput {
  ruleId: string;
  payload: NudgePayload;
  templateTitle: string;
  templateBody: string;
}
export interface NudgeCopy {
  title: string;
  body: string;
  source: "ai" | "template";
}

export function nudgeCopyPrompt(n: NudgeCopyInput): string {
  return [
    "You are Ember, PERQ's calm, friendly money assistant for credit card users in India.",
    "Rewrite this notification in your voice. Rules:",
    `- title at most ${NUDGE_COPY_LIMITS.title} characters, body at most ${NUDGE_COPY_LIMITS.body}.`,
    "- Use only numbers that appear in DATA or TEMPLATE, written the same way (₹18,240, not ₹18k or 18.2k).",
    "- No urgency or pressure: no exclamation marks, no 'urgent', 'hurry', 'now', 'warning', 'last chance'.",
    "- Write dates like 15 Nov (never 2026-11-15). Plain English, second person, one idea. No advice about investments or loans.",
    "",
    `RULE: ${n.ruleId}`,
    `DATA: ${JSON.stringify(n.payload)}`,
    `TEMPLATE TITLE: ${n.templateTitle}`,
    `TEMPLATE BODY: ${n.templateBody}`,
  ].join("\n");
}

export async function writeNudgeCopy(n: NudgeCopyInput): Promise<NudgeCopy> {
  const template: NudgeCopy = { title: n.templateTitle, body: n.templateBody, source: "template" };
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.GEMINI_DISABLED === "1") return template;
  try {
    const out = (await Promise.race([
      extractStructuredJson(key, nudgeCopyPrompt(n), SCHEMA),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ])) as { title?: unknown; body?: unknown };
    if (typeof out?.title !== "string" || typeof out?.body !== "string") return template;
    const copy = { title: out.title.trim(), body: out.body.trim() };
    const check = validateNudgeCopy(copy, n.payload, { title: n.templateTitle, body: n.templateBody });
    if (!check.ok) {
      console.warn("nudge copy rejected", { ruleId: n.ruleId, reason: check.reason.replace(/\d[\d,.]*/g, "#") });
      return template;
    }
    return { ...copy, source: "ai" };
  } catch (err) {
    console.warn("nudge copy failed", { ruleId: n.ruleId, error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return template;
  }
}
