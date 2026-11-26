// Pairing and saving captures from the extension, on a throwaway data folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "plax-cap-"));
const P = await import("../src/lib/pairing.ts");
const { saveCapture, Invalid } = await import("../src/lib/captures.ts");
const L = await import("../src/lib/library.ts");
const { db, dataDir } = await import("../src/lib/db.ts");
after(() => fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true }));

test("pairing codes: shown once, stored as a hash, tied to one extension", () => {
  assert.equal(P.getPairing(), null);
  const code = P.newPairing();
  assert.match(code, /^plax-[\w-]{20,}$/);
  const stored = P.getPairing()!;
  assert.ok(!JSON.stringify(stored).includes(code), "the code itself is never stored");
  assert.equal(P.tokenMatches(code), true);
  assert.equal(P.tokenMatches(code + "x"), false);
  assert.equal(P.tokenMatches(null), false);
  P.bindOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop");
  P.bindOrigin("chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba");
  assert.equal(P.getPairing()!.origin, "chrome-extension://abcdefghijklmnopabcdefghijklmnop", "a second extension can't take it over");
  const next = P.newPairing();
  assert.equal(P.tokenMatches(code), false, "a new code replaces the old one");
  assert.equal(P.tokenMatches(next), true);
  P.unpair();
  assert.equal(P.getPairing(), null);
});

const png = "data:image/png;base64," + Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
const capture = (over: Record<string, unknown> = {}) => ({
  name: "Calm card",
  url: "https://studio.example/work",
  pageTitle: "Studio",
  label: "Card",
  html: '<!doctype html><html><head></head><body><div class="pdi-root">Hi</div></body></html>',
  width: 320,
  height: 240,
  crumbs: ["Page", "Section"],
  path: "main > article:nth-of-type(1)",
  design: null,
  motion: { running: [], transitions: [], hover: null, focus: null, scroll: null, scrollTimelines: [], scriptedIdle: false },
  screenshot: png,
  ...over,
});

test("a capture is saved with its picture and copy, grouped by visit and website", () => {
  const visit = "0b0e6c2a-5d0c-4d38-9a0e-3f1c2b9c8d11";
  const { id } = saveCapture({ analysisId: visit, capture: capture() });
  const icon = saveCapture({ analysisId: visit, capture: capture({ name: "Logo", label: "Icon" })! }).id;
  const item = L.getItem(id)!;
  assert.equal(item.kind, "component");
  assert.equal(item.code.html?.includes("pdi-root"), true);
  assert.ok(fs.existsSync(path.join(dataDir, "screenshots", `${id}.png`)));
  assert.equal((item.observed as { capturedWith?: string }).capturedWith, "extension");
  assert.equal(L.getItem(icon)!.kind, "asset", "pictures and icons are assets");
  assert.equal((db().prepare("SELECT COUNT(*) n FROM analyses").get() as { n: number }).n, 1, "one visit holds both");
  const [site] = L.listWebsites();
  assert.deepEqual([site.items, site.analyses], [2, 1]);
  assert.deepEqual(L.listItems({ kinds: ["asset"] }).map((i) => i.id), [icon]);
});

test("anything malformed is refused before it's stored", () => {
  const visit = "0b0e6c2a-5d0c-4d38-9a0e-3f1c2b9c8d12";
  const before = L.listItems().length;
  assert.throws(() => saveCapture(null), Invalid);
  assert.throws(() => saveCapture({ analysisId: "x", capture: capture() }), /visit/);
  assert.throws(() => saveCapture({ analysisId: visit, capture: capture({ url: "file:///etc/passwd" }) }), /websites/);
  assert.throws(() => saveCapture({ analysisId: visit, capture: capture({ html: "<p>no root</p>" }) }), /copy/);
  assert.throws(() => saveCapture({ analysisId: visit, capture: capture({ screenshot: "data:text/html;base64,PHA+" }) }), /PNG/);
  assert.throws(() => saveCapture({ analysisId: visit, capture: capture({ name: "x".repeat(121) }) }), /too long/);
  assert.equal(L.listItems().length, before);
});
