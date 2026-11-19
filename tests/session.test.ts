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

const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(`<title>Test studio</title><button id="cta" style="padding:12px 20px;background:#111;color:#fff">Get started</button>`);
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
  const shot = await until(() => getSnapshot().selection?.screenshot, "preview");
  assert.match(shot, /^data:image\/png;base64,/);

  const home = await until(() => (getHomeData().websites ? getHomeData() : undefined), "website record");
  assert.equal(home.recentWebsites[0].title, "Test studio");

  await runCommand("clear");
  await until(() => getSnapshot().selection === null || undefined, "clear");
});

test("bad links never reach the browser", async () => {
  await assert.rejects(openWebsite("file:///etc/passwd"), /Only website links/);
});
