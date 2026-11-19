import { chromium, type Browser } from "playwright";
import { extractDesign, type Design } from "../inspector/extract.ts";

// A separate, invisible browser: recreations never run inside the website's window or this app.
const g = globalThis as typeof globalThis & { __pdiRenderer?: Promise<Browser> };

async function browser() {
  const b = await (g.__pdiRenderer ??= chromium.launch({ headless: true }));
  if (b.isConnected()) return b;
  g.__pdiRenderer = undefined;
  return browser();
}

/** Renders a version with scripts switched off, then screenshots and measures its root element. */
export async function renderAndMeasure(html: string, width: number): Promise<{ png: Buffer; design: Design }> {
  const context = await (await browser()).newContext({
    javaScriptEnabled: false,
    viewport: { width: Math.min(Math.max(Math.round(width) + 80, 320), 2400), height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    const root = page.locator(".pdi-root").first();
    if (!(await root.count())) throw new Error("The recreation has no element marked as its root (class “pdi-root”).");
    const design = await root.evaluate(extractDesign);
    const png = await root.screenshot({ timeout: 10_000, animations: "disabled" });
    return { png, design };
  } finally {
    await context.close();
  }
}
