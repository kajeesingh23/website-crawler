import { getSnapshot, subscribe, type Snapshot } from "@/lib/inspector/session";

/** Live updates for the Explore page (Server-Sent Events): the full snapshot on every change. */
export function GET(req: Request) {
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      // A closed tab can both abort the request and cancel the stream; writing after either throws.
      let closed = false;
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          stop();
        }
      };
      write(`data: ${JSON.stringify(getSnapshot())}\n\n`);
      const unsubscribe = subscribe((snap: Snapshot) => write(`data: ${JSON.stringify(snap)}\n\n`));
      const ping = setInterval(() => write(": ping\n\n"), 15_000);
      stop = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => stop());
    },
    cancel: () => stop(),
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
