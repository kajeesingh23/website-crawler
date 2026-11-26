// The real Plax extension, loaded unpacked in Chromium: select on a page, see the list in the side panel.
// The panel is opened in its own window here (tests can't click Chrome's toolbar), so it works on the page's tab.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const ext = path.resolve("dist/extension-test");
const PAGE = `<!doctype html><title>Studio</title><body style="margin:0;font:16px sans-serif;background:#f4f4f4">
  <main style="display:grid;grid-template-columns:repeat(2,260px);gap:24px;padding:24px">
    <article id="a" style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px #0002"><h3 id="a-title">First card</h3><p>Hello</p></article>
    <article id="b" style="background:#101828;color:#fff;border-radius:12px;padding:16px"><h3 id="b-title">Second card</h3><p>World</p></article>
  </main></body>`;

let server: http.Server;
let url = "";
let context: BrowserContext;
let site: Page;
let panel: Page;

before(async () => {
  execFileSync("node", ["scripts/build-extension.mjs"], { stdio: "ignore" });
  execFileSync("node", ["scripts/build-extension.mjs", "--test"], { stdio: "ignore" });
  server = http.createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(PAGE));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://localhost:${(server.address() as { port: number }).port}/`; // covered by the extension's localhost access
  context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "plax-ext-")), {
    channel: "chromium", // the full Chromium build: headless with extensions
    viewport: { width: 1000, height: 700 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  site = context.pages()[0] ?? (await context.newPage());
  await site.goto(url);
  const opened = context.waitForEvent("page");
  await worker.evaluate(() => (globalThis as unknown as { chrome: { windows: { create(o: object): Promise<unknown> } } }).chrome.windows.create({ url: "sidepanel.html", type: "popup", width: 380, height: 700 }));
  panel = await opened;
  await panel.waitForLoadState();
});

after(async () => {
  await context?.close();
  server?.close();
});

const selections = () => panel.locator("ol.list > li");

test("select several components on a page and manage the list", async () => {
  await panel.getByText(url).waitFor(); // the panel found the website's tab
  await panel.getByRole("button", { name: "Start selecting" }).click();
  await panel.getByRole("button", { name: "Stop selecting" }).waitFor(); // selection layer is on the page

  await site.click("#a-title");
  await panel.getByRole("heading", { name: "1 selected" }).waitFor();
  await site.click("#b-title");
  await panel.getByRole("heading", { name: "2 selected" }).waitFor();

  const names = () => selections().locator(".open").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  assert.deepEqual(await names(), ["Open 1: Card from localhost", "Open 2: Card from localhost"]);
  const thumb = await selections().first().locator(".thumb").evaluate((e) => (e as HTMLElement).style.backgroundImage);
  assert.match(thumb, /data:image\/png/, "a cropped picture was taken");

  // Reorder, undo, remove, undo, clear, undo
  await panel.getByRole("button", { name: "Move Card from localhost down" }).first().click();
  await panel.getByRole("button", { name: "Undo" }).click();
  await panel.getByRole("button", { name: "Remove Card from localhost" }).first().click();
  await panel.getByRole("heading", { name: "1 selected" }).waitFor();
  await panel.getByRole("button", { name: "Undo" }).click();
  await panel.getByRole("heading", { name: "2 selected" }).waitFor();
  await panel.getByRole("button", { name: "Clear all" }).click();
  await panel.getByRole("heading", { name: "0 selected" }).waitFor();
  await panel.getByRole("button", { name: "Undo" }).click();
  await panel.getByRole("heading", { name: "2 selected" }).waitFor();

  // Details: measured design and a live copy
  await selections().first().locator(".open").click();
  await panel.getByText("Layout").waitFor();
  assert.match(await panel.locator("dl.facts").innerText(), /#ffffff/i, "the first card's white background was measured");
  await panel.getByRole("tab", { name: "Prompt" }).click();
  assert.match(await panel.locator("pre.out").innerText(), /^# Pixel-accurate recreation: Card from localhost/);
  await panel.getByRole("button", { name: "Design-system tokens" }).click();
  assert.match(await panel.locator("pre.out").innerText(), /"\$type": "color"/);
  const download = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "Download .md" }).click();
  assert.equal((await download).suggestedFilename(), "CardFromLocalhost-tokens-prompt.md");
  await panel.getByRole("tab", { name: "Code" }).click();
  await panel.getByRole("button", { name: "Tailwind" }).click();
  const tw = await panel.locator("pre.out").innerText();
  assert.match(tw, /class="[^"]*bg-\[/);
  assert.doesNotMatch(tw, / style="/);
  await panel.getByRole("tab", { name: "Live copy" }).click();
  const copy = await panel.locator("iframe.live").getAttribute("srcdoc");
  assert.match(copy ?? "", /First card/);
  await panel.getByRole("button", { name: "← Back" }).click();

  // The list survives closing the panel
  await panel.reload();
  await panel.getByRole("heading", { name: "2 selected" }).waitFor();
});

test("the shipped extension asks only for what it needs", () => {
  const m = JSON.parse(fs.readFileSync("dist/extension/manifest.json", "utf8"));
  assert.deepEqual(m.permissions, ["sidePanel", "activeTab", "scripting", "storage"]);
  assert.deepEqual(m.host_permissions, ["http://localhost/*"]);
  assert.deepEqual(m.optional_host_permissions, ["<all_urls>"], "every-site access only if the person turns it on");
  assert.equal(m.version, JSON.parse(fs.readFileSync("package.json", "utf8")).version);
});

test("Esc on the page stops selecting", async () => {
  await panel.getByRole("button", { name: "Start selecting" }).click();
  await panel.getByRole("button", { name: "Stop selecting" }).waitFor();
  await site.bringToFront();
  await site.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Start selecting" }).waitFor();
});
