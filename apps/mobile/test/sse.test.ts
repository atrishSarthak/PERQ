import { describe, expect, it } from "vitest";
import { createSseParser } from "../src/lib/sse";

describe("SSE parser", () => {
  it("parses events split across arbitrary chunk boundaries", () => {
    const feed = createSseParser();
    const raw = 'data: {"type":"step","label":"Checked your answers"}\n\ndata: {"type":"chunk","text":"Hi "}\n\ndata: {"type":"done"}\n\n';
    const out = [];
    for (let i = 0; i < raw.length; i += 7) out.push(...feed(raw.slice(i, i + 7)));
    expect(out).toEqual([
      { type: "step", label: "Checked your answers" },
      { type: "chunk", text: "Hi " },
      { type: "done" },
    ]);
  });

  it("skips malformed or unknown events", () => {
    const feed = createSseParser();
    expect(feed('data: {nope}\n\ndata: {"type":"mystery"}\n\ndata: {"type":"done"}\n\n')).toEqual([{ type: "done" }]);
  });
});
