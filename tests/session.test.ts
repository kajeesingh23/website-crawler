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

const { openWebsite, runCommand, getSnapshot, closeWebsite } = await import("../src/lib/inspector/session.ts");
const { getHomeData } = await import("../src/lib/db.ts");
const { describeLayout } = await import("../src/lib/inspector/describe.ts");

const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
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

const until = async <T>(fn: () => T | undefined, what: string): Promise<T> => {
  for (let i = 0; i < 150; i++) {
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

test("bad links never reach the browser", async () => {
  await assert.rejects(openWebsite("file:///etc/passwd"), /Only website links/);
});
