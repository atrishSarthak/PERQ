/**
 * T13 / D3 note: POST-triggered SSE can't use the browser's EventSource
 * (GET-only) — this reads the raw ReadableStream from fetch() and parses
 * the `data: {...}\n\n` frames by hand. Buffers across chunk boundaries
 * since a single `data: ...\n\n` frame is not guaranteed to arrive in one
 * read() call.
 *
 * Feature-agnostic despite living under quiz/ — shared by the quiz-submit
 * SSE stream and MimirChatContext's streamed chat replies. Not moved to a
 * more neutral location to avoid the import churn; feel free to relocate
 * if a third consumer shows up.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const json = dataLine.slice("data: ".length);
        try {
          yield JSON.parse(json);
        } catch {
          // malformed frame — skip rather than crash the whole stream
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
