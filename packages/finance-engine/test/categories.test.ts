import { describe, expect, it } from "vitest";
import { categoriseOne, merchantsNeedingAi, normalizeMerchant, stripCardNumbers, type TxnCategory } from "../src";

// [raw descriptor, direction, expected merchant, expected kind, expected category]
const TABLE: [string, "debit" | "credit", string, string, TxnCategory][] = [
  ["SWIGGY*ORDER BANGALORE", "debit", "SWIGGY", "purchase", "food_delivery"],
  ["PAYU*ZOMATO GURGAON", "debit", "ZOMATO", "purchase", "food_delivery"],
  ["ZOMATO ONLINE ORDER", "debit", "ZOMATO", "purchase", "food_delivery"],
  ["RAZ*EATSURE FOODS", "debit", "EATSURE FOODS", "purchase", "food_delivery"],
  ["DOMINOS PIZZA 1123 PUNE", "debit", "DOMINOS PIZZA", "purchase", "food_delivery"],
  ["AMAZON PAY INDIA PRIVA BANGALORE", "debit", "AMAZON PAY INDIA", "purchase", "online_shopping"],
  ["FLIPKART INTERNET PVT LTD", "debit", "FLIPKART", "purchase", "online_shopping"],
  ["MYNTRA DESIGNS BANGALORE", "debit", "MYNTRA", "purchase", "online_shopping"],
  ["PAYTM*AJIO", "debit", "AJIO", "purchase", "online_shopping"],
  ["NYKAA E-RETAIL MUMBAI", "debit", "NYKAA E", "purchase", "online_shopping"],
  ["UPI-BLINKIT-COMMERCE PVT LTD", "debit", "BLINKIT", "purchase", "groceries"],
  ["ZEPTO MARKETPLACE PVT LTD MUMBAI", "debit", "ZEPTO", "purchase", "groceries"],
  ["BIGBASKET INNOVATIVE RETAIL", "debit", "BIGBASKET", "purchase", "groceries"],
  ["UPI-SWIGGY INSTAMART-6378221", "debit", "SWIGGY INSTAMART", "purchase", "groceries"],
  ["DMART AVENUE SUPERMARTS", "debit", "DMART AVENUE SUPERMARTS", "purchase", "groceries"],
  ["IOCL PETROL PUMP KORAMANGALA", "debit", "IOCL PETROL PUMP", "purchase", "fuel"],
  ["HPCL FUEL STATION PUNE", "debit", "HPCL FUEL STATION", "purchase", "fuel"],
  ["BHARAT PETROLEUM CORP LTD", "debit", "BHARAT PETROLEUM", "purchase", "fuel"],
  ["SHELL INDIA MKT", "debit", "SHELL INDIA MKT", "purchase", "fuel"],
  ["AIRTEL PAYMENTS BANK MUMBAI", "debit", "AIRTEL", "purchase", "bills"],
  ["BESCOM ELECTRICITY BILL", "debit", "BESCOM ELECTRICITY BILL", "purchase", "bills"],
  ["JIO PREPAID RECHARGE", "debit", "JIO PREPAID RECHARGE", "purchase", "bills"],
  ["NETFLIX.COM SINGAPORE", "debit", "NETFLIX", "purchase", "bills"],
  ["SPOTIFY AB STOCKHOLM", "debit", "SPOTIFY AB", "purchase", "bills"],
  ["BBPS*TATA PLAY", "debit", "TATA PLAY", "purchase", "bills"],
  ["MAKEMYTRIP INDIA PVT LTD", "debit", "MAKEMYTRIP INDIA", "purchase", "travel"],
  ["IRCTC E TICKETING NEW DELHI", "debit", "IRCTC", "purchase", "travel"],
  ["INDIGO 6E 5RTY77 GURGAON", "debit", "INDIGO 6E 5RTY77", "purchase", "travel"],
  ["AIR INDIA LTD", "debit", "AIR INDIA", "purchase", "travel"],
  ["UBER INDIA SYSTEMS", "debit", "UBER INDIA SYSTEMS", "purchase", "travel"],
  ["PVR CINEMAS FORUM MALL", "debit", "PVR CINEMAS", "purchase", "entertainment"],
  ["BOOKMYSHOW MUMBAI", "debit", "BOOKMYSHOW", "purchase", "entertainment"],
  ["APOLLO PHARMACY HSR LAYOUT", "debit", "APOLLO PHARMACY", "purchase", "health"],
  ["TATA 1MG HEALTHCARE", "debit", "TATA 1MG HEALTHCARE", "purchase", "health"],
  ["UDEMY ONLINE COURSES", "debit", "UDEMY COURSES", "purchase", "education"],
  ["NOBROKER RENT PAY", "debit", "NOBROKER RENT PAY", "purchase", "rent"],
  ["THIRD WAVE COFFEE BANGALORE", "debit", "THIRD WAVE COFFEE", "purchase", "dining"],
  ["UPI-CHAI POINT-9876543210@YBL", "debit", "CHAI POINT", "purchase", "dining"],
  ["UPI-RAMESH SHARMA-9812345678@OKAXIS", "debit", "RAMESH SHARMA", "purchase", "upi"],
  ["PAYMENT RECEIVED - THANK YOU", "credit", "PAYMENT RECEIVED THANK YOU", "payment", "transfers"],
  ["NEFT PAYMENT RECEIVED", "credit", "NEFT PAYMENT RECEIVED", "payment", "transfers"],
  ["REFUND AMAZON PAY INDIA PRIVA", "credit", "REFUND AMAZON PAY INDIA", "refund", "online_shopping"],
  ["CASHBACK CREDITED", "credit", "CASHBACK CREDITED", "cashback", "other"],
  ["LATE PAYMENT FEE", "debit", "LATE PAYMENT FEE", "fee", "fees_interest"],
  ["IGST ON FEES @18%", "debit", "IGST ON FEES", "fee", "fees_interest"],
  ["MARKUP FEE ON INTL TXN", "debit", "MARKUP FEE ON INTL TXN", "fee", "fees_interest"],
  ["FINANCE CHARGES", "debit", "FINANCE CHARGES", "interest", "fees_interest"],
  ["EMI 3/6 IPHONE 15", "debit", "EMI 3 6 IPHONE", "emi", "emi"],
  ["AUTOPAY SI 4532015112830366 GOOGLE PLAY", "debit", "AUTOPAY SI GOOGLE PLAY", "purchase", "bills"],
];

