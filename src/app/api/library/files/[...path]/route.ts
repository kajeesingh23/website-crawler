import fs from "node:fs";
import path from "node:path";
import { resolveDataFile } from "@/lib/library";

/**
 * Screenshots and saved code from the local library. Code is always sent as plain text (or as a
 * download), never as a web page, so nothing in it can run inside this app.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/library/files/[...path]">) {
  const parts = (await params).path;
  const file = resolveDataFile(parts);
  if (!file) return new Response("Not found", { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const download = new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": ext === ".png" ? "image/png" : "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
  };
  if (download) headers["Content-Disposition"] = `attachment; filename="${path.basename(file).replace(/"/g, "")}"`;
  return new Response(fs.readFileSync(file), { headers });
}
