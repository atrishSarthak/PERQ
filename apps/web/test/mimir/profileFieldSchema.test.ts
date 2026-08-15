import { describe, expect, it } from "vitest";
import { profileEditSchema, validateFieldValue } from "@/lib/mimir/profileFieldSchema";

describe("profileEditSchema", () => {
  it("accepts a valid field/value patch request shape", () => {
    const result = profileEditSchema.safeParse({ field: "fuelSpend", value: "6k+" });
    expect(result.success).toBe(true);
  });

  it("rejects a field name that isn't one of the 13 quiz questions", () => {
    const result = profileEditSchema.safeParse({ field: "notAQuestion", value: "x" });
    expect(result.success).toBe(false);
  });
});

describe("validateFieldValue", () => {
  it("validates a bucketed spend field against its enum", () => {
    const result = validateFieldValue("fuelSpend", "1-3k");
    expect(result.success).toBe(true);
  });

  it("rejects an invalid bucket value for a spend field", () => {
    const result = validateFieldValue("fuelSpend", "a lot");
    expect(result.success).toBe(false);
  });

  it("validates the gymMembership bucket field", () => {
    const result = validateFieldValue("gymMembership", "1500-plus");
    expect(result.success).toBe(true);
  });

  it("rejects a gymMembership value outside the bucket enum", () => {
    const result = validateFieldValue("gymMembership", "yes-1500");
    expect(result.success).toBe(false);
  });

  it("rejects more than 2 priorityCategories on edit, same as initial submit", () => {
    const result = validateFieldValue("priorityCategories", ["dining", "travel", "fuel"]);
    expect(result.success).toBe(false);
  });

  it("returns a descriptive error for an unknown field", () => {
    const result = validateFieldValue("notAField", "x");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unknown field");
    }
  });
});
