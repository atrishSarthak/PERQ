import type { EmberEvent } from "@perq/shared";

// Server-sent events helper shared by the Ember streaming routes.
export function sseResponse(run: (emit: (e: EmberEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: EmberEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        await run(emit);
      } catch (err) {
        console.error("[sse]", err);
        emit({ type: "error", message: "Something went wrong. Try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
