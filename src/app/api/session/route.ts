import { closeWebsite, getSnapshot, normaliseUrl, openWebsite } from "@/lib/inspector/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  try {
    normaliseUrl(String(body.url ?? "")); // reject bad links before touching the browser
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  await openWebsite(String(body.url));
  return Response.json(getSnapshot());
}

export async function DELETE() {
  await closeWebsite();
  return Response.json(getSnapshot());
}
