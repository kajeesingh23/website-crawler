import { selectionAddress } from "@/lib/inspector/session";
import { checkSizes } from "@/lib/inspector/responsive";

/** The current selection at phone, tablet and desktop widths. */
export async function POST() {
  try {
    const { url, path } = await selectionAddress();
    return Response.json({ path, sizes: await checkSizes(url, path) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
