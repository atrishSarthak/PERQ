import { z } from "zod";
import { quizAnswersSchema } from "./quizAnswersSchema";

// PRD §11: the "Edit my profile" panel edits ONE of the 13 answers at a
// time — this validates a single-field patch, keyed by the same field
// names as quizAnswersSchema's shape (kept in sync by construction: the
// shape() call reuses the object schema's own field validators rather than
// re-declaring 13 field types by hand).
const fieldSchemas = quizAnswersSchema.shape;
const fieldNames = Object.keys(fieldSchemas) as (keyof typeof fieldSchemas)[];

export const profileEditSchema = z.object({
  field: z.enum(fieldNames as [string, ...string[]]),
  value: z.unknown(),
});

export function validateFieldValue(
  field: string,
  value: unknown
): { success: true; value: unknown } | { success: false; error: string } {
  const schema = (fieldSchemas as Record<string, z.ZodTypeAny>)[field];
  if (!schema) return { success: false, error: `Unknown field: ${field}` };
  const result = schema.safeParse(value);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => i.message).join("; ") };
  }
  return { success: true, value: result.data };
}
