import { describe, expect, it } from "vitest";
import { SHARED_VERSION } from "../src";

describe("@perq/shared", () => {
  it("exports its version marker", () => {
    expect(SHARED_VERSION).toBe(1);
  });
});
