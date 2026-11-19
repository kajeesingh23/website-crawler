import { NextResponse, type NextRequest } from "next/server";
import { refuse } from "@/lib/guard";

/** Runs before every request: only this computer and the app's own pages get through. */
export function proxy(req: NextRequest) {
  const reason = refuse({
    method: req.method,
    path: req.nextUrl.pathname,
    host: req.headers.get("host"),
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    secFetchMode: req.headers.get("sec-fetch-mode"),
  });
  return reason ? NextResponse.json({ error: reason }, { status: 403 }) : NextResponse.next();
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
