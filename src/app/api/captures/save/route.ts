import { Invalid, saveCapture } from "@/lib/captures";

/** Saves one capture from the paired extension to the Library. The guard (proxy) has already checked the pairing. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    return Response.json(saveCapture(body));
  } catch (e) {
    if (e instanceof Invalid) return Response.json({ error: e.message }, { status: 400 });
    console.error("Couldn't save a capture", e);
    return Response.json({ error: "The capture couldn't be saved. Check the Plax app's window for details." }, { status: 500 });
  }
}
