// The library behind My Board, on a throwaway data folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pdi-lib-"));
const { saveItem, saveComponent, dataDir } = await import("../src/lib/db.ts");
const L = await import("../src/lib/library.ts");
after(() => fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true }));

const png = Buffer.from("89504e470d0a1a0a", "hex");
const button = saveComponent({
  name: "Magnetic button", html: "<html>pdi-root</html>", observed: {}, inferred: {}, png,
  category: "Button", tags: ["button", "hover", "cursor"], description: "Button that follows the cursor on hover",
});
const nav = saveItem({ kind: "component", name: "Studio nav", observed: {}, category: "Navigation", tags: ["dark", "navigation"], description: "Dark navigation bar" });
const reveal = saveItem({ kind: "animation", name: "Scroll reveal", observed: { motion: {} }, category: "Section", tags: ["scroll"] });

test("plain-language search finds the right things", () => {
  assert.equal(L.ftsQuery("Find the buttons that follow the cursor"), '"button"* OR "follow"* OR "cursor"*');
  assert.equal(L.ftsQuery("show all my"), null);
  assert.equal(L.listItems({ q: "Find buttons that follow the cursor" })[0].id, button);
  assert.deepEqual(L.listItems({ q: "Show all my dark navigation references" }).map((i) => i.id), [nav]);
});

test("filters and newest-first order", () => {
  assert.deepEqual(L.listItems().map((i) => i.name), ["Scroll reveal", "Studio nav", "Magnetic button"]);
  assert.deepEqual(L.listItems({ filter: "animation" }).map((i) => i.id), [reveal]);
  assert.deepEqual(L.listItems({ filter: "section" }).map((i) => i.id).sort(), [nav, reveal].sort());
  assert.deepEqual(L.listItems({ tag: "cursor" }).map((i) => i.id), [button]);
  assert.equal(L.listItems({ filter: "animation" })[0].moves, true);
});

test("favourites, notes and tags", () => {
  L.updateItem(nav, { favourite: true, notes: "Use for portfolio", tags: [" Dark ", "dark", "Header"] });
  assert.deepEqual(L.listItems({ filter: "favourites" }).map((i) => i.id), [nav]);
  const d = L.getItem(nav)!;
  assert.deepEqual([d.notes, d.tags], ["Use for portfolio", ["dark", "header"]]);
  assert.throws(() => L.updateItem(nav, { name: "  " }), /1 to 120/);
  assert.deepEqual(L.listItems({ q: "portfolio" }).map((i) => i.id), [nav], "notes are searchable");
});

test("collections hold items without duplicating them", () => {
  const c = L.createCollection("Premium Navigation");
  L.addToCollection(c, [nav, button]);
  L.addToCollection(c, [nav]);
  const other = L.createCollection("Interaction References");
  L.addToCollection(other, [button]);
  assert.deepEqual(L.listCollections().map((x) => [x.name, x.count]), [["Interaction References", 1], ["Premium Navigation", 2]]);
  assert.equal(L.listItems().length, 3, "still three items");
  L.removeFromCollection(c, [button]);
  assert.deepEqual(L.listItems({ collection: c }).map((i) => i.id), [nav]);
  L.deleteCollection(other);
  assert.equal(L.listItems().length, 3, "deleting a collection keeps its items");
});

test("drag and drop order sticks", () => {
  L.moveItem(button, reveal, "before");
  assert.deepEqual(L.listItems().map((i) => i.name), ["Magnetic button", "Scroll reveal", "Studio nav"]);
  L.moveItem(button, nav, "after");
  assert.deepEqual(L.listItems().map((i) => i.name), ["Scroll reveal", "Studio nav", "Magnetic button"]);
});

test("duplicate copies files and code; delete removes them", () => {
  const copy = L.duplicateItem(button);
  assert.deepEqual(L.listItems().map((i) => i.name).slice(-2), ["Magnetic button", "Magnetic button copy"]);
  const d = L.getItem(copy)!;
  assert.equal(d.code.html, "<html>pdi-root</html>");
  assert.ok(fs.existsSync(path.join(dataDir, "screenshots", `${copy}.png`)));
  L.deleteItems([copy]);
  assert.equal(L.getItem(copy), null);
  assert.ok(!fs.existsSync(path.join(dataDir, "components", copy)));
  assert.ok(L.getItem(button)!.code.html, "the original is untouched");
});

test("only library files can be served", () => {
  assert.ok(L.resolveDataFile(["screenshots", `${button}.png`]));
  assert.equal(L.resolveDataFile(["screenshots", "..", "database", "library.db"]), null);
  assert.equal(L.resolveDataFile(["database", "library.db"]), null);
  assert.equal(L.resolveDataFile(["components", "..", "..", "..", "etc", "passwd"]), null);
});
