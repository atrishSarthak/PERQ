import { z, type ZodTypeAny } from "zod";
import type { JsonSchema } from "../types";

// Converts a tool's zod input schema into the function-declaration schema
// Gemini accepts (an OpenAPI subset). Covers the shapes Ember tools use:
// objects, strings, numbers, booleans, enums, arrays, optional/nullable,
// defaults and .describe() text. Anything else throws at registration time,
// not mid-run.
function convert(schema: ZodTypeAny): Record<string, unknown> {
  const description = schema.description ? { description: schema.description } : {};
  const def = schema._def as { typeName: z.ZodFirstPartyTypeKind };

  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString:
      return { type: "string", ...description };
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const isInt = (schema as z.ZodNumber).isInt;
      return { type: isInt ? "integer" : "number", ...description };
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return { type: "boolean", ...description };
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return { type: "string", enum: (schema as z.ZodEnum<[string]>).options, ...description };
    case z.ZodFirstPartyTypeKind.ZodArray:
      return {
        type: "array",
        items: convert((schema as z.ZodArray<ZodTypeAny>).element),
        ...description,
      };
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return { ...convert((schema as z.ZodOptional<ZodTypeAny>)._def.innerType), ...description };
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return {
        ...convert((schema as z.ZodNullable<ZodTypeAny>).unwrap()),
        nullable: true,
        ...description,
      };
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const { properties, required } = objectParts(schema as z.AnyZodObject);
      return { type: "object", properties, ...(required.length ? { required } : {}), ...description };
    }
    default:
      throw new Error(`zodToToolSchema: unsupported zod type ${def.typeName}`);
  }
}

function objectParts(schema: z.AnyZodObject) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(schema.shape as Record<string, ZodTypeAny>)) {
    properties[key] = convert(value);
    if (!value.isOptional()) required.push(key);
  }
  return { properties, required };
}

export function zodToToolSchema(schema: ZodTypeAny): JsonSchema {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error("zodToToolSchema: a tool's input must be a z.object(...)");
  }
  const { properties, required } = objectParts(schema);
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}
