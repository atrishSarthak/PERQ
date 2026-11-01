import { extractStructuredJson, type ResponseSchema } from "@perq/ai";
import type { StatementLlm } from "@perq/statements";

/**
 * Gemini structured output for statement extraction and merchant
 * categorisation, or null when Gemini is off (no key or GEMINI_DISABLED=1).
 */
export function statementLlm(): StatementLlm | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.GEMINI_DISABLED === "1") return null;
  return (prompt, schema) => extractStructuredJson(key, prompt, schema as ResponseSchema);
}
