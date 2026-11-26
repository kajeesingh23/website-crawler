import { browser } from "../recreate/render.ts";
import { extractDesign } from "./extract.ts";
import { describeLayout } from "./describe.ts";
export { pathOf } from "./path.ts";

export const SIZES = [
  { name: "Phone", width: 375, height: 812 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Desktop", width: 1280, height: 900 },
] as const;

export type SizeResult = {
  name: string;
  width: number;
  found: boolean;
  hidden?: boolean;
  screenshot?: string;
  size?: string;
  fontSize?: number;
  padding?: string;
  layout?: string;
};

/**
 * Opens the page at phone, tablet and desktop widths in the invisible browser (not the Explore
 * window) and measures the same element at each. Pages behind a login show what a visitor sees.
 */
export async function checkSizes(url: string, path: string): Promise<SizeResult[]> {
  const b = await browser();
  return Promise.all(
    SIZES.map(async (s): Promise<SizeResult> => {
      const context = await b.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.width < 768, hasTouch: s.width < 768 });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "load", timeout: 30_000 });
        const el = page.locator(path).first();
        if (!(await el.count())) return { name: s.name, width: s.width, found: false };
        const d = await el.evaluate(extractDesign);
        if (d.layout.width === 0 || d.layout.height === 0) return { name: s.name, width: s.width, found: true, hidden: true };
        const png = await el.screenshot({ timeout: 8_000, animations: "disabled" }).catch(() => null);
        return {
          name: s.name,
          width: s.width,
          found: true,
          screenshot: png ? `data:image/png;base64,${png.toString("base64")}` : undefined,
          size: `${d.layout.width} × ${d.layout.height}`,
          fontSize: d.typography.size,
          padding: d.layout.padding.map((n) => Math.round(n)).join(" "),
          layout: describeLayout(d.layout),
        };
      } catch {
        return { name: s.name, width: s.width, found: false };
      } finally {
        await context.close();
      }
    }),
  );
}
