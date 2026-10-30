import { describe, expect, it } from "vitest";
import { FINANCE_ENGINE_VERSION } from "../src";

describe("@perq/finance-engine", () => {
  it("exports its version marker", () => {
    expect(FINANCE_ENGINE_VERSION).toBe(1);
  });
});
