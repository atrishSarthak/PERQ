// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractFromImage, extractFromText, normaliseExtraction, priceFromText, ruleExtract } from "@/lib/plans/extract";

vi.mock("@perq/ai", async (orig) => {
  const real = await orig<typeof import("@perq/ai")>();
  return { ...real, extractStructuredJson: vi.fn() };
});
import { extractStructuredJson } from "@perq/ai";
const mockedExtract = vi.mocked(extractStructuredJson);

describe("priceFromText", () => {
  it("reads only prices the user wrote", () => {
    expect(priceFromText("Can I get the ₹45k phone?")).toBe(45000);
    expect(priceFromText("iPhone 15 for 59,900")).toBe(59900);
    expect(priceFromText("a 1.2 lakh laptop")).toBe(120000);
    expect(priceFromText("Rs. 24999 laptop")).toBe(24999);
    expect(priceFromText("Should I buy the new iPhone?")).toBeNull();
    expect(priceFromText("iPhone 15")).toBeNull(); // a model number isn't a price
  });
});

describe("ruleExtract", () => {
  it("pulls an item name and a stated price", () => {
    expect(ruleExtract("Can I get the ₹45k phone?")).toMatchObject({ itemName: "phone", price: 45000 });
    expect(ruleExtract("should I buy the new iPhone 15")).toMatchObject({ itemName: "iPhone 15", price: null });
  });
});

describe("normaliseExtraction", () => {
  it("keeps valid offers, drops broken ones with a note, and asks for a missing price", () => {
    const r = normaliseExtraction(
      {
        itemName: "Apple iPhone 15 (128 GB) - Black",
        price: null,
        merchant: "Flipkart",
        offers: [
          { type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1500 off on HDFC Bank cards", percent: null },
          { type: "mystery", rawText: "Special price" },
        ],
        emiOptions: [{ tenureMonths: 6, noCost: true, processingFee: 199 }, { tenureMonths: 0 }],
      },
      "screenshot"
    );
    expect(r.draft.item).toEqual({ name: "Apple iPhone 15 (128 GB) - Black", category: "online_shopping" });
    expect(r.draft.offers).toEqual([{ type: "instant_discount", bank: "HDFC", flat: 1500, rawText: "₹1500 off on HDFC Bank cards" }]);
    expect(r.draft.emiOptions).toEqual([{ tenureMonths: 6, noCost: true, processingFee: 199 }]);
    expect(r.missing).toEqual(["price"]);
    expect(r.notes[0]).toBe("I couldn't find a price. Please type it.");
    expect(r.notes.some((n) => n.includes("Special price"))).toBe(true);
  });
});

describe("extraction runs", () => {
  const deps = { apiKey: "test-key", userId: "u1", logRun: vi.fn(async () => {}) };

  it("chat: a price the user didn't write is never kept, even if the model invents one", async () => {
    mockedExtract.mockResolvedValueOnce({ itemName: "iPhone 15", price: 69900, offers: [], emiOptions: [] });
    const r = await extractFromText("Should I buy the iPhone 15?", deps);
    expect(r.draft.price).toBeUndefined();
    expect(r.missing).toEqual(["price"]);
    expect(r.notes[0]).toBe("You didn't mention a price. What does it cost?");
  });

  it("chat: falls back to rules when the model fails, and with Gemini off", async () => {
    mockedExtract.mockRejectedValueOnce(new Error("quota"));
    expect((await extractFromText("can I get the ₹45k phone", deps)).draft).toMatchObject({ price: 45000, item: { name: "phone" } });
    expect((await extractFromText("can I get the ₹45k phone", { ...deps, apiKey: null })).draft.price).toBe(45000);
  });

  it("image: sends the image inline and logs only the task, never the image", async () => {
    mockedExtract.mockResolvedValueOnce({ itemName: "Laptop", price: 24999, offers: [], emiOptions: [] });
    const img = "A".repeat(200);
    const r = await extractFromImage(img, "image/jpeg", deps);
    expect(r.draft).toMatchObject({ price: 24999, item: { name: "Laptop" } });
    expect(mockedExtract.mock.calls.at(-1)![4]).toEqual({ data: img, mimeType: "image/jpeg" });
    const logged = JSON.stringify(deps.logRun.mock.calls.at(-1));
    expect(logged).toContain("plan_extract_image");
    expect(logged).not.toContain(img);
  });

  it("image: says it can't read screenshots with Gemini off", async () => {
    const r = await extractFromImage("A".repeat(200), "image/png", { ...deps, apiKey: null });
    expect(r.missing).toEqual(["item", "price"]);
  });
});

// Locked (§2, §12): no shop page is fetched by the server; screenshots aren't stored.
const ROOT = resolve(__dirname, "../../../..");
function files(p: string): string[] {
  const abs = join(ROOT, p);
  return statSync(abs).isDirectory() ? readdirSync(abs).flatMap((f) => files(join(p, f))) : [abs];
}
const PLANNER = ["apps/web/app/api/plans", "apps/web/lib/plans", "packages/finance-engine/src/planner", "packages/shared/src/plannerInput.ts"];

describe("planner privacy", () => {
  const sources = PLANNER.flatMap(files).filter((f) => /\.tsx?$/.test(f));
  it("never fetches a URL server-side (no scraping)", () => {
    const offenders = sources.filter((f) => /\bfetch\(|fetchPage|axios|got\(|https?\.get\(|firecrawl/i.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });
  it("never writes an image to disk, storage or the DB", () => {
    const offenders = sources.filter((f) => /\b(writeFile|writeFileSync|createWriteStream|mkdtemp|put\(|upload\()/.test(readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
    const db = sources.filter((f) => /imageBase64/.test(readFileSync(f, "utf-8")) && /\.insert\(|\.update\(/.test(readFileSync(f, "utf-8")));
    expect(db).toEqual([]);
  });
  it("never logs the image or message", () => {
    const logs = sources.flatMap((f) => readFileSync(f, "utf-8").split("\n").filter((l) => /console\.(log|info|warn|error|debug)/.test(l)));
    for (const l of logs) expect(l).not.toMatch(/imageBase64|\bimage\b|\btext\b|body\.data/i); // err.message (Gemini error text) is fine
  });
});
