// Full inspector session: open a page, select an element, get its preview, remember the website.
// Uses an invisible browser and a throwaway library folder, so your real data/ is never touched.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "playwright";

process.env.PDI_HEADLESS = "1";
process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pdi-test-"));

const { openWebsite, runCommand, getSnapshot, closeWebsite, selectBySelector } = await import("../src/lib/inspector/session.ts");
const { getHomeData } = await import("../src/lib/db.ts");
const { describeLayout, describeMovement, movementBetween } = await import("../src/lib/inspector/describe.ts");
const { saveItem, saveComponent, dataDir } = await import("../src/lib/db.ts");

const MOTION_PAGE = `<title>Motion lab</title><style>
  body{margin:0}
  #btn{padding:12px;background:#111111;color:#fff;transition:transform .2s ease-out,background-color .2s ease-out}
  #btn:hover{transform:translateY(-2px);background:#333333}
  #spin{width:20px;height:20px;background:#ff5c28;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #reveal{margin-top:2000px;height:80px;background:#3b6cff;opacity:0;transform:translateY(24px);transition:opacity .4s ease-out,transform .4s ease-out}
  #reveal.in{opacity:1;transform:none}
</style>
<button id="btn">Hover me</button><div id="spin"></div><div id="reveal"></div><div style="height:1500px"></div>
<script>
  new IntersectionObserver(([e]) => e.target.classList.toggle("in", e.isIntersecting)).observe(document.getElementById("reveal"));
</script>`;

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  if (req.url === "/motion") return res.end(MOTION_PAGE);
  res.end(`<title>Test studio</title><body style="margin:0;background:#f7f6f3">
    <nav style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:8px 24px">
      <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#ff5c28"/></svg>
      <img alt="dot" width="10" height="10" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==">
      <button id="cta" style="padding:12px 20px;background:#111111;color:#ffffff;border:0;border-radius:12px;font:600 15px/1.5 Arial;letter-spacing:0.5px;box-shadow:0 2px 8px rgba(0,0,0,.2)">Get started</button>
    </nav></body>`);
});
let url = "";
before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});
after(async () => {
  await closeWebsite();
  server.close();
  fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true });
});

const until = async <T>(fn: () => T | undefined, what: string, tries = 150): Promise<T> => {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
};

test("open → select → preview → remembered on Home", async () => {
  await openWebsite(url);
  assert.equal(getSnapshot().status, "open");
  assert.equal(getSnapshot().title, "Test studio");

  await runCommand("inspect-on");
  const page = (globalThis as unknown as { __pdiSession: { page: Page } }).__pdiSession.page;
  await page.click("#cta");

  const sel = await until(() => getSnapshot().selection ?? undefined, "selection");
  assert.equal(sel.label, "Button");
  assert.equal(sel.text, "Get started");
  assert.equal(sel.path.at(-1), "Navigation");
  const shot = await until(() => getSnapshot().selection?.screenshot, "preview");
  assert.match(shot, /^data:image\/png;base64,/);

  // Phase 2: the button's design, measured from the page
  const d = getSnapshot().selection!.design!;
  assert.equal(d.appearance.background?.hex, "#111111");
  assert.equal(d.appearance.text.hex, "#ffffff");
  assert.equal(d.appearance.radius, "12px");
  assert.ok(d.appearance.shadow);
  assert.equal(d.appearance.border, null);
  assert.deepEqual([d.typography.family, d.typography.size, d.typography.weight, d.typography.lineHeight], ["Arial", 15, "600", "22.5px"]);
  assert.deepEqual(d.layout.padding, [12, 20, 12, 20]);

  // …and its parent: layout in words, icon colour, assets
  await runCommand("parent");
  const nav = await until(() => (getSnapshot().selection?.label === "Navigation" ? getSnapshot().selection?.design : undefined), "nav design");
  assert.equal(describeLayout(nav.layout), "Side by side, spread to the edges, vertically centred, 16px apart.");
  assert.deepEqual(nav.appearance.sitsOn, { hex: "#f7f6f3", alpha: 1 });
  assert.ok(nav.palette.some((c) => c.hex === "#ff5c28" && c.uses.includes("icon")));
  assert.deepEqual(nav.assets.map((a) => a.kind).sort(), ["image", "svg"]);
  assert.match(nav.assets.find((a) => a.kind === "svg")!.svg!, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);

  const home = await until(() => (getHomeData().websites ? getHomeData() : undefined), "website record");
  assert.equal(home.recentWebsites[0].title, "Test studio");

  await runCommand("clear");
  await until(() => getSnapshot().selection === null || undefined, "clear");
});

