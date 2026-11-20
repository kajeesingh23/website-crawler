import { saveComponent } from "@/lib/db";
import { getSnapshot } from "@/lib/inspector/session";
import { describeForLibrary } from "@/lib/library";
import { applyOverrides, type Overrides } from "@/lib/recreate/document";

type Body = {
  name?: unknown;
  html?: unknown;
  react?: unknown;
  overrides?: Overrides;
  notes?: unknown;
  confidence?: unknown;
  unknowns?: unknown;
  compare?: unknown;
  source?: unknown;
};

/** Saves the chosen version, with the studio's changes applied, to the library. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 120) return Response.json({ error: "Give it a name (up to 120 characters)." }, { status: 400 });
  if (typeof b.html !== "string" || !b.html.includes("pdi-root") || b.html.length > 400_000)
    return Response.json({ error: "Make a version first." }, { status: 400 });

  const { selection: sel, url } = getSnapshot();
  if (!sel?.design) return Response.json({ error: "The selection is gone. Select it again, then save." }, { status: 409 });

  const png = sel.screenshot?.startsWith("data:image/png;base64,")
    ? Buffer.from(sel.screenshot.slice("data:image/png;base64,".length), "base64")
    : undefined;
  const id = saveComponent({
    name,
    ...describeForLibrary(sel, url),
    sourceUrl: url,
    png,
    html: applyOverrides(b.html, b.overrides ?? {}),
    react: typeof b.react === "string" ? b.react : undefined,
    note: b.source === "copy" ? "Exact copy" : "Recreated with Claude",
    observed: { element: { label: sel.label, path: sel.path, width: sel.width, height: sel.height }, design: sel.design, motion: sel.motion },
    // What was reconstructed rather than measured, kept apart from the observed facts.
    inferred: { source: b.source, notes: b.notes, confidence: b.confidence, unknowns: b.unknowns, compare: b.compare, overrides: b.overrides },
  });
  return Response.json({ id });
}