describe("categorisation table (§5.5)", () => {
  for (const [raw, dir, merchant, kind, category] of TABLE) {
    it(`${raw} → ${category}`, () => {
      const c = categoriseOne({ description: raw, direction: dir });
      expect({ merchant: c.merchantNormalized, kind: c.kind, category: c.category }).toEqual({ merchant, kind, category });
    });
  }
  it("covers at least 40 descriptors", () => expect(TABLE.length).toBeGreaterThanOrEqual(40));
});

describe("categorisation rules", () => {
  it("strips full card numbers to the last 4 (§12)", () => {
    expect(stripCardNumbers("AUTOPAY 4532 0151 1283 0366 X")).toBe("AUTOPAY XXXX0366 X");
    expect(stripCardNumbers("ORDER 123456 PIN 560034")).toBe("ORDER 123456 PIN 560034");
    expect(categoriseOne({ description: "SI 4532015112830366 NETFLIX", direction: "debit" }).descriptionRaw).not.toMatch(/\d{13,}/);
  });

  it("flags international spend", () => {
    expect(categoriseOne({ description: "NETFLIX.COM SINGAPORE", direction: "debit" }).isInternational).toBe(true);
    expect(categoriseOne({ description: "SWIGGY*ORDER BANGALORE", direction: "debit" }).isInternational).toBe(false);
  });

  it("precedence: kind > user override > rule > shared cache > AI", () => {
    const m = normalizeMerchant("BLUE TOKAI COFFEE");
    const unknown = { description: "MYSTERY MART 22", direction: "debit" as const };
    const mm = normalizeMerchant(unknown.description);
    // kind beats an override
    expect(categoriseOne({ description: "LATE PAYMENT FEE", direction: "debit" }, { userOverrides: new Map([["LATE PAYMENT FEE", "other"]]) }).category).toBe("fees_interest");
    // override beats a rule
    expect(categoriseOne({ description: "BLUE TOKAI COFFEE", direction: "debit" }, { userOverrides: new Map([[m, "groceries"]]) })).toMatchObject({ category: "groceries", categorySource: "user" });
    // rule beats cache
    expect(categoriseOne({ description: "SWIGGY*ORDER", direction: "debit" }, { sharedCache: new Map([["SWIGGY", "other"]]) }).categorySource).toBe("rule");
    // cache beats AI; AI used when nothing else knows
    expect(categoriseOne(unknown, { sharedCache: new Map([[mm, "health"]]), aiResults: new Map([[mm, "dining"]]) })).toMatchObject({ category: "health", categorySource: "cache" });
    expect(categoriseOne(unknown, { aiResults: new Map([[mm, "dining"]]) })).toMatchObject({ category: "dining", categorySource: "ai" });
    expect(categoriseOne(unknown)).toMatchObject({ category: "other" });
  });

  it("only sends unknown merchants to the AI batch (names only)", () => {
    const need = merchantsNeedingAi([
      { description: "SWIGGY*ORDER", direction: "debit" },
      { description: "LATE PAYMENT FEE", direction: "debit" },
      { description: "MYSTERY MART 22", direction: "debit" },
      { description: "MYSTERY MART 99", direction: "debit" },
    ]);
    expect(need).toEqual(["MYSTERY MART"]);
  });
});
