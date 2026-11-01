import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { extractPdfLines, linesToText, StatementPdfError } from "../src/pdfText";

const dir = resolve(__dirname, "../fixtures/synthetic");
const pdfA = new Uint8Array(readFileSync(`${dir}/A-hdfc-2026-10-15.pdf`));

async function blankPdf(): Promise<Uint8Array> {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise((r) => doc.on("end", r));
  doc.rect(50, 50, 200, 200).fill("#888"); // a "scan": shapes, no text
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

describe("extractPdfLines", () => {
  it("decrypts with the right password and keeps line order", async () => {
    const lines = await extractPdfLines(pdfA, "ARJU1503");
    const text = linesToText(lines);
    expect(text.indexOf("Account Summary")).toBeLessThan(text.indexOf("Transaction Description"));
    expect(text).toMatch(/Total Dues : Rs\. [\d,]+\.\d\d/);
    expect(lines.some((l) => /^\d\d\/\d\d\/2026\s+\S/.test(l.text))).toBe(true);
  });

  it("reports a wrong password as bad_password and a missing one as password_required", async () => {
    await expect(extractPdfLines(pdfA, "WRONG123")).rejects.toMatchObject({ code: "bad_password" });
    await expect(extractPdfLines(pdfA)).rejects.toMatchObject({ code: "password_required" });
  });

  it("rejects non-PDFs and image-only PDFs", async () => {
    await expect(extractPdfLines(new TextEncoder().encode("hello"), "x")).rejects.toMatchObject({ code: "not_pdf" });
    await expect(extractPdfLines(await blankPdf())).rejects.toBeInstanceOf(StatementPdfError);
    await expect(extractPdfLines(await blankPdf())).rejects.toMatchObject({ code: "image_only" });
  });

  it("does not consume the caller's buffer (retry with another password works)", async () => {
    await expect(extractPdfLines(pdfA, "WRONG123")).rejects.toThrow();
    await expect(extractPdfLines(pdfA, "ARJU1503")).resolves.toBeTruthy();
  });
});
