import { describe, expect, it } from "vitest";
import { parseSSEStream } from "@/app/quiz/parseSSEStream";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of parseSSEStream(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseSSEStream", () => {
  it("parses a single complete frame", async () => {
    const stream = streamFromChunks([`data: {"type":"step","label":"a"}\n\n`]);
    expect(await collect(stream)).toEqual([{ type: "step", label: "a" }]);
  });

  it("parses multiple frames in one chunk", async () => {
    const stream = streamFromChunks([
      `data: {"type":"step","label":"a"}\n\ndata: {"type":"step","label":"b"}\n\n`,
    ]);
    expect(await collect(stream)).toEqual([
      { type: "step", label: "a" },
      { type: "step", label: "b" },
    ]);
  });

  it("parses a frame split across multiple chunk boundaries (not guaranteed to arrive whole)", async () => {
    const full = `data: {"type":"step","label":"a"}\n\n`;
    const stream = streamFromChunks([full.slice(0, 10), full.slice(10, 20), full.slice(20)]);
    expect(await collect(stream)).toEqual([{ type: "step", label: "a" }]);
  });

  it("skips a malformed frame without crashing the stream", async () => {
    const stream = streamFromChunks([
      `data: not-json\n\ndata: {"type":"done"}\n\n`,
    ]);
    expect(await collect(stream)).toEqual([{ type: "done" }]);
  });

  it("ignores non-data lines within a frame", async () => {
    const stream = streamFromChunks([`: comment\ndata: {"type":"done"}\n\n`]);
    expect(await collect(stream)).toEqual([{ type: "done" }]);
  });

  it("returns an empty array for an empty stream", async () => {
    const stream = streamFromChunks([]);
    expect(await collect(stream)).toEqual([]);
  });
});
