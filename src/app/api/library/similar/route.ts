import { findSimilar } from "@/lib/visual";

/** Saved items that look most like one item (fingerprints are worked out the first time). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Which item?" }, { status: 400 });
  try {
    return Response.json({ items: await findSimilar({ id }, 8) });
  } catch (e) {
    return Response.json({ error: `Couldn't compare pictures: ${(e as Error).message}` }, { status: 500 });
  }
}
