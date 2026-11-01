import { describe, expect, it } from "vitest";
import { averageMonthlySpend } from "../src";

const s = (id: string, card: string, date: string, reconciled = true) => ({ id, cardAccountId: card, statementDate: date, reconciled });
const t = (statementId: string, amount: number, category: string, direction: "debit" | "credit" = "debit", kind = "purchase") => ({ statementId, amount, category, direction, kind });

describe("averageMonthlySpend", () => {
  it("averages each card's last 3 reconciled cycles and adds cards", () => {
    const out = averageMonthlySpend(
      [s("a1", "a", "2026-08-15"), s("a2", "a", "2026-09-15"), s("a3", "a", "2026-10-15"), s("a0", "a", "2026-07-15"), s("b1", "b", "2026-10-20"), s("bx", "b", "2026-09-20", false)],
      [
        t("a1", 3000, "food_delivery"), t("a2", 6000, "food_delivery"), t("a3", 3000, "food_delivery"), t("a0", 90000, "food_delivery"),
        t("a3", 600, "food_delivery", "credit", "refund"), t("a3", 15000, "transfers"), t("a2", 500, "fees_interest", "debit", "fee"),
        t("b1", 2000, "groceries"), t("bx", 9999, "groceries"), t("a3", 20000, "other", "credit", "payment"),
      ]
    );
    expect(out.perMonth).toEqual({ food_delivery: 3800, groceries: 2000 });
    expect(out).toMatchObject({ total: 5800, statementCount: 4, dataThrough: "2026-10-20" });
  });
});
