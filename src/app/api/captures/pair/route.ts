import { bindOrigin } from "@/lib/pairing";

/** The extension's first call with a new pairing code. The guard (proxy) has already checked the code. */
export async function POST(req: Request) {
  bindOrigin(req.headers.get("origin")!);
  return Response.json({ ok: true, app: "Plax" });
}
