import { describe, expect, it } from "vitest";
import { inferPlanCategory, missingForPlan, parseProductLink, parseRupeeInput } from "../src";

describe("inferPlanCategory", () => {
  it("guesses from the item name", () => {
    expect(inferPlanCategory("iPhone 15")).toBe("online_shopping");
    expect(inferPlanCategory("Goa trip package")).toBe("travel");
    expect(inferPlanCategory("Concert tickets")).toBe("entertainment");
    expect(inferPlanCategory("Something odd")).toBe("online_shopping");
  });
});

describe("parseRupeeInput", () => {
  it("reads typed amounts", () => {
    expect(parseRupeeInput("₹59,900")).toBe(59900);
    expect(parseRupeeInput("59900.40")).toBe(59900);
    expect(parseRupeeInput("abc")).toBeNull();
    expect(parseRupeeInput("0")).toBeNull();
  });
});

describe("parseProductLink", () => {
  it("reads merchant and item from a Flipkart URL without fetching it", () => {
    expect(parseProductLink("https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W")).toEqual({
      merchant: "Flipkart",
      itemName: "Apple iPhone 15 Black 128 GB",
    });
  });
  it("reads an Amazon URL", () => {
    expect(parseProductLink("https://www.amazon.in/Samsung-Galaxy-Ultra-Titanium-Storage/dp/B0CS5XW6TN/ref=sr_1_3")).toEqual({
      merchant: "Amazon",
      itemName: "Samsung Galaxy Ultra Titanium Storage",
    });
  });
  it("falls back to the domain name and handles slug-less links", () => {
    expect(parseProductLink("https://shop.example.com/")).toEqual({ merchant: "Example", itemName: null });
    expect(parseProductLink("not a url")).toBeNull();
    expect(parseProductLink("javascript:alert(1)")).toBeNull();
  });
});

describe("missingForPlan", () => {
  it("asks for what isn't there", () => {
    expect(missingForPlan({ offers: [], emiOptions: [] })).toEqual(["item", "price"]);
    expect(missingForPlan({ item: { name: "Phone" }, offers: [], emiOptions: [] })).toEqual(["price"]);
  });
});
