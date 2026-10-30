import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_KEYS, catalogFileSchema } from "../src";

const raw = JSON.parse(readFileSync(resolve(__dirname, "../../db/data/cards.json"), "utf-8"));

describe("card catalogue (packages/db/data/cards.json)", () => {
  const cards = catalogFileSchema.parse(raw);

  it("has 40 cards with unique ids", () => {
    expect(cards).toHaveLength(40);
  });

  it("gives every card a source link and a checked date", () => {
    for (const c of cards) {
      expect(c.sourceUrl).toMatch(/^https:\/\//);
      expect(c.sourceUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has a rate for every category on every verified card", () => {
    for (const c of cards.filter((c) => c.verified)) {
      expect(Object.keys(c.rewardRates).sort()).toEqual([...CATEGORY_KEYS].sort());
    }
  });

  it("only marks RuPay cards as working on UPI, and gives UPI rewards only to those", () => {
    for (const c of cards) {
      if (c.upiEnabled) expect(c.networks).toContain("RuPay");
      if ((c.rewardRates.upi ?? 0) > 0) expect(c.upiEnabled).toBe(true);
    }
  });

  it("gives secured cards a secured type and lifetime-free cards ₹0 fees", () => {
    for (const c of cards) {
      if (c.bucket === "secured") expect(c.cardType).toBe("secured");
      if (c.lifetimeFree) expect(c.joiningFee + c.annualFee).toBe(0);
    }
  });

  it("explains why each unverified card is unverified", () => {
    for (const c of cards.filter((c) => !c.verified)) expect(c.rewardNotes).toMatch(/^UNVERIFIED/);
  });

  it("keeps the handoff's composition: 6 secured, 6 RuPay-on-UPI, 8 mid-tier", () => {
    const count = (b: string) => cards.filter((c) => c.bucket === b).length;
    expect(count("secured")).toBe(6);
    expect(count("rupay_upi")).toBe(6);
    expect(count("mid_tier")).toBe(8);
  });
});
