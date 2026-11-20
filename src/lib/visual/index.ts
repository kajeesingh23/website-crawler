import fs from "node:fs";
import type { Page } from "playwright";
import path from "node:path";
import { browser } from "../recreate/render.ts";
import { dataDir, db } from "../db.ts";
import { listItems, type ItemCard } from "../library.ts";
import { compareInPage, fingerprintInPage, similarity, type Fingerprint } from "./fingerprint.ts";

const dataUrl = (img: Buffer, mime = "image/png") => `data:${mime};base64,${img.toString("base64")}`;

// Pictures are read in the shared invisible browser, which already knows every image format.
async function inPage<R>(run: (page: Page) => Promise<R>): Promise<R> {
  const context = await (await browser()).newContext();
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

export const fingerprint = (img: Buffer, mime?: string) => inPage((p) => p.evaluate(fingerprintInPage, dataUrl(img, mime)));

/** 0–100: how alike two pictures look, pixel by pixel. */
export const visualMatch = (a: Buffer, b: Buffer) => inPage((p) => p.evaluate(compareInPage, [dataUrl(a), dataUrl(b)] as [string, string]));

/** Fingerprints every item that has a screenshot but no fingerprint yet, and returns them all. */
async function allFingerprints(): Promise<Map<string, Fingerprint>> {
  const rows = db().prepare("SELECT id, thumbnail, fingerprint FROM items WHERE thumbnail IS NOT NULL").all() as {
    id: string;
    thumbnail: string;
    fingerprint: string | null;
  }[];
  const out = new Map<string, Fingerprint>();
  for (const r of rows) {
    if (r.fingerprint) {
      out.set(r.id, JSON.parse(r.fingerprint));
      continue;
    }
    const file = path.join(dataDir, r.thumbnail);
    if (!fs.existsSync(file)) continue;
    try {
      const fp = await fingerprint(fs.readFileSync(file));
      db().prepare("UPDATE items SET fingerprint = ? WHERE id = ?").run(JSON.stringify(fp), r.id);
      out.set(r.id, fp);
    } catch {
      // An unreadable picture just isn't part of similarity search.
    }
  }
  return out;
}

/** Saved items that look most like an item, or like any picture (for example a screenshot you share). */
export async function findSimilar(target: { id: string } | { image: Buffer; mime?: string }, limit = 6): Promise<(ItemCard & { score: number })[]> {
  const prints = await allFingerprints();
  const mine = "id" in target ? prints.get(target.id) : await fingerprint(target.image, target.mime);
  if (!mine) return [];
  const exclude = "id" in target ? target.id : null;
  const cards = new Map(listItems().map((i) => [i.id, i]));
  return [...prints]
    .filter(([id]) => id !== exclude && cards.has(id))
    .map(([id, fp]) => ({ ...cards.get(id)!, score: similarity(mine, fp) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
