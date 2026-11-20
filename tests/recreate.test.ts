// Exact copy: freeze an element from a real page, rebuild it as a standalone page, and measure both.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { snapshotElement } from "../src/lib/inspector/snapshot.ts";
import { extractDesign } from "../src/lib/inspector/extract.ts";
import { applyOverrides, buildDocument, compareDesigns, overridesCss, parseReply, pngSize } from "../src/lib/recreate/document.ts";
import { renderAndMeasure } from "../src/lib/recreate/render.ts";
import { visualMatch } from "../src/lib/visual/index.ts";

after(async () => (await (globalThis as unknown as { __pdiRenderer?: Promise<{ close(): Promise<void> }> }).__pdiRenderer)?.close());

const PAGE = `<!doctype html><body style="margin:0;background:#f7f6f3">
<div id="card" style="display:flex;gap:16px;align-items:center;padding:20px 24px;background:#ffffff;border-radius:16px;
  box-shadow:0 8px 24px rgba(0,0,0,.1);font:500 15px/1.5 Arial;color:#1a1a18;width:360px;transition:transform .3s ease-out">
  <svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff5c28"/></svg>
  <div><h3 style="margin:0;font:600 18px/1.3 Georgia">Studio notes</h3><p style="margin:4px 0 0;color:#6f6d66">Calm, useful things.</p></div>
  <a href="https://example.com/evil" onclick="alert(1)" style="margin-left:auto;color:#3b6cff">Open</a>
  <script>alert("never")</script>
</div></body>`;

test("an exact copy matches the original when measured", { timeout: 30_000 }, async () => {
  const b = await chromium.launch();
  try {
    const page = await b.newPage();
    await page.setContent(PAGE);
    const card = page.locator("#card");
    const [snap, original] = await Promise.all([card.evaluate(snapshotElement), card.evaluate(extractDesign)]);

    // Nothing from the website can run or navigate in the copy.
    assert.doesNotMatch(snap.body, /<script|onclick|href=|alert/);
    assert.match(snap.body, /<span[^>]*>Open<\/span>/);

    const html = buildDocument(snap, original.appearance.sitsOn);
    const { png, design } = await renderAndMeasure(html, original.layout.width);
    assert.ok(pngSize(png).width > 300);
    const rows = compareDesigns(original, design);
    const misses = rows.filter((r) => !r.match).map((r) => `${r.label}: ${r.original} vs ${r.recreated}`);
    assert.deepEqual(misses, [], "every measured property should match");
    const looks = await visualMatch(await card.screenshot(), png);
    assert.ok(looks >= 95, `the copy should look the same pixel by pixel (got ${looks}%)`);

    // Studio settings reach every part through the shared variables.
    const tuned = await renderAndMeasure(applyOverrides(html, { bg: "#0b1f3a", text: "#ffffff", space: 2, typeScale: 1.2 }), original.layout.width);
    assert.equal(tuned.design.appearance.background?.hex, "#0b1f3a");
    assert.equal(tuned.design.appearance.text.hex, "#ffffff");
    assert.deepEqual(tuned.design.layout.padding, [40, 48, 40, 48]);
    assert.equal(tuned.design.typography.size, 18);
  } finally {
    await b.close();
  }
});

test("studio settings only accept known values", () => {
  assert.equal(overridesCss({ bg: "red; } body { display:none", font: "Comic", speed: 99 }), "  :root {\n    --pdi-speed: 5;\n  }");
  assert.equal(overridesCss({}), "");
});

test("Claude's reply is read section by section", () => {
  const r = parseReply(`<component_html><!doctype html><html><body class="x"></body></html></component_html>
<component_react>export function Card() {}</component_react><notes>Used flexbox.</notes><confidence>82</confidence>
<unknowns>
- Exact web font
- Click behaviour
</unknowns>`);
  assert.deepEqual([r?.react, r?.confidence, r?.unknowns], ["export function Card() {}", 82, ["Exact web font", "Click behaviour"]]);
  assert.equal(parseReply("no tags here"), null);
});
