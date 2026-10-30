import { describe, expect, it } from "vitest";
import { ungroundedRupees } from "../src/ember";

describe("ungroundedRupees", () => {
  const outputs = [{ ongoingValue: 13680, fee: { payable: 0, annualFee: 1179 }, reason: "10% back (₹5,400/yr)" }];

  it("accepts rupee amounts that appear in tool outputs, formatted or not", () => {
    expect(ungroundedRupees("It earns about ₹13,680 a year, ₹5,400 of it on food delivery; fee ₹1,179.", outputs)).toEqual([]);
  });

  it("flags an amount the tools never produced", () => {
    expect(ungroundedRupees("You'd save ₹14,000 a year.", outputs)).toEqual([14000]);
  });

  it("handles Rs. and INR spellings and ignores percentages", () => {
    expect(ungroundedRupees("Rs. 13680 and INR 999; 10% back", outputs)).toEqual([999]);
  });
});
