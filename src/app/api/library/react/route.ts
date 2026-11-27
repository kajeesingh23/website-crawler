import fs from "node:fs";
import path from "node:path";
import { addVersion, dataDir } from "@/lib/db";
import { getItem } from "@/lib/library";
import { askClaude, NotConnected } from "@/lib/recreate/claude";

/**
 * Asks Claude to rewrite a saved item's exact copy as idiomatic React. Needs a Claude key.
 * The result is saved as a new version next to the unchanged HTML; nothing is overwritten.
 */
export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  const item = typeof id === "string" ? getItem(id) : null;
  if (!item?.code.html) return Response.json({ error: "This item has no copy to convert." }, { status: 404 });
  try {
    const shot = item.thumbnail && path.join(dataDir, item.thumbnail);
    const result = await askClaude(
      { frozenCopy: item.code.html, design: item.observed.design, motion: item.observed.motion, original: shot && fs.existsSync(shot) ? fs.readFileSync(shot) : undefined },
      { kind: "create" },
    );
    if (!result.react) return Response.json({ error: "Claude didn't return a React component. Try again." }, { status: 502 });
    addVersion(item.id, { html: item.code.html, react: result.react }, "React by Claude", "html-css, react");
    return Response.json({ react: result.react });
  } catch (e) {
    if (e instanceof NotConnected)
      return Response.json(
        { error: "Claude isn't connected, so React can't be written by AI. Add ANTHROPIC_API_KEY to .env.local and restart the app (see Settings). The React tab still has the no-AI version." },
        { status: 412 },
      );
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
