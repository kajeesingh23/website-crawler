import { saveVariation } from "@/lib/library";
import { renderAndMeasure } from "@/lib/recreate/render";

/** Saves a customised copy as a new variation (with a fresh picture of it). The original stays as it was. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; name?: unknown; html?: unknown; width?: unknown; changes?: unknown };
  if (typeof b.id !== "string" || typeof b.name !== "string" || typeof b.html !== "string")
    return Response.json({ error: "Nothing to save." }, { status: 400 });
  try {
    // The picture is taken in the invisible browser with scripts off; a failure only means no thumbnail.
    const shot = await renderAndMeasure(b.html, typeof b.width === "number" ? b.width : 600).catch(() => null);
    const id = saveVariation(b.id, { name: b.name, html: b.html, png: shot?.png, changes: b.changes });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
