import { Invalid, saveLiveSelection } from "@/lib/captures";

/** The one Save for a selection in Analyse Website (see saveLiveSelection). */
export async function POST(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: unknown };
  try {
    return Response.json(await saveLiveSelection(typeof name === "string" ? name : ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof Invalid ? 400 : 409 });
  }
}
