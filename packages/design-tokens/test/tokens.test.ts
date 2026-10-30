import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokensCss } from "../src/cssVars";
import { contrastRatio } from "../src/contrast";
import { palette, themes } from "../src/tokens";

const AA = 4.5;
const AA_LARGE = 3;

describe("design tokens", () => {
  it("tokens.css is in sync with tokens.ts (run build:css after editing tokens.ts)", () => {
    const onDisk = readFileSync(resolve(__dirname, "../src/tokens.css"), "utf-8");
    expect(onDisk).toBe(buildTokensCss());
  });

  for (const name of ["dark", "light"] as const) {
    const t = themes[name];
    it(`${name}: body and muted text pass AA on background and surface`, () => {
      for (const bg of [t.bg, t.surface, t.surface2]) {
        expect(contrastRatio(t.text, bg)).toBeGreaterThanOrEqual(AA);
        expect(contrastRatio(t.textMuted, bg)).toBeGreaterThanOrEqual(AA);
      }
    });
    it(`${name}: links and ember accent pass AA on background`, () => {
      expect(contrastRatio(t.link, t.bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(t.ember, t.bg)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(t.ember, t.surface)).toBeGreaterThanOrEqual(AA);
    });
    it(`${name}: text on primary and ember fills passes AA`, () => {
      expect(contrastRatio(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(t.onEmber, t.ember)).toBeGreaterThanOrEqual(AA);
    });
    it(`${name}: success/danger are readable for ₹ figures (AA large)`, () => {
      expect(contrastRatio(t.success, t.bg)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(t.danger, t.bg)).toBeGreaterThanOrEqual(AA_LARGE);
    });
  }

  it("light theme never uses chartreuse as an accent", () => {
    expect(Object.values(themes.light)).not.toContain(palette.chartreuse);
  });
});
