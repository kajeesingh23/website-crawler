import { db, recordWebsite, saveComponent } from "./db.ts";
import { describeForLibrary } from "./library.ts";
import type { Selection } from "./inspector/session.ts";

// Saves one capture sent by the Plax extension. Everything arrives from outside the app, so each
// field is checked before it's stored.

const ASSET_LABELS = new Set(["Image", "Image link", "Image block", "Icon", "Illustration", "Video"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG = "data:image/png;base64,";

export class Invalid extends Error {}

const str = (v: unknown, max: number, what: string) => {
  if (typeof v !== "string" || v.length > max) throw new Invalid(`${what} is missing or too long.`);
  return v;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100_000 ? Math.round(v) : 0);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function saveCapture(body: unknown): { id: string } {
  const b = obj(body);
  const c = obj(b?.capture);
  if (!b || !c) throw new Invalid("Nothing to save.");
  const analysisId = str(b.analysisId, 36, "The visit");
  if (!UUID.test(analysisId)) throw new Invalid("The visit isn't valid.");

  const name = str(c.name, 120, "A name").trim();
  if (!name) throw new Invalid("Give it a name.");
  const url = str(c.url, 2000, "The page address");
  if (!/^https?:\/\//i.test(url)) throw new Invalid("Only captures from websites can be saved.");
  const html = str(c.html, 2_000_000, "The copy");
  if (!html.includes("pdi-root")) throw new Invalid("The copy isn't valid.");
  const label = str(c.label, 40, "The kind of element");
  const shot = c.screenshot === undefined ? undefined : str(c.screenshot, 9_000_000, "The picture");
  if (shot !== undefined && !shot.startsWith(PNG)) throw new Invalid("The picture must be a PNG.");
  const png = shot ? Buffer.from(shot.slice(PNG.length), "base64") : undefined;
  const crumbs = Array.isArray(c.crumbs) ? c.crumbs.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  const design = obj(c.design);
  const motion = obj(c.motion);
  const pageTitle = typeof c.pageTitle === "string" ? c.pageTitle.slice(0, 300) : "";

  recordWebsite(url, pageTitle);
  const site = db().prepare("SELECT id FROM websites WHERE url = ?").get(url) as { id: string } | undefined;
  db().prepare("INSERT OR IGNORE INTO analyses (id, website_id, url, title, source) VALUES (?, ?, ?, ?, 'extension')").run(analysisId, site?.id ?? null, url, pageTitle);

  const sel = { label, design: design ?? undefined, motion: motion ?? undefined } as unknown as Selection;
  const id = saveComponent({
    kind: ASSET_LABELS.has(label) ? "asset" : "component",
    name,
    ...describeForLibrary(sel, url),
    sourceUrl: url,
    png,
    html,
    note: "Captured with the Plax extension",
    analysisId,
    observed: {
      element: { label, path: crumbs, width: num(c.width), height: num(c.height), selector: typeof c.path === "string" ? c.path.slice(0, 1000) : undefined },
      design,
      motion,
      capturedWith: "extension", // hover, focus and scroll-in weren't tested
    },
    inferred: {},
  });
  return { id };
}
