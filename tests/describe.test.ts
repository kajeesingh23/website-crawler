import { test } from "node:test";
import assert from "node:assert/strict";
import { describeLayout, weightName } from "../src/lib/inspector/describe.ts";
import type { Design } from "../src/lib/inspector/extract.ts";

const base: Design["layout"] = {
  width: 100, height: 40, padding: [0, 0, 0, 0], margin: [0, 0, 0, 0], border: [0, 0, 0, 0],
  display: "block", position: "static", direction: "row", justify: "normal", alignItems: "normal",
  wrap: "nowrap", gap: 0, columns: 0, rows: 0, minWidth: "auto", maxWidth: "none",
};

test("layouts are described in plain words", () => {
  assert.equal(describeLayout(base), "Stacks normally, top to bottom.");
  assert.equal(
    describeLayout({ ...base, display: "flex", justify: "space-between", alignItems: "center", gap: 16 }),
    "Side by side, spread to the edges, vertically centred, 16px apart.",
  );
  assert.equal(describeLayout({ ...base, display: "flex", direction: "column", alignItems: "center" }), "Stacked, horizontally centred.");
  assert.equal(describeLayout({ ...base, display: "grid", columns: 3, rows: 2, gap: 24 }), "Grid of 3 columns and 2 rows, 24px apart.");
  assert.equal(describeLayout({ ...base, display: "grid", columns: 1 }), "Grid of 1 column.");
  assert.equal(describeLayout({ ...base, position: "sticky" }), "Stacks normally, top to bottom. Sticks in place once you scroll to it.");
});

test("font weights get names", () => {
  assert.equal(weightName("600"), "Semibold (600)");
  assert.equal(weightName("550"), "550");
});