test("motion: hover, looping and scroll-in animations are observed and can be saved", { timeout: 30_000 }, async () => {
  await openWebsite(`${url}motion`);
  await runCommand("inspect-on");
  const page = (globalThis as unknown as { __pdiSession: { page: Page } }).__pdiSession.page;
  const explore = async (selector: string) => {
    const before = getSnapshot().selection?.id;
    // A real click at its position (Playwright's click waits for movement to stop, and a spinner never does).
    await page.locator(selector).evaluate((e) => e.scrollIntoView({ block: "center" }));
    const b = (await page.locator(selector).boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    const sel = await until(() => {
      const cur = getSnapshot().selection;
      return cur && cur.id !== before && cur.design ? cur : undefined;
    }, `${selector} selected`);
    assert.ok(sel.design!.motion.moving + sel.design!.motion.smooth > 0, "motion hint");
    await runCommand("motion");
    return (await until(() => (getSnapshot().selection?.motionStatus === "done" ? getSnapshot().selection ?? undefined : undefined), `${selector} motion`, 500)).motion!;
  };

  const btn = await explore("#btn");
  const bg = btn.hover!.changes.find((c) => c.prop === "background-color")!;
  assert.deepEqual([bg.from, bg.to], ["rgb(17, 17, 17)", "rgb(51, 51, 51)"]);
  const t = btn.hover!.changes.find((c) => c.prop === "transform")!;
  assert.equal(describeMovement(movementBetween(t.from, t.to)), "Moves up 2px");
  assert.deepEqual(btn.transitions.map((d) => [d.prop, d.duration, d.easing]), [["transform", 200, "ease-out"], ["background-color", 200, "ease-out"]]);
  assert.ok(btn.focus, "a button can be focused");

  const spin = await explore("#spin");
  const loop = spin.running.find((a) => a.name === "spin")!;
  assert.deepEqual([loop.kind, loop.iterations, loop.duration, loop.easing], ["css-animation", "infinite", 1000, "linear"]);
  assert.equal(describeMovement(movementBetween(String(loop.keyframes[0].transform ?? "none"), String(loop.keyframes.at(-1)!.transform))), "Turns 360°");

  const reveal = await explore("#reveal");
  assert.ok(reveal.scroll, "far down the page, so scrolling can be tested");
  const op = reveal.scroll!.changes.find((c) => c.prop === "opacity")!;
  assert.deepEqual([op.from, op.to], ["0", "1"]);
  assert.equal(reveal.focus, null);

  const id = saveItem({ kind: "animation", name: "Scroll reveal", sourceUrl: getSnapshot().url, observed: { motion: reveal } });
  assert.ok(id);
  assert.equal(getHomeData().animations, 1);
});

test("a saved component keeps its code as version 1", () => {
  const id = saveComponent({ name: "Card", html: "<html><div class=\"pdi-root\"></div></html>", react: "export function Card() {}", observed: {}, inferred: { source: "copy" } });
  assert.ok(fs.existsSync(path.join(dataDir, "components", id, "v1", "component.html")));
  assert.ok(fs.existsSync(path.join(dataDir, "components", id, "v1", "Component.tsx")));
  assert.equal(getHomeData().components, 1);
});

test("bad links never reach the browser", async () => {
  await assert.rejects(openWebsite("file:///etc/passwd"), /Only website links/);
});

test("Analyse Website: one Save keeps the picture, exact copy, design and animation", async () => {
  const { saveLiveSelection, liveCopy } = await import("../src/lib/captures.ts");
  const { getItem } = await import("../src/lib/library.ts");
  await openWebsite(`${url}motion`);
  assert.equal(await selectBySelector("#btn"), true);
  await until(() => getSnapshot().selection?.design || undefined, "design read");
  assert.match((await liveCopy()).html, /pdi-root/);
  await assert.rejects(saveLiveSelection("  "), /name/);
  const { id } = await saveLiveSelection("Buy button");
  const item = getItem(id)!;
  assert.equal(item.kind, "component");
  assert.match(item.code.html!, /pdi-root/);
  assert.ok((item.observed as { design?: unknown }).design, "measured design kept");
});
