import { captureForRecreation } from "@/lib/inspector/session";
import { buildDocument, compareDesigns, type Recreation } from "@/lib/recreate/document";
import { renderAndMeasure } from "@/lib/recreate/render";
import { askClaude, NotConnected } from "@/lib/recreate/claude";

type Body = { action?: string; current?: Partial<Recreation>; instruction?: unknown };

const dataUrlToPng = (u?: string) =>
  u?.startsWith("data:image/png;base64,") ? Buffer.from(u.slice("data:image/png;base64,".length), "base64") : undefined;

/**
 * Makes or refines a version of the selected component, then renders and measures it against the
 * original. action: "copy" (no AI), "claude", "improve" or "edit".
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const action = body.action;
  if (!["copy", "claude", "improve", "edit"].includes(action ?? "")) return Response.json({ error: "Unknown action" }, { status: 400 });

  let current: Recreation | undefined;
  if (action === "improve" || action === "edit") {
    const c = body.current;
    if (typeof c?.html !== "string" || c.html.length > 400_000) return Response.json({ error: "Make a version first." }, { status: 400 });
    current = { html: c.html, react: typeof c.react === "string" ? c.react : undefined, unknowns: [] };
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (action === "edit" && (!instruction || instruction.length > 500))
    return Response.json({ error: "Tell Claude what to change (up to 500 characters)." }, { status: 400 });

  try {
    const { sel, snapshot } = await captureForRecreation();
    const frozenCopy = buildDocument(snapshot, sel.design.appearance.sitsOn, sel.motion);
    const width = sel.design.layout.width;

    let version: Recreation;
    if (action === "copy") {
      version = {
        html: frozenCopy,
        notes: "An exact copy, made from what was measured on the page. No AI was used.",
        unknowns: [
          ...(snapshot.truncated ? ["It's very large, so only its first 600 parts were copied."] : []),
          ...(sel.motion
            ? ["Only hover effects on the whole element are copied, not on parts inside it."]
            : ["Animations weren't explored, so hover and motion aren't included. Press Explore animation first to add them."]),
          "Links don't go anywhere and the website's scripts were removed.",
          ...(/data-was=/.test(snapshot.body) ? ["Embedded frames, drawings and videos are shown as striped placeholders."] : []),
        ],
      };
    } else {
      const source = { frozenCopy, design: sel.design, motion: sel.motion, original: dataUrlToPng(sel.screenshot) };
      if (action === "claude") version = await askClaude(source, { kind: "create" });
      else if (action === "edit") version = await askClaude(source, { kind: "edit", current: current!, instruction });
      else {
        const before = await renderAndMeasure(current!.html, width);
        version = await askClaude(source, {
          kind: "improve",
          current: current!,
          compare: compareDesigns(sel.design, before.design),
          recreated: before.png,
        });
      }
    }

    const rendered = await renderAndMeasure(version.html, width);
    return Response.json({
      version: {
        ...version,
        source: action,
        compare: compareDesigns(sel.design, rendered.design),
        screenshot: `data:image/png;base64,${rendered.png.toString("base64")}`,
      },
    });
  } catch (e) {
    if (e instanceof NotConnected)
      return Response.json(
        { error: "Claude isn't connected yet. Add ANTHROPIC_API_KEY to .env.local (or run `ant auth login`), then restart the app.", notConnected: true },
        { status: 412 },
      );
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
