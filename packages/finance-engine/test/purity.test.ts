import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// finance-engine is pure and runtime-dependency-free (handoff §0.5). It may
// use @perq/shared for TYPES only (Step 3 planner types), never at runtime.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("finance-engine purity", () => {
  it("imports @perq/shared only as types", () => {
    const offenders = files(join(__dirname, "../src")).filter((f) =>
      /^\s*(import|export)\s+(?!type\b)[^;]*from\s+["']@perq\/shared["']/m.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
