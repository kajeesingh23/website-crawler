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

import { bezierOf, describeMovement, diffStates, easingName, movementBetween, parseTransform } from "../src/lib/inspector/describe.ts";

test("transforms become plain movements", () => {
  assert.equal(describeMovement(movementBetween("matrix(1, 0, 0, 1, 0, 0)", "matrix(1, 0, 0, 1, 0, -2)")), "Moves up 2px");
  assert.equal(describeMovement(movementBetween("translateY(20px)", "none"), [0, 1]), "Moves up 20px, fades in");
  assert.equal(describeMovement(movementBetween("none", "scale(1.05)")), "Grows 5%");
  assert.equal(describeMovement(movementBetween("rotate(0deg)", "rotate(1turn)")), "Turns 360°");
  assert.equal(describeMovement(movementBetween("translateX(-100%)", "none")), "Moves right 100% of its size");
  assert.equal(describeMovement(movementBetween("none", "none"), [1, 1]), "");
  assert.equal(parseTransform("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,5,7,0,1)").dy, 7);
});

test("easing curves get plain names", () => {
  assert.deepEqual(bezierOf("ease-out"), [0, 0, 0.58, 1]);
  assert.equal(bezierOf("steps(4, end)"), null);
  assert.equal(easingName("cubic-bezier(0.4, 0, 0.2, 1)"), "Slow start and end");
  assert.equal(easingName("cubic-bezier(0.34, 1.56, 0.64, 1)"), "Springy, overshoots");
  assert.equal(easingName("cubic-bezier(0.22, 1, 0.36, 1)"), "Starts fast, slows down");
});

test("only real changes are reported", () => {
  const s = (bg: string) => ({ parts: ["Whole element"], styles: [{ "background-color": bg, opacity: "1" }], animations: [], transitions: [], scrollTimelines: [] });
  assert.deepEqual(diffStates(s("red"), s("blue")), [{ part: "Whole element", prop: "background-color", from: "red", to: "blue" }]);
  assert.deepEqual(diffStates(s("red"), s("red")), []);
});

import { cardPreview } from "../src/lib/inspector/describe.ts";
import type { Motion } from "../src/lib/inspector/session.ts";

test("Library cards replay what was recorded", () => {
  const none: Motion = { running: [], scriptedIdle: false, transitions: [], hover: null, focus: null, scroll: null, scrollTimelines: [] };
  assert.equal(cardPreview(none), null);
  assert.equal(cardPreview(undefined), null);

  const lift = cardPreview({
    ...none,
    transitions: [{ part: "Whole element", prop: "transform", duration: 200, delay: 0, easing: "ease-out" }],
    hover: { changes: [{ part: "Whole element", prop: "transform", from: "none", to: "matrix(1, 0, 0, 1, 0, -2)" }], animations: [] },
  })!;
  assert.equal(lift.label, "On hover · 200ms");
  assert.deepEqual(lift.keyframes, [{ transform: "none" }, { transform: "matrix(1, 0, 0, 1, 0, -2)" }]);
  assert.equal(lift.alternate, true);

  const spin = cardPreview({
    ...none,
    running: [{ key: "s", kind: "css-animation", name: "spin", part: "Whole element", duration: 1000, delay: 0, easing: "linear", iterations: "infinite", direction: "normal", keyframes: [{ offset: 0, transform: "rotate(0deg)", color: "red" }, { offset: 1, transform: "rotate(360deg)" }] }],
  })!;
  assert.equal(spin.label, "Moves on its own · 1s");
  assert.deepEqual(spin.keyframes[0], { offset: 0, transform: "rotate(0deg)" }, "colours aren't replayed on a picture");

  const colour = cardPreview({ ...none, hover: { changes: [{ part: "Whole element", prop: "background-color", from: "red", to: "blue" }], animations: [] } })!;
  assert.deepEqual([colour.label, colour.keyframes], ["On hover · background changes", []]);
});
