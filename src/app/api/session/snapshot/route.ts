import { captureForRecreation } from "@/lib/inspector/session";
import { buildDocument } from "@/lib/recreate/document";

/** The exact copy of the current selection in Analyse Website, for Build Prompt and code export. */
export async function GET() {
  try {
    const { sel, snapshot } = await captureForRecreation();
    return Response.json({ html: buildDocument(snapshot, sel.design.appearance.sitsOn, sel.motion) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
