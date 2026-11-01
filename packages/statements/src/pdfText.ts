// pdf.js legacy build: runs on Node 20 (unpdf and pdf.js v5 need Node 22's
// global Iterator) and on Vercel's Node runtime. No worker thread: parsing
// runs inline in the request.
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

// Decrypt + extract text from a statement PDF, entirely in memory (handoff
// §5.2). The bytes and password are only ever held in local variables of
// this call; nothing is written anywhere, and neither is logged.

export interface PdfSegment {
  x: number; // left edge, PDF points
  xEnd: number; // right edge
  text: string;
}
export interface PdfLine {
  page: number;
  y: number;
  segments: PdfSegment[];
  text: string; // segments joined, wide gaps shown as "  " so columns stay visible
}

export class StatementPdfError extends Error {
  constructor(readonly code: "bad_password" | "password_required" | "not_pdf" | "image_only") {
    super(code);
    this.name = "StatementPdfError";
  }
}

/** Text a page needs before we treat the PDF as a scanned image (OCR is out of scope). */
const MIN_TEXT_CHARS = 200;

export async function extractPdfLines(bytes: Uint8Array, password?: string): Promise<PdfLine[]> {
  if (!looksLikePdf(bytes)) throw new StatementPdfError("not_pdf");

  // pdf.js may detach the buffer it's given; pass a copy so the caller's
  // bytes stay usable (e.g. a retry with another password).
  let pdf: PDFDocumentProxy;
  try {
    pdf = await getDocument({
      data: new Uint8Array(bytes),
      password: password ?? "",
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      // pdf.js: code 1 = password needed, 2 = incorrect password
      throw new StatementPdfError(e.code === 2 || password ? "bad_password" : "password_required");
    }
    throw new StatementPdfError("not_pdf");
  }

  const lines: PdfLine[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as { str?: string; transform?: number[]; width?: number }[])
        .filter((i) => typeof i.str === "string" && i.str.trim() !== "" && i.transform)
        .map((i) => ({ x: i.transform![4]!, y: i.transform![5]!, w: i.width ?? 0, text: i.str! }));

      // Group items into rows by baseline (within 2pt), top of page first.
      const rows = new Map<number, typeof items>();
      for (const it of items) {
        const key = [...rows.keys()].find((k) => Math.abs(k - it.y) <= 2) ?? it.y;
        rows.set(key, [...(rows.get(key) ?? []), it]);
      }
      for (const [y, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
        const segs = row
          .sort((a, b) => a.x - b.x)
          .map((r) => ({ x: r.x, xEnd: r.x + r.w, text: r.text.trim() }));
        let text = "";
        let prevEnd: number | null = null;
        for (const s of segs) {
          if (prevEnd !== null) text += s.x - prevEnd > 12 ? "  " : " ";
          text += s.text;
          prevEnd = s.xEnd;
        }
        lines.push({ page: p, y, segments: segs, text: text.replace(/\s{3,}/g, "  ").trim() });
      }
    }
  } finally {
    await pdf.destroy();
  }

  const chars = lines.reduce((n, l) => n + l.text.replace(/\s/g, "").length, 0);
  if (chars < MIN_TEXT_CHARS) throw new StatementPdfError("image_only");
  return lines;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

/** Plain text of all pages, one line per row, pages separated (for the LLM prompt). */
export function linesToText(lines: PdfLine[]): string {
  let out = "";
  let page = 0;
  for (const l of lines) {
    if (l.page !== page) {
      page = l.page;
      out += `${out ? "\n" : ""}--- page ${page} ---\n`;
    }
    out += `${l.text}\n`;
  }
  return out;
}
