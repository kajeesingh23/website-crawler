import { saveComponent } from "@/lib/db";
import { captureForRecreation } from "@/lib/inspector/session";
import { describeForLibrary } from "@/lib/library";
import { buildDocument } from "@/lib/recreate/document";

const ASSET_LABELS = new Set(["Image", "Image link", "Image block", "Icon", "Illustration", "Video"]);

/**
 * The one Save for a selection in Analyse Website: its picture, exact copy, measured design and,
 * if explored, its animation, as a single Library item.
 */
export async function POST(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: unknown };
  const title = typeof name === "string" ? name.trim() : "";
  if (!title || title.length > 120) return Response.json({ error: "Give it a name (up to 120 characters)." }, { status: 400 });
  try {
    const { sel, url, snapshot } = await captureForRecreation();
    const png = sel.screenshot?.startsWith("data:image/png;base64,") ? Buffer.from(sel.screenshot.slice(22), "base64") : undefined;
    const id = saveComponent({
      kind: ASSET_LABELS.has(sel.label) ? "asset" : "component",
      name: title,
      ...describeForLibrary(sel, url),
      sourceUrl: url,
      png,
      html: buildDocument(snapshot, sel.design.appearance.sitsOn, sel.motion),
      note: "Exact copy",
      observed: { element: { label: sel.label, path: sel.path, width: sel.width, height: sel.height }, design: sel.design, motion: sel.motion },
      inferred: {},
    });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
