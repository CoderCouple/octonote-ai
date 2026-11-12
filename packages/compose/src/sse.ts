import type { ComposeEvent } from "./agent.js";

const encoder = new TextEncoder();

/** Server side: compose events as a server-sent-events body. */
export function toEventStream(events: AsyncIterable<ComposeEvent>): ReadableStream<Uint8Array> {
  const iterator = events[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) return controller.close();
      controller.enqueue(encoder.encode(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** Client side: reads compose events from a fetch Response's server-sent-events body. */
export async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ComposeEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield JSON.parse(data) as ComposeEvent;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
