import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dayOf, feeAnniversaryMonth, matchCard } from "../src";

const catalogue = (JSON.parse(readFileSync(resolve(__dirname, "../../db/data/cards.json"), "utf-8")) as { id: string; name: string; issuer: string }[]).map(
  ({ id, name, issuer }) => ({ id, name, issuer })
);

describe("matchCard (§5.6)", () => {
  it("matches the synthetic statements' printed names to catalogue cards", () => {
    expect(matchCard({ issuer: "HDFC Bank", cardName: "Millennia", last4: "4821" }, catalogue, []).catalogueCardId).toBe("hdfc-millennia");
    expect(matchCard({ issuer: "SBI Card", cardName: "CASHBACK SBI Card", last4: "7710" }, catalogue, []).catalogueCardId).toBe("sbi-cashback");
    expect(matchCard({ issuer: "Axis Bank", cardName: "Axis Bank ACE Credit Card", last4: "0093" }, catalogue, []).catalogueCardId).toBe("axis-ace");
  });

  it("doesn't guess when the name is ambiguous or unknown, but still offers candidates", () => {
    const m = matchCard({ issuer: "HDFC Bank", cardName: "Credit Card", last4: "1111" }, catalogue, []);
    expect(m.catalogueCardId).toBeNull();
    expect(m.candidates.length).toBeGreaterThan(0);
    expect(m.candidates.every((c) => /HDFC/i.test(c.issuer))).toBe(true);
  });

  it("finds the user's existing account by issuer + last4 (next month's statement)", () => {
    const accounts = [{ id: "acc1", issuer: "HDFC Bank", last4: "4821", cardId: "hdfc-millennia", cardLabel: "Millennia" }];
    expect(matchCard({ issuer: "HDFC BANK", cardName: "Something", last4: "4821" }, catalogue, accounts)).toMatchObject({
      accountId: "acc1",
      catalogueCardId: "hdfc-millennia",
      confidence: 1,
    });
    expect(matchCard({ issuer: "SBI Card", cardName: "x", last4: "4821" }, catalogue, accounts).accountId).toBeNull();
  });

  it("infers days and the fee anniversary month", () => {
    expect(dayOf("2026-10-15")).toBe(15);
    expect(feeAnniversaryMonth([{ date: "2026-03-02", description: "ANNUAL FEE", direction: "debit" }])).toBe(3);
    expect(feeAnniversaryMonth([{ date: "2026-03-02", description: "SWIGGY", direction: "debit" }])).toBeNull();
  });
});
