import { emberEventSchema, type EmberEvent } from "@perq/shared";

/**
 * Incremental parser for the server-sent events PERQ streams
 * (`data: {...}\n\n`). Feed it text chunks as they arrive; it returns the
 * complete, zod-validated events and keeps any partial line buffered.
 */
export function createSseParser() {
  let buffer = "";
  return (chunk: string): EmberEvent[] => {
    buffer += chunk;
    const events: EmberEvent[] = [];
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        const parsed = emberEventSchema.safeParse(JSON.parse(data));
        if (parsed.success) events.push(parsed.data);
      } catch {
        // ignore a malformed block rather than killing the stream
      }
    }
    return events;
  };
}
