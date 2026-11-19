import { collectSystem, friendlyCollectError } from "@/lib/system/collect";

const dataUrl = (png: Buffer | null) => (png ? `data:image/png;base64,${png.toString("base64")}` : null);

/** Collects a website's design system in the background browser. Takes a few seconds. */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (typeof url !== "string") return Response.json({ error: "Paste a website link first." }, { status: 400 });
  try {
    const c = await collectSystem(url);
    return Response.json({ id: c.id, system: c.system, pageShot: dataUrl(c.pageShot), shots: c.shots.map(dataUrl) });
  } catch (e) {
    return Response.json({ error: friendlyCollectError(e) }, { status: 500 });
  }
}
