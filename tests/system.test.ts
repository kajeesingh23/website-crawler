// Collecting a whole website's design system, in the background browser, from a local test site.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pdi-sys-"));
const { collectSystem, getCollected } = await import("../src/lib/system/collect.ts");
const { designMd, filterSystem, guessRoles } = await import("../src/lib/system/design-md.ts");
const L = await import("../src/lib/library.ts");
const { checkSizes, pathOf } = await import("../src/lib/inspector/responsive.ts");
const { browser } = await import("../src/lib/recreate/render.ts");

const SITE = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Calm Studio</title><style>
  body{margin:0;font:400 16px/1.5 Arial;color:#1a1a18;background:#f7f6f3}
  nav{display:flex;justify-content:space-between;padding:16px 32px}
  main{max-width:960px;margin:0 auto;padding:48px 24px}
  h1{font:700 48px/1.1 Georgia;margin:0 0 24px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:24px}
  .card h3{margin:0 0 8px;font:600 20px/1.3 Georgia}
  .btn{display:inline-block;background:#3b6cff;color:#fff;padding:12px 24px;border-radius:999px;transition:transform .2s ease-out}
  @media (max-width: 768px){.grid{grid-template-columns:1fr}}
  @media (min-width: 1280px){main{max-width:1120px}}
  @keyframes float{to{transform:translateY(-4px)}}
</style>
<nav><strong>Calm</strong><a class="btn" href="#">Start a project</a></nav>
<main><h1>We design calm, useful things.</h1>
<div class="grid">${[1, 2, 3].map((i) => `<div class="card"><h3>Project ${i}</h3><p>Quiet interfaces for busy people.</p></div>`).join("")}</div>
<form style="margin-top:48px;padding:24px"><input placeholder="Email" style="padding:12px"><button style="padding:12px 24px">Subscribe</button></form>
</main>`;

const server = http.createServer((_q, r) => (r.setHeader("content-type", "text/html"), r.end(SITE)));
let url = "";
before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});
after(async () => {
  server.close();
  await (await (globalThis as unknown as { __pdiRenderer?: Promise<{ close(): Promise<void> }> }).__pdiRenderer)?.close();
  fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true });
});

test("a website's design language is collected, chosen from and saved", { timeout: 60_000 }, async () => {
  const c = await collectSystem(url);
  const s = c.system;
  assert.equal(s.title, "Calm Studio");
  for (const hex of ["#3b6cff", "#ffffff", "#1a1a18", "#f7f6f3"]) assert.ok(s.colours.some((x) => x.hex === hex), `colour ${hex}`);
  assert.deepEqual(s.type.slice(0, 2).map((t) => [t.size, t.family, t.weight]), [[48, "Georgia", "700"], [20, "Georgia", "600"]]);
  assert.deepEqual(s.fonts.map((f) => f.family).sort(), ["Arial", "Georgia"]);
  for (const v of [24, 48]) assert.ok(s.spacing.some((x) => x.value === v), `spacing ${v}`);
  assert.ok(s.radii.some((r) => r.value === "16px"));
  assert.equal(s.shadows[0].value, "rgba(0, 0, 0, 0.08) 0px 8px 24px 0px");
  assert.deepEqual(s.breakpoints, [768, 1280]);
  assert.deepEqual(s.layout.gridColumns.map((g) => g.columns), [3]);
  assert.deepEqual(s.layout.contentWidths.map((w) => w.value), [1120], "measured at 1440px wide, so the 1280px rule applies");
  assert.deepEqual([s.transitions[0].prop, s.transitions[0].duration, s.transitions[0].easing], ["transform", 200, "ease-out"]);
  assert.deepEqual(s.keyframes, ["float"]);
  const kinds = s.examples.map((e) => e.kind);
  for (const k of ["button", "card", "navigation", "form"]) assert.ok(kinds.includes(k as never), `example ${k}`);
  assert.ok(c.shots.filter(Boolean).length >= kinds.length - 1, "examples are photographed");
  assert.deepEqual(guessRoles(s.colours).accent, "#3b6cff");

  // Keep only some parts, then write design.md and save.
  const chosen = filterSystem(s, { colours: [0, 1], examples: [s.examples.findIndex((e) => e.kind === "button")] });
  assert.equal(chosen.colours.length, 2);
  assert.equal(chosen.examples.length, 1);
  const md = designMd(chosen, new Date("2026-11-19"));
  for (const part of ["# Design system: Calm Studio", "Captured: 2026-11-19", "## Typography", "| 48px | Bold (700)", "Breakpoints: 768px, 1280px", "--space-24: 24px;", "**(guess)**"])
    assert.ok(md.includes(part), `design.md has ${part}`);

  assert.ok(getCollected(c.id));
  const id = L.saveDesignSystem({ name: "Calm Studio system", system: chosen, pageShot: c.pageShot, shots: [c.shots[s.examples.findIndex((e) => e.kind === "button")]] });
  const item = L.getItem(id)!;
  assert.equal(item.kind, "design_system");
  assert.deepEqual(item.versions[0].files.sort(), ["design.md", "example-1.png"]);
  assert.ok(L.resolveDataFile(["design-systems", id, "design.md"]));
  assert.equal(L.listItems({ q: "calm studio design system" })[0].id, id);
  L.deleteItems([id]);
  assert.equal(L.resolveDataFile(["design-systems", id, "design.md"]), null, "deleting removes its files");
});

test("the same element is measured at phone, tablet and desktop widths", { timeout: 60_000 }, async () => {
  const page = await (await browser()).newPage();
  await page.goto(url);
  const path = await page.locator(".grid").evaluate(pathOf);
  assert.equal(await page.locator(path).evaluate((e) => e.className), "grid", "the address finds the element again");
  await page.close();

  const [phone, tablet, desktop] = await checkSizes(url, path);
  assert.deepEqual([phone.name, tablet.name, desktop.name], ["Phone", "Tablet", "Desktop"]);
  assert.match(phone.layout!, /Grid of 1 column/, "the 768px rule stacks the cards on a phone");
  assert.match(desktop.layout!, /Grid of 3 columns/);
  assert.ok(phone.screenshot?.startsWith("data:image/png"));
  assert.equal((await checkSizes(url, "#does-not-exist"))[0].found, false);
});

test("bad links are refused before anything loads", async () => {
  await assert.rejects(collectSystem("file:///etc/passwd"), /Only website links/);
});
