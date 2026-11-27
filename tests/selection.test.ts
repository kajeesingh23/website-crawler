// Smart picking (the extension's selection): a click inside a component picks the whole component.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { overlay } from "../src/lib/inspector/overlay.ts";

const PAGE = `<!doctype html><body style="margin:0;font:16px sans-serif">
  <nav style="display:flex;gap:8px;padding:10px"><a href="/a" id="navlink">Work</a></nav>
  <main style="display:grid;grid-template-columns:repeat(3,200px);gap:16px;padding:16px">
    <article id="card" style="background:#fff;border-radius:12px;box-shadow:0 2px 8px #0002;padding:12px">
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="176" height="80">
      <h3 id="title">Calm studio</h3><p>Small team, big ideas.</p>
      <button id="cta"><span id="cta-text">Read more</span></button>
    </article>
    <ul style="list-style:none;margin:0;padding:0"><li id="plain">
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="100" height="60"><span id="plain-text">A plain list card</span>
    </li></ul>
    <div><button id="solo"><span id="solo-text">Buy now</span></button></div>
  </main>
  <section style="height:420px;background:#eee"><img id="hero" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="300" height="200"></section>
</body>`;

test("a click picks the whole component; Alt picks exactly what's under the pointer", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const picks: { label: string; text: string; width: number }[] = [];
    await context.exposeBinding("__pdiEmit", (_src, ev: { type: string; info?: { label: string; text: string; width: number } }) => {
      if (ev.type === "select") picks.push(ev.info!);
      return ev.type === "ready" ? { inspecting: true } : undefined;
    });
    await context.addInitScript(overlay, { smart: true });
    const page = await context.newPage();
    await page.route("https://example.test/**", (r) => r.fulfill({ contentType: "text/html", body: PAGE }));
    await page.goto("https://example.test/");
    await page.waitForFunction(() => "__pdi" in window);

    const pick = async (css: string, alt = false) => {
      const before = picks.length;
      await page.click(css, { modifiers: alt ? ["Alt"] : [] });
      for (let i = 0; i < 100 && picks.length === before; i++) await new Promise((r) => setTimeout(r, 20));
      return picks.at(-1)!;
    };

    const card = await pick("#title");
    assert.equal(card.label, "Card", "the card's title picks the card");
    assert.match(card.text, /Calm studio.*Read more/);
    assert.equal((await pick("#cta-text")).label, "Card", "a button inside the card still picks the card");
    assert.equal((await pick("#cta-text", true)).label, "Text", "Alt-click picks the exact element");
    assert.equal((await pick("#plain-text")).label, "Card", "a list item that groups a picture with text is a card");
    assert.equal((await pick("#solo-text")).label, "Button", "text inside a lone button picks the button");
    assert.equal((await pick("#navlink")).label, "Link", "full-width bars aren't cards: the link stays a link");
    assert.equal((await pick("#hero")).label, "Image", "a picture in a full-width section stays a picture");
  } finally {
    await browser.close();
  }
});

test("without smart picking (the app's Analyse Website) clicks pick exactly what's under the pointer", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const picks: string[] = [];
    await context.exposeBinding("__pdiEmit", (_src, ev: { type: string; info?: { label: string } }) => {
      if (ev.type === "select") picks.push(ev.info!.label);
      return ev.type === "ready" ? { inspecting: true } : undefined;
    });
    await context.addInitScript(overlay);
    const page = await context.newPage();
    await page.route("https://example.test/**", (r) => r.fulfill({ contentType: "text/html", body: PAGE }));
    await page.goto("https://example.test/");
    await page.waitForFunction(() => "__pdi" in window);
    await page.click("#title");
    for (let i = 0; i < 100 && !picks.length; i++) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(picks, ["Heading"]);
  } finally {
    await browser.close();
  }
});
