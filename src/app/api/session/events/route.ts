import { getSnapshot, subscribe, type Snapshot } from "@/lib/inspector/session";

/** Live updates for the Explore page (Server-Sent Events): the full snapshot on every change. */
export function GET(req: Request) {
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (snap: Snapshot) => controller.enqueue(enc.encode(`data: ${JSON.stringify(snap)}\n\n`));
      send(getSnapshot());
      const unsubscribe = subscribe(send);
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15_000);
      stop = () => {
        unsubscribe();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        stop();
        controller.close();
      });
    },
    cancel: () => stop(),
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
