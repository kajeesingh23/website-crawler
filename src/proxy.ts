import { NextResponse, type NextRequest } from "next/server";
import { refuse, type PairingFacts } from "@/lib/guard";
import { getPairing, tokenMatches } from "@/lib/pairing";

/** Runs before every request: only this computer, the app's own pages and the paired extension get through. */
export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  let pairing: PairingFacts | null = null;
  if (origin?.startsWith("chrome-extension://")) {
    const p = getPairing(); // only read for extension requests, so ordinary pages never touch the database here
    pairing = p && { origin: p.origin, tokenValid: tokenMatches(req.headers.get("x-plax-token"), p) };
  }
  const reason = refuse(
    {
      method: req.method,
      path: req.nextUrl.pathname,
      host: req.headers.get("host"),
      origin,
      secFetchSite: req.headers.get("sec-fetch-site"),
      secFetchMode: req.headers.get("sec-fetch-mode"),
    },
    pairing,
  );
  return reason ? NextResponse.json({ error: reason }, { status: 403 }) : NextResponse.next();
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
