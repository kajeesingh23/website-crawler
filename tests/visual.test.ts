// Visual fingerprints: similar pictures score high, different ones low, on real rendered pictures.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pdi-vis-"));
const { browser } = await import("../src/lib/recreate/render.ts");
const { fingerprint, visualMatch, findSimilar } = await import("../src/lib/visual/index.ts");
const { similarity } = await import("../src/lib/visual/fingerprint.ts");
const { saveItem } = await import("../src/lib/db.ts");
after(async () => {
  await (await browser()).close();
  fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true });
});

const shot = async (html: string) => {
  const page = await (await browser()).newPage({ viewport: { width: 320, height: 120 } });
  await page.setContent(`<body style="margin:0">${html}</body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
};
const button = (bg: string, text: string, radius = 999) =>
  `<div style="display:grid;place-items:center;height:120px;background:#fff"><span style="background:${bg};color:#fff;padding:14px 28px;border-radius:${radius}px;font:600 16px Arial">${text}</span></div>`;

test("similar pictures score higher than different ones", { timeout: 30_000 }, async () => {
  const [navyPill, navyPill2, redSquare, stripes] = await Promise.all([
    shot(button("#0b1f3a", "Get started")),
    shot(button("#0d2347", "Start now")),
    shot(button("#e5322d", "Delete", 0)),
    shot(`<div style="height:120px;background:repeating-linear-gradient(90deg,#000 0 20px,#ff0 20px 40px)"></div>`),
  ]);
  const [a, b, c, d] = await Promise.all([navyPill, navyPill2, redSquare, stripes].map((p) => fingerprint(p)));
  assert.equal(similarity(a, a), 1);
  assert.ok(similarity(a, b) > similarity(a, c), "two navy pills are closer than a navy pill and a red square");
  assert.ok(similarity(a, c) > similarity(a, d), "any button is closer than black-and-yellow stripes");

  assert.equal(await visualMatch(navyPill, navyPill), 100);
  assert.ok((await visualMatch(navyPill, navyPill2)) > (await visualMatch(navyPill, stripes)));

  // Library search, by item and by a picture you hand over.
  const ids = [
    saveItem({ kind: "component", name: "Navy pill", observed: {}, png: navyPill2 }),
    saveItem({ kind: "component", name: "Red square", observed: {}, png: redSquare }),
    saveItem({ kind: "component", name: "Stripes", observed: {}, png: stripes }),
  ];
  const byPicture = await findSimilar({ image: navyPill }, 3);
  assert.deepEqual(byPicture.map((i) => i.name), ["Navy pill", "Red square", "Stripes"]);
  const byItem = await findSimilar({ id: ids[0] }, 2);
  assert.equal(byItem[0].name, "Red square", "the item itself is left out");
  const { db } = await import("../src/lib/db.ts");
  assert.ok((db().prepare("SELECT fingerprint FROM items WHERE id = ?").get(ids[2]) as { fingerprint: string }).fingerprint, "stored for next time");
});
