import { randomUUID } from "node:crypto";
import { browser } from "../recreate/render.ts";
import { recordWebsite } from "../db.ts";
import { normaliseUrl } from "../url.ts";
import { extractSystem, type SystemData } from "./extract-system.ts";

export type Collected = { id: string; system: SystemData; pageShot: Buffer; shots: (Buffer | null)[] };

// The last few collections stay in memory, so you can choose what to keep without collecting again.
const g = globalThis as typeof globalThis & { __pdiSystems?: Map<string, Collected> };
const store = (g.__pdiSystems ??= new Map<string, Collected>());

export const getCollected = (id: string) => store.get(id);

/**
 * Loads the website in the invisible browser (never the Explore window), scrolls through it so lazy
 * content appears, then reads its design language and photographs example components.
 */
export async function collectSystem(raw: string): Promise<Collected> {
  const url = normaliseUrl(raw);
  const context = await (await browser()).newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight && y < 30_000; y += innerHeight * 0.8) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    const system = await page.evaluate(extractSystem);
    const pageShot = await page.screenshot();
    const shots: (Buffer | null)[] = [];
    for (const ex of system.examples)
      shots.push(await page.locator(ex.path).first().screenshot({ timeout: 4_000, animations: "disabled" }).catch(() => null));
    try {
      recordWebsite(system.url, system.title);
    } catch {}

    const entry = { id: randomUUID(), system, pageShot, shots };
    store.set(entry.id, entry);
    for (const old of [...store.keys()].slice(0, Math.max(0, store.size - 5))) store.delete(old);
    return entry;
  } finally {
    await context.close();
  }
}

export function friendlyCollectError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Only website links|Paste a website|look like a website/.test(msg)) return msg;
  if (msg.includes("ERR_NAME_NOT_RESOLVED")) return "We couldn't find that website. Check the link for typos.";
  if (msg.includes("Timeout")) return "The website took too long to load. Try again, or try another page.";
  if (msg.includes("Executable doesn't exist")) return "The background browser isn't installed. Run `npx playwright install chromium` once, then try again.";
  return `The design system couldn't be collected. (${msg.split("\n")[0]})`;
}
