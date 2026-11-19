import { getCollected } from "@/lib/system/collect";
import { SECTIONS, filterSystem, type Selection } from "@/lib/system/design-md";
import { saveDesignSystem } from "@/lib/library";

/** Saves the parts you chose as an independent reference in the library. */
export async function POST(req: Request) {
  const { id, name, selection } = (await req.json().catch(() => ({}))) as { id?: unknown; name?: unknown; selection?: unknown };
  const title = typeof name === "string" ? name.trim() : "";
  if (!title || title.length > 120) return Response.json({ error: "Give it a name (up to 120 characters)." }, { status: 400 });
  const collected = typeof id === "string" ? getCollected(id) : undefined;
  if (!collected) return Response.json({ error: "That collection has expired. Collect the website again." }, { status: 409 });

  // Only whole-number positions in known sections are accepted.
  const sel: Selection = {};
  if (selection && typeof selection === "object")
    for (const section of SECTIONS) {
      const v = (selection as Record<string, unknown>)[section];
      if (Array.isArray(v)) sel[section] = v.filter((n): n is number => Number.isInteger(n) && n >= 0);
    }

  const system = filterSystem(collected.system, sel);
  const kept = sel.examples ?? collected.system.examples.map((_, i) => i);
  const saved = saveDesignSystem({ name: title, system, pageShot: collected.pageShot, shots: kept.map((i) => collected.shots[i] ?? null) });
  return Response.json({ id: saved });
}
