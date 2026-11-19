import { saveItem } from "@/lib/db";
import { getSnapshot } from "@/lib/inspector/session";

/** Saves the animation of the current selection to the library, under a name you choose. */
export async function POST(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: unknown };
  const title = typeof name === "string" ? name.trim() : "";
  if (!title || title.length > 120) return Response.json({ error: "Give it a name (up to 120 characters)." }, { status: 400 });

  const { selection: sel, url } = getSnapshot();
  if (!sel?.motion) return Response.json({ error: "Explore the animation first." }, { status: 409 });

  const png = sel.screenshot?.startsWith("data:image/png;base64,")
    ? Buffer.from(sel.screenshot.slice("data:image/png;base64,".length), "base64")
    : undefined;
  const id = saveItem({
    kind: "animation",
    name: title,
    sourceUrl: url,
    png,
    observed: { element: { label: sel.label, path: sel.path, width: sel.width, height: sel.height }, motion: sel.motion },
  });
  return Response.json({ id });
}
