import { liveCopy } from "@/lib/captures";

/** The exact copy of the current selection in Analyse Website, for Build Prompt and code export. */
export async function GET() {
  try {
    return Response.json({ html: (await liveCopy()).html });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
