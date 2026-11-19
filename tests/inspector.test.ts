// Run with: npm test  (Node runs TypeScript directly; Playwright's headless Chromium does the browsing)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { overlay } from "../src/lib/inspector/overlay.ts";
import { normaliseUrl } from "../src/lib/url.ts";

type Ev = { type: string; info?: { label: string; text: string; note?: string }; seen?: boolean };

const PAGE = `<!doctype html><body style="margin:0">
  <nav style="display:flex;gap:8px;padding:10px">
    <a href="/elsewhere" id="link">Work</a><button id="btn">Buy now</button>
  </nav>
  <iframe id="frame" style="width:200px;height:100px;border:0" srcdoc="hi"></iframe>
</body>`;

test("links are checked before opening", () => {
  assert.equal(normaliseUrl(" stripe.com "), "https://stripe.com/");
  assert.equal(normaliseUrl("http://localhost:3000/a"), "http://localhost:3000/a");
  assert.throws(() => normaliseUrl("javascript:alert(1)"), /Only website links/);
  assert.throws(() => normaliseUrl("file:///etc/passwd"), /Only website links/);
  assert.throws(() => normaliseUrl(""), /Paste a website link/);
});

test("hover, select and move around the page without the site reacting", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const events: Ev[] = [];
    await context.exposeBinding("__pdiEmit", (_src, ev: Ev) => {
      events.push(ev);
      return ev.type === "ready" ? { inspecting: true } : undefined; // app says: selection mode is on
    });
    await context.addInitScript(overlay);
    const page = await context.newPage();
    await page.route("https://example.test/**", (r) => r.fulfill({ contentType: "text/html", body: PAGE }));
    await page.goto("https://example.test/");

    const next = async (type: string) => {
      for (let i = 0; i < 100; i++) {
        const e = events.find((x) => x.type === type && !x.seen);
        if (e) return ((e.seen = true), e);
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`no "${type}" event`);
    };
    const api = (fn: string) => page.evaluate((f) => (window as never as Record<string, Record<string, () => void>>).__pdi[f](), fn);

    await next("ready");
    await page.click("#link");
    assert.equal((await next("select")).info?.label, "Link");
    assert.equal(page.url(), "https://example.test/", "clicking while selecting must not follow the link");

    await api("parent");
    assert.equal((await next("select")).info?.label, "Navigation");
    await api("child");
    assert.equal((await next("select")).info?.label, "Link");
    await api("next");
    const btn = await next("select");
    assert.deepEqual([btn.info?.label, btn.info?.text], ["Button", "Buy now"]);

    const box = (await page.locator("#frame").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // a real click over the frame
    const frame = await next("select");
    assert.equal(frame.info?.label, "Embedded frame");
    assert.match(frame.info?.note ?? "", /another website/);

    assert.equal(await page.evaluate(() => (window as never as { __pdi: { selectCss(c: string): boolean } }).__pdi.selectCss("#btn")), true);
    assert.equal((await next("select")).info?.label, "Button");
    assert.equal(await page.evaluate(() => (window as never as { __pdi: { selectCss(c: string): boolean } }).__pdi.selectCss("((bad")), false);

    await page.keyboard.press("Escape");
    await next("clear");
  } finally {
    await browser.close();
  }
});
