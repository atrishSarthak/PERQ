import { describe, expect, it } from "vitest";
import { arsenalToggleSchema } from "@/lib/mimir/arsenalSchema";

describe("arsenalToggleSchema", () => {
  it("accepts a valid held toggle", () => {
    const result = arsenalToggleSchema.safeParse({ cardId: "card-1", status: "held" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid not_held toggle", () => {
    const result = arsenalToggleSchema.safeParse({ cardId: "card-1", status: "not_held" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty cardId", () => {
    const result = arsenalToggleSchema.safeParse({ cardId: "", status: "held" });
    expect(result.success).toBe(false);
  });

  it("rejects an arbitrary status value outside the two-state enum", () => {
    const result = arsenalToggleSchema.safeParse({ cardId: "card-1", status: "maybe" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing status", () => {
    const result = arsenalToggleSchema.safeParse({ cardId: "card-1" });
    expect(result.success).toBe(false);
  });
});
