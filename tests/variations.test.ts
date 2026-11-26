// Customisation and variations: content, pictures, size and layout; the original never changes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { applyContent, applyLayout, layoutCss, listEditable, type ContentEdits } from "../src/lib/recreate/content.ts";

process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "plax-var-"));
const { saveComponent, dataDir } = await import("../src/lib/db.ts");
const L = await import("../src/lib/library.ts");
after(() => fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true }));

const COPY = `<!doctype html><html><head><style>
  .pdi-root {
    display: flex;
  }
</style></head><body><div class="pdi-root"><h3> Calm studio </h3><img src="https://studio.example/a.png" alt="A desk"><p>Read more</p></div></body></html>`;

test("text and pictures can be changed; unsafe pictures are ignored", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const listed = await page.evaluate(listEditable, COPY);
    assert.deepEqual(listed.texts, ["Calm studio", "Read more"]);
    assert.deepEqual(listed.images, [{ src: "https://studio.example/a.png", alt: "A desk", fit: "" }]);
    await page.addScriptTag({ content: applyContent.toString() }); // it's self-contained, so its source runs on its own
    const run = (edits: ContentEdits) =>
      page.evaluate(([h, e]) => (window as unknown as { applyContent: typeof applyContent }).applyContent(h, e), [COPY, edits] as const);
    const out = await run({ texts: { 0: "Quiet <b>bank</b>" }, images: { 0: { src: "data:image/png;base64,AAAA", fit: "cover", alt: "New" } } });
    assert.match(out, /<h3> Quiet &lt;b&gt;bank&lt;\/b&gt; <\/h3>/, "typed text stays text, spaces kept");
    assert.match(out, /src="data:image\/png;base64,AAAA"/);
    assert.match(out, /object-fit: cover/);
    assert.match(out, /alt="New"/);
    const unsafe = await run({ images: { 0: { src: "javascript:alert(1)", fit: "url(x)" } } });
    assert.match(unsafe, /src="https:\/\/studio\.example\/a\.png"/, "only web addresses and image data are accepted");
    assert.doesNotMatch(unsafe, /object-fit/);
  } finally {
    await browser.close();
  }
});

test("size and layout only accept checked values", () => {
  const css = layoutCss({ width: 360, ratio: "16 / 9", direction: "column", gap: 12, align: "center" });
  assert.match(css, /width: 360px !important/);
  assert.match(css, /aspect-ratio: 16 \/ 9 !important/);
  assert.match(css, /display: flex !important;\n {4}flex-direction: column/);
  assert.match(css, /gap: calc\(12px \* var\(--pdi-space, 1\)\)/);
  assert.match(css, /overflow: hidden/);
  const hostile = layoutCss({ width: "1px;}body{display:none" as never, ratio: "1;color:red" as never, align: "x" as never, gap: -4 });
  assert.equal(hostile, "", "nothing typed can inject other styles");
  assert.equal(applyLayout(applyLayout(COPY, { width: 200 }), {}), COPY, "removing all changes gives the original back");
});

test("a variation is its own item; the original keeps its files and versions", () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const original = saveComponent({ name: "Calm card", html: COPY, observed: { design: { x: 1 } }, inferred: {}, png, tags: ["card"] });
  const before = fs.readFileSync(path.join(dataDir, "components", original, "v1", "component.html"), "utf8");
  const v = L.saveVariation(original, { name: "Calm card, dark", html: COPY.replace("Calm", "Dark"), png, changes: { overrides: { bg: "#000000" } } });
  const item = L.getItem(v)!;
  assert.equal(item.variantOf, original);
  assert.equal(item.original?.id, original);
  assert.ok(item.tags.includes("variation"));
  assert.deepEqual(item.observed, { design: { x: 1 } }, "measurements stay those of the original page");
  assert.match(item.code.html!, /Dark studio/);
  const o = L.getItem(original)!;
  // Pages can only receive plain objects (node:sqlite rows have no prototype).
  const plain = (v: unknown): boolean =>
    v === null || typeof v !== "object" ? true : [Object.prototype, Array.prototype].includes(Object.getPrototypeOf(v)) && Object.values(v).every(plain);
  for (const x of [item, o, L.listCollections(), L.listWebsites(), L.filterOptions(), L.listItems()]) assert.ok(plain(x), "plain objects only");
  assert.equal(fs.readFileSync(path.join(dataDir, "components", original, "v1", "component.html"), "utf8"), before);
  assert.equal(o.versions.length, 1);
  assert.deepEqual(o.variations.map((x) => x.id), [v]);
  assert.deepEqual(L.listItems({ variations: true }).map((x) => x.id), [v]);
  assert.throws(() => L.saveVariation(original, { name: " ", html: COPY, changes: {} }), /1 to 120/);
  assert.throws(() => L.saveVariation(original, { name: "x", html: "<p>no root</p>", changes: {} }), /isn't valid/);
  L.deleteItems([original]);
  assert.equal(L.getItem(v)!.variantOf, null, "deleting the original keeps its variations");
});
